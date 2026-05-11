import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  return files;
}

export async function readArtifacts(workspaceDir: string): Promise<Array<{ path: string; content: string }>> {
  const storageDir = workspaceStorageDir(workspaceDir);
  const artifactEntries = [
    { label: "reports/dream-diary.md", fullPath: join(storageDir, "reports", "dream-diary.md") },
    { label: "reports/governance.json", fullPath: join(storageDir, "reports", "governance.json") },
    { label: "reports/metrics.json", fullPath: join(storageDir, "reports", "metrics.json") },
    { label: "reports/pipeline-log.json", fullPath: join(storageDir, "reports", "pipeline-log.json") },
    { label: "memory.json", fullPath: join(storageDir, "memory.json") },
    { label: "copilot-memory.json", fullPath: join(storageDir, "copilot-memory.json") },
    { label: "copilot-memory.md", fullPath: join(storageDir, "copilot-memory.md") }
  ];
  const artifacts: Array<{ path: string; content: string }> = [];
  for (const { label, fullPath } of artifactEntries) {
    const content = await readFile(fullPath, "utf8").catch(() => "");
    if (content.trim().length > 0) artifacts.push({ path: label, content: content.slice(0, 8000) });
  }
  return artifacts;
}
