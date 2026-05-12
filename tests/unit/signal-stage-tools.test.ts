import { describe, expect, it } from "vitest";
import type { InsightRecord, NormalizedEvent } from "../../src/core/types.js";
import { createSignalTools } from "../../src/stages/signal-stage-tools.js";
import type { WrittenSession } from "../../src/stages/signal-stage-file-writer.js";

function event(overrides: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: overrides.id ?? "e1",
    timestamp: overrides.timestamp ?? "2026-05-10T00:00:00.000Z",
    source: "test",
    kind: overrides.kind ?? "message",
    text: overrides.text ?? "",
    metadata: overrides.metadata ?? {}
  };
}

describe("createSignalTools", () => {
  it("records concrete interaction preferences with examples and scope", async () => {
    const captured: InsightRecord[] = [];
    const session: WrittenSession = {
      sessionIndex: 1,
      events: [
        event({ id: "s1", kind: "session_start", metadata: { sessionId: "session-abc" } }),
        event({
          id: "m1",
          text: "Use short caveman style and state-transition examples.",
          metadata: { role: "user" }
        })
      ],
      messageCount: 1
    };
    const tools = createSignalTools("/tmp/dreamer-run", [session], (insight) => captured.push(insight));
    const recordInsight = tools.find((tool) => tool.name === "record_insight") as
      | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
      | undefined;

    await recordInsight?.handler({
      statement: "User prefers terse state-transition examples when discussing behavior.",
      scope: "user",
      category: "communication",
      tags: ["examples", "style"],
      rationale:
        "User asked for short caveman style and examples like given state, action, resulting state.",
      applies_when: "Explaining product behavior, bugs, requirements, or acceptance criteria.",
      horizon: "long_term",
      reason: "This controls how future agents should communicate behavior changes.",
      references: [{ kind: "session", value: "session-1" }],
      evidence: [{ session_id: "session-abc", from_message: 1, to_message: 1 }]
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.scope).toBe("user");
    expect(captured[0]?.context?.category).toBe("communication");
    expect(captured[0]?.context?.tags).toEqual(["examples", "style"]);
    expect(captured[0]?.context?.appliesWhen).toContain("Explaining product behavior");
    expect(captured[0]?.capture?.horizon).toBe("long_term");
    expect(captured[0]?.capture?.references?.[0]).toEqual({ kind: "session", value: "session-1" });
    expect(captured[0]?.evidence?.[0]?.sessionId).toBe("session-abc");
  });

  it("rejects insight writes without references when no session hint is available", async () => {
    const captured: InsightRecord[] = [];
    const session: WrittenSession = {
      sessionIndex: 1,
      events: [event({ id: "m1", text: "A meaningful user preference", metadata: { role: "user" } })],
      messageCount: 1
    };
    const tools = createSignalTools("/tmp/dreamer-run", [session], (insight) => captured.push(insight));
    const recordInsight = tools.find((tool) => tool.name === "record_insight") as
      | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
      | undefined;

    const result = await recordInsight?.handler({
      statement: "User prefers compact reports.",
      scope: "user"
    });

    expect(captured).toHaveLength(0);
    expect(result).toEqual(
      expect.objectContaining({
        resultType: "error"
      })
    );
  });

  it("auto-adds session reference/evidence from session hint", async () => {
    const captured: InsightRecord[] = [];
    const session: WrittenSession = {
      sessionIndex: 1,
      events: [event({ id: "s1", kind: "session_start", metadata: { sessionId: "session-xyz" } })],
      messageCount: 0
    };
    const tools = createSignalTools("/tmp/dreamer-run", [session], (insight) => captured.push(insight), {
      sessionId: "session-xyz"
    });
    const recordInsight = tools.find((tool) => tool.name === "record_insight") as
      | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
      | undefined;

    await recordInsight?.handler({
      statement: "Use non-destructive git commands while fixing regressions.",
      scope: "workspace",
      references: [{ kind: "doc", value: "workflow:git-safety" }]
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.capture?.references).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "session", value: "session-xyz" })])
    );
    expect(captured[0]?.evidence).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: "session-xyz" })]));
  });

  it("records an explicit no-insights final verdict", async () => {
    let verdict: { status: string; summary: string } | null = null;
    const session: WrittenSession = {
      sessionIndex: 1,
      events: [event({ id: "m1", text: "No durable content", metadata: { role: "user" } })],
      messageCount: 1
    };
    const tools = createSignalTools(
      "/tmp/dreamer-run",
      [session],
      () => undefined,
      { sessionId: "session-xyz" },
      (next) => {
        verdict = next;
      }
    );
    const finalize = tools.find((tool) => tool.name === "finalize_signal_extraction") as
      | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
      | undefined;

    const result = await finalize?.handler({
      status: "no_insights_found",
      summary: "Reviewed the session and found no durable preferences or workspace rules."
    });

    expect(result).toEqual(expect.objectContaining({ resultType: "success" }));
    expect(verdict).toEqual({
      status: "no_insights_found",
      summary: "Reviewed the session and found no durable preferences or workspace rules."
    });
  });

  it("keeps long insight statements beyond 200 chars without mid-token clipping", async () => {
    const captured: InsightRecord[] = [];
    const session: WrittenSession = {
      sessionIndex: 1,
      events: [event({ id: "s1", kind: "session_start", metadata: { sessionId: "session-long" } })],
      messageCount: 0
    };
    const tools = createSignalTools("/tmp/dreamer-run", [session], (insight) => captured.push(insight), {
      sessionId: "session-long"
    });
    const recordInsight = tools.find((tool) => tool.name === "record_insight") as
      | { handler: (args: Record<string, unknown>) => unknown | Promise<unknown> }
      | undefined;

    const longStatement =
      "Signal-stage required-tool failures such as missing finalize_signal_extraction should be treated as per-session non-fatal skips with explicit diary markers and visibility in reports. " +
      "When users paste wtf-prefixed terminal diagnostics, proceed straight to code-level investigation and fix without clarifying loops. " +
      "Use pnpm dream:honcho for end-to-end validation after signal-stage patches so multi-session runs are verified.";

    await recordInsight?.handler({
      statement: longStatement,
      scope: "workspace",
      references: [{ kind: "session", value: "session-1" }]
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.statement.length).toBeGreaterThan(200);
    expect(captured[0]?.statement).toContain("missing finalize_signal_extraction");
    expect(captured[0]?.statement).toContain("wtf-prefixed terminal diagnostics");
  });
});
