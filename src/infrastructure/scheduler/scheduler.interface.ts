export interface ScheduledTask {
  stop(): void;
}

export interface SchedulerInterface {
  schedule(
    cronExpression: string,
    callback: () => void | Promise<void>
  ): ScheduledTask;
  stopAll(): void;
}
