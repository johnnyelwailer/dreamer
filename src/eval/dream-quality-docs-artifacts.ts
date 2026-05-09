import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

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
  const artifactPaths = [
    "reports/dream-diary.md",
    "reports/governance.json",
    "reports/metrics.json",
    "reports/pipeline-log.json",
    ".dreamer/memory.json",
    ".dreamer/copilot-memory.json"
  ];
  const artifacts: Array<{ path: string; content: string }> = [];
  for (const artifactPath of artifactPaths) {
    const content = await readFile(join(workspaceDir, artifactPath), "utf8").catch(() => "");
    if (content.trim().length > 0) artifacts.push({ path: artifactPath, content: content.slice(0, 8000) });
  }
  return artifacts;
}
