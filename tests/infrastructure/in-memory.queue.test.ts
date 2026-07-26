import { JobType } from "../../src/jobs/job.types";
import { InMemoryQueue } from "../../src/infrastructure/queue";

describe("InMemoryQueue", () => {
  afterEach(async () => {
    jest.useRealTimers();
  });

  it("processes jobs in FIFO order", async () => {
    const queue = new InMemoryQueue();
    const processed: string[] = [];

    queue.process(async (job) => {
      processed.push(String(job.payload));
    });

    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, "first");
    await queue.enqueue(JobType.SYNC_RECENT_HASHTAG_MEDIA, "second");

    await waitFor(() => processed.length === 2);

    expect(processed).toEqual(["first", "second"]);
    await queue.stopProcessing();
  });

  it("preserves typed payloads and job metadata", async () => {
    const queue = new InMemoryQueue();
    let receivedJob: unknown;

    queue.process(async (job) => {
      receivedJob = job;
    });

    const payload = { hashtag: "matcha", hashtagId: "ig-123" };
    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, payload);

    await waitFor(() => receivedJob !== undefined);

    expect(receivedJob).toMatchObject({
      type: JobType.SYNC_TOP_HASHTAG_MEDIA,
      payload,
    });
    expect(receivedJob).toHaveProperty("id");
    expect(receivedJob).toHaveProperty("enqueuedAt");

    await queue.stopProcessing();
  });

  it("dequeue returns jobs manually without a processor", async () => {
    const queue = new InMemoryQueue();

    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, { hashtag: "matcha" });

    const job = queue.dequeue();

    expect(job?.type).toBe(JobType.SYNC_TOP_HASHTAG_MEDIA);
    expect(queue.size()).toBe(0);
  });

  it("reports queue size", async () => {
    const queue = new InMemoryQueue();

    await queue.enqueue(JobType.SYNC_TOP_HASHTAG_MEDIA, "a");
    await queue.enqueue(JobType.SYNC_RECENT_HASHTAG_MEDIA, "b");

    expect(queue.size()).toBe(2);
  });
});

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
