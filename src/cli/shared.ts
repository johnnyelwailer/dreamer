import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { ttyWriteLine } from "../shared/tty-log-format.js";

export type HealthStatus = "ok" | "warn" | "fail";

export type HealthCheck = {
  status: HealthStatus;
  label: string;
  detail: string;
};

export function statusPrefix(status: HealthStatus): string {
  if (status === "ok") return "[ok]";
  if (status === "warn") return "[warn]";
  return "[fail]";
}

export function printChecks(title: string, checks: HealthCheck[]): void {
  ttyWriteLine(`\n${title}`);
  for (const check of checks) {
    ttyWriteLine(`${statusPrefix(check.status)} ${check.label}: ${check.detail}`);
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}