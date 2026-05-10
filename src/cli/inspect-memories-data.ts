import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MemoryRecord } from "../core/types.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export type SourceId = "file" | "copilot" | "honcho" | "all";

function memoryPaths(workspaceDir: string): Record<Exclude<SourceId, "all">, string> {
  const storageDir = workspaceStorageDir(workspaceDir);
  return {
    file: join(storageDir, "memory.json"),
    copilot: join(storageDir, "copilot-memory.json"),
    honcho: join(storageDir, "honcho", "workspace.json")
  };
}

export function selectedSources(source: SourceId): Array<Exclude<SourceId, "all">> {
  return source === "all" ? ["file", "copilot", "honcho"] : [source];
}

function filterNoise(records: MemoryRecord[]): MemoryRecord[] {
  return records.filter((record) => !record.statement.startsWith("Observed "));
}

export async function pruneNoiseRecords(workspaceDir: string, source: SourceId): Promise<number> {
  let removed = 0;
  for (const key of selectedSources(source)) {
    const path = memoryPaths(workspaceDir)[key];
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const next = filterNoise(parsed as MemoryRecord[]);
        removed += parsed.length - next.length;
        if (next.length !== parsed.length) await writeFile(path, JSON.stringify(next, null, 2), "utf8");
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.records)) {
        const current = record.records as MemoryRecord[];
        const next = filterNoise(current);
        removed += current.length - next.length;
        record.records = next;
      }
      if (Array.isArray(record.memory)) {
        const current = record.memory as MemoryRecord[];
        const next = filterNoise(current);
        removed += current.length - next.length;
        record.memory = next;
      }
      await writeFile(path, JSON.stringify(record, null, 2), "utf8");
    } catch {
      continue;
    }
  }
  return removed;
}

export async function loadMemoryRows(workspaceDir: string, source: SourceId): Promise<Array<MemoryRecord & { from: string }>> {
  const out: Array<MemoryRecord & { from: string }> = [];
  for (const key of selectedSources(source)) {
    const path = memoryPaths(workspaceDir)[key];
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
      const rows = Array.isArray(parsed)
        ? (parsed as MemoryRecord[])
        : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).records)
          ? ((parsed as Record<string, unknown>).records as MemoryRecord[])
          : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).memory)
            ? ((parsed as Record<string, unknown>).memory as MemoryRecord[])
            : [];
      for (const row of rows) out.push({ ...row, from: key });
    } catch {
      continue;
    }
  }
  return out;
}
