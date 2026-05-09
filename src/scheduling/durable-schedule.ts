import { buildTaskLabel, normalizeCronExpression, parseDailyTime } from "./durable-schedule-shared.js";
import type { DurableScheduleStatus } from "./durable-schedule-shared.js";
import {
  cronStatus,
  installCron,
  installCronExpression,
  installLaunchd,
  installLaunchdPortable,
  launchdStatus,
  removeCron,
  removeLaunchd
} from "./durable-schedule-posix.js";
import {
  installWindowsPortableTask,
  installWindowsTask,
  removeWindowsTask,
  windowsTaskStatus
} from "./durable-schedule-windows.js";

export { buildTaskLabel, normalizeCronExpression, parseDailyTime };
export type { DurableScheduleStatus };

export type PortableScheduleKind = "hourly" | "daily" | "weekly" | "monthly";

export interface PortableSchedule {
  kind: PortableScheduleKind;
  at: string;
  weekday?: number;
  dayOfMonth?: number;
}

export function buildPortableCronExpression(portable: PortableSchedule): string {
  const { minute, hour } = parseDailyTime(portable.at);
  if (portable.kind === "hourly") return `${minute} * * * *`;
  if (portable.kind === "daily") return `${minute} ${hour} * * *`;
  if (portable.kind === "weekly") return `${minute} ${hour} * * ${portable.weekday ?? 1}`;
  return `${minute} ${hour} ${portable.dayOfMonth ?? 1} * *`;
}

export async function installDurableSchedule(
  workspaceDir: string,
  dailyAt: string,
  options?: { runAtLoad?: boolean; cronExpression?: string; portable?: PortableSchedule }
): Promise<DurableScheduleStatus> {
  const cronExpression = options?.cronExpression ? normalizeCronExpression(options.cronExpression) : undefined;
  if (cronExpression && options?.portable) {
    throw new Error("Use either --cron or --portable, not both.");
  }
  const taskLabel = buildTaskLabel(workspaceDir);

  if (process.platform === "darwin") {
    if (cronExpression) {
      throw new Error("Native cron expressions are only supported on Linux. Use --portable on macOS.");
    }
    if (options?.portable) {
      await installLaunchdPortable(workspaceDir, taskLabel, options.portable, options?.runAtLoad ?? false);
    } else {
      await installLaunchd(workspaceDir, taskLabel, parseDailyTime(dailyAt), options?.runAtLoad ?? false);
    }
    return launchdStatus(taskLabel);
  }
  if (process.platform === "linux") {
    if (cronExpression) {
      await installCronExpression(workspaceDir, taskLabel, cronExpression);
    } else if (options?.portable) {
      await installCronExpression(workspaceDir, taskLabel, buildPortableCronExpression(options.portable));
    } else {
      await installCron(workspaceDir, taskLabel, parseDailyTime(dailyAt));
    }
    return cronStatus(taskLabel);
  }
  if (process.platform === "win32") {
    if (cronExpression) {
      throw new Error("Native cron expressions are only supported on Linux. Use --portable on Windows.");
    }
    if (options?.portable) {
      await installWindowsPortableTask(workspaceDir, taskLabel, options.portable);
    } else {
      await installWindowsTask(workspaceDir, taskLabel, parseDailyTime(dailyAt));
    }
    return windowsTaskStatus(taskLabel);
  }
  throw new Error(`Durable scheduling is not implemented for platform: ${process.platform}`);
}

export async function removeDurableSchedule(workspaceDir: string): Promise<DurableScheduleStatus> {
  const taskLabel = buildTaskLabel(workspaceDir);
  if (process.platform === "darwin") {
    await removeLaunchd(taskLabel);
    return launchdStatus(taskLabel);
  }
  if (process.platform === "linux") {
    await removeCron(taskLabel);
    return cronStatus(taskLabel);
  }
  if (process.platform === "win32") {
    await removeWindowsTask(taskLabel);
    return windowsTaskStatus(taskLabel);
  }
  throw new Error(`Durable scheduling is not implemented for platform: ${process.platform}`);
}

export async function getDurableScheduleStatus(workspaceDir: string): Promise<DurableScheduleStatus> {
  const taskLabel = buildTaskLabel(workspaceDir);
  if (process.platform === "darwin") return launchdStatus(taskLabel);
  if (process.platform === "linux") return cronStatus(taskLabel);
  if (process.platform === "win32") return windowsTaskStatus(taskLabel);
  throw new Error(`Durable scheduling is not implemented for platform: ${process.platform}`);
}
