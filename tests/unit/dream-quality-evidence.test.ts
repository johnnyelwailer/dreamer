import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvidenceToolingSection, resolveJudgeEvidenceFiles } from "../../src/eval/dream-quality-evidence.js";
import type { DreamConfig } from "../../src/dream/config.js";

function baseConfig(): DreamConfig {
  return {
    adapterId: "adapter.copilot.debug",
    backendId: "backend.file.memory",
    providerId: "provider.copilot.sdk",
    stageOrder: [],
    minSessions: 1,
    copilotDebugSessionDir: "/tmp/ws/debug-logs/session-123",
    jsonlEventsPath: "/tmp/ws/events.jsonl",
    claudeCodePath: "/tmp/ws/claude.jsonl",
    codexTracePath: "/tmp/ws/codex.jsonl",
    terminalCastPath: "/tmp/ws/terminal.cast",
    browserHarPath: "/tmp/ws/browser.har",
    copilotMemoryPath: "/tmp/ws/copilot-memory.json",
    honchoExportPath: "/tmp/ws/honcho.json",
    honchoWorkspaceId: "dreamer",
    copilotSdkModel: "model",
    copilotSdkProviderOptions: {} as DreamConfig["copilotSdkProviderOptions"],
    docsOutputRootPath: "docs/generated",
    docsFallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
    docsPromptTemplatePath: "",
    docsImprovementHintsPath: "",
    docsMaxSignals: 1,
    docsMaxMemories: 1,
    docsMaxEvents: 1
  };
}

describe("dream quality evidence", () => {
  it("resolves copilot transcript path as evidence", () => {
    const config = baseConfig();
    const files = resolveJudgeEvidenceFiles(config);
    expect(files).toHaveLength(1);
    expect(files[0]?.kind).toBe("transcript");
    expect(files[0]?.path).toBe(join("/tmp/ws/debug-logs/session-123", "..", "..", "transcripts", "session-123.jsonl"));
  });

  it("builds evidence instructions with user-reaction and assistant-behavior focus", () => {
    const section = buildEvidenceToolingSection([
      { kind: "transcript", path: "/tmp/ws/transcripts/session-123.jsonl" }
    ]);
    expect(section).toContain("use native tools to inspect");
    expect(section).toContain("User reactions");
    expect(section).toContain("Assistant behavior");
    expect(section).toContain("/tmp/ws/transcripts/session-123.jsonl");
  });
});