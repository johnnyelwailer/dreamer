import type { DiscoveredCopilotSession } from "../../dream/copilot-debug-session-discovery.js";

export type CopilotDebugAdapterOptions = {
  fallbackSessionDir?: string;
  searchPaths?: string[];
  discoveryMode?: "append" | "override";
  lookbackDays?: number;
  maxSessionsPerRun?: number;
};

export type CopilotSessionCheckpoint = {
  cursor?: string;
  lastProcessedAt?: string;
  lastObservedActivityMs?: number;
  lastObservedTranscriptLineCount?: number;
  totalEventsSeen?: number;
};

export type CopilotDebugCheckpoint = {
  version: 1;
  legacyCursor?: string;
  sessions: Record<string, CopilotSessionCheckpoint>;
  averageSessionDurationMs?: number;
  totalRuns?: number;
};

export type CopilotCompletion = {
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  completionPercent: number;
};

export type CopilotSessionIngestResult = {
  events: import("../../core/types.js").NormalizedEvent[];
  cursor?: string;
};

export type CopilotDiscoveredSession = DiscoveredCopilotSession;
