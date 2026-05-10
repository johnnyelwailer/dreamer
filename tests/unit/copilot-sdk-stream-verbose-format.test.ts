import { describe, expect, it } from "vitest";
import {
  buildAssistantIntentLines,
  buildReasoningVerboseLines,
  buildToolArgsVerboseLines,
  buildToolResultVerboseLines
} from "../../src/providers/copilot-sdk-stream-verbose-format.js";

describe("copilot sdk stream verbose format", () => {
  it("renders multiline tool params with truncation", () => {
    const lines = buildToolArgsVerboseLines({
      arguments: {
        filePath: "/Users/pj/Dev/github/dreamer/src/providers/copilot-sdk-stream.ts",
        query:
          "find every possible stream event type and include enough details to trigger line wrapping in verbose output for readability checks",
        command: "rg -n \"tool.execution\" src providers tests"
      }
    });

    expect(lines.length).toBeGreaterThan(2);
    expect(lines.some((line) => line.includes("filePath:"))).toBe(true);
    expect(lines.some((line) => line.includes("query:"))).toBe(true);
  });

  it("renders structured result preview per property", () => {
    const lines = buildToolResultVerboseLines({
      result: {
        ok: true,
        total: 42,
        files: ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"],
        metadata: { durationMs: 123, warnings: 0 }
      }
    });

    expect(lines.some((line) => line.includes("ok:"))).toBe(true);
    expect(lines.some((line) => line.includes("files:"))).toBe(true);
    expect(lines.some((line) => line.includes("metadata:"))).toBe(true);
  });

  it("extracts reasoning from assistant payloads", () => {
    const lines = buildReasoningVerboseLines({
      reasoningText:
        "I will inspect event metadata first, then choose a stable fallback and only then call tools to avoid unnecessary retries."
    });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" ")).toContain("inspect event metadata");
  });

  it("does not treat generic assistant content as reasoning", () => {
    const lines = buildReasoningVerboseLines({
      content: "Final assistant answer",
      deltaContent: "token"
    });
    expect(lines).toEqual([]);
  });

  it("extracts assistant intent when tool requests are present", () => {
    const lines = buildAssistantIntentLines({
      content: "I will read the orientation file first, then inspect the session length before extracting insights.",
      toolRequests: [{ name: "view" }, { name: "bash" }]
    });
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join(" ")).toContain("read the orientation file first");
  });

  it("does not emit intent without tool requests", () => {
    const lines = buildAssistantIntentLines({ content: "Here is the final answer." });
    expect(lines).toEqual([]);
  });
});
