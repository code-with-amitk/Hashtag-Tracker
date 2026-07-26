import { Hashtag, Media, SyncRun } from "../../types";

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function mapHashtagRow(row: Record<string, unknown>): Hashtag {
  return {
    id: String(row.id),
    name: String(row.name),
    instagramHashtagId: String(row.instagram_hashtag_id),
    createdAt: toDate(row.created_at as string),
    updatedAt: toDate(row.updated_at as string),
  };
}

export function mapMediaRow(row: Record<string, unknown>): Media {
  return {
    id: String(row.id),
    instagramMediaId: String(row.instagram_media_id),
    hashtagId: String(row.hashtag_id),
    mediaType: String(row.media_type),
    caption: row.caption == null ? null : String(row.caption),
    permalink: String(row.permalink),
    mediaUrl: String(row.media_url),
    storedAssetPath:
      row.stored_asset_path == null ? null : String(row.stored_asset_path),
    likeCount: Number(row.like_count),
    commentsCount: Number(row.comments_count),
    instagramTimestamp: toDate(row.instagram_timestamp as string),
    source: row.source as Media["source"],
    createdAt: toDate(row.created_at as string),
    updatedAt: toDate(row.updated_at as string),
  };
}

export function mapSyncRunRow(row: Record<string, unknown>): SyncRun {
  return {
    id: String(row.id),
    hashtagId: String(row.hashtag_id),
    syncType: row.sync_type as SyncRun["syncType"],
    status: row.status as SyncRun["status"],
    itemsFetched: Number(row.items_fetched),
    itemsInserted: Number(row.items_inserted),
    itemsSkipped: Number(row.items_skipped),
    itemsFailed: Number(row.items_failed),
    errorMessage: row.error_message == null ? null : String(row.error_message),
    startedAt:
      row.started_at == null ? null : toDate(row.started_at as string),
    completedAt:
      row.completed_at == null ? null : toDate(row.completed_at as string),
    createdAt: toDate(row.created_at as string),
  };
}
