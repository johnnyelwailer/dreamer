import { describe, expect, it } from "vitest";
import { BrowserTraceAdapter } from "../../src/adapters/browser-trace-adapter.js";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code-adapter.js";
import { CodexTraceAdapter } from "../../src/adapters/codex-trace-adapter.js";
import { CopilotCliAdapter } from "../../src/adapters/copilot-cli-adapter.js";
import { CursorChatAdapter } from "../../src/adapters/cursor-chat-adapter.js";
import { TerminalRecordingAdapter } from "../../src/adapters/terminal-recording-adapter.js";
import { VsCodeChatExportAdapter } from "../../src/adapters/vscode-chat-export-adapter.js";
import { WindsurfTraceAdapter } from "../../src/adapters/windsurf-trace-adapter.js";
import { CopilotMemoryBackend } from "../../src/backends/copilot-memory-backend.js";
import { HonchoMemoryBackend } from "../../src/backends/honcho-memory-backend.js";
import { AnthropicProvider } from "../../src/providers/anthropic-provider.js";
import { CopilotSdkProvider } from "../../src/providers/copilot-sdk-provider.js";
import { LmStudioProvider } from "../../src/providers/lm-studio-provider.js";
import { LocalOpenAiProvider } from "../../src/providers/local-openai-provider.js";
import { OllamaProvider } from "../../src/providers/ollama-provider.js";

describe("adapter matrix", () => {
  it("ingests fixtures for each listed adapter integration", async () => {
    const adapters = [
      new VsCodeChatExportAdapter(".dreamer/fixtures/vscode-chat-export.json"),
      new CopilotCliAdapter(".dreamer/fixtures/copilot-cli.jsonl"),
      new ClaudeCodeAdapter(".dreamer/fixtures/claude-code.jsonl"),
      new CursorChatAdapter(".dreamer/fixtures/cursor-chat.json"),
      new WindsurfTraceAdapter(".dreamer/fixtures/windsurf.jsonl"),
      new CodexTraceAdapter(".dreamer/fixtures/codex.jsonl"),
      new TerminalRecordingAdapter(".dreamer/fixtures/terminal.cast"),
      new BrowserTraceAdapter(".dreamer/fixtures/browser.har")
    ];
    for (const adapter of adapters) {
      const result = await adapter.ingest();
      expect(result.events.length, adapter.id).toBeGreaterThan(0);
    }
  });
});

describe("backend matrix", () => {
  it("round-trips memory records in copilot and honcho backends", async () => {
    const memory = [
      {
        id: "m-1",
        scope: "workspace" as const,
        statement: "Use unit tests before refactors",
        confidence: 0.9,
        provenance: {
          source: "test",
          eventIds: ["e-1"],
          capturedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    ];
    const copilot = new CopilotMemoryBackend(process.cwd(), ".dreamer/test/copilot-memory.json");
    const honcho = new HonchoMemoryBackend(process.cwd(), ".dreamer/test/honcho-workspace.json");
    await copilot.save(memory);
    await honcho.save(memory);
    expect((await copilot.load()).length).toBe(1);
    expect((await honcho.load()).length).toBe(1);
  });
});

describe("provider matrix", () => {
  it("returns safe fallback summaries when endpoints are not configured", async () => {
    const providers = [
      new CopilotSdkProvider("", "", "gpt-4o-mini"),
      new AnthropicProvider("https://api.anthropic.com/v1", "", "claude-3-5-sonnet-latest"),
      new OllamaProvider("", "llama3.2"),
      new LmStudioProvider("", "local-model"),
      new LocalOpenAiProvider("", "", "local-model")
    ];
    for (const provider of providers) {
      const summary = await provider.summarize("hello");
      expect(summary.length, provider.id).toBeGreaterThan(0);
    }
  });
});
