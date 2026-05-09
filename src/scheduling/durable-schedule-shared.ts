import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export interface DailyTime {
  hour: number;
  minute: number;
}

export interface DurableScheduleStatus {
  installed: boolean;
  platform: NodeJS.Platform;
  taskLabel: string;
  details?: string;
}

export function normalizeCronExpression(input: string): string {
  const normalized = input.trim().replace(/\s+/g, " ");
  const parts = normalized.split(" ");
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${input}. Expected 5 fields (minute hour day month weekday).`);
  }
  if (parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid cron expression: ${input}. Empty cron fields are not allowed.`);
  }
  return normalized;
}

export function parseDailyTime(input: string): DailyTime {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) throw new Error(`Invalid time format: ${input}. Expected HH:MM in 24-hour time.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time value: ${input}. Hour must be 0-23 and minute 0-59.`);
  }
  return { hour, minute };
}

export function buildTaskLabel(workspaceDir: string): string {
  const digest = createHash("sha256").update(workspaceDir).digest("hex").slice(0, 10);
  return `com.dreamer.daily.${digest}`;
}

export function resolveSchedulePaths(workspaceDir: string): { nodePath: string; cliPath: string; logPath: string } {
  return {
    nodePath: process.execPath,
    cliPath: join(workspaceDir, "src", "cli.ts"),
    logPath: join(workspaceStorageDir(workspaceDir), "logs", "schedule.log")
  };
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function shQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function runOrThrow(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return (result.stdout ?? "").trim();
}

export function tryRun(command: string, args: string[]): { ok: boolean; output: string } {
  const result = spawnSync(command, args, { encoding: "utf-8" });
  return {
    ok: result.status === 0,
    output: (result.stdout || result.stderr || "").trim()
  };
}
