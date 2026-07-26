import { AppDependencies } from "../../src/api/app";
import { AppConfig } from "../../src/config";
import { MediaService } from "../../src/services/media.service";
import { QueueInterface } from "../../src/infrastructure/queue/queue.interface";
import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";

export function buildTestAppDependencies(
  overrides: Partial<AppDependencies> = {}
): AppDependencies {
  const config: AppConfig = {
    databaseUrl: "postgresql://localhost/db",
    metaAccessToken: "token",
    metaUserId: "user",
    hashtagName: "matcha",
    storageBasePath: "./storage",
    port: 3000,
    syncMaxItems: 500,
    metaPageLimit: 10,
    cronRecentMedia: "0 */3 * * *",
  };

  return {
    mediaService: {
      listHashtagMedia: jest.fn(),
    } as unknown as MediaService,
    queue: {
      enqueue: jest.fn().mockResolvedValue(undefined),
      dequeue: jest.fn(),
      process: jest.fn(),
      size: jest.fn().mockReturnValue(0),
      stopProcessing: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueueInterface,
    hashtagRepository: {
      findByName: jest.fn(),
    } as unknown as HashtagRepository,
    config,
    ...overrides,
  };
}
