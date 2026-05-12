import { basename, join, normalize } from "node:path";
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
import type {
  CopilotDebugAdapterOptions,
  CopilotDebugCheckpoint,
  CopilotSessionScopeMode
} from "./copilot-debug/types.js";
import { ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildProgress, computeAverageMs, emptyProgress } from "./copilot-debug/progress.js";

export class CopilotDebugAdapter implements TranscriptAdapter {
  readonly id = "adapter.copilot.debug";
  readonly supportsIncremental = true;
  constructor(private readonly options: string | CopilotDebugAdapterOptions) {}

  evidenceFiles(): Array<{ path: string; kind: "transcript" | "event-log" }> {
    return this.discoverSessions().flatMap((s) =>
      s.transcriptPath ? [{ path: s.transcriptPath, kind: "transcript" as const }] : []
    );
  }

  async ingest(checkpoint?: unknown): Promise<{ events: NormalizedEvent[]; cursor?: string; checkpoint?: unknown; progress?: AdapterProgress }> {
    const parsed = parseCheckpoint(checkpoint);
    const discovered = this.discoverSessions();
    if (discovered.length === 0) {
      ttyWriteTagged("dream", "ingest: no Copilot debug sessions discovered", { noisy: true });
      return { events: [], checkpoint: parsed, progress: emptyProgress() };
    }
    const sessionScopeMode = this.readSessionScopeMode();
    const prioritized = prioritizeSessions(discovered, parsed.sessions, sessionScopeMode);
    const maxSessions = this.readMaxSessionsPerRun();
    const selected = maxSessions ? prioritized.slice(0, maxSessions) : prioritized;
    ttyWriteTagged(
      "dream",
      `ingest: ${selected.length}/${discovered.length} sessions selected scope=${sessionScopeMode} maxPerRun=${maxSessions ?? "all"}`,
      { noisy: true }
    );
    const nowIso = new Date().toISOString();
    const nextSessions = { ...parsed.sessions };
    const runEvents: NormalizedEvent[] = [];
    let latestCursor: string | undefined;
    let durationMs = 0;
    let completion = computeCompletion(discovered, parsed.sessions);

    for (const [index, session] of selected.entries()) {
      const startedAt = Date.now();
      ttyWriteTagged(
        "dream",
        `ingest: session ${index + 1}/${selected.length} id=${session.sessionId} overall=${completion.completedUnits}/${discovered.length}`,
        { noisy: true }
      );
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
      completion = computeCompletion(discovered, nextSessions);
      durationMs += Math.max(1, Date.now() - startedAt);
      ttyWriteTagged(
        "dream",
        `ingest: done ${session.sessionId} events=${ingestResult.events.length} overall=${completion.completedUnits}/${completion.totalUnits}`,
        { noisy: true }
      );
    }

    const averageSessionDurationMs = computeAverageMs(parsed, selected.length, durationMs);
    const nextCheckpoint: CopilotDebugCheckpoint = {
      version: 1,
      sessions: nextSessions,
      averageSessionDurationMs,
      totalRuns: (parsed.totalRuns ?? 0) + 1
    };
    const progress = buildProgress(completion, selected.length, discovered.length, averageSessionDurationMs);
    runEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    ttyWriteTagged(
      "dream",
      `ingest: progress ${progress.completedUnits}/${progress.totalUnits} (${progress.completionPercent}%)${progress.etaMinutes !== undefined ? ` eta=${progress.etaMinutes}m` : ""}`,
      { noisy: true }
    );
    return {
      events: runEvents,
      cursor: latestCursor,
      checkpoint: nextCheckpoint,
      progress
    };
  }

  private discoverSessions(): DiscoveredCopilotSession[] {
    const discovered = discoverCopilotDebugSessions({
      searchPaths: this.readOptions().searchPaths,
      mode: this.readOptions().discoveryMode,
      lookbackDays: this.readOptions().lookbackDays
    });
    const allowlist = this.readOptions().sessionPathAllowlist;
    const filtered = allowlist
      ? discovered.filter((s) => allowlist.includes(s.path))
      : discovered;
    const fallback = this.readOptions().fallbackSessionDir;
    if (!fallback) return filtered;
    if (filtered.some((session) => normalize(session.path) === normalize(fallback))) return filtered;
    const sessionId = basename(normalize(fallback)) || "fallback-session";
    filtered.push({
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
    return filtered;
  }

  private readOptions(): CopilotDebugAdapterOptions {
    return typeof this.options === "string" ? { fallbackSessionDir: this.options } : this.options;
  }

  private readMaxSessionsPerRun(): number | undefined {
    const value = this.readOptions().maxSessionsPerRun;
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
  }

  private readSessionScopeMode(): CopilotSessionScopeMode {
    const mode = this.readOptions().sessionScopeMode;
    if (mode === "newest-first" || mode === "oldest-first" || mode === "coverage") return mode;
    return "newest-first";
  }
}
