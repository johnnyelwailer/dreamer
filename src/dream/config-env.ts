import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readPositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function readList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function loadWorkspaceDotenv(workspaceDir: string): void {
  const envPath = join(workspaceDir, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed && !trimmed.startsWith("#") ? trimmed.match(/^([A-Z0-9_]+)=(.*)$/) : undefined;
    if (!match?.[1] || process.env[match[1]]) continue;
    const value = (match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (value) process.env[match[1]] = value;
  }
}