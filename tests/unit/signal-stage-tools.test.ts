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
});
