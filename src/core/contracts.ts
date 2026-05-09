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

export type TranscriptAdapter = {
  id: PluginId;
  supportsIncremental: boolean;
  ingest: (checkpoint?: unknown) => Promise<AdapterIngestResult>;
};

export type MemoryBackend = {
  id: PluginId;
  load: () => Promise<MemoryRecord[]>;
  save: (records: MemoryRecord[]) => Promise<void>;
};

export type IntelligenceProvider = {
  id: PluginId;
  summarize: (input: string) => Promise<string>;
};

export type PipelineStage = {
  id: PluginId;
  run: (context: DreamContext) => Promise<DreamContext>;
};
