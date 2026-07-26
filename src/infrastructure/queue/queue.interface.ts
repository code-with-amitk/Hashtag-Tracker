import { Job, JobProcessor, JobType } from "../../jobs/job.types";

export interface QueueInterface {
  enqueue<TPayload>(type: JobType, payload: TPayload): Promise<void>;
  dequeue(): Job | undefined;
  process(processor: JobProcessor): void;
  size(): number;
  stopProcessing(): Promise<void>;
}
