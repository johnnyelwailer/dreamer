import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { MemoryRecord } from "../core/types.js";

type MemoryAttribution = {
  workspaceId: string;
  workspaceDir: string;
  repoName: string;
  repoRemoteUrl?: string;
  repoBranch?: string;
  repoCommit?: string;
};

export function buildMemoryAttribution(workspaceDir: string, workspaceId: string): MemoryAttribution {
  return {
    workspaceId,
    workspaceDir,
    repoName: basename(workspaceDir),
    repoRemoteUrl: readGitField(workspaceDir, ["config", "--get", "remote.origin.url"]),
    repoBranch: readGitField(workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
    repoCommit: readGitField(workspaceDir, ["rev-parse", "HEAD"])
  };
}

export function toReadableConclusionContent(record: MemoryRecord, attribution: MemoryAttribution): string {
  const lines = [
    record.scope === "workspace" ? `[${attribution.repoName}] ${record.statement}` : record.statement,
    `Scope: ${record.scope}`,
    `Confidence: ${record.confidence}`,
    `Workspace: ${attribution.workspaceId}`,
    `Repo: ${attribution.repoName}`,
    attribution.repoRemoteUrl ? `Repo URL: ${attribution.repoRemoteUrl}` : undefined,
    attribution.repoBranch ? `Repo Branch: ${attribution.repoBranch}` : undefined,
    record.context?.appliesWhen ? `Applies when: ${record.context.appliesWhen}` : undefined,
    record.context?.category ? `Category: ${record.context.category}` : undefined,
    record.context?.tags?.length ? `Tags: ${record.context.tags.join(", ")}` : undefined,
    record.context?.rationale ? `Rationale: ${record.context.rationale}` : undefined,
    record.capture?.reason ? `Capture reason: ${record.capture.reason}` : undefined,
    referencesLine(record),
    evidenceLine(record),
    `Source: ${record.provenance.source}`,
    record.provenance.eventIds.length ? `Event IDs: ${record.provenance.eventIds.join(", ")}` : undefined,
    `Captured: ${record.provenance.capturedAt}`,
    attribution.repoCommit ? `Repo Commit: ${attribution.repoCommit}` : undefined,
    record.contradictoryTo ? `Contradicts: ${record.contradictoryTo}` : undefined,
    `Memory ID: ${record.id}`
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

function referencesLine(record: MemoryRecord): string | undefined {
  const references = record.capture?.references ?? [];
  if (references.length) return `References: ${references.map((ref) => `${ref.kind}:${ref.value}`).join("; ")}`;
  if (record.context?.references?.length) return `References: ${record.context.references.join("; ")}`;
  return undefined;
}

function evidenceLine(record: MemoryRecord): string | undefined {
  const evidence = record.evidence ?? [];
  if (!evidence.length) return undefined;
  const rendered = evidence.slice(0, 3).map((item) => {
    const session = item.sessionId ? `session=${item.sessionId}` : undefined;
    const range = item.fromMessage ? `messages=${item.fromMessage}${item.toMessage ? `-${item.toMessage}` : ""}` : undefined;
    const quote = item.quote ? `quote=${item.quote}` : undefined;
    return [session, range, quote].filter(Boolean).join(" ");
  });
  return `Evidence: ${rendered.filter(Boolean).join(" | ")}`;
}

function readGitField(workspaceDir: string, args: string[]): string | undefined {
  try {
    const value = execFileSync("git", ["-C", workspaceDir, ...args], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8"
    }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}
