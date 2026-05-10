import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDreamAgentStreamHandler } from "../../src/providers/copilot-sdk-stream.js";

describe("createDreamAgentStreamHandler", () => {
  const originalLiveStream = process.env.DREAM_RUN_LIVE_STREAM;
  const originalEvalStream = process.env.DREAM_EVAL_LIVE_STREAM;
  let writeSpy: ReturnType<typeof vi.spyOn> | undefined;
  const writes: string[] = [];

  beforeEach(() => {
    process.env.DREAM_RUN_LIVE_STREAM = "1";
    delete process.env.DREAM_EVAL_LIVE_STREAM;
    writes.length = 0;
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(() => {
    writeSpy?.mockRestore();
    if (originalLiveStream === undefined) delete process.env.DREAM_RUN_LIVE_STREAM;
    else process.env.DREAM_RUN_LIVE_STREAM = originalLiveStream;
    if (originalEvalStream === undefined) delete process.env.DREAM_EVAL_LIVE_STREAM;
    else process.env.DREAM_EVAL_LIVE_STREAM = originalEvalStream;
  });

  it("includes the delegated prompt in the start banner", () => {
    const handler = createDreamAgentStreamHandler({ agentTag: "signal main" });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "tool.execution_start",
      data: {
        toolName: "task",
        agent_type: "explore",
        name: "session-explorer",
        description: "Inspect the session transcript",
        prompt: "Inspect the session transcript and summarize durable findings."
      }
    });

    handler?.({
      type: "subagent.started",
      data: {
        agentName: "explore"
      }
    });

    const output = writes.join("");
    expect(output).toContain("[delegate]");
    expect(output).toContain("start explore");
    expect(output).toContain('prompt="Inspect the session transcript and summarize durable findings."');
  });
});