import { describe, expect, it } from "vitest";
import { createStreamState } from "../../src/providers/copilot-sdk-stream-state.js";

describe("createStreamState", () => {
  it("tags top-level selected-agent tool events with agent context", () => {
    const state = createStreamState("signal:session-1.md");

    const tag = state.toolTagFor("read_file", {
      type: "tool.execution_start",
      data: {
        toolName: "read_file",
        agent: { name: "skill" }
      }
    });

    expect(tag).toBe("read_file@signal:session-1.md");
  });

  it("uses subagent suffix for tool events with known subagent agentId", () => {
    const state = createStreamState("signal:session-1.md");
    state.rememberSubagent({
      type: "subagent.started",
      agentId: "sg-1",
      data: {
        agentName: "behavior-analyst"
      }
    });

    const tag = state.toolTagFor("read_file", {
      type: "tool.execution_start",
      agentId: "sg-1",
      data: {
        toolName: "read_file"
      }
    });

    expect(tag).toBe("read_file@behavior-analyst");
  });

  it("keeps main agent tag for non-subagent assistant messages", () => {
    const state = createStreamState("signal:session-1.md");

    const tag = state.agentTagFor({
      type: "assistant.message",
      data: {
        agent: { name: "skill" },
        content: "Working on this now."
      }
    });

    expect(tag).toBe("signal:session-1.md");
  });

  it("does not classify non-subagent events as delegated when agentId is unknown", () => {
    const state = createStreamState("signal:session-1.md");

    const tag = state.agentTagFor({
      type: "assistant.message",
      agentId: "unknown-subagent-id",
      data: {
        agentName: "behavior-analyst",
        content: "Interim result"
      }
    });

    expect(tag).toBe("signal:session-1.md");
  });
});
