import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { summarizeCopilotTranscript, type TranscriptSummary } from "./dream-quality-transcript-summary.js";

export type FilePreview = {
  path: string;
  exists: boolean;
  sizeBytes?: number;
  lineCount?: number;
  head?: string[];
  tail?: string[];
};

export async function previewFile(path: string, maxLines = 6): Promise<FilePreview> {
  try {
    const [raw, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    const lines = raw.split("\n");
    return {
      path,
      exists: true,
      sizeBytes: info.size,
      lineCount: lines.length,
      head: lines.slice(0, maxLines),
      tail: lines.slice(Math.max(0, lines.length - maxLines))
    };
  } catch {
    return { path, exists: false };
  }
}

export async function countMemoryRecords(path: string): Promise<number | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.records)) return record.records.length;
      if (Array.isArray(record.memory)) return record.memory.length;
    }
    return null;
  } catch {
    return null;
  }
}

export async function readMemoryStatements(paths: string[]): Promise<string[]> {
  const statements: string[] = [];
  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const records = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).records)
          ? ((parsed as Record<string, unknown>).records as unknown[])
          : [];
      for (const record of records) {
        const statement = (record as { statement?: unknown }).statement;
        if (typeof statement === "string" && statement.trim().length > 0) statements.push(statement);
      }
    } catch {
      continue;
    }
  }
  return [...new Set(statements)].slice(0, 8);
}

export async function readProviderSummaryPreview(path: string): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as {
      providerOutputs?: { summary?: unknown };
    };
    const summary = parsed.providerOutputs?.summary;
    return typeof summary === "string" && summary.trim().length > 0 ? summary.slice(0, 400) : undefined;
  } catch {
    return undefined;
  }
}

export { summarizeCopilotTranscript, type TranscriptSummary };

