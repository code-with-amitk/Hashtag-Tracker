import {
  createSyncRecentMediaJobHandler,
  createSyncTopMediaJobHandler,
} from "../../src/jobs";
import { IngestionService } from "../../src/services/ingestion.service";

describe("sync job handlers", () => {
  it("top media job delegates to syncTopMedia", async () => {
    const ingestionService = {
      syncTopMedia: jest.fn().mockResolvedValue(undefined),
      syncRecentMedia: jest.fn(),
    } as unknown as IngestionService;

    const handler = createSyncTopMediaJobHandler(ingestionService);
    await handler({ hashtag: "matcha", hashtagId: "ig-123" });

    expect(ingestionService.syncTopMedia).toHaveBeenCalledWith({
      hashtagName: "matcha",
      instagramHashtagId: "ig-123",
    });
    expect(ingestionService.syncRecentMedia).not.toHaveBeenCalled();
  });

  it("recent media job delegates to syncRecentMedia", async () => {
    const ingestionService = {
      syncTopMedia: jest.fn(),
      syncRecentMedia: jest.fn().mockResolvedValue(undefined),
    } as unknown as IngestionService;

    const handler = createSyncRecentMediaJobHandler(ingestionService);
    await handler({ hashtag: "matcha", hashtagId: "ig-123" });

    expect(ingestionService.syncRecentMedia).toHaveBeenCalledWith({
      hashtagName: "matcha",
      instagramHashtagId: "ig-123",
    });
    expect(ingestionService.syncTopMedia).not.toHaveBeenCalled();
  });
});
