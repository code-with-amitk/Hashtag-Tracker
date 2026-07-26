import { randomUUID } from "crypto";
import { Job, JobProcessor, JobType } from "../../jobs/job.types";
import { QueueInterface } from "./queue.interface";

const POLL_INTERVAL_MS = 50;

export class InMemoryQueue implements QueueInterface {
  private readonly jobs: Job[] = [];
  private processor: JobProcessor | null = null;
  private processing = false;
  private running = false;
  private currentJob: Promise<void> | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  async enqueue<TPayload>(type: JobType, payload: TPayload): Promise<void> {
    this.jobs.push({
      id: randomUUID(),
      type,
      payload,
      enqueuedAt: new Date(),
    });

    this.scheduleProcess();
  }

  dequeue(): Job | undefined {
    return this.jobs.shift();
  }

  process(processor: JobProcessor): void {
    this.processor = processor;
    this.running = true;
    this.scheduleProcess();
  }

  size(): number {
    return this.jobs.length;
  }

  async stopProcessing(): Promise<void> {
    this.running = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.currentJob) {
      await this.currentJob;
    }
  }

  private scheduleProcess(): void {
    if (!this.running || this.processing || !this.processor) {
      return;
    }

    void this.runNext();
  }

  private async runNext(): Promise<void> {
    if (!this.running || !this.processor) {
      return;
    }

    const job = this.dequeue();
    if (!job) {
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        void this.runNext();
      }, POLL_INTERVAL_MS);
      return;
    }

    this.processing = true;
    this.currentJob = Promise.resolve(this.processor(job))
      .catch(() => undefined)
      .finally(() => {
        this.processing = false;
        this.currentJob = null;
        this.scheduleProcess();
      });

    await this.currentJob;
  }
}
