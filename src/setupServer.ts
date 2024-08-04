import { Application, json, urlencoded, Response, Request, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import cookieSession from 'cookie-session';
import HTTP_STATUS from 'http-status-codes';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import Logger from 'bunyan';
import 'express-async-errors';
import { CustomError, IErrorResponse } from './shared/globals/helpers/error-handler';
import { config } from './config';
import applicationRoutes from './routes';
import { SocketIOPostHandler } from './shared/sockets/post';
import { SocketIOFollowerHandler } from './shared/sockets/follower';
import { SocketIOUserHandler } from './shared/sockets/user';
import { SocketIONotificationHandler } from './shared/sockets/notification';
import { SocketIOImageHandler } from './shared/sockets/image';
import { SocketIOChatHandler } from './shared/sockets/chat';
import apiStats from 'swagger-stats';

const SERVER_PORT = process.env.PORT;
const log: Logger = config.createLogger('server');

export function startClient(app: Application): void {
  securityMiddleware(app);
  standardMiddleware(app);
  routeMiddleware(app);
  apiMonitoring(app);
  globalErrorHandler(app);
  startServer(app);
}

function securityMiddleware(app: Application): void {
  app.use(
    cookieSession({
      name: 'session',
      keys: [config.SECRET_KEY_ONE!, config.SECRET_KEY_TWO!],
      maxAge: 24 * 60 * 60 * 1000 * 7,
      secure: config.NODE_ENV !== 'development'
    })
  );
  app.use(hpp());
  app.use(helmet());
  app.use(
    cors({
      origin: config.CLIENT_URL,
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    })
  );
}

function standardMiddleware(app: Application): void {
  app.use(compression());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
}

function apiMonitoring(app: Application): void {
  app.use(
    apiStats.getMiddleware({
      uriPath: '/swagger-monitoring'
    })
  );
}

function routeMiddleware(app: Application): void {
  applicationRoutes(app);
}

function globalErrorHandler(app: Application): void {
  app.all('*', (req: Request, res: Response) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({ message: `${req.originalUrl} not found` });
  });

  app.use((error: IErrorResponse, _req: Request, res: Response, next: NextFunction) => {
    log.error(error);
    if (error instanceof CustomError) {
      return res.status(error.statusCode).json(error.serializeErrors());
    }
    next();
  });
}

async function startServer(app: Application): Promise<void> {
  if (!config.JWT_TOKEN) {
    throw new Error('JWT_TOKEN must be provided');
  }
  try {
    const httpServer: http.Server = new http.Server(app);
    const socketIO: Server = await createSocketIO(httpServer);
    startHttpServer(httpServer);
    socketIOConnections(socketIO);
  } catch (error) {
    log.error(error);
  }
}

async function createSocketIO(httpServer: http.Server): Promise<Server> {
  const io: Server = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_URL,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }
  });
  const pubClient = createClient({ url: config.REDIS_HOST });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  return io;
}

function startHttpServer(httpServer: http.Server): void {
  log.info(`Worker with process ${process.pid} has started`);
  log.info(`Server has started with process ${process.pid}`);
  httpServer.listen(SERVER_PORT, () => {
    log.info(`SERVER RUNNING ON PORT ${SERVER_PORT}`);
  });
}

function socketIOConnections(io: Server): void {
  const postSocketHandler: SocketIOPostHandler = new SocketIOPostHandler(io);
  const followerSocketHandler: SocketIOFollowerHandler = new SocketIOFollowerHandler(io);
  const userSocketHandler: SocketIOUserHandler = new SocketIOUserHandler(io);
  const notificationSocketHandler: SocketIONotificationHandler = new SocketIONotificationHandler();
  const imageSocketHandler: SocketIOImageHandler = new SocketIOImageHandler();
  const chatSocketHandler: SocketIOChatHandler = new SocketIOChatHandler(io);

  postSocketHandler.listen();
  followerSocketHandler.listen();
  userSocketHandler.listen();
  chatSocketHandler.listen();
  notificationSocketHandler.listen(io);
  imageSocketHandler.listen(io);
}
