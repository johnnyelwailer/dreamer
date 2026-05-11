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
import { HonchoSignalIngestionImplementation } from "../stages/honcho-signal-ingestion-stage.js";
import { SkillsStage } from "../stages/skills-stage.js";
import { CopilotMemoryBackend } from "../backends/copilot-memory-backend.js";
import { HonchoMemoryBackend } from "../backends/honcho-memory-backend.js";
import type { DreamRunState, RunDreamOptions } from "./run-dream-types.js";
import { createTtyStatus } from "../shared/tty-progress.js";
import { loadDreamerPlugins } from "./plugin-loader.js";

export type { RunDreamOptions } from "./run-dream-types.js";

function formatLimit(value: number | undefined): string {
  return value === undefined ? "all" : String(value);
}

export async function runDream(workspaceDir: string, options: RunDreamOptions = {}): Promise<void> {
  const runId = `run-${Date.now()}`;
  const config = readDreamConfig(workspaceDir);
  const configuredMaxSessions =
    options.maxSessions === "all"
      ? undefined
      : options.maxSessions ?? config.copilotDebugMaxSessionsPerRun;
  const configuredBatchSessions =
    options.batchSessions === "all"
      ? undefined
      : options.batchSessions ?? config.copilotDebugBatchSessions;
  const copilotAdapterOptions = {
    fallbackSessionDir: config.copilotDebugSessionDir,
    searchPaths: config.copilotDebugSearchPaths,
    discoveryMode: config.copilotDebugDiscoveryMode,
    lookbackDays: options.sinceDays ?? config.copilotDebugLookbackDays,
    maxSessionsPerRun: configuredBatchSessions,
    sessionScopeMode: options.sessionScopeMode ?? config.copilotDebugSessionScopeMode,
    sessionPathAllowlist: options.sessionPathAllowlist
  };
  const status = createTtyStatus("[dream]");
  status.update(`start run=${runId} adapter=${config.adapterId} backend=${config.backendId} provider=${config.providerId}`);
  const registry = new PluginRegistry();
  registry.registerAdapter(new CopilotDebugAdapter(copilotAdapterOptions));
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
  registry.registerStage(new OrientationStage());
  registry.registerStage(new DocumentationStage());
  registry.registerStage(new SkillsStage());
  registry.registerStage(new GovernanceStage());
  registry.registerStage(new ObservabilityStage());

  const loadedPlugins = await loadDreamerPlugins(registry, {
    workspaceDir,
    pluginPaths: config.pluginPaths
  });
  if (loadedPlugins.length > 0) status.update(`loaded plugins=${loadedPlugins.length}`);

  const adapter = registry.requireAdapter(config.adapterId);
  const backend = registry.requireBackend(config.backendId);
  const provider = registry.requireProvider(config.providerId);
  const state = new JsonStateStore(JsonStateStore.runStatePath(workspaceDir));
  const signalStage = new SignalStage(provider, config.stageAgentPacks?.["stage.signal"]);
  registry.registerStage(signalStage);
  registry.registerStageImplementation(
    new HonchoSignalIngestionImplementation(signalStage, workspaceDir, {
      workspaceId: config.honchoWorkspaceId,
      apiKey: config.honchoApiKey,
      baseURL: config.honchoBaseUrl,
      environment: config.honchoEnvironment
    })
  );
  registry.registerStage(new ConsolidationStage(provider, config.stageAgentPacks?.["stage.consolidation"]));

  try {
    const context = buildContext(workspaceDir, runId);
    const effectiveSessionScopeMode = options.sessionScopeMode ?? config.copilotDebugSessionScopeMode;
    const effectiveSinceDays = options.sinceDays ?? config.copilotDebugLookbackDays;
    const effectivePersistState = options.persistState !== false;
    status.update(
      `config maxSessions=${formatLimit(configuredMaxSessions)} batchSessions=${formatLimit(configuredBatchSessions)} ` +
        `sinceDays=${effectiveSinceDays} sessionScope=${effectiveSessionScopeMode} minSessions=${config.minSessions} ` +
        `replayFromStart=${options.replayFromStart === true} persistState=${effectivePersistState}`
    );
    context.diary.push(`config:adapter=${config.adapterId}`);
    context.diary.push(`config:backend=${config.backendId}`);
    context.diary.push(`config:provider=${config.providerId}`);
    context.diary.push(`config:model=${config.copilotSdkModel}`);
    context.diary.push(`source:copilotDebugSessionDir=${config.copilotDebugSessionDir}`);
    context.diary.push(`config:maxSessions=${formatLimit(configuredMaxSessions)}`);
    context.diary.push(`config:batchSessions=${formatLimit(configuredBatchSessions)}`);
    context.diary.push(`config:sinceDays=${effectiveSinceDays}`);
    context.diary.push(`config:sessionScope=${effectiveSessionScopeMode}`);
    context.diary.push(`config:minSessions=${config.minSessions}`);
    context.diary.push(`config:replayFromStart=${options.replayFromStart === true}`);
    context.diary.push(`config:persistState=${effectivePersistState}`);
    const loaded = await status.track("loading memory", backend.load());
    context.memories = loaded;
    status.update(`loaded memories=${loaded.length}`);
    const previousState = await state.read<DreamRunState>({});
    const adapterCheckpoint = options.replayFromStart
      ? undefined
      : previousState.adapterCheckpoint ?? previousState.cursor;
    const orderedStages = config.stageOrder.map((id) => registry.requireStageForSlot(id, config.stageImplementations[id]));

    let remainingSessionBudget = configuredMaxSessions;
    let cycle = 0;
    let currentCheckpoint = adapterCheckpoint;
    let lastCursor: string | null | undefined = previousState.cursor;
    let lastAdapterCheckpoint: unknown = previousState.adapterCheckpoint;
    let lastAdapterProgress = previousState.adapterProgress;
    let totalSessionsProcessed = 0;

    while (true) {
      if (remainingSessionBudget !== undefined && remainingSessionBudget <= 0) {
        context.diary.push("ingest:budget_reached=1");
        break;
      }

      if (config.adapterId === "adapter.copilot.debug") {
        const caps = [configuredBatchSessions, remainingSessionBudget]
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
        copilotAdapterOptions.maxSessionsPerRun = caps.length > 0 ? Math.min(...caps) : undefined;
      }

      cycle += 1;
      const ingest = await status.track(
        `ingesting ${config.adapterId} cycle=${cycle}${options.replayFromStart && cycle === 1 ? " (replay from start)" : ""}`,
        adapter.ingest(currentCheckpoint)
      );
      const sessions = ingest.events.filter((event) => event.kind === "session_start").length;
      totalSessionsProcessed += sessions;
      const backlog = ingest.progress
        ? `${ingest.progress.completedUnits}/${ingest.progress.totalUnits} (${ingest.progress.completionPercent}%)`
        : "unknown";
      status.update(
        `ingest cycle=${cycle} events=${ingest.events.length} sessions this cycle=${sessions} ` +
          `sessions overall=${totalSessionsProcessed} backlog=${backlog}`
      );
      context.diary.push(`ingest:cycle=${cycle}`);
      context.diary.push(`ingest:events=${ingest.events.length}`);
      context.diary.push(`ingest:sessions=${sessions}`);
      context.diary.push(`ingest:cursor=${String(ingest.cursor ?? "none")}`);
      if (ingest.progress) {
        context.diary.push(
          `ingest:progress=${ingest.progress.completedUnits}/${ingest.progress.totalUnits} (${ingest.progress.completionPercent}%)`
        );
        if (ingest.progress.etaMinutes !== undefined) {
          context.diary.push(`ingest:eta_minutes=${ingest.progress.etaMinutes}`);
        }
      }

      lastCursor = ingest.cursor ?? lastCursor ?? null;
      lastAdapterCheckpoint = ingest.checkpoint ?? lastAdapterCheckpoint ?? ingest.cursor ?? null;
      lastAdapterProgress = ingest.progress ?? lastAdapterProgress;
      currentCheckpoint = ingest.checkpoint ?? ingest.cursor;

      if (options.persistState !== false) {
        await status.track(
          `persisting state cycle=${cycle}`,
          state.write({
            cursor: lastCursor,
            adapterCheckpoint: lastAdapterCheckpoint,
            adapterProgress: lastAdapterProgress,
            lastRunAt: new Date().toISOString()
          })
        );
      }

      if (sessions === 0) break;

      if (remainingSessionBudget !== undefined) {
        remainingSessionBudget = Math.max(0, remainingSessionBudget - sessions);
      }

      if (sessions < config.minSessions) {
        status.update(`skipping pipeline cycle=${cycle} sessions=${sessions} minSessions=${config.minSessions}`);
        continue;
      }

      context.nowIso = new Date().toISOString();
      context.events = ingest.events;
      context.insights = [];
      context.signals = [];
      context.providerOutputs = {};

      await runPipeline(context, orderedStages, status);
      await status.track(`saving memories cycle=${cycle}`, backend.save(context.memories));
    }

    await status.track("writing provider docs artifacts (workspace storage)", writeProviderDocs(context, provider, config));

    const runSummary =
      `finished run=${runId} cycles=${cycle} sessions=${totalSessionsProcessed} ` +
      `memories_created=${context.metrics.memoriesAdded} memories_updated=${context.metrics.memoriesUpdated} ` +
      `memories_removed=${context.metrics.contradictionsFound} final_memory_count=${context.memories.length} ` +
      `config(maxSessions=${formatLimit(configuredMaxSessions)} batchSessions=${formatLimit(configuredBatchSessions)} ` +
      `sinceDays=${effectiveSinceDays} sessionScope=${effectiveSessionScopeMode} minSessions=${config.minSessions})`;
    context.diary.push(`run:summary=${runSummary}`);
    status.done(runSummary);
  } finally {
    const maybeDisposable = provider as IntelligenceProvider & { dispose?: () => Promise<void> };
    if (typeof maybeDisposable.dispose === "function") {
      await maybeDisposable.dispose();
    }
  }
}
