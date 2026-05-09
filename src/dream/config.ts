import { join } from "node:path";

export type DreamConfig = {
  adapterId: string;
  backendId: string;
  providerId: string;
  minSessions: number;
  copilotDebugSessionDir: string;
  jsonlEventsPath: string;
  vscodeChatExportPath: string;
  copilotCliPath: string;
  claudeCodePath: string;
  cursorChatPath: string;
  windsurfTracePath: string;
  codexTracePath: string;
  terminalCastPath: string;
  browserHarPath: string;
  copilotMemoryPath: string;
  honchoWorkspacePath: string;
  hostedProviderBaseUrl: string;
  hostedProviderApiKey: string;
  hostedProviderModel: string;
  copilotSdkBaseUrl: string;
  copilotSdkApiKey: string;
  copilotSdkModel: string;
  anthropicBaseUrl: string;
  anthropicApiKey: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  localOpenAiBaseUrl: string;
  localOpenAiApiKey: string;
  localOpenAiModel: string;
};

export function readDreamConfig(workspaceDir: string): DreamConfig {
  const fixturesDir = join(workspaceDir, ".dreamer", "fixtures");
  return {
    adapterId: process.env.DREAM_ADAPTER_ID ?? "adapter.copilot.debug",
    backendId: process.env.DREAM_BACKEND_ID ?? "backend.file.memory",
    providerId: process.env.DREAM_PROVIDER_ID ?? "provider.echo",
    minSessions: Number(process.env.DREAM_MIN_SESSIONS ?? "1"),
    copilotDebugSessionDir:
      process.env.COPILOT_DEBUG_SESSION_DIR ?? join(fixturesDir, "copilot-session"),
    jsonlEventsPath: process.env.DREAM_JSONL_EVENTS_FILE ?? join(fixturesDir, "events.jsonl"),
    vscodeChatExportPath:
      process.env.DREAM_VSCODE_CHAT_EXPORT_FILE ?? join(fixturesDir, "vscode-chat-export.json"),
    copilotCliPath: process.env.DREAM_COPILOT_CLI_FILE ?? join(fixturesDir, "copilot-cli.jsonl"),
    claudeCodePath: process.env.DREAM_CLAUDE_CODE_FILE ?? join(fixturesDir, "claude-code.jsonl"),
    cursorChatPath: process.env.DREAM_CURSOR_CHAT_FILE ?? join(fixturesDir, "cursor-chat.json"),
    windsurfTracePath: process.env.DREAM_WINDSURF_TRACE_FILE ?? join(fixturesDir, "windsurf.jsonl"),
    codexTracePath: process.env.DREAM_CODEX_TRACE_FILE ?? join(fixturesDir, "codex.jsonl"),
    terminalCastPath: process.env.DREAM_TERMINAL_CAST_FILE ?? join(fixturesDir, "terminal.cast"),
    browserHarPath: process.env.DREAM_BROWSER_TRACE_FILE ?? join(fixturesDir, "browser.har"),
    copilotMemoryPath:
      process.env.DREAM_COPILOT_MEMORY_FILE ?? join(workspaceDir, ".dreamer", "copilot-memory.json"),
    honchoWorkspacePath:
      process.env.DREAM_HONCHO_WORKSPACE_FILE ?? join(workspaceDir, ".dreamer", "honcho", "workspace.json"),
    hostedProviderBaseUrl: process.env.HOSTED_LLM_BASE_URL ?? "",
    hostedProviderApiKey: process.env.HOSTED_LLM_API_KEY ?? "",
    hostedProviderModel: process.env.HOSTED_LLM_MODEL ?? "qwen3.6-35b-a3b-q3",
    copilotSdkBaseUrl: process.env.COPILOT_SDK_BASE_URL ?? "",
    copilotSdkApiKey: process.env.COPILOT_SDK_API_KEY ?? "",
    copilotSdkModel: process.env.COPILOT_SDK_MODEL ?? "gpt-4o-mini",
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "",
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    lmStudioBaseUrl: process.env.LM_STUDIO_BASE_URL ?? "",
    lmStudioModel: process.env.LM_STUDIO_MODEL ?? "local-model",
    localOpenAiBaseUrl: process.env.LOCAL_OPENAI_BASE_URL ?? "",
    localOpenAiApiKey: process.env.LOCAL_OPENAI_API_KEY ?? "",
    localOpenAiModel: process.env.LOCAL_OPENAI_MODEL ?? "local-model"
  };
}
