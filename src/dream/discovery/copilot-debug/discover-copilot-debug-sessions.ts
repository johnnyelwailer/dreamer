import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreTranscriptRichness } from "./richness.js";
import type {
  CopilotDiscoveryDeps,
  CopilotDiscoveryOptions,
  DiscoveredCopilotSession
} from "./types.js";
import { workspaceStorageRoots } from "./roots.js";

export function discoverCopilotDebugSessions(
  options: CopilotDiscoveryOptions & Partial<CopilotDiscoveryDeps> = {}
): DiscoveredCopilotSession[] {
  const deps: CopilotDiscoveryDeps = {
    platform: options.platform ?? process.platform,
    env: options.env ?? process.env,
    homeDir: options.homeDir ?? homedir(),
    exists: options.exists ?? existsSync,
    readdir: options.readdir ?? safeReadDirs,
    mtimeMs: options.mtimeMs ?? safeMtimeMs
  };
  const defaults = workspaceStorageRoots(deps.platform, deps.homeDir, deps.env);
  const configured = (options.searchPaths ?? []).filter((path) => path.trim().length > 0);
  const roots = [...(options.mode === "override" ? configured : [...defaults, ...configured])]
    .filter((path, index, values) => values.indexOf(path) === index)
    .filter(deps.exists);
  const lookbackThresholdMs =
    typeof options.lookbackDays === "number" && Number.isFinite(options.lookbackDays) && options.lookbackDays > 0
      ? Date.now() - options.lookbackDays * 24 * 60 * 60 * 1000
      : undefined;

  const sessions: DiscoveredCopilotSession[] = [];
  for (const root of roots) {
    const workspaces = deps.readdir(root);
    for (const workspaceId of workspaces) {
      const workspaceDir = readWorkspaceDir(root, workspaceId);
      const debugLogsRoot = join(root, workspaceId, "GitHub.copilot-chat", "debug-logs");
      if (!deps.exists(debugLogsRoot)) continue;
      for (const sessionId of deps.readdir(debugLogsRoot)) {
        const sessionDir = join(debugLogsRoot, sessionId);
        const mainJsonl = join(sessionDir, "main.jsonl");
        if (!deps.exists(mainJsonl)) continue;
        const transcriptPath = join(root, workspaceId, "GitHub.copilot-chat", "transcripts", `${sessionId}.jsonl`);
        const transcriptExists = deps.exists(transcriptPath);
        const mainMtimeMs = deps.mtimeMs(mainJsonl);
        const transcriptMtimeMs = transcriptExists ? deps.mtimeMs(transcriptPath) : 0;
        const activityMs = Math.max(mainMtimeMs, transcriptMtimeMs);
        if (lookbackThresholdMs !== undefined && activityMs < lookbackThresholdMs) continue;
        const transcriptStats = scoreTranscriptRichness(transcriptPath);
        sessions.push({
          sessionId,
          path: sessionDir,
          workspaceDir,
          mainJsonlPath: mainJsonl,
          transcriptPath: transcriptExists ? transcriptPath : undefined,
          mainMtimeMs,
          transcriptMtimeMs,
          activityMs,
          richnessScore: transcriptStats.richnessScore,
          transcriptLineCount: transcriptStats.lineCount
        });
      }
    }
  }

  sessions.sort((a, b) => b.richnessScore - a.richnessScore || b.activityMs - a.activityMs);
  return sessions;
}

export function discoverCopilotDebugSessionDir(
  options: CopilotDiscoveryOptions & Partial<CopilotDiscoveryDeps> = {}
): string | undefined {
  return discoverCopilotDebugSessions(options)[0]?.path;
}

function safeReadDirs(path: string): string[] {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function safeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function readWorkspaceDir(root: string, workspaceId: string): string | undefined {
  const workspaceJsonPath = join(root, workspaceId, "workspace.json");
  if (!existsSync(workspaceJsonPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(workspaceJsonPath, "utf8")) as { folder?: string };
    if (!parsed.folder || !parsed.folder.startsWith("file://")) return undefined;
    return fileURLToPath(parsed.folder);
  } catch {
    return undefined;
  }
}
