import type { AdapterProgress } from "../core/contracts.js";

export type RunDreamOptions = {
  replayFromStart?: boolean;
  persistState?: boolean;
  maxSessions?: number | "all";
  sinceDays?: number;
};

export type DreamRunState = {
  cursor?: string;
  adapterCheckpoint?: unknown;
  adapterProgress?: AdapterProgress;
  lastRunAt?: string;
};
