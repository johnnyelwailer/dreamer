import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDreamAgentStreamHandler } from "../../src/providers/copilot-sdk-stream.js";

describe("createDreamAgentStreamHandler", () => {
  const originalLiveStream = process.env.DREAM_RUN_LIVE_STREAM;
  const originalEvalStream = process.env.DREAM_EVAL_LIVE_STREAM;
  const originalRenderer = process.env.DREAM_STREAM_RENDERER;
  const originalCi = process.env.CI;
  let writeSpy: ReturnType<typeof vi.spyOn> | undefined;
  let stderrWriteSpy: ReturnType<typeof vi.spyOn> | undefined;
  let stderrIsTtyDescriptor: PropertyDescriptor | undefined;
  const writes: string[] = [];
  const stderrWrites: string[] = [];

  beforeEach(() => {
    process.env.DREAM_RUN_LIVE_STREAM = "1";
    delete process.env.DREAM_EVAL_LIVE_STREAM;
    process.env.DREAM_STREAM_RENDERER = "tty";
    delete process.env.CI;
    writes.length = 0;
    stderrWrites.length = 0;
    stderrIsTtyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      return true;
    }) as typeof process.stdout.write);
    stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      return true;
    }) as typeof process.stderr.write);
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: false });
  });

  afterEach(() => {
    writeSpy?.mockRestore();
    stderrWriteSpy?.mockRestore();
    if (stderrIsTtyDescriptor) Object.defineProperty(process.stderr, "isTTY", stderrIsTtyDescriptor);
    if (originalLiveStream === undefined) delete process.env.DREAM_RUN_LIVE_STREAM;
    else process.env.DREAM_RUN_LIVE_STREAM = originalLiveStream;
    if (originalEvalStream === undefined) delete process.env.DREAM_EVAL_LIVE_STREAM;
    else process.env.DREAM_EVAL_LIVE_STREAM = originalEvalStream;
    if (originalRenderer === undefined) delete process.env.DREAM_STREAM_RENDERER;
    else process.env.DREAM_STREAM_RENDERER = originalRenderer;
    if (originalCi === undefined) delete process.env.CI;
    else process.env.CI = originalCi;
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

  it("does not stream assistant deltas when stderr is not a tty", () => {
    const handler = createDreamAgentStreamHandler({ agentTag: "signal main" });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "assistant.message_delta",
      data: {
        content: "live token"
      }
    });

    expect(writes.join("")).not.toContain("live token");
  });

  it("does not render dashboard rows in tty mode by default", () => {
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    const handler = createDreamAgentStreamHandler({ agentTag: "signal main" });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "tool.execution_start",
      data: {
        toolName: "task",
        description: "Inspect session transcript"
      }
    });

    handler?.({
      type: "subagent.started",
      agentId: "explore-1",
      data: { agentName: "explore" }
    });

    handler?.({
      type: "tool.execution_start",
      agentId: "explore-1",
      data: { toolName: "read_file" }
    });

    const output = stderrWrites.join("");
    expect(output).not.toContain("- explore");
    expect(output).toContain("[delegate] start explore");
  });

  it("keeps detailed colored tool logs in tty mode", () => {
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    const handler = createDreamAgentStreamHandler({ agentTag: "signal main", verbose: true });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "subagent.started",
      agentId: "explore-2",
      data: { agentName: "explore" }
    });

    handler?.({
      type: "tool.execution_start",
      agentId: "explore-2",
      data: {
        toolName: "read_file",
        toolCallId: "call-1",
        arguments: {
          filePath: "/Users/pj/Dev/github/dreamer/docs/getting-started.md"
        }
      }
    });

    handler?.({
      type: "tool.execution_complete",
      agentId: "explore-2",
      data: {
        toolName: "read_file",
        toolCallId: "call-1",
        success: true,
        result: { ok: true, bytes: 321 }
      }
    });

    const output = stderrWrites.join("");
    expect(output).toContain("read_file@explore");
    expect(output).toContain("filePath");
    expect(output).toContain("result:");
  });

  it("falls back to tty renderer when ink is selected without interactive tty", () => {
    process.env.DREAM_STREAM_RENDERER = "ink";
    const handler = createDreamAgentStreamHandler({ agentTag: "signal main" });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "tool.execution_start",
      data: {
        toolName: "task",
        description: "Inspect session transcript"
      }
    });

    handler?.({
      type: "subagent.started",
      data: { agentName: "explore" }
    });

    expect(writes.join("")).toContain("[delegate] start explore");
  });

  it("appends main-agent tool completion lines in non-verbose tty mode", () => {
    Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: true });
    const handler = createDreamAgentStreamHandler({ agentTag: "consolidation main", verbose: false });
    expect(handler).toBeTypeOf("function");

    handler?.({
      type: "tool.execution_start",
      data: {
        toolName: "finalize_consolidation",
        toolCallId: "finalize-1",
        arguments: {
          status: "completed",
          summary: "done"
        }
      }
    });

    handler?.({
      type: "tool.execution_complete",
      data: {
        toolName: "finalize_consolidation",
        toolCallId: "finalize-1",
        success: true
      }
    });

    const output = stderrWrites.join("");
    expect(output).toContain("finalize_consolidation");
    expect(output).toContain("completed ✓");
  });
});