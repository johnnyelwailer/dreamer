import type { TranscriptAdapter } from "../core/contracts.js";
import type { DreamConfig } from "./config.js";
import { CopilotDebugAdapter } from "../adapters/copilot-debug-adapter.js";
import { JsonlEventAdapter } from "../adapters/jsonl-event-adapter.js";
import { ClaudeCodeAdapter } from "../adapters/claude-code-adapter.js";
import { CodexTraceAdapter } from "../adapters/codex-trace-adapter.js";
import { TerminalRecordingAdapter } from "../adapters/terminal-recording-adapter.js";
import { BrowserTraceAdapter } from "../adapters/browser-trace-adapter.js";

export function createAdapter(config: DreamConfig): TranscriptAdapter {
  switch (config.adapterId) {
    case "adapter.copilot.debug":
      return new CopilotDebugAdapter({
        fallbackSessionDir: config.copilotDebugSessionDir,
        discoveryMode: config.copilotDebugDiscoveryMode,
        searchPaths: config.copilotDebugSearchPaths,
        lookbackDays: config.copilotDebugLookbackDays,
        maxSessionsPerRun: config.copilotDebugMaxSessionsPerRun
      });
    case "adapter.jsonl.events":
      return new JsonlEventAdapter(config.jsonlEventsPath);
    case "adapter.claude.code":
      return new ClaudeCodeAdapter(config.claudeCodePath);
    case "adapter.codex.trace":
      return new CodexTraceAdapter(config.codexTracePath);
    case "adapter.terminal.recording":
      return new TerminalRecordingAdapter(config.terminalCastPath);
    case "adapter.browser.trace":
      return new BrowserTraceAdapter(config.browserHarPath);
    default:
      throw new Error(`Unknown adapter id: ${config.adapterId}`);
  }
}
