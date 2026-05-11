import { describe, expect, it } from "vitest";
import {
  delegationPhase,
  eventSubagentName,
  isSubagentTerminalEvent,
  isToolComplete
} from "../../src/providers/copilot-sdk-stream-event-helpers.js";

describe("eventSubagentName", () => {
  it("does not treat generic data.name as a subagent name", () => {
    expect(
      eventSubagentName({
        type: "tool.execution_start",
        data: {
          name: "finalize_signal_extraction"
        }
      })
    ).toBeUndefined();
  });

  it("returns explicit subagent names from canonical fields", () => {
    expect(
      eventSubagentName({
        type: "subagent.started",
        data: {
          agentName: "behavior-analyst"
        }
      })
    ).toBe("behavior-analyst");
  });
});

describe("terminal event matching", () => {
  it("treats cancellation and abort variants as terminal subagent events", () => {
    expect(isSubagentTerminalEvent("subagent.cancelled")).toBe(true);
    expect(isSubagentTerminalEvent("subagent.aborted")).toBe(true);
    expect(isSubagentTerminalEvent("subagent.terminated")).toBe(true);
    expect(isSubagentTerminalEvent("subagent.stopped")).toBe(true);
    expect(isSubagentTerminalEvent("subagent.rejected")).toBe(true);
  });

  it("treats failure and cancellation variants as terminal tool events", () => {
    expect(isToolComplete("tool.execution_complete")).toBe(true);
    expect(isToolComplete("tool.execution_error")).toBe(true);
    expect(isToolComplete("tool.execution_failed")).toBe(true);
    expect(isToolComplete("tool.execution_cancelled")).toBe(true);
    expect(isToolComplete("tool.execution_aborted")).toBe(true);
  });

  it("maps cancelled delegations to failed phase", () => {
    expect(delegationPhase("subagent.cancelled")).toBe("failed");
    expect(delegationPhase("subagent.aborted")).toBe("failed");
    expect(delegationPhase("subagent.rejected")).toBe("failed");
  });
});
