export type MediaSource = "top" | "recent";

export interface Hashtag {
  id: string;
  name: string;
  instagramHashtagId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Media {
  id: string;
  instagramMediaId: string;
  hashtagId: string;
  mediaType: string;
  caption: string | null;
  permalink: string;
  mediaUrl: string;
  storedAssetPath: string | null;
  likeCount: number;
  commentsCount: number;
  instagramTimestamp: Date;
  source: MediaSource;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMediaInput {
  instagramMediaId: string;
  hashtagId: string;
  mediaType: string;
  caption: string | null;
  permalink: string;
  mediaUrl: string;
  likeCount: number;
  commentsCount: number;
  instagramTimestamp: Date;
  source: MediaSource;
}

export interface MediaUpsertResult {
  media: Media;
  inserted: boolean;
}

export interface PaginatedMediaResult {
  items: Media[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type SyncType = "top" | "recent";
export type SyncStatus = "pending" | "running" | "completed" | "failed";

export interface SyncRun {
  id: string;
  hashtagId: string;
  syncType: SyncType;
  status: SyncStatus;
  itemsFetched: number;
  itemsInserted: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface SyncCounterDeltas {
  fetched?: number;
  inserted?: number;
  skipped?: number;
  failed?: number;
}
