import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { PortableSchedule } from "./durable-schedule.js";
import type { DailyTime, DurableScheduleStatus } from "./durable-schedule-shared.js";
import { resolveSchedulePaths, runOrThrow, shQuote, tryRun, xmlEscape } from "./durable-schedule-shared.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export async function installLaunchd(workspaceDir: string, taskLabel: string, dailyTime: DailyTime, runAtLoad: boolean): Promise<void> {
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(launchAgentsDir, `${taskLabel}.plist`);
  const { nodePath, cliPath, logPath } = resolveSchedulePaths(workspaceDir);
  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(join(workspaceStorageDir(workspaceDir), "logs"), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xmlEscape(taskLabel)}</string>
<key>ProgramArguments</key><array>
<string>${xmlEscape(nodePath)}</string><string>--import</string><string>tsx</string><string>${xmlEscape(cliPath)}</string><string>run</string>
</array>
<key>WorkingDirectory</key><string>${xmlEscape(workspaceDir)}</string>
<key>StartCalendarInterval</key><dict><key>Hour</key><integer>${dailyTime.hour}</integer><key>Minute</key><integer>${dailyTime.minute}</integer></dict>
<key>RunAtLoad</key><${runAtLoad ? "true" : "false"}/>
<key>StandardOutPath</key><string>${xmlEscape(logPath)}</string>
<key>StandardErrorPath</key><string>${xmlEscape(logPath)}</string>
</dict></plist>
`;
  await writeFile(plistPath, plist, "utf-8");
  void tryRun("launchctl", ["unload", "-w", plistPath]);
  runOrThrow("launchctl", ["load", "-w", plistPath]);
}

export async function installLaunchdPortable(workspaceDir: string, taskLabel: string, portable: PortableSchedule, runAtLoad: boolean): Promise<void> {
  const launchAgentsDir = join(homedir(), "Library", "LaunchAgents");
  const plistPath = join(launchAgentsDir, `${taskLabel}.plist`);
  const { nodePath, cliPath, logPath } = resolveSchedulePaths(workspaceDir);
  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(join(workspaceStorageDir(workspaceDir), "logs"), { recursive: true });

  const interval =
    portable.kind === "hourly"
      ? `<dict><key>Minute</key><integer>${portable.at.split(":")[1] ?? "0"}</integer></dict>`
      : portable.kind === "daily"
        ? `<dict><key>Hour</key><integer>${portable.at.split(":")[0]}</integer><key>Minute</key><integer>${portable.at.split(":")[1]}</integer></dict>`
        : portable.kind === "weekly"
          ? `<dict><key>Weekday</key><integer>${portable.weekday ?? 1}</integer><key>Hour</key><integer>${portable.at.split(":")[0]}</integer><key>Minute</key><integer>${portable.at.split(":")[1]}</integer></dict>`
          : `<dict><key>Day</key><integer>${portable.dayOfMonth ?? 1}</integer><key>Hour</key><integer>${portable.at.split(":")[0]}</integer><key>Minute</key><integer>${portable.at.split(":")[1]}</integer></dict>`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xmlEscape(taskLabel)}</string>
<key>ProgramArguments</key><array>
<string>${xmlEscape(nodePath)}</string><string>--import</string><string>tsx</string><string>${xmlEscape(cliPath)}</string><string>run</string>
</array>
<key>WorkingDirectory</key><string>${xmlEscape(workspaceDir)}</string>
<key>StartCalendarInterval</key>${interval}
<key>RunAtLoad</key><${runAtLoad ? "true" : "false"}/>
<key>StandardOutPath</key><string>${xmlEscape(logPath)}</string>
<key>StandardErrorPath</key><string>${xmlEscape(logPath)}</string>
</dict></plist>
`;
  await writeFile(plistPath, plist, "utf-8");
  void tryRun("launchctl", ["unload", "-w", plistPath]);
  runOrThrow("launchctl", ["load", "-w", plistPath]);
}

export async function removeLaunchd(taskLabel: string): Promise<void> {
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${taskLabel}.plist`);
  void tryRun("launchctl", ["unload", "-w", plistPath]);
  await rm(plistPath, { force: true });
}

export async function launchdStatus(taskLabel: string): Promise<DurableScheduleStatus> {
  const plistPath = join(homedir(), "Library", "LaunchAgents", `${taskLabel}.plist`);
  const plistExists = await readFile(plistPath, "utf-8").then(() => true).catch(() => false);
  if (!plistExists) return { installed: false, platform: process.platform, taskLabel, details: "launchd plist not found" };
  const loaded = tryRun("launchctl", ["list", taskLabel]);
  return {
    installed: loaded.ok,
    platform: process.platform,
    taskLabel,
    details: loaded.ok ? `loaded (${plistPath})` : `plist present but not loaded (${plistPath})`
  };
}

export async function installCron(workspaceDir: string, taskLabel: string, dailyTime: DailyTime): Promise<void> {
  await installCronExpression(workspaceDir, taskLabel, `${dailyTime.minute} ${dailyTime.hour} * * *`);
}

export async function installCronExpression(workspaceDir: string, taskLabel: string, cronExpression: string): Promise<void> {
  const { nodePath, cliPath, logPath } = resolveSchedulePaths(workspaceDir);
  await mkdir(join(workspaceStorageDir(workspaceDir), "logs"), { recursive: true });
  const marker = `# ${taskLabel}`;
  const command = `${cronExpression} cd ${shQuote(workspaceDir)} && ${shQuote(nodePath)} --import tsx ${shQuote(cliPath)} run >> ${shQuote(logPath)} 2>&1 ${marker}`;
  const current = tryRun("crontab", ["-l"]);
  const lines = (current.ok ? current.output : "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.includes(marker));
  lines.push(command);
  const apply = spawnSync("crontab", ["-"], { input: `${lines.join("\n")}\n`, encoding: "utf-8" });
  if (apply.status !== 0) throw new Error((apply.stderr || apply.stdout || "failed to update crontab").trim());
}

export async function removeCron(taskLabel: string): Promise<void> {
  const marker = `# ${taskLabel}`;
  const current = tryRun("crontab", ["-l"]);
  if (!current.ok) return;
  const lines = current.output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !line.includes(marker));
  const apply = spawnSync("crontab", ["-"], { input: lines.length > 0 ? `${lines.join("\n")}\n` : "", encoding: "utf-8" });
  if (apply.status !== 0) throw new Error((apply.stderr || apply.stdout || "failed to update crontab").trim());
}

export async function cronStatus(taskLabel: string): Promise<DurableScheduleStatus> {
  const marker = `# ${taskLabel}`;
  const current = tryRun("crontab", ["-l"]);
  const installed = current.ok && current.output.includes(marker);
  return { installed, platform: process.platform, taskLabel, details: installed ? "cron entry found" : "cron entry missing" };
}
