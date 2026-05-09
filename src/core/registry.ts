import type {
  IntelligenceProvider,
  MemoryBackend,
  PipelineStage,
  TranscriptAdapter
} from "./contracts.js";

type Buckets = {
  adapters: Map<string, TranscriptAdapter>;
  backends: Map<string, MemoryBackend>;
  providers: Map<string, IntelligenceProvider>;
  stages: Map<string, PipelineStage>;
};

export class PluginRegistry {
  private readonly buckets: Buckets = {
    adapters: new Map(),
    backends: new Map(),
    providers: new Map(),
    stages: new Map()
  };

  registerAdapter(adapter: TranscriptAdapter): void {
    this.buckets.adapters.set(adapter.id, adapter);
  }

  registerBackend(backend: MemoryBackend): void {
    this.buckets.backends.set(backend.id, backend);
  }

  registerProvider(provider: IntelligenceProvider): void {
    this.buckets.providers.set(provider.id, provider);
  }

  registerStage(stage: PipelineStage): void {
    this.buckets.stages.set(stage.id, stage);
  }

  requireAdapter(id: string): TranscriptAdapter {
    return this.requireById(this.buckets.adapters, id, "adapter");
  }

  requireBackend(id: string): MemoryBackend {
    return this.requireById(this.buckets.backends, id, "backend");
  }

  requireProvider(id: string): IntelligenceProvider {
    return this.requireById(this.buckets.providers, id, "provider");
  }

  requireStage(id: string): PipelineStage {
    return this.requireById(this.buckets.stages, id, "stage");
  }

  private requireById<T>(bucket: Map<string, T>, id: string, type: string): T {
    const found = bucket.get(id);
    if (!found) throw new Error(`Missing ${type} plugin: ${id}`);
    return found;
  }
}
