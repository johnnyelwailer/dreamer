import { describe, expect, it } from "vitest";
import { createAgentToolGuard } from "../../src/providers/copilot-sdk-agent-tool-guard.js";

describe("createAgentToolGuard maxParallelSubagents", () => {
  it("does not block the first subagent launch when max parallelism is one", async () => {
    const guard = createAgentToolGuard({
      allowedTaskAgentTypes: ["behavior-analyst"],
      maxParallelSubagents: 1
    });

    await expect(
      Promise.resolve(
        guard.hooks.onPreToolUse({
          toolName: "task",
          toolArgs: {
            agent_type: "behavior-analyst",
            prompt: "Inspect user behavior."
          }
        })
      )
    ).resolves.toBeUndefined();
  });

  it("queues subsequent launches until a slot is freed", async () => {
    const guard = createAgentToolGuard({
      allowedTaskAgentTypes: ["behavior-analyst", "architecture-analyst"],
      maxParallelSubagents: 1
    });

    await Promise.resolve(
      guard.hooks.onPreToolUse({
        toolName: "task",
        toolArgs: {
          agent_type: "behavior-analyst",
          prompt: "Inspect behavior."
        }
      })
    );

    let released = false;
    const queued = Promise.resolve(
      guard.hooks.onPreToolUse({
        toolName: "task",
        toolArgs: {
          agent_type: "architecture-analyst",
          prompt: "Inspect architecture."
        }
      })
    ).then((result) => {
      released = true;
      return result;
    });

    await Promise.resolve();
    expect(released).toBe(false);

    guard.onEvent({ type: "subagent.started", agentId: "behavior-1", data: { agentName: "behavior-analyst" } });
    guard.onEvent({ type: "subagent.completed", agentId: "behavior-1", data: { agentName: "behavior-analyst" } });

    await queued;
    expect(released).toBe(true);
  });
});
