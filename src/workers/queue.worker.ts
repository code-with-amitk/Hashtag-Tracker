import {
  HashtagSyncJobPayload,
  JobHandler,
  JobType,
} from "../jobs/job.types";
import { QueueInterface } from "../infrastructure/queue";

const POLL_INTERVAL_MS = 100;

export class QueueWorker {
  private readonly handlers = new Map<JobType, JobHandler>();
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private activeJob: Promise<void> | null = null;
  private loopError: Error | null = null;

  constructor(private readonly queue: QueueInterface) {}

  register<TPayload>(
    type: JobType,
    handler: JobHandler<TPayload>
  ): void {
    this.handlers.set(type, handler as JobHandler);
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.loopError = null;
    this.loopPromise = this.runLoop().catch((error: unknown) => {
      this.loopError =
        error instanceof Error ? error : new Error(String(error));
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.activeJob) {
      await this.activeJob;
    }

    if (this.loopPromise) {
      await this.loopPromise;
    }

    if (this.loopError) {
      throw this.loopError;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      const job = this.queue.dequeue();

      if (!job) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      this.activeJob = Promise.resolve(
        handler(job.payload as HashtagSyncJobPayload)
      ).catch((error: unknown) => {
        console.error(
          `Job ${job.type} failed:`,
          error instanceof Error ? error.message : error
        );
      });
      await this.activeJob;
      this.activeJob = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
