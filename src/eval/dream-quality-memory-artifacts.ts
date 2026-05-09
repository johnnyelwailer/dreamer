import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function readMemoryArtifacts(workspaceDir: string): Promise<Array<{ path: string; content: string }>> {
  const memoryPaths = [
    ".dreamer/memory.json",
    ".dreamer/copilot-memory.json"
  ];
  const artifacts: Array<{ path: string; content: string }> = [];
  for (const artifactPath of memoryPaths) {
    const content = await readFile(join(workspaceDir, artifactPath), "utf8").catch(() => "");
    if (content.trim().length > 0) artifacts.push({ path: artifactPath, content: content.slice(0, 12000) });
  }
  return artifacts;
}
