import request from "supertest";
import { createApp } from "../../src/api/app";
import { JobType } from "../../src/jobs";
import { AppConfig } from "../../src/config";
import { MediaService } from "../../src/services/media.service";
import { QueueInterface } from "../../src/infrastructure/queue/queue.interface";
import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { Hashtag } from "../../src/types";

function buildDeps(options?: { hashtag?: Hashtag | null }) {
  const hashtag: Hashtag = {
    id: "uuid",
    name: "matcha",
    instagramHashtagId: "ig-123",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const queue: QueueInterface = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    dequeue: jest.fn(),
    process: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    stopProcessing: jest.fn().mockResolvedValue(undefined),
  };

  const hashtagRepository = {
    findByName: jest
      .fn()
      .mockResolvedValue(
        options?.hashtag === undefined ? hashtag : options.hashtag
      ),
  } as unknown as HashtagRepository;

  const config: AppConfig = {
    databaseUrl: "postgresql://localhost/db",
    metaAccessToken: "token",
    metaUserId: "user",
    hashtagName: "matcha",
    storageBasePath: "./storage",
    port: 3000,
    syncMaxItems: 500,
    cronRecentMedia: "0 */3 * * *",
  };

  return {
    app: createApp({
      mediaService: { listHashtagMedia: jest.fn() } as unknown as MediaService,
      queue,
      hashtagRepository,
      config,
    }),
    queue,
  };
}

describe("POST /sync", () => {
  it("POST /sync/top enqueues a top media sync job", async () => {
    const { app, queue } = buildDeps();

    const response = await request(app).post("/sync/top");

    expect(response.status).toBe(202);
    expect(response.body.message).toBe("Top media sync enqueued");
    expect(queue.enqueue).toHaveBeenCalledWith(JobType.SYNC_TOP_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-123",
    });
  });

  it("POST /sync/recent enqueues a recent media sync job", async () => {
    const { app, queue } = buildDeps();

    const response = await request(app).post("/sync/recent");

    expect(response.status).toBe(202);
    expect(response.body.message).toBe("Recent media sync enqueued");
    expect(queue.enqueue).toHaveBeenCalledWith(
      JobType.SYNC_RECENT_HASHTAG_MEDIA,
      {
        hashtag: "matcha",
        hashtagId: "ig-123",
      }
    );
  });

  it("returns 503 when hashtag is not in the database", async () => {
    const { app, queue } = buildDeps({ hashtag: null });

    const response = await request(app).post("/sync/top");

    expect(response.status).toBe(503);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});
