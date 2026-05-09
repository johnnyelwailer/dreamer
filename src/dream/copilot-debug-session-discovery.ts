import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
};

const vscodeProductDirs = ["Code", "Code - Insiders", "VSCodium"];

export function discoverCopilotDebugSessionDir(
  options: DiscoveryOptions & Partial<DiscoveryDeps> = {}
): string | undefined {
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
  const sessions: Array<{ path: string; mtimeMs: number }> = [];

  for (const root of roots) {
    const workspaces = deps.readdir(root);
    for (const workspaceId of workspaces) {
      const debugLogsRoot = join(root, workspaceId, "GitHub.copilot-chat", "debug-logs");
      if (!deps.exists(debugLogsRoot)) continue;
      for (const sessionId of deps.readdir(debugLogsRoot)) {
        const sessionDir = join(debugLogsRoot, sessionId);
        const mainJsonl = join(sessionDir, "main.jsonl");
        if (!deps.exists(mainJsonl)) continue;
        sessions.push({ path: sessionDir, mtimeMs: deps.mtimeMs(mainJsonl) });
      }
    }
  }

  sessions.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return sessions[0]?.path;
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