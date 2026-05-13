import { defineTool } from "@github/copilot-sdk";
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveCopilotDestinationPath } from "../backends/copilot-memory-backend.js";
import {
  MEMORY_CATEGORIES,
  type InsightRecord,
  type MemoryRecord,
} from "../core/types.js";
import { workspaceId as resolveWorkspaceId } from "../dream/dreamer-home.js";
import { inferEvidenceAndReferences } from "./consolidation-memory-metadata.js";
import { validateReferencesStrict } from "./consolidation-reference-validation.js";
import {
  inferWorkspaceDirFromSessionIds,
  resolveMemoryScopeBySessionWorkspace,
} from "./consolidation-workspace-scope.js";
import {
  EVIDENCE_ITEM_SCHEMA,
  REFERENCE_ITEM_SCHEMA,
  normalizeEvidence,
  normalizeReferences,
  normalizeTags,
  parseCategory,
  parseHorizon,
} from "./memory-tool-shared.js";

type CreateWriteMemoryToolOptions = {
  toolName: "write_workspace_memory" | "write_global_memory";
  forcedScope: "workspace" | "user";
  memories: MemoryRecord[];
  nowIso: string;
  insights: InsightRecord[];
  runId: string;
  executionRootDir: string;
  runDir: string;
  sessionSourceWorkspaceById: Map<string, string>;
  onAdded: (record: MemoryRecord) => void;
  onUpdated: () => void;
};

function makeId(value: string): string {
  return `mem:${Buffer.from(value).toString("base64url").slice(0, 20)}`;
}

function normalizeWorkspacePath(value: string): string {
  return value.replaceAll("/", "\\").replace(/[\\/]+$/, "").trim().toLowerCase();
}

function readGitField(
  workspaceDir: string,
  args: string[],
): string | undefined {
  try {
    const value = execFileSync("git", ["-C", workspaceDir, ...args], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function formatCopilotDestination(
  scope: "user" | "workspace",
  workspaceDir: string,
  category?: string,
): string {
  const configuredTargetPath =
    process.env.DREAM_COPILOT_MEMORY_FILE ?? undefined;
  return resolveCopilotDestinationPath(
    workspaceDir,
    scope,
    category,
    configuredTargetPath,
  );
}

function writeUnresolvedWorkspaceFallback(
  runDir: string,
  entry: Record<string, unknown>,
): string {
  const fallbackDir = join(runDir, "fallback", "workspace-attribution");
  mkdirSync(fallbackDir, { recursive: true });
  const filePath = join(fallbackDir, "pending-workspace-writes.ndjson");
  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return filePath;
}

function countDistinctSessionIds(sessionIds: string[]): number {
  return new Set(sessionIds.map((sessionId) => sessionId.trim())).size;
}

export function createWriteMemoryTool(options: CreateWriteMemoryToolOptions) {
  const repoMetadataCache = new Map<
    string,
    {
      repoRemoteUrl: string | undefined;
      repoBranch: string | undefined;
      repoCommit: string | undefined;
    }
  >();

  const readRepoMetadata = (dir: string) => {
    const key = normalizeWorkspacePath(dir);
    const cached = repoMetadataCache.get(key);
    if (cached) return cached;
    const metadata = {
      repoRemoteUrl: readGitField(dir, ["config", "--get", "remote.origin.url"]),
      repoBranch: readGitField(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
      repoCommit: readGitField(dir, ["rev-parse", "HEAD"]),
    };
    repoMetadataCache.set(key, metadata);
    return metadata;
  };

  return defineTool(options.toolName, {
    description:
      options.forcedScope === "workspace"
        ? "Add or update workspace memory only."
        : "Add or update global user memory only.",
    parameters: {
      type: "object",
      properties: {
        statement: { type: "string" },
        confidence: { type: "number", description: "0.0-1.0" },
        category: { type: "string", enum: [...MEMORY_CATEGORIES] },
        tags: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
        applies_when: { type: "string" },
        horizon: { type: "string", enum: ["short_term", "long_term"] },
        expires_at: { type: "string" },
        reason: { type: "string" },
        references: { type: "array", items: REFERENCE_ITEM_SCHEMA },
        evidence: { type: "array", items: EVIDENCE_ITEM_SCHEMA },
      },
      required: ["statement", "reason", "references", "horizon"],
    },
    skipPermission: true,
    handler: (args) => {
      const input = args as Record<string, unknown>;
      const statement = String(input.statement ?? "").trim();
      const requestedScope = options.forcedScope;
      const confidence = Math.min(
        1,
        Math.max(0, Number(input.confidence) || 0.85),
      );
      if (statement.length < 10)
        return {
          textResultForLlm: "Statement too short.",
          resultType: "error" as const,
        };

      const horizon = parseHorizon(input.horizon);
      if (!horizon)
        return {
          textResultForLlm: "Missing required horizon.",
          resultType: "error" as const,
        };
      const expiresAt = String(input.expires_at ?? "")
        .trim()
        .slice(0, 40);
      if (horizon === "short_term" && expiresAt.length < 10) {
        return {
          textResultForLlm: "Short-term memories require expires_at.",
          resultType: "error" as const,
        };
      }

      const reason = String(input.reason ?? "")
        .trim()
        .slice(0, 240);
      if (reason.length < 12)
        return {
          textResultForLlm: "reason must be meaningful.",
          resultType: "error" as const,
        };

      const references = normalizeReferences(input.references) ?? [];
      const referenceValidation = validateReferencesStrict(references, {
        workspaceDir: options.executionRootDir,
        runDir: options.runDir,
      });
      if (!referenceValidation.ok) {
        return {
          textResultForLlm: referenceValidation.message,
          resultType: "error" as const,
        };
      }

      const category = parseCategory(input.category);
      const tags = normalizeTags(input.tags);
      const rationale = String(input.rationale ?? "")
        .trim()
        .slice(0, 240);
      const appliesWhen = String(input.applies_when ?? "")
        .trim()
        .slice(0, 180);
      const rawEvidence = normalizeEvidence(input.evidence);
      const derived = inferEvidenceAndReferences(
        statement,
        rawEvidence,
        references,
        {
          insights: options.insights,
          runId: options.runId,
        },
      );
      const evidence = derived.evidence;
      const mergedReferences = derived.references;
      const scopeDecision = resolveMemoryScopeBySessionWorkspace(
        requestedScope,
        options.executionRootDir,
        options.sessionSourceWorkspaceById,
        derived.sessionIds,
      );
      const scope = scopeDecision.scope;
      if (options.forcedScope === "workspace" && scope !== "workspace") {
        return {
          textResultForLlm:
            "Workspace write deferred: evidence resolves outside this workspace. Do not retry in this pass; let post-consolidation global pass decide with write_global_memory.",
          resultType: "success" as const,
        };
      }
      const inferredWorkspaceDir = inferWorkspaceDirFromSessionIds(
        options.sessionSourceWorkspaceById,
        derived.sessionIds,
      );
      if (options.forcedScope === "workspace") {
        const missingSessionEvidence = derived.sessionIds.length === 0;
        const unresolvedSessionIds = scopeDecision.unresolvedSessionIds;
        if (
          missingSessionEvidence ||
          unresolvedSessionIds.length > 0 ||
          !inferredWorkspaceDir
        ) {
          const fallbackFile = writeUnresolvedWorkspaceFallback(
            options.runDir,
            {
              runId: options.runId,
              timestamp: options.nowIso,
              statement,
              reason,
              sessionIds: derived.sessionIds,
              unresolvedSessionIds,
              references: mergedReferences,
              evidence,
            },
          );
          return {
            textResultForLlm:
              `Workspace write deferred: unresolved workspace attribution. Not auto-upgraded to global. Saved for later review at ${fallbackFile}.`,
            resultType: "success" as const,
          };
        }
      }
      const attributionWorkspaceDir =
        scope === "workspace"
          ? inferredWorkspaceDir ?? options.executionRootDir
          : options.executionRootDir;
      const attributionWorkspaceId = resolveWorkspaceId(
        attributionWorkspaceDir,
      );
      const { repoRemoteUrl, repoBranch, repoCommit } = readRepoMetadata(
        attributionWorkspaceDir,
      );
      const distinctSessionCount = countDistinctSessionIds(derived.sessionIds);

      const existing = options.memories.find((m) => {
        if (m.statement !== statement || m.scope !== scope) return false;
        if (scope !== "workspace") return true;
        const currentWorkspace =
          m.provenance?.workspaceDir
            ? normalizeWorkspacePath(m.provenance.workspaceDir)
            : undefined;
        return currentWorkspace === normalizeWorkspacePath(attributionWorkspaceDir);
      });
      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.05);
        existing.context = {
          category: category ?? existing.context?.category,
          tags: [
            ...new Set([...(existing.context?.tags ?? []), ...(tags ?? [])]),
          ].slice(0, 8),
          retention: horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          rationale: rationale || existing.context?.rationale,
          references: mergedReferences.map(
            (reference) => `${reference.kind}:${reference.value}`,
          ),
          appliesWhen: appliesWhen || existing.context?.appliesWhen,
        };
        existing.capture = {
          horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          reason,
          references: mergedReferences,
        };
        existing.evidence = evidence;
        existing.provenance = {
          ...existing.provenance,
          eventIds: derived.sessionIds.length
            ? derived.sessionIds.map((sessionId) => `session:${sessionId}`)
            : [`run:${options.runId}`],
          capturedAt: options.nowIso,
          workspaceId: attributionWorkspaceId,
          workspaceDir: attributionWorkspaceDir,
          repoRemoteUrl,
          repoBranch,
          repoCommit,
        };
        options.onUpdated();
        const destination = formatCopilotDestination(
          scope,
          scope === "workspace"
            ? attributionWorkspaceDir
            : options.executionRootDir,
          category ?? undefined,
        );
        return {
          textResultForLlm: `Memory reinforced.\n\nCopilot destination:\n[${destination}](${destination})`,
          resultType: "success" as const,
        };
      }

      if (!existing && scope === "user" && distinctSessionCount < 2) {
        return {
          textResultForLlm:
            "Global write deferred: needs repeated evidence across at least two independent sessions or an existing matching global memory.",
          resultType: "success" as const,
        };
      }

      const record: MemoryRecord = {
        id: makeId(
          scope === "workspace"
            ? `${scope}:${attributionWorkspaceId}:${statement}`
            : `${scope}:${statement}`,
        ),
        scope,
        statement,
        confidence,
        provenance: {
          source: "dream-run-agent",
          eventIds: derived.sessionIds.length
            ? derived.sessionIds.map((sessionId) => `session:${sessionId}`)
            : [`run:${options.runId}`],
          capturedAt: options.nowIso,
          workspaceId: attributionWorkspaceId,
          workspaceDir: attributionWorkspaceDir,
          repoRemoteUrl,
          repoBranch,
          repoCommit,
        },
        context: {
          category,
          tags,
          retention: horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          rationale: rationale || reason,
          references: mergedReferences.map(
            (reference) => `${reference.kind}:${reference.value}`,
          ),
          appliesWhen: appliesWhen || undefined,
        },
        evidence,
        capture: {
          horizon,
          expiresAt: horizon === "short_term" ? expiresAt : undefined,
          reason,
          references: mergedReferences,
        },
      };
      options.memories.push(record);
      options.onAdded(record);
      const destination = formatCopilotDestination(
        scope,
        scope === "workspace"
          ? attributionWorkspaceDir
          : options.executionRootDir,
        category ?? undefined,
      );
      return {
        textResultForLlm: `Memory written.\n\nCopilot destination:\n[${destination}](${destination})`,
        resultType: "success" as const,
      };
    },
  });
}
