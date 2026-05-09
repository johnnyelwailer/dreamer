import type { DreamContext, MemoryRecord, NormalizedEvent } from "./types.js";

export type PluginId = string;

export type TranscriptAdapter = {
  id: PluginId;
  supportsIncremental: boolean;
  ingest: (since?: string) => Promise<{ events: NormalizedEvent[]; cursor?: string }>;
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
