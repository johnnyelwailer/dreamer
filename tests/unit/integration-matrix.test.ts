import { describe, expect, it } from "vitest";
import { BrowserTraceAdapter } from "../../src/adapters/browser-trace-adapter.js";
import { ClaudeCodeAdapter } from "../../src/adapters/claude-code-adapter.js";
import { CodexTraceAdapter } from "../../src/adapters/codex-trace-adapter.js";
import { TerminalRecordingAdapter } from "../../src/adapters/terminal-recording-adapter.js";
import { CopilotMemoryBackend } from "../../src/backends/copilot-memory-backend.js";
import { readRuntimeManifest } from "../../src/dream/runtime-manifest.js";
import { CopilotSdkProvider } from "../../src/providers/copilot-sdk-provider.js";

describe("adapter matrix", () => {
  it("ingests fixtures for each listed adapter integration", async () => {
    const adapters = [
      new ClaudeCodeAdapter(".dreamer/fixtures/claude-code.jsonl"),
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
  it("round-trips memory records in the copilot backend", async () => {
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
    await copilot.save(memory);
    expect((await copilot.load()).length).toBe(1);
  });
});

describe("provider matrix", () => {
  it("returns safe fallback summary when Copilot SDK endpoint is not configured", async () => {
    const runtime = readRuntimeManifest(process.cwd());
    const provider = new CopilotSdkProvider({
      model: runtime.provider.defaultModel,
      requestTimeoutMs: 500,
      clientOptions: { useLoggedInUser: false, cliUrl: "127.0.0.1:1" },
      sessionConfig: {
        provider: {
          type: "openai",
          wireApi: "completions",
          baseUrl: "http://127.0.0.1:1"
        }
      }
    });
    const summary = await provider.summarize("hello");
    expect(summary.length, provider.id).toBeGreaterThan(0);
  }, 15000);
});
