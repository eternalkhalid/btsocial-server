import { BaseCache } from './base.cache';
import Logger from 'bunyan';
import { config } from '../../../config';
import { ServerError } from 'src/shared/globals/helpers/error-handler';
import { IPostDocument, IReactions, ISavePostToCache } from 'src/features/post/interfaces/post.interface';
import { Helpers } from 'src/shared/globals/helpers/helpers';
import { RedisCommandRawReply } from '@redis/client/dist/lib/commands';

const log: Logger = config.createLogger('postCache');

export type PostCacheMultiType = string | number | Buffer | RedisCommandRawReply[] | IPostDocument | IPostDocument[];

export class PostCache extends BaseCache {
  constructor() {
    super('postCache');
  }

  public async savePostToCache(data: ISavePostToCache): Promise<void> {
    const { key, currentUserId, uId, createdPost } = data;
    const {
      _id,
      userId,
      username,
      email,
      avatarColor,
      profilePicture,
      post,
      bgColor,
      feelings,
      privacy,
      gifUrl,
      commentsCount,
      imgVersion,
      imgId,
      // videoId,
      // videoVersion,
      reactions,
      createdAt
    } = createdPost;

    const dataToSave = {
      _id: `${_id}`,
      userId: `${userId}`,
      username: `${username}`,
      email: `${email}`,
      avatarColor: `${avatarColor}`,
      profilePicture: `${profilePicture}`,
      post: `${post}`,
      bgColor: `${bgColor}`,
      feelings: `${feelings}`,
      privacy: `${privacy}`,
      gifUrl: `${gifUrl}`,
      commentsCount: `${commentsCount}`,
      reactions: JSON.stringify(reactions),
      imgVersion: `${imgVersion}`,
      imgId: `${imgId}`,
      // 'videoId': `${videoId}`,
      // 'videoVersion': `${videoVersion}`,
      createdAt: `${createdAt}`
    };

    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      const postCount: string[] = await this.client.HMGET(`users:${currentUserId}`, 'postsCount');
      const multi: ReturnType<typeof this.client.multi> = this.client.multi();
      await this.client.ZADD('post', { score: parseInt(uId, 10), value: `${key}` });
      for (const [itemKey, itemValue] of Object.entries(dataToSave)) {
        multi.HSET(`posts:${key}`, `${itemKey}`, `${itemValue}`);
      }
      const count: number = parseInt(postCount[0], 10) + 1;
      multi.HSET(`users:${currentUserId}`, 'postsCount', count);
      multi.exec();
    } catch (error) {
      log.error(error);
      throw new ServerError('Server Error, Try again');
    }
  }

  public async getPostsFromCache(key: string, start: number, end: number): Promise<any[]> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      const originalReply: string[] = await this.client.ZRANGE(key, start, end);
      const reply = [...originalReply].reverse();

      // const multi: ReturnType<typeof this.client.multi> = this.client.multi();

      // const replies: Record<string, string>[] = [];

      const replies: IPostDocument[] = [];

      for (const value of reply) {
        const r = await this.client.HGETALL(`posts:${value}`);

        const postDocument: any = {
          _id: r._id,
          userId: r.userId,
          username: r.username,
          email: r.email,
          avatarColor: r.avatarColor,
          profilePicture: r.profilePicture,
          post: r.post,
          bgColor: r.bgColor,
          commentsCount: parseInt(r.commentsCount),
          imgVersion: r.imgVersion,
          imgId: r.imgId,
          videoId: r.videoId,
          videoVersion: r.videoVersion,
          feelings: r.feelings,
          gifUrl: r.gifUrl,
          privacy: r.privacy,
          reactions: JSON.parse(r.reactions) as IReactions,
          createdAt: new Date(r.createdAt) as Date
        };

        replies.push(postDocument);
        //   multi.HGETALL(`posts:${value}`);
      }

      // log.info(replies);

      // log.info(`4.2 ${await multi.exec()}`);

      // const replies: PostCacheMultiType = (await multi.exec()) as PostCacheMultiType;
      // log.info(`5 ${replies}`);

      // const postReplies: IPostDocument[] = [];
      // // log.info(`6 ${postReplies}`);

      // for (const post of replies as Record<string, string | number | Date | IReactions>[]) {
      //   log.info(`6 ${post}`);

      //   post.commentsCount = parseInt(post.commentsCount) as number;
      //   log.info(`7 ${post.commentsCount}`);

      //   post.reactions = JSON.parse(post.reactions) as IReactions;
      //   log.info(`8 ${post.reactions}`);

      //   post.createdAt = new Date(post.createdAt) as Date;
      //   log.info(`9 ${post.createdAt}`);
      //   // log.info(typeof post);
      //   // postReplies.push(post);
      // }

      // log.info(`10 ${postReplies}`);
      // log.info('END');

      return replies;
    } catch (error) {
      log.error(error);
      throw new ServerError('Server error. Try again.. here is error');
    }
  }

  public async getTotalPostsInCache(): Promise<number> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }
      const count: number = await this.client.ZCARD('post');
      return count;
    } catch (error) {
      log.error(error);
      throw new ServerError('Server error. Try again.');
    }
  }

  public async getPostsWithImagesFromCache(key: string, start: number, end: number): Promise<IPostDocument[]> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      ////////////// This isn't Working anymore ///////////////
      // const reply: string[] = await this.client.ZRANGE(key, start, end, { REV: true });
      const originalReply: string[] = await this.client.ZRANGE(key, start, end);
      const reply = [...originalReply].reverse();

      const postWithImages: IPostDocument[] = [];

      for (const value of reply) {
        const r = await this.client.HGETALL(`posts:${value}`);

        const postDocument: any = {
          _id: r._id,
          userId: r.userId,
          username: r.username,
          email: r.email,
          avatarColor: r.avatarColor,
          profilePicture: r.profilePicture,
          post: r.post,
          bgColor: r.bgColor,
          commentsCount: parseInt(r.commentsCount),
          imgVersion: r.imgVersion,
          imgId: r.imgId,
          videoId: r.videoId,
          videoVersion: r.videoVersion,
          feelings: r.feelings,
          gifUrl: r.gifUrl,
          privacy: r.privacy,
          reactions: JSON.parse(r.reactions) as IReactions,
          createdAt: new Date(r.createdAt) as Date
        };
        if ((r.imgId && r.imgVersion) || r.gifUrl) {
          postWithImages.push(postDocument);
        }
      }
      return postWithImages;
      // const multi: ReturnType<typeof this.client.multi> = this.client.multi();
      // for (const value of reply) {
      // multi.HGETALL(`posts:${value}`);
      // }

      // const replies: PostCacheMultiType = (await multi.exec()) as PostCacheMultiType;
      // const postWithImages: IPostDocument[] = [];
      // for (const post of replies as IPostDocument[]) {
      // if ((post.imgId && post.imgVersion) || post.gifUrl) {
      // post.commentsCount = Helpers.parseJson(`${post.commentsCount}`) as number;
      //     post.reactions = Helpers.parseJson(`${post.reactions}`) as IReactions;
      //     post.createdAt = new Date(Helpers.parseJson(`${post.createdAt}`)) as Date;
      //     postWithImages.push(post);
      //   }
      // }
      // return postWithImages;
    } catch (error) {
      log.error(error);
      throw new ServerError('Server error. Try again.');
    }
  }

  public async getUserPostsFromCache(key: string, uId: number): Promise<IPostDocument[]> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      const reply: string[] = await this.client.ZRANGE(key, uId, uId, { REV: true, BY: 'SCORE' });
      const multi: ReturnType<typeof this.client.multi> = this.client.multi();
      for (const value of reply) {
        multi.HGETALL(`posts:${value}`);
      }
      const replies: PostCacheMultiType = (await multi.exec()) as PostCacheMultiType;
      const postReplies: IPostDocument[] = [];
      for (const post of replies as IPostDocument[]) {
        post.commentsCount = Helpers.parseJson(`${post.commentsCount}`) as number;
        post.reactions = Helpers.parseJson(`${post.reactions}`) as IReactions;
        post.createdAt = new Date(Helpers.parseJson(`${post.createdAt}`)) as Date;
        postReplies.push(post);
      }
      return postReplies;
    } catch (error) {
      log.error(error);
      throw new ServerError('Server error. Try again.');
    }
  }

  public async getTotalUserPostsInCache(uId: number): Promise<number> {
    try {
      if (!this.client.isOpen) {
        await this.client.connect();
      }
      const count: number = await this.client.ZCOUNT('post', uId, uId);
      return count;
    } catch (error) {
      log.error(error);
      throw new ServerError('Server error. Try again.');
    }
  }
}
