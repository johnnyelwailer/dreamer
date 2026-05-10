import type { AdapterProgress } from "../../core/contracts.js";
import type { CopilotDebugCheckpoint } from "./types.js";

type Completion = {
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  completionPercent: number;
};

export function computeAverageMs(
  checkpoint: CopilotDebugCheckpoint,
  sessionCount: number,
  durationMs: number
): number | undefined {
  const runAverage = sessionCount > 0 ? durationMs / sessionCount : checkpoint.averageSessionDurationMs;
  if (!runAverage || !Number.isFinite(runAverage) || runAverage <= 0) return checkpoint.averageSessionDurationMs;
  if (!checkpoint.averageSessionDurationMs) return Math.round(runAverage);
  return Math.round(checkpoint.averageSessionDurationMs * 0.7 + runAverage * 0.3);
}

export function buildProgress(
  completion: Completion,
  processedThisRun: number,
  discoveredCount: number,
  averageSessionDurationMs?: number
): AdapterProgress {
  const etaMinutes =
    completion.remainingUnits > 0 && averageSessionDurationMs
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

export function emptyProgress(): AdapterProgress {
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
