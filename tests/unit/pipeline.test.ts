import { describe, expect, it } from "vitest";
import { runPipeline } from "../../src/core/pipeline.js";
import { buildContext } from "../../src/dream/build-context.js";

describe("runPipeline", () => {
  it("runs stages in order", async () => {
    const context = buildContext("/tmp/workspace", "run-1");
    const calls: string[] = [];
    const stages = [
      { id: "a", run: async (ctx: typeof context) => (calls.push("a"), ctx) },
      { id: "b", run: async (ctx: typeof context) => (calls.push("b"), ctx) }
    ];
    await runPipeline(context, stages);
    expect(calls).toEqual(["a", "b"]);
  });
});
