import { JsonlEventAdapter } from "../adapters/jsonl-event-adapter.js";
import { InMemoryBackend } from "../backends/in-memory-backend.js";
import { FileMemoryBackend } from "../backends/file-memory-backend.js";
import { runPipeline } from "../core/pipeline.js";
import { PluginRegistry } from "../core/registry.js";
import { JsonStateStore } from "../core/state-store.js";
import { CopilotDebugAdapter } from "../adapters/copilot-debug-adapter.js";
import { VsCodeChatExportAdapter } from "../adapters/vscode-chat-export-adapter.js";
import { CopilotCliAdapter } from "../adapters/copilot-cli-adapter.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code-adapter.js";
import { CursorChatAdapter } from "../adapters/cursor-chat-adapter.js";
import { WindsurfTraceAdapter } from "../adapters/windsurf-trace-adapter.js";
import { CodexTraceAdapter } from "../adapters/codex-trace-adapter.js";
import { TerminalRecordingAdapter } from "../adapters/terminal-recording-adapter.js";
import { BrowserTraceAdapter } from "../adapters/browser-trace-adapter.js";
import { EchoProvider } from "../providers/echo-provider.js";
import { OpenAiCompatibleProvider } from "../providers/openai-compatible-provider.js";
import { CopilotSdkProvider } from "../providers/copilot-sdk-provider.js";
import { AnthropicProvider } from "../providers/anthropic-provider.js";
import { OllamaProvider } from "../providers/ollama-provider.js";
import { LmStudioProvider } from "../providers/lm-studio-provider.js";
import { LocalOpenAiProvider } from "../providers/local-openai-provider.js";
import { buildContext } from "./build-context.js";
import { readDreamConfig } from "./config.js";
import { ConsolidationStage } from "../stages/consolidation-stage.js";
import { DocumentationStage } from "../stages/documentation-stage.js";
import { GovernanceStage } from "../stages/governance-stage.js";
import { ObservabilityStage } from "../stages/observability-stage.js";
import { OrientationStage } from "../stages/orientation-stage.js";
import { SignalStage } from "../stages/signal-stage.js";
import { SkillsStage } from "../stages/skills-stage.js";
import { CopilotMemoryBackend } from "../backends/copilot-memory-backend.js";
import { HonchoMemoryBackend } from "../backends/honcho-memory-backend.js";

export async function runDream(workspaceDir: string): Promise<void> {
  const runId = `run-${Date.now()}`;
  const config = readDreamConfig(workspaceDir);
  const registry = new PluginRegistry();
  registry.registerAdapter(new CopilotDebugAdapter(config.copilotDebugSessionDir));
  registry.registerAdapter(new JsonlEventAdapter(config.jsonlEventsPath));
  registry.registerAdapter(new VsCodeChatExportAdapter(config.vscodeChatExportPath));
  registry.registerAdapter(new CopilotCliAdapter(config.copilotCliPath));
  registry.registerAdapter(new ClaudeCodeAdapter(config.claudeCodePath));
  registry.registerAdapter(new CursorChatAdapter(config.cursorChatPath));
  registry.registerAdapter(new WindsurfTraceAdapter(config.windsurfTracePath));
  registry.registerAdapter(new CodexTraceAdapter(config.codexTracePath));
  registry.registerAdapter(new TerminalRecordingAdapter(config.terminalCastPath));
  registry.registerAdapter(new BrowserTraceAdapter(config.browserHarPath));
  registry.registerBackend(new FileMemoryBackend(workspaceDir));
  registry.registerBackend(new InMemoryBackend());
  registry.registerBackend(new CopilotMemoryBackend(workspaceDir, config.copilotMemoryPath));
  registry.registerBackend(new HonchoMemoryBackend(workspaceDir, config.honchoWorkspacePath));
  registry.registerProvider(new EchoProvider());
  registry.registerProvider(
    new OpenAiCompatibleProvider(config.hostedProviderBaseUrl, config.hostedProviderApiKey, config.hostedProviderModel)
  );
  registry.registerProvider(new CopilotSdkProvider(config.copilotSdkBaseUrl, config.copilotSdkApiKey, config.copilotSdkModel));
  registry.registerProvider(new AnthropicProvider(config.anthropicBaseUrl, config.anthropicApiKey, config.anthropicModel));
  registry.registerProvider(new OllamaProvider(config.ollamaBaseUrl, config.ollamaModel));
  registry.registerProvider(new LmStudioProvider(config.lmStudioBaseUrl, config.lmStudioModel));
  registry.registerProvider(new LocalOpenAiProvider(config.localOpenAiBaseUrl, config.localOpenAiApiKey, config.localOpenAiModel));

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

  const context = buildContext(workspaceDir, runId);
  const loaded = await backend.load();
  context.memories = loaded;
  const previousState = await state.read<{ cursor?: string }>({});
  const ingest = await adapter.ingest(previousState.cursor);
  context.events = ingest.events;
  if (context.events.length) {
    const summary = await provider.summarize(context.events.map((e) => e.text).join("\n"));
    context.signals.push(`provider_summary=${summary.slice(0, 120)}`);
  }
  const sessions = context.events.filter((event) => event.kind === "session_start").length;
  if (sessions < config.minSessions) {
    await state.write({ cursor: ingest.cursor ?? previousState.cursor ?? null, lastRunAt: context.nowIso });
    return;
  }

  const orderedStages = [
    "stage.orientation",
    "stage.signal",
    "stage.consolidation",
    "stage.documentation",
    "stage.skills",
    "stage.governance",
    "stage.observability"
  ].map((id) => registry.requireStage(id));

  const finalContext = await runPipeline(context, orderedStages);
  await backend.save(finalContext.memories);
  await state.write({ cursor: ingest.cursor ?? null, lastRunAt: finalContext.nowIso });
}
