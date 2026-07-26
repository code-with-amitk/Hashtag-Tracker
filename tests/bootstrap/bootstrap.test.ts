import { AppConfig } from "../../src/config";
import {
  ApplicationDependencies,
  enqueueRecentMediaSync,
  startApplication,
} from "../../src/bootstrap";
import { JobType } from "../../src/jobs";
import { Hashtag } from "../../src/types";
import { QueueInterface } from "../../src/infrastructure/queue/queue.interface";
import { SchedulerInterface } from "../../src/infrastructure/scheduler/scheduler.interface";
import { QueueWorker } from "../../src/workers/queue.worker";
import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { HashtagService } from "../../src/services/hashtag.service";
import { MediaService } from "../../src/services/media.service";

function buildConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: "postgresql://localhost/hashtag_tracker",
    metaAccessToken: "token",
    metaUserId: "user-id",
    hashtagName: "matcha",
    storageBasePath: "./storage",
    port: 3000,
    syncMaxItems: 500,
    cronRecentMedia: "0 */3 * * *",
    ...overrides,
  };
}

function buildHashtag(overrides: Partial<Hashtag> = {}): Hashtag {
  return {
    id: "hashtag-uuid",
    name: "matcha",
    instagramHashtagId: "ig-hashtag-123",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createMockDeps(options?: {
  hashtag?: Hashtag;
  findByNameResult?: Hashtag | null;
}): ApplicationDependencies {
  const hashtag = options?.hashtag ?? buildHashtag();
  const queue: QueueInterface = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    dequeue: jest.fn(),
    process: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    stopProcessing: jest.fn().mockResolvedValue(undefined),
  };

  const scheduler: SchedulerInterface = {
    schedule: jest.fn().mockReturnValue({ stop: jest.fn() }),
    stopAll: jest.fn(),
  };

  const queueWorker = {
    start: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    register: jest.fn(),
  } as unknown as QueueWorker;

  const hashtagService = {
    resolveHashtag: jest.fn().mockResolvedValue(hashtag),
  } as unknown as HashtagService;

  const hashtagRepository = {
    findByName: jest
      .fn()
      .mockResolvedValue(
        options?.findByNameResult === undefined
          ? hashtag
          : options.findByNameResult
      ),
  } as unknown as HashtagRepository;

  return {
    config: buildConfig(),
    queue,
    scheduler,
    queueWorker,
    hashtagService,
    hashtagRepository,
    mediaService: {
      listHashtagMedia: jest.fn(),
    } as unknown as MediaService,
    runMigrations: jest.fn(),
  };
}

describe("startApplication", () => {
  it("runs migrations, resolves hashtag, starts worker, and enqueues top sync", async () => {
    const deps = createMockDeps();

    const context = await startApplication(deps);

    expect(deps.runMigrations).toHaveBeenCalledWith(deps.config.databaseUrl);
    expect(deps.hashtagService.resolveHashtag).toHaveBeenCalledWith("matcha");
    expect(deps.queueWorker.start).toHaveBeenCalled();
    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      JobType.SYNC_TOP_HASHTAG_MEDIA,
      {
        hashtag: "matcha",
        hashtagId: "ig-hashtag-123",
      }
    );
    expect(deps.scheduler.schedule).toHaveBeenCalledWith(
      "0 */3 * * *",
      expect.any(Function)
    );
    expect(context.hashtag?.name).toBe("matcha");
  });

  it("continues startup when Meta hashtag resolution fails", async () => {
    const deps = createMockDeps({ findByNameResult: null });
    (deps.hashtagService.resolveHashtag as jest.Mock).mockRejectedValue(
      new Error("(#200) Requires instagram_basic permission")
    );

    const context = await startApplication(deps);

    expect(deps.queueWorker.start).toHaveBeenCalled();
    expect(deps.queue.enqueue).not.toHaveBeenCalled();
    expect(deps.scheduler.schedule).toHaveBeenCalled();
    expect(context.hashtag).toBeNull();
  });

  it("uses existing DB hashtag when Meta resolution fails", async () => {
    const hashtag = buildHashtag();
    const deps = createMockDeps({ findByNameResult: hashtag });
    (deps.hashtagService.resolveHashtag as jest.Mock).mockRejectedValue(
      new Error("Meta API unavailable")
    );

    const context = await startApplication(deps);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      JobType.SYNC_TOP_HASHTAG_MEDIA,
      {
        hashtag: "matcha",
        hashtagId: "ig-hashtag-123",
      }
    );
    expect(context.hashtag).toEqual(hashtag);
  });
});

describe("enqueueRecentMediaSync", () => {
  it("enqueues recent media sync with the stored hashtag payload", async () => {
    const deps = createMockDeps();

    await enqueueRecentMediaSync(deps);

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      JobType.SYNC_RECENT_HASHTAG_MEDIA,
      {
        hashtag: "matcha",
        hashtagId: "ig-hashtag-123",
      }
    );
  });

  it("skips enqueue when hashtag is missing from the database", async () => {
    const deps = createMockDeps({ findByNameResult: null });

    await enqueueRecentMediaSync(deps);

    expect(deps.queue.enqueue).not.toHaveBeenCalled();
  });
});

describe("cron callback", () => {
  it("registers a callback that enqueues recent media sync", async () => {
    const deps = createMockDeps();

    await startApplication(deps);

    const scheduleMock = deps.scheduler.schedule as jest.Mock;
    const cronCallback = scheduleMock.mock.calls[0][1] as () => Promise<void>;

    await cronCallback();

    expect(deps.queue.enqueue).toHaveBeenCalledWith(
      JobType.SYNC_RECENT_HASHTAG_MEDIA,
      {
        hashtag: "matcha",
        hashtagId: "ig-hashtag-123",
      }
    );
  });
});
