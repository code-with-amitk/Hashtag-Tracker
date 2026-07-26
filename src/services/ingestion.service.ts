import { MediaRepository } from "../db/repositories/media.repository";
import { SyncRunRepository } from "../db/repositories/sync-run.repository";
import { MetaClient, MetaMediaItem } from "../integrations/meta";
import {
  Hashtag,
  MediaSource,
  SyncRun,
  SyncType,
} from "../types";
import { AssetService } from "./asset.service";
import { HashtagService } from "./hashtag.service";

export interface SyncMediaOptions {
  hashtagName: string;
  instagramHashtagId?: string;
}

export class IngestionService {
  constructor(
    private readonly metaClient: MetaClient,
    private readonly hashtagService: HashtagService,
    private readonly mediaRepository: MediaRepository,
    private readonly syncRunRepository: SyncRunRepository,
    private readonly assetService: AssetService
  ) {}

  async syncTopMedia(options: SyncMediaOptions): Promise<SyncRun> {
    return this.syncMedia(options, "top", (hashtagId) =>
      this.metaClient.fetchAllTopMedia(hashtagId)
    );
  }

  async syncRecentMedia(options: SyncMediaOptions): Promise<SyncRun> {
    return this.syncMedia(options, "recent", (hashtagId) =>
      this.metaClient.fetchAllRecentMedia(hashtagId)
    );
  }

  private async syncMedia(
    options: SyncMediaOptions,
    syncType: SyncType,
    fetchItems: (instagramHashtagId: string) => Promise<MetaMediaItem[]>
  ): Promise<SyncRun> {
    const hashtag = await this.hashtagService.resolveHashtag(
      options.hashtagName,
      options.instagramHashtagId
    );

    const syncRun = await this.syncRunRepository.create(hashtag.id, syncType);
    await this.syncRunRepository.markStarted(syncRun.id);

    try {
      const items = await fetchItems(hashtag.instagramHashtagId);
      await this.processItems(items, hashtag, syncType, syncRun.id);
      return this.syncRunRepository.markCompleted(syncRun.id);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingestion error";
      await this.syncRunRepository.markFailed(syncRun.id, message);
      throw error;
    }
  }

  private async processItems(
    items: MetaMediaItem[],
    hashtag: Hashtag,
    source: MediaSource,
    syncRunId: string
  ): Promise<void> {
    let inserted = 0;
    let skipped = 0;
    let failed = 0;

    for (const item of items) {
      const upsertResult = await this.mediaRepository.upsert({
        instagramMediaId: item.id,
        hashtagId: hashtag.id,
        mediaType: item.mediaType,
        caption: item.caption,
        permalink: item.permalink,
        mediaUrl: item.mediaUrl,
        likeCount: item.likeCount,
        commentsCount: item.commentsCount,
        instagramTimestamp: item.timestamp,
        source,
      });

      if (upsertResult.inserted) {
        inserted += 1;
      } else {
        skipped += 1;
      }

      if (upsertResult.media.storedAssetPath) {
        continue;
      }

      try {
        const storedAssetPath = await this.assetService.downloadAndStore({
          hashtagName: hashtag.name,
          mediaId: item.id,
          mediaUrl: item.mediaUrl,
          mediaType: item.mediaType,
        });
        await this.mediaRepository.updateStoredAssetPath(
          upsertResult.media.id,
          storedAssetPath
        );
      } catch (error) {
        failed += 1;
        console.error(
          `Failed to store asset for media ${item.id}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    await this.syncRunRepository.incrementCounters(syncRunId, {
      fetched: items.length,
      inserted,
      skipped,
      failed,
    });
  }
}
