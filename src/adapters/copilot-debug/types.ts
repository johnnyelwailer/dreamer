import type { DiscoveredCopilotSession } from "../../dream/copilot-debug-session-discovery.js";

export type CopilotSessionScopeMode = "newest-first" | "oldest-first" | "coverage";

export type CopilotDebugAdapterOptions = {
  fallbackSessionDir?: string;
  searchPaths?: string[];
  discoveryMode?: "append" | "override";
  lookbackDays?: number;
  maxSessionsPerRun?: number;
  sessionScopeMode?: CopilotSessionScopeMode;
  /** When set, only sessions whose path is in this list are used. */
  sessionPathAllowlist?: string[];
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
