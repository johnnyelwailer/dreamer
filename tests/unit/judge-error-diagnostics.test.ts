import { describe, expect, it } from "vitest";
import { deriveJudgeErrorDiagnostics } from "../../src/eval/judge-error-diagnostics.js";

describe("judge error diagnostics", () => {
  it("extracts provider preflight root cause", () => {
    const details = deriveJudgeErrorDiagnostics("provider_preflight_failed: TimeoutError: The operation was aborted due to timeout");
    expect(details.failureCategory).toBe("provider_preflight");
    expect(details.rootCause).toBe("TimeoutError: The operation was aborted due to timeout");
  });

  it("classifies tool-not-called explicitly", () => {
    const details = deriveJudgeErrorDiagnostics("tool_not_called_after_retries");
    expect(details.failureCategory).toBe("tool_not_called");
    expect(details.rootCause).toContain("submit_quality_scores");
  });

  it("keeps wrapped judge runtime error text", () => {
    const details = deriveJudgeErrorDiagnostics("tool_judge_failed: Error: 400 request (65608 tokens) exceeds available context size (65536)");
    expect(details.failureCategory).toBe("judge_error");
    expect(details.rootCause).toContain("400 request (65608 tokens)");
  });
});
