jest.mock("node-cron", () => ({
  __esModule: true,
  default: {
    schedule: jest.fn(),
  },
}));

import cron from "node-cron";
import {
  CronScheduler,
  ScheduledTask,
} from "../../src/infrastructure/scheduler";

const mockSchedule = cron.schedule as jest.MockedFunction<typeof cron.schedule>;

function mockCronTask(stop: jest.Mock = jest.fn()): ScheduledTask {
  return { stop } as unknown as ScheduledTask;
}

describe("CronScheduler", () => {
  beforeEach(() => {
    mockSchedule.mockReset();
    mockSchedule.mockReturnValue(mockCronTask() as ReturnType<typeof cron.schedule>);
  });

  it("registers a cron job with node-cron", () => {
    const scheduler = new CronScheduler();
    const callback = jest.fn();

    scheduler.schedule("0 */3 * * *", callback);

    expect(mockSchedule).toHaveBeenCalledWith("0 */3 * * *", expect.any(Function));
  });

  it("stopAll stops all scheduled tasks", () => {
    const scheduler = new CronScheduler();
    const stopOne = jest.fn();
    const stopTwo = jest.fn();

    mockSchedule
      .mockReturnValueOnce(mockCronTask(stopOne) as ReturnType<typeof cron.schedule>)
      .mockReturnValueOnce(mockCronTask(stopTwo) as ReturnType<typeof cron.schedule>);

    scheduler.schedule("0 */3 * * *", jest.fn());
    scheduler.schedule("0 * * * *", jest.fn());
    scheduler.stopAll();

    expect(stopOne).toHaveBeenCalledTimes(1);
    expect(stopTwo).toHaveBeenCalledTimes(1);
  });

  it("returns a task that can be stopped individually", () => {
    const scheduler = new CronScheduler();
    const stop = jest.fn();
    mockSchedule.mockReturnValue(mockCronTask(stop) as ReturnType<typeof cron.schedule>);

    const task = scheduler.schedule("0 */3 * * *", jest.fn());
    task.stop();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
