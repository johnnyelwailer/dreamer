import type { DreamContext, MemoryRecord, NormalizedEvent } from "./types.js";

export type PluginId = string;

export type AdapterProgress = {
  label: string;
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  completionPercent: number;
  processedThisRun: number;
  etaMinutes?: number;
  details?: string;
};

export type AdapterIngestResult = {
  events: NormalizedEvent[];
  cursor?: string;
  checkpoint?: unknown;
  progress?: AdapterProgress;
};

export type AdapterEvidenceFile = {
  path: string;
  kind: "transcript" | "event-log";
};

export type TranscriptAdapter = {
  id: PluginId;
  supportsIncremental: boolean;
  ingest: (checkpoint?: unknown) => Promise<AdapterIngestResult>;
  evidenceFiles: () => AdapterEvidenceFile[];
};

export type MemoryBackend = {
  id: PluginId;
  load: () => Promise<MemoryRecord[]>;
  save: (records: MemoryRecord[]) => Promise<void>;
};

export type RunAgentDefaultAgentConfig = {
  excludedTools?: string[];
};

export type RunAgentCustomAgentConfig = {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[] | null;
  prompt: string;
  infer?: boolean;
};

export type RunAgentOptions = {
  workingDirectory?: string;
  retries?: string[];
  streamTag?: string;
  customAgents?: RunAgentCustomAgentConfig[];
  defaultAgent?: RunAgentDefaultAgentConfig;
  selectedAgent?: string;
  onSubagentEvent?: (event: unknown) => void;
};

export type IntelligenceProvider = {
  id: PluginId;
  summarize: (input: string) => Promise<string>;
  runAgent: (prompt: string, tools: unknown[], options?: RunAgentOptions) => Promise<string>;
};

export type PipelineStage = {
  id: PluginId;
  run: (context: DreamContext) => Promise<DreamContext>;
};
