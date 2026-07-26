import { MetaMediaItem } from "../../src/integrations/meta";
import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { MediaRepository } from "../../src/db/repositories/media.repository";
import { SyncRunRepository } from "../../src/db/repositories/sync-run.repository";
import { AssetService } from "../../src/services/asset.service";
import { HashtagService } from "../../src/services/hashtag.service";
import { IngestionService } from "../../src/services/ingestion.service";
import { getTestPool } from "../helpers/db";

function buildMetaItem(id: string, overrides: Partial<MetaMediaItem> = {}): MetaMediaItem {
  return {
    id,
    mediaType: "IMAGE",
    timestamp: new Date("2026-01-01T10:00:00.000Z"),
    permalink: `https://instagram.com/p/${id}`,
    mediaUrl: `https://cdn.example.com/${id}.jpg`,
    caption: `Caption ${id}`,
    likeCount: 5,
    commentsCount: 1,
    ...overrides,
  };
}

describe("IngestionService", () => {
  const pool = () => getTestPool();

  function createService(options?: {
    items?: MetaMediaItem[];
    assetShouldFailFor?: Set<string>;
  }) {
    const items = options?.items ?? [
      buildMetaItem("media-1"),
      buildMetaItem("media-2"),
    ];
    const assetShouldFailFor = options?.assetShouldFailFor ?? new Set<string>();

    const metaClient = {
      searchHashtag: jest.fn().mockResolvedValue("ig-hashtag-999"),
      fetchAllTopMedia: jest.fn().mockResolvedValue(items),
      fetchAllRecentMedia: jest.fn().mockResolvedValue(items),
    };

    const hashtagService = new HashtagService(
      new HashtagRepository(pool()),
      metaClient as never
    );

    const assetService = {
      downloadAndStore: jest.fn(async ({ mediaId }: { mediaId: string }) => {
        if (assetShouldFailFor.has(mediaId)) {
          throw new Error(`Download failed for ${mediaId}`);
        }
        return `/storage/matcha/${mediaId}.jpg`;
      }),
    };

    const ingestionService = new IngestionService(
      metaClient as never,
      hashtagService,
      new MediaRepository(pool()),
      new SyncRunRepository(pool()),
      assetService as unknown as AssetService
    );

    return {
      ingestionService,
      metaClient,
      assetService,
    };
  }

  it("inserts new media items and stores assets", async () => {
    const { ingestionService, assetService } = createService();
    const mediaRepository = new MediaRepository(pool());

    const syncRun = await ingestionService.syncTopMedia({
      hashtagName: "matcha",
      instagramHashtagId: "ig-hashtag-999",
    });

    expect(syncRun.status).toBe("completed");
    expect(syncRun.itemsFetched).toBe(2);
    expect(syncRun.itemsInserted).toBe(2);
    expect(syncRun.itemsSkipped).toBe(0);
    expect(syncRun.itemsFailed).toBe(0);
    expect(assetService.downloadAndStore).toHaveBeenCalledTimes(2);

    const stored = await mediaRepository.findByInstagramId("media-1");
    expect(stored?.storedAssetPath).toBe("/storage/matcha/media-1.jpg");
  });

  it("skips duplicate media and updates sync_run stats", async () => {
    const mediaRepository = new MediaRepository(pool());
    const hashtagRepository = new HashtagRepository(pool());
    const hashtag = await hashtagRepository.findOrCreate(
      "matcha",
      "ig-hashtag-999"
    );

    await mediaRepository.upsert({
      instagramMediaId: "media-1",
      hashtagId: hashtag.id,
      mediaType: "IMAGE",
      caption: "Existing",
      permalink: "https://instagram.com/p/media-1",
      mediaUrl: "https://cdn.example.com/media-1.jpg",
      likeCount: 1,
      commentsCount: 0,
      instagramTimestamp: new Date("2025-12-01T10:00:00.000Z"),
      source: "top",
    });

    const { ingestionService } = createService({
      items: [buildMetaItem("media-1"), buildMetaItem("media-2")],
    });

    const syncRun = await ingestionService.syncTopMedia({
      hashtagName: "matcha",
      instagramHashtagId: "ig-hashtag-999",
    });

    expect(syncRun.itemsInserted).toBe(1);
    expect(syncRun.itemsSkipped).toBe(1);
    expect(syncRun.itemsFetched).toBe(2);
  });

  it("records asset failures without failing the entire sync", async () => {
    const { ingestionService } = createService({
      items: [buildMetaItem("media-1"), buildMetaItem("media-2")],
      assetShouldFailFor: new Set(["media-2"]),
    });

    const syncRun = await ingestionService.syncTopMedia({
      hashtagName: "matcha",
      instagramHashtagId: "ig-hashtag-999",
    });

    expect(syncRun.status).toBe("completed");
    expect(syncRun.itemsFailed).toBe(1);
    expect(syncRun.itemsInserted).toBe(2);
  });

  it("syncRecentMedia uses recent media fetcher", async () => {
    const { ingestionService, metaClient } = createService({
      items: [buildMetaItem("recent-1")],
    });

    const syncRun = await ingestionService.syncRecentMedia({
      hashtagName: "matcha",
      instagramHashtagId: "ig-hashtag-999",
    });

    expect(metaClient.fetchAllRecentMedia).toHaveBeenCalledWith("ig-hashtag-999");
    expect(syncRun.syncType).toBe("recent");
    expect(syncRun.itemsInserted).toBe(1);
  });
});
