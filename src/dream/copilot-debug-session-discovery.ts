import { basename, join } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

type DiscoveryDeps = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  exists: (path: string) => boolean;
  readdir: (path: string) => string[];
  mtimeMs: (path: string) => number;
};

type DiscoveryMode = "append" | "override";
type DiscoveryOptions = {
  searchPaths?: string[];
  mode?: DiscoveryMode;
  lookbackDays?: number;
};

const vscodeProductDirs = ["Code", "Code - Insiders", "VSCodium"];

export type DiscoveredCopilotSession = {
  sessionId: string;
  path: string;
  mainJsonlPath: string;
  transcriptPath?: string;
  mainMtimeMs: number;
  transcriptMtimeMs: number;
  activityMs: number;
  richnessScore: number;
  transcriptLineCount: number;
};

export function discoverCopilotDebugSessions(
  options: DiscoveryOptions & Partial<DiscoveryDeps> = {}
): DiscoveredCopilotSession[] {
  const deps: DiscoveryDeps = {
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
  options: DiscoveryOptions & Partial<DiscoveryDeps> = {}
): string | undefined {
  return discoverCopilotDebugSessions(options)[0]?.path;
}

function scoreTranscriptRichness(transcriptPath: string): { richnessScore: number; lineCount: number } {
  if (!existsSync(transcriptPath)) return { richnessScore: 0, lineCount: 0 };

  try {
    let messageCount = 0;
    let toolCount = 0;
    let lineCount = 0;
    let substantiveMessageCount = 0;
    let noisyMessageCount = 0;
    for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      lineCount += 1;
      const parsed = JSON.parse(line) as { type?: string; data?: { content?: string } };
      if (parsed.type === "user.message" || parsed.type === "assistant.message") {
        messageCount += 1;
        const content = parsed.data?.content?.trim() ?? "";
        const isNoisy = content.startsWith("[") || /notification:|waiting for input|command completed/i.test(content);
        if (isNoisy) noisyMessageCount += 1;
        if (content.length >= 40 && !isNoisy) substantiveMessageCount += 1;
      }
      if (parsed.type?.startsWith("tool.")) toolCount += 1;
    }
    return {
      richnessScore: substantiveMessageCount * 1000 + messageCount * 50 + toolCount * 5 + lineCount - noisyMessageCount * 200,
      lineCount
    };
  } catch {
    return { richnessScore: 0, lineCount: 0 };
  }
}

function workspaceStorageRoots(
  platform: NodeJS.Platform,
  homeDir: string,
  env: NodeJS.ProcessEnv
): string[] {
  if (platform === "darwin") {
    return vscodeProductDirs.map((product) =>
      join(homeDir, "Library", "Application Support", product, "User", "workspaceStorage")
    );
  }

  if (platform === "win32") {
    const roaming = env.APPDATA ?? join(homeDir, "AppData", "Roaming");
    return vscodeProductDirs.map((product) => join(roaming, product, "User", "workspaceStorage"));
  }

  // Linux support is intentionally included for consistency, even though
  // the current requirement specifically called out macOS and Windows.
  return vscodeProductDirs.map((product) =>
    join(homeDir, ".config", product, "User", "workspaceStorage")
  );
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