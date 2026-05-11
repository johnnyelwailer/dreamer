import type { AdapterProgress } from "../core/contracts.js";
import type { CopilotSessionScopeMode } from "../adapters/copilot-debug/types.js";

export type RunDreamOptions = {
  replayFromStart?: boolean;
  persistState?: boolean;
  maxSessions?: number | "all";
  batchSessions?: number | "all";
  sinceDays?: number;
  sessionScopeMode?: CopilotSessionScopeMode;
  /** Restrict processing to only these session paths (used by eval sampling). */
  sessionPathAllowlist?: string[];
};

export type DreamRunState = {
  cursor?: string;
  adapterCheckpoint?: unknown;
  adapterProgress?: AdapterProgress;
  lastRunAt?: string;
};
