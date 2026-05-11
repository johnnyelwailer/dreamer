import { type PermissionRequest, type PermissionRequestResult } from "@github/copilot-sdk";

type ToolHookInput = {
  toolName: string;
  toolArgs: unknown;
};

type PermissionRequestRecord = PermissionRequest & { toolName?: string };

type JudgeToolGuard = {
  hooks: {
    onPreToolUse: (input: ToolHookInput) =>
      | {
          permissionDecision: "allow" | "deny";
          permissionDecisionReason?: string;
          additionalContext?: string;
        }
      | undefined;
    onPostToolUse: () => undefined;
  };
  onPermissionRequest: (request: PermissionRequest) => PermissionRequestResult;
  deniedToolCount: () => number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function permissionToolName(request: PermissionRequest): string | undefined {
  const record = request as PermissionRequestRecord;
  if (typeof record.toolName === "string" && record.toolName.trim().length > 0) return record.toolName;
  if (request.kind === "shell") return "bash";
  if (request.kind === "read") return "read_file";
  return undefined;
}

export function createJudgeToolGuard(allowedTools: Iterable<string>): JudgeToolGuard {
  const allowed = new Set([...allowedTools].map(normalize).filter(Boolean));
  let deniedCount = 0;

  const deny = (toolName: string) => {
    deniedCount += 1;
    return {
      permissionDecision: "deny" as const,
      permissionDecisionReason: `Judge session is restricted to quality evidence tools only. Blocked: ${toolName}.`,
      additionalContext:
        "Use only list_quality_evidence_files, read_quality_evidence_chunk, search_quality_evidence, and submit_quality_scores."
    };
  };

  return {
    hooks: {
      onPreToolUse: (input) => {
        const toolName = normalize(input.toolName);
        if (!toolName) return deny("unknown");
        if (allowed.has(toolName)) return { permissionDecision: "allow" };
        return deny(toolName);
      },
      onPostToolUse: () => undefined
    },
    onPermissionRequest: (request) => {
      const toolName = permissionToolName(request);
      if (toolName && allowed.has(normalize(toolName))) {
        return { kind: "approve-once" };
      }
      deniedCount += 1;
      return { kind: "reject", feedback: "Judge session is restricted to quality evidence tools only." };
    },
    deniedToolCount: () => deniedCount
  };
}
