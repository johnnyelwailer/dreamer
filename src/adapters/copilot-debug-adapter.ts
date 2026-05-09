import { join, normalize } from "node:path";
import type { AdapterProgress, TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import {
  discoverCopilotDebugSessions,
  type DiscoveredCopilotSession
} from "../dream/copilot-debug-session-discovery.js";
import {
  computeCompletion,
  maxTimestamp,
  parseCheckpoint,
  prioritizeSessions
} from "./copilot-debug/checkpoint.js";
import { ingestCopilotSession } from "./copilot-debug/session-ingest.js";
import type { CopilotDebugAdapterOptions, CopilotDebugCheckpoint } from "./copilot-debug/types.js";

export class CopilotDebugAdapter implements TranscriptAdapter {
  readonly id = "adapter.copilot.debug";
  readonly supportsIncremental = true;

  constructor(private readonly options: string | CopilotDebugAdapterOptions) {}

  async ingest(checkpoint?: unknown): Promise<{ events: NormalizedEvent[]; cursor?: string; checkpoint?: unknown; progress?: AdapterProgress }> {
    const parsed = parseCheckpoint(checkpoint);
    const discovered = this.discoverSessions();
    if (discovered.length === 0) {
      return { events: [], checkpoint: parsed, progress: emptyProgress() };
    }

    const prioritized = prioritizeSessions(discovered, parsed.sessions);
    const maxSessions = this.readMaxSessionsPerRun();
    const selected = maxSessions ? prioritized.slice(0, maxSessions) : prioritized;
    const nowIso = new Date().toISOString();
    const nextSessions = { ...parsed.sessions };
    const runEvents: NormalizedEvent[] = [];
    let latestCursor: string | undefined;
    let durationMs = 0;

    for (const session of selected) {
      const startedAt = Date.now();
      const fallbackState = parsed.legacyCursor ? { cursor: parsed.legacyCursor } : {};
      const state = parsed.sessions[session.path] ?? fallbackState;
      const ingestResult = await ingestCopilotSession(session, state);
      runEvents.push(...ingestResult.events);
      latestCursor = maxTimestamp(latestCursor, ingestResult.cursor);
      nextSessions[session.path] = {
        cursor: ingestResult.cursor,
        lastProcessedAt: nowIso,
        lastObservedActivityMs: session.activityMs,
        lastObservedTranscriptLineCount: session.transcriptLineCount,
        totalEventsSeen: (state.totalEventsSeen ?? 0) + ingestResult.events.length
      };
      durationMs += Math.max(1, Date.now() - startedAt);
    }

    const averageSessionDurationMs = computeAverageMs(parsed, selected.length, durationMs);
    const nextCheckpoint: CopilotDebugCheckpoint = {
      version: 1,
      sessions: nextSessions,
      averageSessionDurationMs,
      totalRuns: (parsed.totalRuns ?? 0) + 1
    };

    const completion = computeCompletion(discovered, nextSessions);
    runEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return {
      events: runEvents,
      cursor: latestCursor,
      checkpoint: nextCheckpoint,
      progress: buildProgress(completion, selected.length, discovered.length, averageSessionDurationMs)
    };
  }

  private discoverSessions(): DiscoveredCopilotSession[] {
    const discovered = discoverCopilotDebugSessions({
      searchPaths: this.readOptions().searchPaths,
      mode: this.readOptions().discoveryMode,
      lookbackDays: this.readOptions().lookbackDays
    });
    const fallback = this.readOptions().fallbackSessionDir;
    if (!fallback) return discovered;
    if (discovered.some((session) => normalize(session.path) === normalize(fallback))) return discovered;
    const sessionId = normalize(fallback).split("/").pop() ?? "fallback-session";
    discovered.push({
      sessionId,
      path: fallback,
      mainJsonlPath: join(fallback, "main.jsonl"),
      transcriptPath: join(fallback, "..", "..", "transcripts", `${sessionId}.jsonl`),
      mainMtimeMs: 0,
      transcriptMtimeMs: 0,
      activityMs: 0,
      richnessScore: 0,
      transcriptLineCount: 0
    });
    return discovered;
  }

  private readOptions(): CopilotDebugAdapterOptions {
    return typeof this.options === "string" ? { fallbackSessionDir: this.options } : this.options;
  }

  private readMaxSessionsPerRun(): number | undefined {
    const value = this.readOptions().maxSessionsPerRun;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }
}

function computeAverageMs(checkpoint: CopilotDebugCheckpoint, sessionCount: number, durationMs: number): number | undefined {
  const runAverage = sessionCount > 0 ? durationMs / sessionCount : checkpoint.averageSessionDurationMs;
  if (!runAverage || !Number.isFinite(runAverage) || runAverage <= 0) return checkpoint.averageSessionDurationMs;
  if (!checkpoint.averageSessionDurationMs) return Math.round(runAverage);
  return Math.round(checkpoint.averageSessionDurationMs * 0.7 + runAverage * 0.3);
}

function buildProgress(
  completion: { totalUnits: number; completedUnits: number; remainingUnits: number; completionPercent: number },
  processedThisRun: number,
  discoveredCount: number,
  averageSessionDurationMs?: number
): AdapterProgress {
  const etaMinutes = completion.remainingUnits > 0 && averageSessionDurationMs
    ? Math.max(1, Math.round((completion.remainingUnits * averageSessionDurationMs) / 60000))
    : 0;
  return {
    label: "copilot-backlog",
    totalUnits: completion.totalUnits,
    completedUnits: completion.completedUnits,
    remainingUnits: completion.remainingUnits,
    completionPercent: completion.completionPercent,
    processedThisRun,
    etaMinutes,
    details: `${processedThisRun}/${discoveredCount} sessions scanned this run`
  };
}

function emptyProgress(): AdapterProgress {
  return {
    label: "copilot-backlog",
    totalUnits: 0,
    completedUnits: 0,
    remainingUnits: 0,
    completionPercent: 100,
    processedThisRun: 0,
    etaMinutes: 0,
    details: "No Copilot sessions discovered."
  };
}
