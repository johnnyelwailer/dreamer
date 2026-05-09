export type EventKind = "session_start" | "message" | "tool" | "unknown";

export type NormalizedEvent = {
  id: string;
  timestamp: string;
  source: string;
  kind: EventKind;
  text: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type MemoryRecord = {
  id: string;
  scope: "user" | "workspace" | "session";
  statement: string;
  confidence: number;
  provenance: { source: string; eventIds: string[]; capturedAt: string };
  contradictoryTo?: string;
};

export type DreamRunMetrics = {
  sessionsProcessed: number;
  memoriesAdded: number;
  memoriesUpdated: number;
  contradictionsFound: number;
  docsGenerated: number;
  skillPatchesProposed: number;
};

export type DreamContext = {
  workspaceDir: string;
  runId: string;
  nowIso: string;
  events: NormalizedEvent[];
  memories: MemoryRecord[];
  signals: string[];
  metrics: DreamRunMetrics;
  diary: string[];
};
