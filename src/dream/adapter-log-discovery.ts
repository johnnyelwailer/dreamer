import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type DiscoveryMode = "append" | "override";
type DiscoveryOptions = { homeDir?: string; searchPaths?: string[]; mode?: DiscoveryMode };

export function discoverClaudeCodeLogPath(options: string | DiscoveryOptions = {}): string | undefined {
  const normalized = normalizeOptions(options);
  const defaults = [join(normalized.homeDir, ".claude", "history.jsonl"), join(normalized.homeDir, ".claude", "projects")];
  return newestJsonl(resolveSearchPaths(defaults, normalized.searchPaths, normalized.mode));
}

export function discoverCodexTraceLogPath(options: string | DiscoveryOptions = {}): string | undefined {
  const normalized = normalizeOptions(options);
  const defaults = [join(normalized.homeDir, ".codex", "history.jsonl"), join(normalized.homeDir, ".codex", "sessions")];
  return newestJsonl(resolveSearchPaths(defaults, normalized.searchPaths, normalized.mode));
}

function normalizeOptions(input: string | DiscoveryOptions): Required<DiscoveryOptions> {
  if (typeof input === "string") return { homeDir: input, searchPaths: [], mode: "append" };
  return { homeDir: input.homeDir ?? homedir(), searchPaths: input.searchPaths ?? [], mode: input.mode ?? "append" };
}

function resolveSearchPaths(defaults: string[], configured: string[], mode: DiscoveryMode): string[] {
  const base = mode === "override" ? configured : [...defaults, ...configured];
  return base.filter((path, index, values) => path.trim().length > 0 && values.indexOf(path) === index);
}

function newestJsonl(candidates: string[]): string | undefined {
  const stack = candidates.filter(existsSync);
  let newest: { path: string; mtimeMs: number } | undefined;

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;
    const dirStat = safeStat(dir);
    if (dirStat?.isFile() && dir.endsWith(".jsonl")) {
      const mtimeMs = safeMtimeMs(dir);
      if (!newest || mtimeMs > newest.mtimeMs) newest = { path: dir, mtimeMs };
      continue;
    }
    if (!dirStat?.isDirectory()) continue;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const mtimeMs = safeMtimeMs(full);
      if (!newest || mtimeMs > newest.mtimeMs) newest = { path: full, mtimeMs };
    }
  }

  return newest?.path;
}

function safeStat(path: string): { isDirectory: () => boolean; isFile: () => boolean } | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function safeMtimeMs(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}