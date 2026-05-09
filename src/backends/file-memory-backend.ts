import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

export class FileMemoryBackend implements MemoryBackend {
  readonly id = "backend.file.memory";
  private readonly filePath: string;

  constructor(workspaceDir: string) {
    this.filePath = join(workspaceStorageDir(workspaceDir), "memory.json");
  }

  async load(): Promise<MemoryRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch {
      return [];
    }
  }

  async save(records: MemoryRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(records, null, 2), "utf8");
  }
}
