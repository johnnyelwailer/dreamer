import { describe, expect, it } from "vitest";
import { runStageAgentPack } from "../../src/stages/stage-agent-pack-execution.js";
import type { IntelligenceProvider, RunAgentOptions } from "../../src/core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../../src/dream/runtime-manifest.js";

describe("runStageAgentPack", () => {
  it("runs explicit specialist sequence before main pass", async () => {
    const calls: Array<{ prompt: string; options: RunAgentOptions }> = [];
    const provider: IntelligenceProvider = {
      id: "provider.test",
      summarize: async () => "",
      runAgent: async (prompt, _tools, options = {}) => {
        calls.push({ prompt, options });
        return "";
      }
    };

    const agentPack: RuntimeStageAgentPackConfig = {
      defaultAgent: { excludedTools: ["bash"] },
      customAgents: [
        { name: "a", promptTemplatePath: "x" },
        { name: "b", promptTemplatePath: "y" }
      ],
      execution: { mode: "explicit-sequence", explicitSequence: ["a", "b"] }
    };

    await runStageAgentPack({
      provider,
      prompt: "main prompt",
      tools: [],
      streamTag: "stage.main",
      retries: ["retry once"],
      customAgents: [
        { name: "a", prompt: "agent a" },
        { name: "b", prompt: "agent b" }
      ],
      defaultAgent: agentPack.defaultAgent,
      agentPack
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]?.options.selectedAgent).toBe("a");
    expect(calls[1]?.options.selectedAgent).toBe("b");
    expect(calls[2]?.options.selectedAgent).toBeUndefined();
    expect(calls[2]?.options.retries).toEqual(["retry once"]);
  });

  it("falls back to a single main pass when explicit-sequence is not configured", async () => {
    const calls: Array<{ prompt: string; options: RunAgentOptions }> = [];
    const provider: IntelligenceProvider = {
      id: "provider.test",
      summarize: async () => "",
      runAgent: async (prompt, _tools, options = {}) => {
        calls.push({ prompt, options });
        return "";
      }
    };

    await runStageAgentPack({
      provider,
      prompt: "main prompt",
      tools: [],
      streamTag: "stage.main",
      customAgents: [{ name: "a", prompt: "agent a" }],
      agentPack: {
        customAgents: [{ name: "a", promptTemplatePath: "x" }]
      }
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.options.selectedAgent).toBeUndefined();
  });
});
