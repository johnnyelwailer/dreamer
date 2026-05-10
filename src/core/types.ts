export type EventKind = "session_start" | "message" | "tool" | "unknown";

export type NormalizedEvent = {
  id: string;
  timestamp: string;
  source: string;
  kind: EventKind;
  text: string;
  metadata: Record<string, string | number | boolean | null>;
};

export const MEMORY_CATEGORIES = [
  "preferences",
  "workflow",
  "tooling",
  "architecture",
  "quality",
  "constraints",
  "security",
  "domain",
  "process",
  "other"
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryEvidence = {
  sessionId?: string;
  fromMessage?: number;
  toMessage?: number;
  quote?: string;
};

export type MemoryReference = {
  kind: "file" | "url" | "session" | "doc";
  value: string;
  note?: string;
};

export type MemoryCapture = {
  horizon?: "short_term" | "long_term";
  expiresAt?: string;
  reason?: string;
  references?: MemoryReference[];
};

export type MemoryContext = {
  category?: MemoryCategory;
  tags?: string[];
  retention?: "short_term" | "long_term";
  expiresAt?: string;
  rationale?: string;
  references?: string[];
  appliesWhen?: string;
};

export type InsightRecord = {
  statement: string;
  scope: "user" | "workspace";
  context?: MemoryContext;
  evidence?: MemoryEvidence[];
  capture?: MemoryCapture;
};

export type MemoryRecord = {
  id: string;
  scope: "user" | "workspace" | "session";
  statement: string;
  confidence: number;
  provenance: { source: string; eventIds: string[]; capturedAt: string };
  contradictoryTo?: string;
  context?: MemoryContext;
  evidence?: MemoryEvidence[];
  capture?: MemoryCapture;
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
  insights: InsightRecord[];
  providerOutputs: {
    summary?: string;
    documentationPlan?: string;
  };
  metrics: DreamRunMetrics;
  diary: string[];
};
