import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDreamQualityDiagnostics } from "../../src/eval/dream-quality-diagnostics.js";
import type { DreamConfig } from "../../src/dream/config.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(workspaceStorageDir(dir), { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildDreamQualityDiagnostics", () => {
  it("includes transcript summary and derived conclusions for copilot debug runs", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-diagnostics-"));
    tempDirs.push(workspaceDir);

    const sessionDir = join(workspaceDir, "fixtures", "debug-logs", "session-1");
    const transcriptDir = join(workspaceDir, "fixtures", "transcripts");
    const storageReportsDir = join(workspaceStorageDir(workspaceDir), "reports");
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(transcriptDir, { recursive: true });
    mkdirSync(storageReportsDir, { recursive: true });
    // copilot-memory is config-specified so can live anywhere; use a stable temp path
    const copilotMemoryDir = join(workspaceDir, ".dreamer");
    mkdirSync(copilotMemoryDir, { recursive: true });

    writeFileSync(join(sessionDir, "main.jsonl"), '{"type":"session_start"}\n', "utf8");
    writeFileSync(join(sessionDir, "models.json"), "[]", "utf8");
    writeFileSync(
      join(transcriptDir, "session-1.jsonl"),
      [
        JSON.stringify({ type: "user.message", data: { content: "Need better provenance in reports" } }),
        JSON.stringify({ type: "assistant.message", data: { content: "I will inspect diagnostics and reporting flow" } }),
        JSON.stringify({ type: "tool.execution_start", data: { toolName: "read_file" } })
      ].join("\n") + "\n",
      "utf8"
    );
    writeFileSync(
      join(copilotMemoryDir, "copilot-memory.json"),
      JSON.stringify({ records: [{ statement: "Observed provider_summary=inspected diagnostics flow" }] }),
      "utf8"
    );
    writeFileSync(
      join(storageReportsDir, "pipeline-log.json"),
      JSON.stringify({ providerOutputs: { summary: "Long-running transcript about report provenance." } }),
      "utf8"
    );
    writeFileSync(join(storageReportsDir, "dream-diary.md"), "ok\n", "utf8");
    writeFileSync(join(storageReportsDir, "governance.json"), "{}\n", "utf8");
    writeFileSync(join(storageReportsDir, "metrics.json"), "{}\n", "utf8");

    const config = {
      adapterId: "adapter.copilot.debug",
      backendId: "backend.file.memory",
      providerId: "provider.copilot.sdk",
      stageOrder: [],
      minSessions: 1,
      copilotDebugSessionDir: sessionDir,
      jsonlEventsPath: "",
      claudeCodePath: "",
      codexTracePath: "",
      terminalCastPath: "",
      browserHarPath: "",
      copilotMemoryPath: join(copilotMemoryDir, "copilot-memory.json"),
      memoryBackupEnabled: false,
      memoryBackupDir: join(workspaceDir, ".dreamer", "backups", "memories"),
      memoryBackupExternalOnly: true,
      honchoExportPath: join(workspaceDir, ".dreamer", "honcho.json"),
      honchoWorkspaceId: "dreamer",
      copilotSdkModel: "test-model",
      copilotSdkProviderOptions: {} as DreamConfig["copilotSdkProviderOptions"],
      docsOutputRootPath: "docs/generated",
      docsFallbackOutputPath: "docs/generated/DREAM_OUTPUT.md",
      docsPromptTemplatePath: "",
      docsImprovementHintsPath: "",
      docsMaxSignals: 1,
      docsMaxMemories: 1,
      docsMaxEvents: 1
    } satisfies DreamConfig;

    const diagnostics = (await buildDreamQualityDiagnostics(workspaceDir, config)) as {
      transcriptSummary?: {
        messageCount?: number;
        toolCount?: number;
        sampleUserMessages?: string[];
        conversationReplay?: Array<{ role: string; content: string }>;
      };
      derivedConclusions?: { memoryStatements?: string[]; providerSummaryPreview?: string };
    };

    expect(diagnostics.transcriptSummary?.messageCount).toBe(2);
    expect(diagnostics.transcriptSummary?.toolCount).toBe(1);
    expect(diagnostics.transcriptSummary?.sampleUserMessages?.[0]).toContain("Need better provenance");
    expect(diagnostics.transcriptSummary?.conversationReplay?.[0]).toEqual({
      role: "user",
      content: "Need better provenance in reports"
    });
    expect(diagnostics.transcriptSummary?.conversationReplay?.[1]).toEqual({
      role: "assistant",
      content: "I will inspect diagnostics and reporting flow"
    });
    expect(diagnostics.derivedConclusions?.memoryStatements?.[0]).toContain("Observed provider_summary");
    expect(diagnostics.derivedConclusions?.providerSummaryPreview).toContain("Long-running transcript");
  });
});