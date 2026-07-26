import { AppConfig, loadConfig } from "./config";
import { closePool, initPool } from "./db/client";
import { runMigrations } from "./db/migrate";
import { HashtagRepository } from "./db/repositories/hashtag.repository";
import { MediaRepository } from "./db/repositories/media.repository";
import { SyncRunRepository } from "./db/repositories/sync-run.repository";
import { MetaClient } from "./integrations/meta";
import { InMemoryQueue } from "./infrastructure/queue";
import { CronScheduler } from "./infrastructure/scheduler";
import {
  createSyncRecentMediaJobHandler,
  createSyncTopMediaJobHandler,
  JobType,
} from "./jobs";
import { LocalStorage } from "./infrastructure/storage";
import {
  AssetService,
  HashtagService,
  IngestionService,
  MediaService,
} from "./services";
import { Hashtag } from "./types";
import { QueueWorker } from "./workers/queue.worker";
import { QueueInterface } from "./infrastructure/queue/queue.interface";
import { SchedulerInterface } from "./infrastructure/scheduler/scheduler.interface";

const DRAIN_POLL_MS = 100;
const DRAIN_TIMEOUT_MS = 30_000;

export interface ApplicationDependencies {
  config: AppConfig;
  queue: QueueInterface;
  scheduler: SchedulerInterface;
  queueWorker: QueueWorker;
  hashtagService: HashtagService;
  hashtagRepository: HashtagRepository;
  mediaService: MediaService;
  runMigrations: (databaseUrl: string) => void;
}

export interface ApplicationContext extends ApplicationDependencies {
  hashtag: Hashtag | null;
}

export function createDependencies(
  config: AppConfig = loadConfig()
): ApplicationDependencies {
  const pool = initPool(config.databaseUrl);

  const metaClient = new MetaClient({
    accessToken: config.metaAccessToken,
    userId: config.metaUserId,
    maxItemsPerSync: config.syncMaxItems,
    pageLimit: config.metaPageLimit,
  });

  const hashtagRepository = new HashtagRepository(pool);
  const mediaRepository = new MediaRepository(pool);
  const syncRunRepository = new SyncRunRepository(pool);

  const hashtagService = new HashtagService(hashtagRepository, metaClient);
  const assetService = new AssetService(new LocalStorage(config.storageBasePath));
  const ingestionService = new IngestionService(
    metaClient,
    hashtagService,
    mediaRepository,
    syncRunRepository,
    assetService
  );
  const mediaService = new MediaService(
    mediaRepository,
    hashtagRepository,
    config.hashtagName
  );

  const queue = new InMemoryQueue();
  const scheduler = new CronScheduler();
  const queueWorker = new QueueWorker(queue);

  queueWorker.register(
    JobType.SYNC_TOP_HASHTAG_MEDIA,
    createSyncTopMediaJobHandler(ingestionService)
  );
  queueWorker.register(
    JobType.SYNC_RECENT_HASHTAG_MEDIA,
    createSyncRecentMediaJobHandler(ingestionService)
  );

  return {
    config,
    queue,
    scheduler,
    queueWorker,
    hashtagService,
    hashtagRepository,
    mediaService,
    runMigrations,
  };
}

async function resolveStartupHashtag(
  deps: ApplicationDependencies
): Promise<Hashtag | null> {
  try {
    return await deps.hashtagService.resolveHashtag(deps.config.hashtagName);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Meta API error";
    console.error(
      `Failed to resolve hashtag "${deps.config.hashtagName}" via Meta API: ${message}`
    );

    const existing = await deps.hashtagRepository.findByName(
      deps.config.hashtagName
    );
    if (existing) {
      console.log(
        `Using hashtag already stored in database: ${existing.name} (${existing.instagramHashtagId})`
      );
      return existing;
    }

    console.warn(
      "Skipping initial media sync until a valid META_ACCESS_TOKEN is configured."
    );
    return null;
  }
}

export async function startApplication(
  deps: ApplicationDependencies
): Promise<ApplicationContext> {
  deps.runMigrations(deps.config.databaseUrl);

  const hashtag = await resolveStartupHashtag(deps);

  deps.queueWorker.start();

  if (hashtag) {
    await deps.queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, {
      hashtag: hashtag.name,
      hashtagId: hashtag.instagramHashtagId,
    });
  }

  deps.scheduler.schedule(deps.config.cronRecentMedia, async () => {
    await enqueueRecentMediaSync(deps);
  });

  if (hashtag) {
    console.log(
      `Bootstrap complete — hashtag: ${hashtag.name} (${hashtag.instagramHashtagId}), cron: ${deps.config.cronRecentMedia}`
    );
  } else {
    console.log(
      `Bootstrap partial — API and cron started, but hashtag sync is paused (cron: ${deps.config.cronRecentMedia})`
    );
  }

  return { ...deps, hashtag };
}

export async function enqueueRecentMediaSync(
  deps: Pick<
    ApplicationDependencies,
    "config" | "queue" | "hashtagRepository"
  >
): Promise<void> {
  const hashtag = await deps.hashtagRepository.findByName(deps.config.hashtagName);

  if (!hashtag) {
    console.error(
      `Skipping recent media sync — hashtag not found: ${deps.config.hashtagName}`
    );
    return;
  }

  await deps.queue.enqueue(JobType.SYNC_RECENT_HASHTAG_MEDIA, {
    hashtag: hashtag.name,
    hashtagId: hashtag.instagramHashtagId,
  });
}

export async function shutdownApplication(
  deps: ApplicationDependencies
): Promise<void> {
  deps.scheduler.stopAll();
  await drainQueue(deps.queue);
  await deps.queueWorker.stop();
  await deps.queue.stopProcessing();
  await closePool();
}

async function drainQueue(queue: QueueInterface): Promise<void> {
  const started = Date.now();

  while (queue.size() > 0) {
    if (Date.now() - started > DRAIN_TIMEOUT_MS) {
      console.warn(
        `Queue drain timed out with ${queue.size()} job(s) remaining`
      );
      break;
    }

    await sleep(DRAIN_POLL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
