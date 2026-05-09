import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runDream } from "../../src/dream/run-dream.js";

describe("dream run integration", () => {
  it("produces generated docs, reports, and memory output", async () => {
    const workspaceDir = process.cwd();
    process.env.DREAM_MIN_SESSIONS = "0";
    await rm(join(workspaceDir, ".dreamer", "state.json"), { force: true });
    await runDream(workspaceDir);
    const targets = [
      ".dreamer/memory.json",
      "reports/dream-diary.md",
      "reports/governance.json",
      "docs/generated/PRODUCT_SPEC.md"
    ].map((f) => join(workspaceDir, f));
    for (const file of targets) {
      const info = await stat(file);
      expect(info.isFile()).toBe(true);
    }
    delete process.env.DREAM_MIN_SESSIONS;
    await rm(join(workspaceDir, "docs/generated"), { recursive: true, force: true });
    await rm(join(workspaceDir, "reports"), { recursive: true, force: true });
  });

  it("switches plugins by config without core rewrites", async () => {
    const workspaceDir = process.cwd();
    process.env.DREAM_ADAPTER_ID = "adapter.vscode.chat-export";
    process.env.DREAM_BACKEND_ID = "backend.copilot.memory";
    process.env.DREAM_PROVIDER_ID = "provider.local.openai";
    process.env.DREAM_MIN_SESSIONS = "0";
    await rm(join(workspaceDir, ".dreamer", "state.json"), { force: true });
    await runDream(workspaceDir);
    const diary = await stat(join(workspaceDir, "reports", "dream-diary.md"));
    const copilotMemory = await stat(join(workspaceDir, ".dreamer", "copilot-memory.json"));
    expect(diary.isFile()).toBe(true);
    expect(copilotMemory.isFile()).toBe(true);
    delete process.env.DREAM_ADAPTER_ID;
    delete process.env.DREAM_BACKEND_ID;
    delete process.env.DREAM_PROVIDER_ID;
    delete process.env.DREAM_MIN_SESSIONS;
    await rm(join(workspaceDir, "docs/generated"), { recursive: true, force: true });
    await rm(join(workspaceDir, "reports"), { recursive: true, force: true });
  });
});
