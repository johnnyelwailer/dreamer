import type {
  CopilotCompletion,
  CopilotDebugCheckpoint,
  CopilotSessionCheckpoint,
  CopilotDiscoveredSession
} from "./types.js";

export function parseCheckpoint(value: unknown): CopilotDebugCheckpoint {
  if (typeof value === "string") {
    return { version: 1, legacyCursor: value, sessions: {} };
  }
  if (!value || typeof value !== "object") return { version: 1, sessions: {} };
  const parsed = value as Partial<CopilotDebugCheckpoint>;
  if (parsed.version !== 1 || !parsed.sessions || typeof parsed.sessions !== "object") {
    return { version: 1, sessions: {} };
  }
  return {
    version: 1,
    legacyCursor: parsed.legacyCursor,
    sessions: parsed.sessions,
    averageSessionDurationMs: parsed.averageSessionDurationMs,
    totalRuns: parsed.totalRuns
  };
}

export function prioritizeSessions(
  discovered: CopilotDiscoveredSession[],
  sessions: Record<string, CopilotSessionCheckpoint>
): CopilotDiscoveredSession[] {
  return [...discovered].sort((left, right) => {
    const leftProcessed = sessions[left.path]?.lastProcessedAt ? Date.parse(sessions[left.path].lastProcessedAt ?? "") : Number.NaN;
    const rightProcessed = sessions[right.path]?.lastProcessedAt ? Date.parse(sessions[right.path].lastProcessedAt ?? "") : Number.NaN;
    if (Number.isNaN(leftProcessed) && Number.isNaN(rightProcessed)) return right.activityMs - left.activityMs;
    if (Number.isNaN(leftProcessed)) return -1;
    if (Number.isNaN(rightProcessed)) return 1;
    if (leftProcessed !== rightProcessed) return leftProcessed - rightProcessed;
    return right.activityMs - left.activityMs;
  });
}

export function computeCompletion(
  discovered: CopilotDiscoveredSession[],
  sessions: Record<string, CopilotSessionCheckpoint>
): CopilotCompletion {
  let completed = 0;
  for (const session of discovered) {
    const state = sessions[session.path];
    if (!state?.lastProcessedAt) continue;
    const isUpToDate =
      (state.lastObservedActivityMs ?? 0) >= session.activityMs &&
      (state.lastObservedTranscriptLineCount ?? 0) >= session.transcriptLineCount;
    if (isUpToDate) completed += 1;
  }
  const totalUnits = discovered.length;
  const remainingUnits = Math.max(0, totalUnits - completed);
  const completionPercent = totalUnits === 0 ? 100 : Math.round((completed / totalUnits) * 100);
  return { totalUnits, completedUnits: completed, remainingUnits, completionPercent };
}

export function maxTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left >= right ? left : right;
}
