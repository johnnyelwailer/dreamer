import { readFile } from "node:fs/promises";
import type { EventKind, NormalizedEvent } from "../core/types.js";

type JsonRecord = Record<string, unknown>;

export async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

export async function readJsonLines(path: string): Promise<JsonRecord[]> {
  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

export function parseIso(value: unknown, fallback = new Date(0).toISOString()): string {
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString();
  }
  return fallback;
}

export function asEvent(
  source: string,
  id: string,
  kind: EventKind,
  timestamp: string,
  text: string,
  metadata: NormalizedEvent["metadata"] = {}
): NormalizedEvent {
  return { id, source, kind, timestamp, text, metadata };
}
