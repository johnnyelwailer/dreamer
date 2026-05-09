import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { NormalizedEvent } from "../core/types.js";

type TranscriptRecord = {
  type?: string;
  id?: string;
  timestamp?: string;
  data?: {
    content?: string;
    toolName?: string;
    toolCallId?: string;
    success?: boolean;
    toolRequests?: Array<{ name?: string }>;
  };
};

export async function readCopilotTranscriptEvents(
  sessionDir: string,
  sessionEvent: NormalizedEvent
): Promise<NormalizedEvent[]> {
  const sid = String(sessionEvent.metadata.sessionId ?? basename(sessionDir));
  const transcriptPath = join(sessionDir, "..", "..", "transcripts", `${sid}.jsonl`);
  const lines = await safeReadLines(transcriptPath);
  const events: NormalizedEvent[] = [];

  for (const line of lines) {
    const parsed = safeParse<TranscriptRecord>(line);
    if (!parsed) continue;
    const mapped = mapTranscriptRecord(parsed);
    if (mapped) events.push(mapped);
  }

  return events;
}

async function safeReadLines(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function mapTranscriptRecord(record: TranscriptRecord): NormalizedEvent | null {
  const type = record.type ?? "unknown";
  if (type === "session.start") return null;

  const timestamp = record.timestamp ?? new Date().toISOString();
  const id = record.id ?? `${type}:${timestamp}`;

  if (type === "user.message" || type === "assistant.message") {
    const role = type.startsWith("user") ? "user" : "assistant";
    const content = (record.data?.content ?? "").trim();
    const toolRequests = (record.data?.toolRequests ?? [])
      .map((request) => request.name)
      .filter((name): name is string => Boolean(name));
    const text =
      content.length > 0
        ? content
        : toolRequests.length > 0
          ? `Tool requests: ${toolRequests.join(", ")}`
          : `${role} message`;

    return {
      id,
      timestamp,
      source: "copilot-transcript",
      kind: "message",
      text: text.slice(0, 400),
      metadata: {
        role,
        type
      }
    };
  }

  if (type === "tool.execution_start" || type === "tool.execution_complete") {
    const toolName = record.data?.toolName ?? "unknown-tool";
    const toolCallId = record.data?.toolCallId ?? "unknown-call";
    const success = record.data?.success;
    return {
      id,
      timestamp,
      source: "copilot-transcript",
      kind: "tool",
      text:
        type === "tool.execution_start"
          ? `Tool start: ${toolName}`
          : `Tool complete: ${toolName} success=${String(success ?? "unknown")}`,
      metadata: {
        type,
        toolName,
        toolCallId,
        success: success ?? null
      }
    };
  }

  return {
    id,
    timestamp,
    source: "copilot-transcript",
    kind: "unknown",
    text: type,
    metadata: {
      type
    }
  };
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
