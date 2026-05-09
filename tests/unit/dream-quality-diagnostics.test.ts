import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDreamQualityDiagnostics } from "../../src/eval/dream-quality-diagnostics.js";
import type { DreamConfig } from "../../src/dream/config.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("buildDreamQualityDiagnostics", () => {
  it("includes transcript summary and derived conclusions for copilot debug runs", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-diagnostics-"));
    tempDirs.push(workspaceDir);

    const sessionDir = join(workspaceDir, "fixtures", "debug-logs", "session-1");
    const transcriptDir = join(workspaceDir, "fixtures", "transcripts");
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(transcriptDir, { recursive: true });
    mkdirSync(join(workspaceDir, "reports"), { recursive: true });
    mkdirSync(join(workspaceDir, ".dreamer"), { recursive: true });

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
      join(workspaceDir, ".dreamer", "copilot-memory.json"),
      JSON.stringify({ records: [{ statement: "Observed provider_summary=inspected diagnostics flow" }] }),
      "utf8"
    );
    writeFileSync(
      join(workspaceDir, "reports", "pipeline-log.json"),
      JSON.stringify({ providerOutputs: { summary: "Long-running transcript about report provenance." } }),
      "utf8"
    );
    writeFileSync(join(workspaceDir, "reports", "dream-diary.md"), "ok\n", "utf8");
    writeFileSync(join(workspaceDir, "reports", "governance.json"), "{}\n", "utf8");
    writeFileSync(join(workspaceDir, "reports", "metrics.json"), "{}\n", "utf8");

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
      copilotMemoryPath: join(workspaceDir, ".dreamer", "copilot-memory.json"),
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
      transcriptSummary?: { messageCount?: number; toolCount?: number; sampleUserMessages?: string[] };
      derivedConclusions?: { memoryStatements?: string[]; providerSummaryPreview?: string };
    };

    expect(diagnostics.transcriptSummary?.messageCount).toBe(2);
    expect(diagnostics.transcriptSummary?.toolCount).toBe(1);
    expect(diagnostics.transcriptSummary?.sampleUserMessages?.[0]).toContain("Need better provenance");
    expect(diagnostics.derivedConclusions?.memoryStatements?.[0]).toContain("Observed provider_summary");
    expect(diagnostics.derivedConclusions?.providerSummaryPreview).toContain("Long-running transcript");
  });
});