import { Router, Request, Response, NextFunction } from "express";
import { AppConfig } from "../../config";
import { HashtagRepository } from "../../db/repositories/hashtag.repository";
import { QueueInterface } from "../../infrastructure/queue/queue.interface";
import { JobType } from "../../jobs";
import { enqueueRecentMediaSync } from "../../bootstrap";

export interface SyncRouteDependencies {
  queue: QueueInterface;
  hashtagRepository: HashtagRepository;
  config: AppConfig;
}

export function createSyncRouter(deps: SyncRouteDependencies): Router {
  const router = Router();

  router.post(
    "/top",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await enqueueTopMediaSync(deps);
        res.status(result.enqueued ? 202 : 503).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/recent",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await enqueueRecentMediaSyncWithStatus(deps);
        res.status(result.enqueued ? 202 : 503).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export async function enqueueTopMediaSync(
  deps: SyncRouteDependencies
): Promise<{ enqueued: boolean; message: string }> {
  const hashtag = await deps.hashtagRepository.findByName(deps.config.hashtagName);

  if (!hashtag) {
    return {
      enqueued: false,
      message: `Hashtag "${deps.config.hashtagName}" is not in the database yet. Restart the app after fixing META_ACCESS_TOKEN.`,
    };
  }

  await deps.queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, {
    hashtag: hashtag.name,
    hashtagId: hashtag.instagramHashtagId,
  });

  return {
    enqueued: true,
    message: "Top media sync enqueued",
  };
}

async function enqueueRecentMediaSyncWithStatus(
  deps: SyncRouteDependencies
): Promise<{ enqueued: boolean; message: string }> {
  const hashtag = await deps.hashtagRepository.findByName(deps.config.hashtagName);

  if (!hashtag) {
    return {
      enqueued: false,
      message: `Hashtag "${deps.config.hashtagName}" is not in the database yet.`,
    };
  }

  await enqueueRecentMediaSync(deps);

  return {
    enqueued: true,
    message: "Recent media sync enqueued",
  };
}
