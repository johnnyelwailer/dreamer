import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

export async function readMemoryArtifacts(workspaceDir: string): Promise<Array<{ path: string; content: string }>> {
  const storageDir = workspaceStorageDir(workspaceDir);
  const memoryFiles = [
    { label: "memory.json", fullPath: join(storageDir, "memory.json") },
    { label: "copilot-memory.json", fullPath: join(storageDir, "copilot-memory.json") }
  ];
  const artifacts: Array<{ path: string; content: string }> = [];
  for (const { label, fullPath } of memoryFiles) {
    const content = await readFile(fullPath, "utf8").catch(() => "");
    if (content.trim().length > 0) artifacts.push({ path: fullPath, content: content.slice(0, 12000) });
  }
  return artifacts;
}
