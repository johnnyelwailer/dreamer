import type { AdapterProgress } from "../core/contracts.js";

export type RunDreamOptions = {
  replayFromStart?: boolean;
  persistState?: boolean;
  maxSessions?: number | "all";
  sinceDays?: number;
  /** Restrict processing to only these session paths (used by eval sampling). */
  sessionPathAllowlist?: string[];
};

export type DreamRunState = {
  cursor?: string;
  adapterCheckpoint?: unknown;
  adapterProgress?: AdapterProgress;
  lastRunAt?: string;
};
