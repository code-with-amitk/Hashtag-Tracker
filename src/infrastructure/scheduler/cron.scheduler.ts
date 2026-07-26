import cron from "node-cron";
import {
  ScheduledTask,
  SchedulerInterface,
} from "./scheduler.interface";

export class CronScheduler implements SchedulerInterface {
  private readonly tasks: ScheduledTask[] = [];

  schedule(
    cronExpression: string,
    callback: () => void | Promise<void>
  ): ScheduledTask {
    const task = cron.schedule(cronExpression, () => {
      void callback();
    });

    this.tasks.push(task);
    return task;
  }

  stopAll(): void {
    for (const task of this.tasks) {
      task.stop();
    }
    this.tasks.length = 0;
  }
}
