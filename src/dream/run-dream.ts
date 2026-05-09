import { JsonlEventAdapter } from "../adapters/jsonl-event-adapter.js";
import { InMemoryBackend } from "../backends/in-memory-backend.js";
import { FileMemoryBackend } from "../backends/file-memory-backend.js";
import { runPipeline } from "../core/pipeline.js";
import { PluginRegistry } from "../core/registry.js";
import { JsonStateStore } from "../core/state-store.js";
import type { IntelligenceProvider } from "../core/contracts.js";
import { CopilotDebugAdapter } from "../adapters/copilot-debug-adapter.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code-adapter.js";
import { CodexTraceAdapter } from "../adapters/codex-trace-adapter.js";
import { TerminalRecordingAdapter } from "../adapters/terminal-recording-adapter.js";
import { BrowserTraceAdapter } from "../adapters/browser-trace-adapter.js";
import { CopilotSdkProvider } from "../providers/copilot-sdk-provider.js";
import { buildContext } from "./build-context.js";
import { readDreamConfig } from "./config.js";
import { writeProviderDocs } from "./generate-provider-docs.js";
import { ConsolidationStage } from "../stages/consolidation-stage.js";
import { DocumentationStage } from "../stages/documentation-stage.js";
import { GovernanceStage } from "../stages/governance-stage.js";
import { ObservabilityStage } from "../stages/observability-stage.js";
import { OrientationStage } from "../stages/orientation-stage.js";
import { SignalStage } from "../stages/signal-stage.js";
import { SkillsStage } from "../stages/skills-stage.js";
import { CopilotMemoryBackend } from "../backends/copilot-memory-backend.js";
import { HonchoMemoryBackend } from "../backends/honcho-memory-backend.js";
import type { DreamRunState, RunDreamOptions } from "./run-dream-types.js";

export type { RunDreamOptions } from "./run-dream-types.js";

export async function runDream(workspaceDir: string, options: RunDreamOptions = {}): Promise<void> {
  const runId = `run-${Date.now()}`;
  const config = readDreamConfig(workspaceDir);
  const registry = new PluginRegistry();
  registry.registerAdapter(
    new CopilotDebugAdapter({
      fallbackSessionDir: config.copilotDebugSessionDir,
      searchPaths: config.copilotDebugSearchPaths,
      discoveryMode: config.copilotDebugDiscoveryMode,
      lookbackDays: options.sinceDays ?? config.copilotDebugLookbackDays,
      maxSessionsPerRun:
        options.maxSessions === "all"
          ? undefined
          : options.maxSessions ?? config.copilotDebugMaxSessionsPerRun
    })
  );
  registry.registerAdapter(new JsonlEventAdapter(config.jsonlEventsPath));
  registry.registerAdapter(new ClaudeCodeAdapter(config.claudeCodePath));
  registry.registerAdapter(new CodexTraceAdapter(config.codexTracePath));
  registry.registerAdapter(new TerminalRecordingAdapter(config.terminalCastPath));
  registry.registerAdapter(new BrowserTraceAdapter(config.browserHarPath));
  registry.registerBackend(new FileMemoryBackend(workspaceDir));
  registry.registerBackend(new InMemoryBackend());
  registry.registerBackend(new CopilotMemoryBackend(workspaceDir, config.copilotMemoryPath));
  registry.registerBackend(
    new HonchoMemoryBackend(workspaceDir, {
      exportPath: config.honchoExportPath,
      workspaceId: config.honchoWorkspaceId,
      apiKey: config.honchoApiKey,
      baseURL: config.honchoBaseUrl,
      environment: config.honchoEnvironment
    })
  );
  registry.registerProvider(new CopilotSdkProvider(config.copilotSdkProviderOptions));

  const adapter = registry.requireAdapter(config.adapterId);
  const backend = registry.requireBackend(config.backendId);
  const provider = registry.requireProvider(config.providerId);
  const state = new JsonStateStore(JsonStateStore.runStatePath(workspaceDir));
  registry.registerStage(new OrientationStage());
  registry.registerStage(new SignalStage());
  registry.registerStage(new ConsolidationStage());
  registry.registerStage(new DocumentationStage());
  registry.registerStage(new SkillsStage());
  registry.registerStage(new GovernanceStage());
  registry.registerStage(new ObservabilityStage());

  try {
    const context = buildContext(workspaceDir, runId);
    context.diary.push(`config:adapter=${config.adapterId}`);
    context.diary.push(`config:backend=${config.backendId}`);
    context.diary.push(`config:provider=${config.providerId}`);
    context.diary.push(`config:model=${config.copilotSdkModel}`);
    context.diary.push(`source:copilotDebugSessionDir=${config.copilotDebugSessionDir}`);
    const loaded = await backend.load();
    context.memories = loaded;
    const previousState = await state.read<DreamRunState>({});
    const adapterCheckpoint = options.replayFromStart
      ? undefined
      : previousState.adapterCheckpoint ?? previousState.cursor;
    const ingest = await adapter.ingest(adapterCheckpoint);
    context.events = ingest.events;
    context.metrics.sessionsProcessed = context.events.filter((event) => event.kind === "session_start").length;
    context.diary.push(`ingest:events=${context.events.length}`);
    context.diary.push(`ingest:sessions=${context.metrics.sessionsProcessed}`);
    context.diary.push(`ingest:cursor=${String(ingest.cursor ?? "none")}`);
    if (ingest.progress) {
      context.diary.push(
        `ingest:progress=${ingest.progress.completedUnits}/${ingest.progress.totalUnits} (${ingest.progress.completionPercent}%)`
      );
      if (ingest.progress.etaMinutes !== undefined) {
        context.diary.push(`ingest:eta_minutes=${ingest.progress.etaMinutes}`);
      }
    }
    if (context.events.length) {
      const summary = await provider.summarize(context.events.map((e) => e.text).join("\n"));
      context.signals.push(`provider_summary=${summary.slice(0, 120)}`);
      context.providerOutputs.summary = summary;
    }
    const sessions = context.events.filter((event) => event.kind === "session_start").length;
    if (sessions < config.minSessions) {
      if (options.persistState !== false) {
        await state.write({
          cursor: ingest.cursor ?? previousState.cursor ?? null,
          adapterCheckpoint: ingest.checkpoint ?? previousState.adapterCheckpoint ?? ingest.cursor ?? null,
          adapterProgress: ingest.progress ?? previousState.adapterProgress,
          lastRunAt: context.nowIso
        });
      }
      return;
    }

    const orderedStages = config.stageOrder.map((id) => registry.requireStage(id));

    const finalContext = await runPipeline(context, orderedStages);
    await writeProviderDocs(finalContext, provider, config);
    await backend.save(finalContext.memories);
    if (options.persistState !== false) {
      await state.write({
        cursor: ingest.cursor ?? null,
        adapterCheckpoint: ingest.checkpoint ?? ingest.cursor ?? null,
        adapterProgress: ingest.progress,
        lastRunAt: finalContext.nowIso
      });
    }
  } finally {
    const maybeDisposable = provider as IntelligenceProvider & { dispose?: () => Promise<void> };
    if (typeof maybeDisposable.dispose === "function") {
      await maybeDisposable.dispose();
    }
  }
}
