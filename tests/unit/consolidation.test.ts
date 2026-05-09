import { describe, expect, it } from "vitest";
import { ConsolidationStage } from "../../src/stages/consolidation-stage.js";
import { buildContext } from "../../src/dream/build-context.js";

describe("ConsolidationStage", () => {
  it("adds new memory and updates duplicates", async () => {
    const stage = new ConsolidationStage();
    const context = buildContext(process.cwd(), "run-x");
    context.signals = ["session_starts=1", "session_starts=1"];
    const first = await stage.run(context);
    expect(first.memories.length).toBe(1);
    const second = await stage.run(first);
    expect(second.metrics.memoriesUpdated).toBeGreaterThan(0);
  });
});
