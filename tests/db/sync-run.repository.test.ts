import { HashtagRepository } from "../../src/db/repositories/hashtag.repository";
import { SyncRunRepository } from "../../src/db/repositories/sync-run.repository";
import { getTestPool } from "../helpers/db";

describe("SyncRunRepository", () => {
  const syncRunRepository = () => new SyncRunRepository(getTestPool());
  const hashtagRepository = () => new HashtagRepository(getTestPool());

  async function createHashtag() {
    return hashtagRepository().findOrCreate("matcha", "ig-hashtag-123");
  }

  it("creates a pending sync run", async () => {
    const hashtag = await createHashtag();
    const syncRun = await syncRunRepository().create(hashtag.id, "top");

    expect(syncRun.status).toBe("pending");
    expect(syncRun.syncType).toBe("top");
    expect(syncRun.itemsFetched).toBe(0);
  });

  it("marks a sync run as started", async () => {
    const hashtag = await createHashtag();
    const created = await syncRunRepository().create(hashtag.id, "recent");
    const started = await syncRunRepository().markStarted(created.id);

    expect(started.status).toBe("running");
    expect(started.startedAt).not.toBeNull();
  });

  it("updates status explicitly", async () => {
    const hashtag = await createHashtag();
    const created = await syncRunRepository().create(hashtag.id, "top");
    const updated = await syncRunRepository().updateStatus(created.id, "running");

    expect(updated.status).toBe("running");
  });

  it("increments counters", async () => {
    const hashtag = await createHashtag();
    const created = await syncRunRepository().create(hashtag.id, "top");
    const updated = await syncRunRepository().incrementCounters(created.id, {
      fetched: 10,
      inserted: 4,
      skipped: 5,
      failed: 1,
    });

    expect(updated.itemsFetched).toBe(10);
    expect(updated.itemsInserted).toBe(4);
    expect(updated.itemsSkipped).toBe(5);
    expect(updated.itemsFailed).toBe(1);
  });

  it("marks a sync run as completed", async () => {
    const hashtag = await createHashtag();
    const created = await syncRunRepository().create(hashtag.id, "top");
    await syncRunRepository().markStarted(created.id);
    const completed = await syncRunRepository().markCompleted(created.id);

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).not.toBeNull();
  });

  it("marks a sync run as failed with an error message", async () => {
    const hashtag = await createHashtag();
    const created = await syncRunRepository().create(hashtag.id, "recent");
    const failed = await syncRunRepository().markFailed(
      created.id,
      "Meta API rate limit"
    );

    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toBe("Meta API rate limit");
    expect(failed.completedAt).not.toBeNull();
  });
});
