# Dreamer Plugins

Dreamer plugins are ESM modules that register one or more runtime pieces with the central registry:

- transcript adapters for conversation/data aggregation
- memory backends
- intelligence providers
- pipeline stages, including custom dreaming systems

At startup, Dreamer loads plugins before resolving `DREAM_ADAPTER_ID`, `DREAM_BACKEND_ID`, `DREAM_PROVIDER_ID`, and `pipeline.stageOrder`. That means a plugin can add a new id and runtime config can select it without changing core code.

## Where Plugins Are Loaded From

Dreamer auto-loads plugin modules from:

- `<workspace>/.dreamer/plugins`
- `<DREAMER_HOME>/workspaces/<workspace-id>/plugins`
- `<DREAMER_HOME>/plugins`

You can also point at files or directories with:

```bash
DREAM_PLUGIN_PATHS="./plugins/my-dreaming.ts,/absolute/path/to/plugin.js" pnpm dream:unsafe
```

`DREAM_PLUGIN_PATHS` accepts comma-separated paths and the platform path delimiter.

Supported module files are `.js`, `.mjs`, `.cjs`, `.ts`, and `.mts`. TypeScript plugins work when Dreamer is launched with the `tsx` loader, which the repo scripts already do.

## Plugin Shape

A plugin exports `registerDreamerPlugin(registry, context)` or a default registrar:

```ts
export function registerDreamerPlugin(registry, context) {
  registry.registerStage({
    id: "stage.my-dreaming",
    async run(dreamContext) {
      // dreamContext already contains aggregated events and loaded memories.
      dreamContext.diary.push(`my-dreaming:events=${dreamContext.events.length}`);
      return dreamContext;
    }
  });
}
```

For local TypeScript type hints from a workspace plugin, import the API types:

```ts
import type { DreamerPluginRegistrar, PipelineStage } from "../../src/plugins/api.js";

const stage: PipelineStage = {
  id: "stage.my-dreaming",
  async run(context) {
    context.signals.push("Custom dreaming system saw the aggregated context.");
    return context;
  }
};

export const registerDreamerPlugin: DreamerPluginRegistrar = (registry) => {
  registry.registerStage(stage);
};
```

## Selecting Custom Plugins

Use environment variables for quick switching:

```bash
DREAM_ADAPTER_ID=adapter.my-system \
DREAM_BACKEND_ID=backend.my-memory \
DREAM_STAGE_ORDER=stage.orientation,stage.my-dreaming,stage.consolidation,stage.governance,stage.observability \
pnpm dream:unsafe
```

Or configure stage order permanently in `.dreamer/config/runtime.json`.

## Custom Conversation Aggregation

Register a `TranscriptAdapter` when your source system has its own transcript or event format:

```ts
export function registerDreamerPlugin(registry) {
  registry.registerAdapter({
    id: "adapter.my-system",
    supportsIncremental: true,
    evidenceFiles: () => [{ path: "/path/to/events.jsonl", kind: "event-log" }],
    async ingest(checkpoint) {
      return {
        events: [
          {
            id: "my-event-1",
            timestamp: new Date().toISOString(),
            source: "my-system",
            kind: "message",
            text: "Normalized message text",
            metadata: {}
          }
        ],
        cursor: "my-next-cursor"
      };
    }
  });
}
```

Adapters should return normalized events only. Dreamer handles memory loading, stage execution, diary output, and state persistence.

## Custom Memory System

Register a `MemoryBackend` to plug in your own storage:

```ts
export function registerDreamerPlugin(registry) {
  registry.registerBackend({
    id: "backend.my-memory",
    async load() {
      return [];
    },
    async save(records) {
      // Persist the complete memory snapshot in your backend.
    }
  });
}
```

`save(records)` receives the complete final memory set after the dreaming pipeline runs.
