import { JobType } from "../../src/jobs/job.types";
import { InMemoryQueue } from "../../src/infrastructure/queue";
import { QueueWorker } from "../../src/workers/queue.worker";

describe("QueueWorker", () => {
  it("dispatches jobs to registered handlers by type", async () => {
    const queue = new InMemoryQueue();
    const worker = new QueueWorker(queue);
    const handled: string[] = [];

    worker.register(JobType.SYNC_TOP_HASHTAG_MEDIA, async (payload) => {
      handled.push(`top:${(payload as { hashtag: string }).hashtag}`);
    });

    worker.register(JobType.SYNC_RECENT_HASHTAG_MEDIA, async (payload) => {
      handled.push(`recent:${(payload as { hashtag: string }).hashtag}`);
    });

    worker.start();

    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-1",
    });
    await queue.enqueue(JobType.SYNC_RECENT_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-1",
    });

    await waitFor(() => handled.length === 2);
    await worker.stop();

    expect(handled).toEqual(["top:matcha", "recent:matcha"]);
  });

  it("continues processing after a handler throws", async () => {
    const queue = new InMemoryQueue();
    const worker = new QueueWorker(queue);
    const handled: string[] = [];

    worker.register(JobType.SYNC_TOP_HASHTAG_MEDIA, async () => {
      throw new Error("sync failed");
    });

    worker.register(JobType.SYNC_RECENT_HASHTAG_MEDIA, async (payload) => {
      handled.push((payload as { hashtag: string }).hashtag);
    });

    worker.start();

    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-1",
    });
    await queue.enqueue(JobType.SYNC_RECENT_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-1",
    });

    await waitFor(() => handled.length === 1);
    await worker.stop();

    expect(handled).toEqual(["matcha"]);
  });

  it("throws when no handler is registered for a job type", async () => {
    const queue = new InMemoryQueue();
    const worker = new QueueWorker(queue);

    worker.start();
    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, {
      hashtag: "matcha",
      hashtagId: "ig-1",
    });

    await sleep(300);

    await expect(worker.stop()).rejects.toThrow(
      "No handler registered for job type: SYNC_TOP_HASHTAG_MEDIA"
    );
  });
});

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000
): Promise<void> {
  const start = Date.now();

  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
