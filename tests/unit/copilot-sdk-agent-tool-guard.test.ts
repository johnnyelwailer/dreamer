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

  it("denies excluded tools for the default stage agent", async () => {
    const guard = createAgentToolGuard({
      defaultAgentExcludedTools: ["read_file"]
    });

    const result = await Promise.resolve(
      guard.hooks.onPreToolUse({
        toolName: "read_file",
        toolArgs: { path: "session-1.md" }
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        permissionDecision: "deny"
      })
    );
  });

  it("allows excluded tools for an explicitly selected specialist agent", async () => {
    const guard = createAgentToolGuard({
      defaultAgentExcludedTools: ["read_file"],
      initialAgent: "behavior-analyst"
    });

    const result = await Promise.resolve(
      guard.hooks.onPreToolUse({
        toolName: "read_file",
        toolArgs: { path: "session-2.md" }
      })
    );

    expect(result).toBeUndefined();
  });
});
