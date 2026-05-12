import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { DreamConfig } from "./config.js";
import { discoverCopilotGlobalMemoryRoot, discoverCopilotWorkspaceMemoryRoot } from "./copilot-memory-path.js";
import { workspaceStorageDir } from "./dreamer-home.js";

export type MemoryBackupConfig = Pick<
  DreamConfig,
  | "backendId"
  | "copilotMemoryPath"
  | "honchoExportPath"
  | "memoryBackupEnabled"
  | "memoryBackupDir"
  | "memoryBackupExternalOnly"
>;

type BackupItemKind = "file" | "directory";

type BackupItem = {
  sourcePath: string;
  backupPath: string;
  kind: BackupItemKind;
  exists: boolean;
  externalToDreamerStorage: boolean;
};

export type MemoryBackupResult = {
  backupDir: string;
  backendId: string;
  createdAt: string;
  items: BackupItem[];
};

function pathIsInside(parentPath: string, childPath: string): boolean {
  const rel = relative(parentPath, childPath);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("../") && rel !== "..");
}

async function classifyPath(path: string): Promise<BackupItemKind | undefined> {
  try {
    const info = await stat(path);
    if (info.isDirectory()) return "directory";
    if (info.isFile()) return "file";
    return undefined;
  } catch {
    return undefined;
  }
}

function candidatePaths(workspaceDir: string, config: MemoryBackupConfig): string[] {
  const storageDir = workspaceStorageDir(workspaceDir);
  if (config.backendId === "backend.copilot.memory") {
    return [
      config.copilotMemoryPath,
      discoverCopilotWorkspaceMemoryRoot(workspaceDir, false),
      discoverCopilotGlobalMemoryRoot(false)
    ].filter((path): path is string => Boolean(path));
  }
  if (config.backendId === "backend.honcho.memory") return [config.honchoExportPath];
  if (config.backendId === "backend.file.memory") return [join(storageDir, "memory.json")];
  return [];
}

export async function backupMemoryBeforeRun(
  workspaceDir: string,
  runId: string,
  config: MemoryBackupConfig
): Promise<MemoryBackupResult | undefined> {
  if (!config.memoryBackupEnabled) return undefined;

  const storageDir = workspaceStorageDir(workspaceDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(config.memoryBackupDir, `${runId}-${timestamp}-${config.backendId.replace(/[^a-z0-9.-]/gi, "_")}`);

  const items: BackupItem[] = [];
  const uniqueCandidates = [...new Set(candidatePaths(workspaceDir, config))];
  for (const sourcePath of uniqueCandidates) {
    const kind = await classifyPath(sourcePath);
    const externalToDreamerStorage = !pathIsInside(storageDir, sourcePath);
    if (config.memoryBackupExternalOnly && !externalToDreamerStorage) continue;

    const scopedFolder = externalToDreamerStorage ? "external" : "internal";
    const filename = kind === "directory" ? basename(sourcePath) : basename(sourcePath);
    const destination = join(backupDir, scopedFolder, filename);
    if (kind) {
      await mkdir(dirname(destination), { recursive: true });
      await cp(sourcePath, destination, { recursive: kind === "directory", force: true });
      items.push({
        sourcePath,
        backupPath: destination,
        kind,
        exists: true,
        externalToDreamerStorage
      });
      continue;
    }

    items.push({
      sourcePath,
      backupPath: destination,
      kind: "file",
      exists: false,
      externalToDreamerStorage
    });
  }

  if (items.length === 0) return undefined;

  const result: MemoryBackupResult = {
    backupDir,
    backendId: config.backendId,
    createdAt: new Date().toISOString(),
    items
  };

  await mkdir(backupDir, { recursive: true });
  await writeFile(join(backupDir, "manifest.json"), JSON.stringify(result, null, 2), "utf8");
  return result;
}
