import { HashtagSyncJobPayload, JobHandler } from "./job.types";
import { IngestionService } from "../services/ingestion.service";

export function createSyncRecentMediaJobHandler(
  ingestionService: IngestionService
): JobHandler<HashtagSyncJobPayload> {
  return async (payload) => {
    await ingestionService.syncRecentMedia({
      hashtagName: payload.hashtag,
      instagramHashtagId: payload.hashtagId,
    });
  };
}
