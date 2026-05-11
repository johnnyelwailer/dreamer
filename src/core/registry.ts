import type {
  IntelligenceProvider,
  MemoryBackend,
  PipelineStage,
  StageDataShape,
  StageImplementation,
  StageImplementationId,
  StageSlot,
  StageSlotId,
  TranscriptAdapter
} from "./contracts.js";

type Buckets = {
  adapters: Map<string, TranscriptAdapter>;
  backends: Map<string, MemoryBackend>;
  providers: Map<string, IntelligenceProvider>;
  stages: Map<string, PipelineStage>;
  stageSlots: Map<string, StageSlot>;
  stageImplementations: Map<string, StageImplementation>;
};

export function stageIdToSlotId(id: string): StageSlotId {
  return id.startsWith("stage.") ? `slot.${id.slice("stage.".length)}` : id;
}

function defaultSlotShapes(slotId: StageSlotId): Pick<StageSlot, "inputShape" | "outputShape"> {
  const shapes: Partial<Record<StageSlotId, [StageDataShape[], StageDataShape[]]>> = {
    "slot.orientation": [["events", "memories"], ["docs"]],
    "slot.signal": [["events", "memories", "docs"], ["signals", "insights", "reports"]],
    "slot.consolidation": [["insights", "memories"], ["memories", "reports"]],
    "slot.documentation": [["signals", "insights", "memories"], ["docs"]],
    "slot.skills": [["signals", "insights"], ["reports"]],
    "slot.governance": [["events", "insights", "memories"], ["reports"]],
    "slot.observability": [["events", "signals", "insights", "memories"], ["reports"]]
  };
  const [inputShape = [], outputShape = []] = shapes[slotId] ?? [];
  return { inputShape, outputShape };
}

export class PluginRegistry {
  private readonly buckets: Buckets = {
    adapters: new Map(),
    backends: new Map(),
    providers: new Map(),
    stages: new Map(),
    stageSlots: new Map(),
    stageImplementations: new Map()
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
    const slotId = stageIdToSlotId(stage.id);
    const { inputShape, outputShape } = defaultSlotShapes(slotId);
    this.registerStageSlot({
      id: slotId,
      defaultImplementationId: stage.id,
      inputShape,
      outputShape
    });
    this.registerStageImplementation({
      id: stage.id,
      slots: [slotId],
      run: async ({ context }) => ({ context: await stage.run(context) })
    });
  }

  registerStageSlot(slot: StageSlot): void {
    this.register(this.buckets.stageSlots, slot.id, slot, "stage slot");
  }

  registerStageImplementation(implementation: StageImplementation): void {
    this.register(this.buckets.stageImplementations, implementation.id, implementation, "stage implementation");
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

  requireStageSlot(id: StageSlotId): StageSlot {
    return this.requireById(this.buckets.stageSlots, stageIdToSlotId(id), "stage slot");
  }

  requireStageImplementation(id: StageImplementationId): StageImplementation {
    return this.requireById(this.buckets.stageImplementations, id, "stage implementation");
  }

  implementationsForSlot(id: StageSlotId): StageImplementation[] {
    const slotId = stageIdToSlotId(id);
    return [...this.buckets.stageImplementations.values()]
      .filter((implementation) => implementation.slots.includes(slotId))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  requireStageForSlot(id: StageSlotId, implementationId?: StageImplementationId): PipelineStage {
    const slot = this.requireStageSlot(id);
    const implementation = this.requireStageImplementation(implementationId ?? slot.defaultImplementationId);
    if (!implementation.slots.includes(slot.id)) {
      throw new Error(`Stage implementation ${implementation.id} cannot run for slot ${slot.id}`);
    }
    return {
      id: slot.id,
      run: async (context) => (await implementation.run({ slotId: slot.id, context })).context
    };
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
