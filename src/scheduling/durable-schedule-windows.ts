import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { PortableSchedule } from "./durable-schedule.js";
import type { DailyTime, DurableScheduleStatus } from "./durable-schedule-shared.js";
import { resolveSchedulePaths, runOrThrow, tryRun } from "./durable-schedule-shared.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export async function installWindowsTask(workspaceDir: string, taskLabel: string, dailyTime: DailyTime): Promise<void> {
  const { nodePath, cliPath, logPath } = resolveSchedulePaths(workspaceDir);
  await mkdir(join(workspaceStorageDir(workspaceDir), "logs"), { recursive: true });
  const time = `${String(dailyTime.hour).padStart(2, "0")}:${String(dailyTime.minute).padStart(2, "0")}`;
  const taskCommand = `cmd /d /c "cd /d \"${workspaceDir}\" && \"${nodePath}\" --import tsx \"${cliPath}\" run >> \"${logPath}\" 2>&1"`;
  runOrThrow("schtasks", ["/Create", "/F", "/SC", "DAILY", "/ST", time, "/TN", taskLabel, "/TR", taskCommand]);
}

export async function installWindowsPortableTask(workspaceDir: string, taskLabel: string, portable: PortableSchedule): Promise<void> {
  const { nodePath, cliPath, logPath } = resolveSchedulePaths(workspaceDir);
  await mkdir(join(workspaceStorageDir(workspaceDir), "logs"), { recursive: true });
  const [hh, mm] = portable.at.split(":");
  const time = `${hh}:${mm}`;
  const taskCommand = `cmd /d /c "cd /d \"${workspaceDir}\" && \"${nodePath}\" --import tsx \"${cliPath}\" run >> \"${logPath}\" 2>&1"`;

  if (portable.kind === "hourly") {
    runOrThrow("schtasks", ["/Create", "/F", "/SC", "HOURLY", "/MO", "1", "/ST", `00:${mm}`, "/TN", taskLabel, "/TR", taskCommand]);
    return;
  }
  if (portable.kind === "daily") {
    runOrThrow("schtasks", ["/Create", "/F", "/SC", "DAILY", "/ST", time, "/TN", taskLabel, "/TR", taskCommand]);
    return;
  }
  if (portable.kind === "weekly") {
    const dayMap = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const day = dayMap[portable.weekday ?? 1] ?? "MON";
    runOrThrow("schtasks", ["/Create", "/F", "/SC", "WEEKLY", "/D", day, "/ST", time, "/TN", taskLabel, "/TR", taskCommand]);
    return;
  }

  runOrThrow("schtasks", ["/Create", "/F", "/SC", "MONTHLY", "/D", String(portable.dayOfMonth ?? 1), "/ST", time, "/TN", taskLabel, "/TR", taskCommand]);
}

export async function removeWindowsTask(taskLabel: string): Promise<void> {
  void tryRun("schtasks", ["/Delete", "/TN", taskLabel, "/F"]);
}

export async function windowsTaskStatus(taskLabel: string): Promise<DurableScheduleStatus> {
  const result = tryRun("schtasks", ["/Query", "/TN", taskLabel]);
  return {
    installed: result.ok,
    platform: process.platform,
    taskLabel,
    details: result.ok ? "scheduled task found" : "scheduled task missing"
  };
}
