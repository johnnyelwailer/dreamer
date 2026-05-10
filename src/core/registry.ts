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
    this.register(this.buckets.adapters, adapter.id, adapter, "adapter");
  }

  registerBackend(backend: MemoryBackend): void {
    this.register(this.buckets.backends, backend.id, backend, "backend");
  }

  registerProvider(provider: IntelligenceProvider): void {
    this.register(this.buckets.providers, provider.id, provider, "provider");
  }

  registerStage(stage: PipelineStage): void {
    this.register(this.buckets.stages, stage.id, stage, "stage");
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

  list(type: keyof Buckets): string[] {
    return [...this.buckets[type].keys()].sort();
  }

  private register<T>(bucket: Map<string, T>, id: string, value: T, type: string): void {
    if (!id.trim()) throw new Error(`Cannot register ${type} plugin with empty id`);
    if (bucket.has(id)) throw new Error(`Duplicate ${type} plugin id: ${id}`);
    bucket.set(id, value);
  }

  private requireById<T>(bucket: Map<string, T>, id: string, type: string): T {
    const found = bucket.get(id);
    if (!found) {
      const available = [...bucket.keys()].sort();
      const suffix = available.length > 0 ? ` Available ${type} plugins: ${available.join(", ")}` : "";
      throw new Error(`Missing ${type} plugin: ${id}.${suffix}`);
    }
    return found;
  }
}
