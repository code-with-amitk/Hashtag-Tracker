import { HashtagSyncJobPayload, JobHandler } from "./job.types";
import { IngestionService } from "../services/ingestion.service";

export function createSyncTopMediaJobHandler(
  ingestionService: IngestionService
): JobHandler<HashtagSyncJobPayload> {
  return async (payload) => {
    await ingestionService.syncTopMedia({
      hashtagName: payload.hashtag,
      instagramHashtagId: payload.hashtagId,
    });
  };
}
