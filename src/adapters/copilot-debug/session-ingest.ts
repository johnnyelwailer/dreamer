import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedEvent } from "../../core/types.js";
import { readCopilotTranscriptEvents } from "../copilot-debug-transcript.js";
import type { CopilotDiscoveredSession, CopilotSessionCheckpoint, CopilotSessionIngestResult } from "./types.js";

type SessionStart = {
  ts?: number;
  sid?: string;
  type?: string;
  attrs?: { copilotVersion?: string; vscodeVersion?: string };
};

export async function ingestCopilotSession(
  session: CopilotDiscoveredSession,
  state: CopilotSessionCheckpoint
): Promise<CopilotSessionIngestResult> {
  const mainPath = join(session.path, "main.jsonl");
  const modelPath = join(session.path, "models.json");
  const lines = await safeReadLines(mainPath);
  const sessionEvent = mapSessionStart(lines[0] ?? "{}", session.sessionId, session.transcriptPath, session.workspaceDir);
  const modelEvent = await mapModels(modelPath, sessionEvent.timestamp, session.sessionId);
  const transcriptEvents = await readCopilotTranscriptEvents(session.path, sessionEvent);
  const scopedTranscriptEvents = transcriptEvents.map((event) => ({ ...event, id: `${session.sessionId}:${event.id}` }));
  const combined = [sessionEvent, modelEvent, ...scopedTranscriptEvents].filter(Boolean) as NormalizedEvent[];
  combined.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const latestTimestamp = combined.length > 0 ? combined.at(-1)?.timestamp : state.cursor;
  const hasSessionMetadata =
    state.lastObservedActivityMs !== undefined || state.lastObservedTranscriptLineCount !== undefined;
  const shouldReplay =
    hasSessionMetadata &&
    Boolean(state.cursor) &&
    (session.activityMs > (state.lastObservedActivityMs ?? 0) ||
      session.transcriptLineCount > (state.lastObservedTranscriptLineCount ?? 0)) &&
    Boolean(latestTimestamp) &&
    latestTimestamp <= state.cursor;

  const cursor = state.cursor;
  const events = shouldReplay || !cursor ? combined : combined.filter((event) => event.timestamp > cursor);
  return { events, cursor: latestTimestamp ?? cursor };
}

async function safeReadLines(filePath: string): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf8");
    return raw.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function mapSessionStart(line: string, fallbackSid: string, transcriptPath?: string, workspaceDir?: string): NormalizedEvent {
  const parsed = safeParse<SessionStart>(line) ?? {};
  const sid = parsed.sid ?? fallbackSid;
  const ts = parsed.ts ? new Date(parsed.ts).toISOString() : new Date().toISOString();
  return {
    id: `copilot:${sid}:start`,
    timestamp: ts,
    source: "copilot-debug",
    kind: parsed.type === "session_start" ? "session_start" : "unknown",
    text: `Session ${sid} started`,
    metadata: {
      sessionId: sid,
      copilotVersion: parsed.attrs?.copilotVersion ?? "unknown",
      vscodeVersion: parsed.attrs?.vscodeVersion ?? "unknown",
      transcriptPath: transcriptPath ?? null,
      workspaceDir: workspaceDir ?? null
    }
  };
}

async function mapModels(filePath: string, timestamp: string, sid: string): Promise<NormalizedEvent | null> {
  try {
    const raw = await readFile(filePath, "utf8");
    const models = JSON.parse(raw) as Array<{ id?: string; vendor?: string }>;
    const first = models[0] ?? {};
    return {
      id: `copilot:${sid}:model:${String(first.id ?? "unknown")}`,
      timestamp,
      source: "copilot-debug",
      kind: "unknown",
      text: `Model metadata discovered: ${String(first.id ?? "unknown")}`,
      metadata: { vendor: String(first.vendor ?? "unknown") }
    };
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
