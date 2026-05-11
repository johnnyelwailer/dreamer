import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceStorageDir } from "./dreamer-home.js";
import { workspaceStorageRoots } from "./discovery/copilot-debug/roots.js";

const COPILOT_MEMORY_RELATIVE_DIR = join("GitHub.copilot-chat", "memory-tool", "memories");

function resolveFromSessionLogPath(sessionLogPath?: string): string | undefined {
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
  return join(root, "workspaceStorage", workspaceHash, COPILOT_MEMORY_RELATIVE_DIR);
}

export function discoverCopilotMemoryRoot(workspaceDir: string): string | undefined {
  const fromSessionLog = resolveFromSessionLogPath(process.env.VSCODE_TARGET_SESSION_LOG);
  if (fromSessionLog) return fromSessionLog;

  const folderUri = pathToFileURL(workspaceDir).toString();
  const roots = workspaceStorageRoots(process.platform, homedir(), process.env);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const entries = readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const workspaceJsonPath = join(root, entry.name, "workspace.json");
      if (!existsSync(workspaceJsonPath)) continue;
      try {
        const parsed = JSON.parse(readFileSync(workspaceJsonPath, "utf8")) as { folder?: string };
        if (parsed.folder === folderUri) {
          return join(root, entry.name, COPILOT_MEMORY_RELATIVE_DIR);
        }
      } catch {
        continue;
      }
    }
  }

  return undefined;
}

export function defaultCopilotMemoryTarget(workspaceDir: string): string {
  return discoverCopilotMemoryRoot(workspaceDir) ?? join(workspaceStorageDir(workspaceDir), "copilot-memory.md");
}
