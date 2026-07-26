export const JobType = {
  SYNC_TOP_HASHTAG_MEDIA: "SYNC_TOP_HASHTAG_MEDIA",
  SYNC_RECENT_HASHTAG_MEDIA: "SYNC_RECENT_HASHTAG_MEDIA",
} as const;

export type JobType = (typeof JobType)[keyof typeof JobType];

export interface HashtagSyncJobPayload {
  hashtag: string;
  hashtagId: string;
}

export interface Job<TPayload = unknown> {
  id: string;
  type: JobType;
  payload: TPayload;
  enqueuedAt: Date;
}

export type JobHandler<TPayload = unknown> = (
  payload: TPayload
) => void | Promise<void>;

export type JobProcessor = (job: Job) => void | Promise<void>;
