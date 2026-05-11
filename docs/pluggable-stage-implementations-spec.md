# Pluggable Stage Implementations Spec

## Problem

Dreamer has pluggable stages today, but the stage id is also the implementation id. That makes broad replacement awkward. For example, `stage.consolidation` is both the conceptual pipeline step and the current local LLM implementation.

We need to separate the stable pipeline slot from the implementation that fulfills it. Users should be able to say "run a consolidation stage here" and choose whether that consolidation is local LLM based, Honcho backed, hybrid, rule based, or something else.

## Goals

- Make pipeline slots stable and semantic.
- Let each slot bind to a configurable implementation.
- Allow multiple implementations for the same slot.
- Keep Honcho, local LLM, vector stores, audit logs, and future systems as ordinary plugins.
- Preserve the current pipeline as the default implementation set.
- Keep memory backends focused on final memory load/save.

## Non-Goals

- Do not create Honcho-specific core branches.
- Do not hardcode lifecycle integration points per vendor.
- Do not remove custom stages; plugins can still add fully custom slots when needed.
- Do not let stage implementations bypass safety or mutation contracts.

## Core Model

Introduce two separate concepts:

- `StageSlot`: the semantic place in the pipeline.
- `StageImplementation`: a concrete implementation that can run for one or more slots.

Example slots:

- `slot.orientation`
- `slot.signal`
- `slot.consolidation`
- `slot.documentation`
- `slot.skills`
- `slot.governance`
- `slot.observability`

Example implementations:

- `impl.orientation.local`
- `impl.signal.local-llm`
- `impl.signal.honcho-raw`
- `impl.consolidation.local-llm`
- `impl.consolidation.honcho`
- `impl.consolidation.hybrid-local-honcho`
- `impl.observability.local-files`

The pipeline order references slots. Runtime config binds each slot to one implementation.

## Contract Shape

```ts
export type StageSlotId = string;
export type StageImplementationId = string;

export type StageSlot = {
  id: StageSlotId;
  description?: string;
  defaultImplementationId: StageImplementationId;
  inputShape: StageDataShape[];
  outputShape: StageDataShape[];
};

export type StageDataShape =
  | "events"
  | "signals"
  | "insights"
  | "memories"
  | "docs"
  | "reports";

export type StageImplementation = {
  id: StageImplementationId;
  slots: StageSlotId[];
  exportsData?: boolean;
  run: (input: StageImplementationInput) => Promise<StageImplementationResult>;
};

export type StageImplementationInput = {
  slotId: StageSlotId;
  context: DreamContext;
  config?: unknown;
};

export type StageImplementationResult = {
  context: DreamContext;
};
```

The first implementation can keep the existing mutable `DreamContext` style. A later hardening pass can move to read-only input plus explicit patches, but that is not required to unlock swappable stages.

## Registry Additions

Extend `PluginRegistry` with slots and implementations:

```ts
registerStageSlot(slot: StageSlot): void;
registerStageImplementation(implementation: StageImplementation): void;
requireStageSlot(id: StageSlotId): StageSlot;
requireStageImplementation(id: StageImplementationId): StageImplementation;
implementationsForSlot(id: StageSlotId): StageImplementation[];
```

Existing `registerStage(stage)` can remain as a compatibility path. Internally it can register a slot and an implementation with the same id, or it can be kept until the migration is complete.

## Configuration

Pipeline order should reference slots:

```json
{
  "pipeline": {
    "stageOrder": [
      "slot.orientation",
      "slot.signal",
      "slot.consolidation",
      "slot.governance",
      "slot.observability"
    ],
    "stageImplementations": {
      "slot.orientation": "impl.orientation.local",
      "slot.signal": "impl.signal.local-llm",
      "slot.consolidation": "impl.consolidation.local-llm",
      "slot.governance": "impl.governance.local",
      "slot.observability": "impl.observability.local-files"
    }
  }
}
```

Environment override:

```bash
DREAM_STAGE_ORDER=slot.orientation,slot.signal,slot.consolidation,slot.governance,slot.observability
DREAM_STAGE_IMPLEMENTATIONS=slot.signal=impl.signal.honcho-raw,slot.consolidation=impl.consolidation.honcho
```

If no implementation is configured for a slot, Dreamer uses the slot's `defaultImplementationId`.

## Honcho Example

Honcho should be modeled as normal implementations plus the existing backend:

- `impl.signal.honcho-raw`
  - slot: `slot.signal`
  - sends sanitized raw transcript events to Honcho
  - can either return no local insights or return Honcho-derived insights

- `impl.signal.local-llm`
  - slot: `slot.signal`
  - current local signal extraction behavior

- `impl.consolidation.honcho`
  - slot: `slot.consolidation`
  - asks Honcho for context or conclusions and converts them into `MemoryRecord`s

- `impl.consolidation.local-llm`
  - slot: `slot.consolidation`
  - current consolidation behavior

- `impl.consolidation.hybrid-local-honcho`
  - slot: `slot.consolidation`
  - uses local insights plus Honcho context, then applies normal memory mutation rules

- `backend.honcho.memory`
  - remains a `MemoryBackend`
  - stores final memory snapshots

Users can choose raw Honcho signal extraction, Honcho consolidation, Honcho as final backend, or all three without core knowing anything special about Honcho.

## Safety Rules

- Transcript inertness must run before any implementation receives `context.events`.
- Implementations that export data externally must set `exportsData: true`.
- Memory mutation still goes through the consolidation slot's allowed tools or explicit memory mutation helpers.
- Implementations must not write workspace files directly unless they are an approved output stage with an explicit write contract.
- Stage implementations must record diary entries for meaningful external exports and memory mutations.

## Migration Plan

### Slice 1 - Compatibility Layer

- Add `StageSlot` and `StageImplementation` types.
- Add registry support.
- Register each current built-in stage as a default implementation for a matching slot.
- Preserve current `DREAM_STAGE_ORDER` behavior by mapping `stage.*` ids to equivalent `slot.*` ids.

### Slice 2 - Config Binding

- Add `pipeline.stageImplementations` runtime config.
- Add `DREAM_STAGE_IMPLEMENTATIONS` parsing.
- Add diagnostics for missing slots, missing implementations, and implementation-slot mismatches.
- Add tests that replace only consolidation while leaving the rest of the pipeline unchanged.

### Slice 3 - Split Current Stages

- Rename built-in implementations to `impl.*`.
- Keep slot ids stable.
- Update docs and setup wizard language from "choose stage" to "choose implementation for stage slot."

### Slice 4 - Honcho Reference Implementations

- Extract shared Honcho client setup.
- Implement `impl.signal.honcho-raw`.
- Implement `impl.consolidation.honcho`.
- Keep `backend.honcho.memory` as the final memory backend option.
- Add tests for all combinations:
  - local signal + local consolidation + Honcho backend
  - Honcho signal + local consolidation + file backend
  - local signal + Honcho consolidation + file backend
  - Honcho signal + Honcho consolidation + Honcho backend

## Open Questions

- Should a slot allow multiple implementations in sequence, or should composition be expressed as a new hybrid implementation?
- Should implementation config be global by id or nested under each slot binding?
- Should data export consent be enforced at setup time only, or also at runtime?
- Should old `stage.*` ids be deprecated immediately or kept indefinitely as aliases?

## Decision

Use stage slots plus swappable stage implementations as the primary extension model. Treat Honcho as a reference set of implementations and a backend, not as a special lifecycle feature. This keeps the pipeline generic while allowing users to replace `slot.signal`, `slot.consolidation`, or any future slot with any compatible implementation.
