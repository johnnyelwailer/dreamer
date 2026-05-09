import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDream } from "../../src/dream/run-dream.js";
import { readRuntimeManifest } from "../../src/dream/runtime-manifest.js";

describe("dream run integration", () => {
  it("produces generated docs, reports, and memory output", async () => {
    const workspaceDir = process.cwd();
    process.env.DREAM_MIN_SESSIONS = "0";
    await rm(join(workspaceDir, ".dreamer", "state.json"), { force: true });
    await runDream(workspaceDir);
    const targets = [
      ".dreamer/memory.json",
      "reports/dream-diary.md",
      "reports/governance.json"
    ].map((f) => join(workspaceDir, f));
    for (const file of targets) {
      const info = await stat(file);
      expect(info.isFile()).toBe(true);
    }
    const docsDir = join(workspaceDir, "docs", "generated");
    const generatedDocs = (await readdir(docsDir)).filter((name) => name.endsWith(".md"));
    expect(generatedDocs.length).toBeGreaterThan(0);
    const firstDoc = await readFile(join(docsDir, generatedDocs[0] ?? ""), "utf8");
    expect(firstDoc.trim().length).toBeGreaterThan(20);
    expect(firstDoc).not.toContain("Generated architecture notes");
    delete process.env.DREAM_MIN_SESSIONS;
    await rm(join(workspaceDir, "docs/generated"), { recursive: true, force: true });
    await rm(join(workspaceDir, "reports"), { recursive: true, force: true });
  });

  it("switches plugins by config without core rewrites", async () => {
    const workspaceDir = process.cwd();
    const runtime = readRuntimeManifest(workspaceDir);
    process.env.DREAM_ADAPTER_ID = "adapter.claude.code";
    process.env.DREAM_CLAUDE_CODE_FILE = join(workspaceDir, ".dreamer", "fixtures", "claude-code.jsonl");
    process.env.DREAM_BACKEND_ID = "backend.copilot.memory";
    process.env.DREAM_MIN_SESSIONS = "0";
    process.env.COPILOT_SDK_BASE_URL = "";
    process.env.COPILOT_SDK_API_KEY = "";
    process.env.COPILOT_SDK_MODEL = runtime.provider.defaultModel;
    await rm(join(workspaceDir, ".dreamer", "state.json"), { force: true });
    await runDream(workspaceDir);
    const diary = await stat(join(workspaceDir, "reports", "dream-diary.md"));
    const copilotMemory = await stat(join(workspaceDir, ".dreamer", "copilot-memory.json"));
    const evalReport = await stat(join(workspaceDir, runtime.eval.reportPath)).catch(() => null);
    expect(diary.isFile()).toBe(true);
    expect(copilotMemory.isFile()).toBe(true);
    expect(evalReport === null || evalReport.isFile()).toBe(true);
    delete process.env.DREAM_ADAPTER_ID;
    delete process.env.DREAM_CLAUDE_CODE_FILE;
    delete process.env.DREAM_BACKEND_ID;
    delete process.env.DREAM_MIN_SESSIONS;
    delete process.env.COPILOT_SDK_BASE_URL;
    delete process.env.COPILOT_SDK_API_KEY;
    delete process.env.COPILOT_SDK_MODEL;
    await rm(join(workspaceDir, "docs/generated"), { recursive: true, force: true });
    await rm(join(workspaceDir, "reports"), { recursive: true, force: true });
  });
});
