import { describe, expect, it } from "vitest";
import { createJudgeToolGuard } from "../../src/eval/dream-quality-tool-judge-guard.js";

const ALLOWED = [
  "submit_quality_scores",
  "list_quality_evidence_files",
  "read_quality_evidence_chunk",
  "search_quality_evidence"
];

describe("createJudgeToolGuard", () => {
  it("allows only configured evidence tools in pre-tool hook", () => {
    const guard = createJudgeToolGuard(ALLOWED);

    const allowed = guard.hooks.onPreToolUse({
      toolName: "submit_quality_scores",
      toolArgs: {}
    });
    const denied = guard.hooks.onPreToolUse({
      toolName: "bash",
      toolArgs: { command: "ls" }
    });

    expect(allowed).toEqual({ permissionDecision: "allow" });
    expect(denied).toMatchObject({ permissionDecision: "deny" });
    expect(guard.deniedToolCount()).toBe(1);
  });

  it("rejects non-allowed permission requests", () => {
    const guard = createJudgeToolGuard(ALLOWED);

    const allowed = guard.onPermissionRequest({
      kind: "custom-tool",
      toolName: "read_quality_evidence_chunk"
    } as unknown as Parameters<typeof guard.onPermissionRequest>[0]);

    const denied = guard.onPermissionRequest({ kind: "shell" } as unknown as Parameters<typeof guard.onPermissionRequest>[0]);

    expect(allowed).toEqual({ kind: "approve-once" });
    expect(denied).toEqual({ kind: "reject", feedback: "Judge session is restricted to quality evidence tools only." });
    expect(guard.deniedToolCount()).toBe(1);
  });
});
