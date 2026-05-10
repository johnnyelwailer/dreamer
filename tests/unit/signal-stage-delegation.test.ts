import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IntelligenceProvider, RunAgentOptions } from "../../src/core/contracts.js";
import type { NormalizedEvent } from "../../src/core/types.js";
import { buildContext } from "../../src/dream/build-context.js";
import type { RuntimeStageAgentPackConfig } from "../../src/dream/runtime-manifest.js";
import { workspaceStorageDir } from "../../src/dream/dreamer-home.js";
import { SignalStage } from "../../src/stages/signal-stage.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(workspaceStorageDir(dir), { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

function createEvents(): NormalizedEvent[] {
  return [
    {
      id: "e-1",
      timestamp: "2026-05-10T00:00:00.000Z",
      source: "adapter.test",
      kind: "session_start",
      text: "",
      metadata: { sessionId: "session-test" }
    },
    {
      id: "e-2",
      timestamp: "2026-05-10T00:00:01.000Z",
      source: "adapter.test",
      kind: "message",
      text: "Please make plan concise.",
      metadata: { role: "user" }
    }
  ];
}

class MockProvider implements IntelligenceProvider {
  id = "provider.test";
  calls: Array<{ prompt: string; options: RunAgentOptions }> = [];

  async summarize(_input: string): Promise<string> {
    return "ok";
  }

  async runAgent(prompt: string, _tools: unknown[], options: RunAgentOptions = {}): Promise<string> {
    this.calls.push({ prompt, options });
    return "ok";
  }
}

describe("SignalStage delegated mode", () => {
  it("keeps default per-session behavior when no agent pack is configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);
    const provider = new MockProvider();
    const stage = new SignalStage(provider);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.options.selectedAgent).toBeUndefined();
    expect(provider.calls[0]?.options.customAgents).toBeUndefined();
  });

  it("uses explicit-sequence delegated calls when signal agent pack is configured", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "dreamer-signal-stage-"));
    tempDirs.push(workspaceDir);

    const promptDir = join(workspaceDir, ".dreamer", "config", "prompts", "stages", "signal", "agents");
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(
      join(promptDir, "timeline.md"),
      "Timeline role for {{session_file}} in {{run_dir}}.",
      "utf8"
    );
    writeFileSync(
      join(promptDir, "recorder.md"),
      "Recorder role for {{session_file}} using {{orientation_path}}.",
      "utf8"
    );

    const pack: RuntimeStageAgentPackConfig = {
      defaultAgent: { excludedTools: ["record_insight"] },
      customAgents: [
        {
          name: "timeline-analyst",
          tools: ["read_file", "get_message_details"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/timeline.md",
          infer: true
        },
        {
          name: "insight-recorder",
          tools: ["record_insight"],
          promptTemplatePath: ".dreamer/config/prompts/stages/signal/agents/recorder.md",
          infer: false
        }
      ],
      execution: {
        mode: "explicit-sequence",
        explicitSequence: ["timeline-analyst", "insight-recorder"]
      }
    };

    const provider = new MockProvider();
    const stage = new SignalStage(provider, pack);
    const context = buildContext(workspaceDir, "run-1");
    context.events = createEvents();

    await stage.run(context);

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[0]?.options.selectedAgent).toBe("timeline-analyst");
    expect(provider.calls[1]?.options.selectedAgent).toBe("insight-recorder");
    expect(provider.calls[0]?.options.defaultAgent).toEqual({ excludedTools: ["record_insight"] });
    expect(provider.calls[0]?.options.customAgents).toHaveLength(2);
    expect(provider.calls[0]?.prompt).toContain("session-1.md");
    expect(provider.calls[1]?.prompt).toContain("session-1.md");
  });
});
