import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  globalStorageRoots,
  workspaceStorageRoots,
} from "./discovery/copilot-debug/roots.js";
import { workspaceStorageDir } from "./dreamer-home.js";

const COPILOT_MEMORY_RELATIVE_DIR = join(
  "GitHub.copilot-chat",
  "memory-tool",
  "memories",
);
const COPILOT_GLOBAL_MEMORY_RELATIVE_DIR = join(
  "github.copilot-chat",
  "memory-tool",
  "memories",
);

function resolveFromSessionLogPath(
  sessionLogPath?: string,
): string | undefined {
  if (!sessionLogPath) return undefined;
  const marker = `${join("", "workspaceStorage")}${process.platform === "win32" ? "\\" : "/"}`;
  const markerIndex = sessionLogPath.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const idStart = markerIndex + marker.length;
  const idTail = sessionLogPath.slice(idStart);
  const separators = /[\\/]/;
  const workspaceHash = idTail.split(separators)[0];
  if (!workspaceHash) return undefined;
  const root = sessionLogPath.slice(0, idStart - marker.length);
  return join(
    root,
    "workspaceStorage",
    workspaceHash,
    COPILOT_MEMORY_RELATIVE_DIR,
  );
}

function normalizeWorkspacePath(path: string): string {
  const normalized = normalize(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function folderUriToWorkspacePath(folderUri: string): string | undefined {
  try {
    return normalizeWorkspacePath(fileURLToPath(folderUri));
  } catch {
    return undefined;
  }
}

export function discoverCopilotWorkspaceMemoryRoot(
  workspaceDir: string,
  requireExists = true,
): string | undefined {
  const fromSessionLog = resolveFromSessionLogPath(
    process.env.VSCODE_TARGET_SESSION_LOG,
  );
  if (fromSessionLog && (!requireExists || existsSync(fromSessionLog)))
    return fromSessionLog;

  const candidateWorkspaceDirs = [
    ...new Set(
      [workspaceDir, process.env.DREAMER_ENV_SOURCE_DIR].filter(
        Boolean,
      ) as string[],
    ),
  ];
  const folderUris = new Set(
    candidateWorkspaceDirs.map((dir) => pathToFileURL(dir).toString()),
  );
  const folderPaths = new Set(
    candidateWorkspaceDirs.map((dir) => normalizeWorkspacePath(dir)),
  );
  const roots = workspaceStorageRoots(process.platform, homedir(), process.env);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspaceJsonPath = join(root, entry.name, "workspace.json");
      if (!existsSync(workspaceJsonPath)) continue;
      try {
        const parsed = JSON.parse(readFileSync(workspaceJsonPath, "utf8")) as {
          folder?: string;
        };
        const parsedFolderPath = parsed.folder
          ? folderUriToWorkspacePath(parsed.folder)
          : undefined;
        if (
          (parsed.folder && folderUris.has(parsed.folder)) ||
          (parsedFolderPath && folderPaths.has(parsedFolderPath))
        ) {
          const candidate = join(root, entry.name, COPILOT_MEMORY_RELATIVE_DIR);
          if (!requireExists || existsSync(candidate)) return candidate;
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

export function discoverCopilotGlobalMemoryRoot(
  requireExists = true,
): string | undefined {
  const globalRoots = globalStorageRoots(
    process.platform,
    homedir(),
    process.env,
  );
  for (const root of globalRoots) {
    const candidate = join(root, COPILOT_GLOBAL_MEMORY_RELATIVE_DIR);
    if (!requireExists || existsSync(candidate)) return candidate;
  }

  return undefined;
}

export function discoverCopilotMemoryRoot(
  workspaceDir: string,
): string | undefined {
  return (
    discoverCopilotWorkspaceMemoryRoot(workspaceDir, true) ??
    discoverCopilotGlobalMemoryRoot(true)
  );
}

export function defaultCopilotMemoryTarget(workspaceDir: string): string {
  const canonicalWorkspaceDir =
    process.env.DREAMER_ENV_SOURCE_DIR ?? workspaceDir;
  return (
    discoverCopilotMemoryRoot(workspaceDir) ??
    join(workspaceStorageDir(canonicalWorkspaceDir), "copilot-memory.md")
  );
}
