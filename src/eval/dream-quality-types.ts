import type { JudgeFailureCategory } from "./judge-error-diagnostics.js";

export type DreamQualityReport = {
  generatedAt: string;
  model: string;
  minPassingScore: number;
  weightedScore: number;
  passed: boolean;
  dimensions: Array<{ id: string; score: number; weight: number; weighted: number; rationale: string }>;
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
  transcriptsEvaluated: string[];
  rawJudgeOutput: string;
  judgeParseError?: string;
  judgeMode?: string;
  judgeToolUsed?: boolean;
  judgeToolError?: string;
  judgeDiagnostics?: {
    requestTimeoutMs: number;
    effectiveJudgeTimeoutMs: number;
    attempts: number;
    elapsedMs: number;
    promptChars: number;
    promptEstimatedTokens: number;
    lastOutputChars: number;
    failureCategory?: JudgeFailureCategory;
    rootCause?: string;
    modelCapabilitiesLimits?: {
      max_context_window_tokens?: number;
      max_prompt_tokens?: number;
    };
    evidence: Array<{ kind: string; path: string; sizeBytes?: number; error?: string }>;
  };
  diagnostics?: unknown;
};