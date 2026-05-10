export type JudgeFailureCategory = "timeout" | "tool_not_called" | "judge_error" | "provider_preflight" | "unknown";

export function deriveJudgeErrorDiagnostics(judgeToolError?: string): {
  failureCategory?: JudgeFailureCategory;
  rootCause?: string;
} {
  if (!judgeToolError) return {};
  if (judgeToolError.startsWith("provider_preflight_failed:")) {
    return {
      failureCategory: "provider_preflight",
      rootCause: judgeToolError.replace("provider_preflight_failed:", "").trim()
    };
  }
  if (judgeToolError === "tool_not_called_after_retries") {
    return { failureCategory: "tool_not_called", rootCause: "submit_quality_scores was never called" };
  }
  if (judgeToolError.includes("session.idle")) {
    return { failureCategory: "timeout", rootCause: "Timeout waiting for session.idle" };
  }
  if (judgeToolError.startsWith("tool_judge_failed:")) {
    return {
      failureCategory: "judge_error",
      rootCause: judgeToolError.replace("tool_judge_failed:", "").trim()
    };
  }
  return { failureCategory: "unknown", rootCause: judgeToolError };
}