import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { honchoSafeId } from "../backends/honcho-memory-shared.js";
import { fallbackSignalSessionTitle, type SessionNamer } from "../core/session-naming.js";
import type { InsightRecord } from "../core/types.js";

const MAX_SIGNAL_CONTENT_CHARS = 2000;
const MAX_SESSION_ID_CHARS = 120;

export type SignalAttribution = {
  workspaceId: string;
  repoName: string;
  repoRemoteUrl?: string;
  repoBranch?: string;
  repoCommit?: string;
};

export function buildSignalAttribution(workspaceDir: string, workspaceId: string): SignalAttribution {
  return {
    workspaceId,
    repoName: basename(workspaceDir),
    repoRemoteUrl: readGitField(workspaceDir, ["config", "--get", "remote.origin.url"]),
    repoBranch: readGitField(workspaceDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
    repoCommit: readGitField(workspaceDir, ["rev-parse", "HEAD"])
  };
}

export function buildSignalSessionId(
  attribution: SignalAttribution,
  nowIso: string,
  title: string
): string {
  const topic = slugText(title);
  const repoName = slugText(attribution.repoName);
  return honchoSafeId(`signal-insights-${repoName}-${compactTimestamp(nowIso)}-${topic}`)
    .slice(0, MAX_SESSION_ID_CHARS)
    .replace(/-+$/g, "");
}

export function buildSignalContent(insight: InsightRecord, attribution: SignalAttribution): string {
  const references = insight.capture?.references?.map((reference) => `${reference.kind}:${reference.value}`).join("; ");
  const reason = insight.capture?.reason;
  const evidence = summarizeEvidence(insight);
  const lines = [
    `Statement: ${insight.statement}`,
    `Scope: ${insight.scope}`,
    `Workspace: ${attribution.workspaceId}`,
    `Repo: ${attribution.repoName}`,
    attribution.repoRemoteUrl ? `Repo URL: ${attribution.repoRemoteUrl}` : undefined,
    attribution.repoBranch ? `Repo Branch: ${attribution.repoBranch}` : undefined,
    attribution.repoCommit ? `Repo Commit: ${attribution.repoCommit}` : undefined,
    references ? `References: ${references}` : undefined,
    reason ? `Reason: ${reason}` : undefined,
    evidence ? `Evidence: ${evidence}` : undefined
  ].filter((line): line is string => Boolean(line));
  const content = lines.join("\n");
  if (content.length <= MAX_SIGNAL_CONTENT_CHARS) return content;
  return `${content.slice(0, MAX_SIGNAL_CONTENT_CHARS - 3).trimEnd()}...`;
}

export async function nameSignalSession(input: {
  sessionNamer?: SessionNamer;
  attribution: SignalAttribution;
  runId: string;
  nowIso: string;
  insights: InsightRecord[];
}): Promise<string> {
  const nameInput = {
    repoName: input.attribution.repoName,
    workspaceId: input.attribution.workspaceId,
    runId: input.runId,
    nowIso: input.nowIso,
    insights: input.insights
  };
  if (!input.sessionNamer) return fallbackSignalSessionTitle(nameInput);
  return (await input.sessionNamer.nameSession(nameInput)).title;
}

export function honchoSafePeerId(value: string): string {
  return honchoSafeId(value.toLowerCase()).replace(/-+/g, "-");
}

function slugText(value: string): string {
  return honchoSafeId(value.toLowerCase()).replace(/-+/g, "-").slice(0, 48).replace(/-+$/g, "");
}

function compactTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-time";
  return date.toISOString().slice(0, 16).replace(/[-:T]/g, "");
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

function summarizeEvidence(insight: InsightRecord): string | undefined {
  const evidence = insight.evidence ?? [];
  if (!evidence.length) return undefined;
  const items = evidence.slice(0, 3).map((entry) => {
    const session = entry.sessionId ? `session=${entry.sessionId}` : undefined;
    const range = entry.fromMessage ? `messages=${entry.fromMessage}${entry.toMessage ? `-${entry.toMessage}` : ""}` : undefined;
    const quote = entry.quote ? `quote=${entry.quote}` : undefined;
    return [session, range, quote].filter(Boolean).join(" ");
  });
  return items.filter((item) => item.length > 0).join(" | ");
}
