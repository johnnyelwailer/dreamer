import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

type HonchoWorkspace = {
  workspaceId: string;
  peers: Array<{ id: string; role: string }>;
  sessions: Array<{ id: string; memoryIds: string[]; startedAt: string }>;
  memory: MemoryRecord[];
};

export class HonchoMemoryBackend implements MemoryBackend {
  readonly id = "backend.honcho.memory";
  private readonly filePath: string;

  constructor(workspaceDir: string, targetPath?: string) {
    this.filePath = targetPath ?? join(workspaceDir, ".dreamer", "honcho", "workspace.json");
  }

  async load(): Promise<MemoryRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as HonchoWorkspace;
      return parsed.memory;
    } catch {
      return [];
    }
  }

  async save(records: MemoryRecord[]): Promise<void> {
    const now = new Date().toISOString();
    const payload: HonchoWorkspace = {
      workspaceId: "dreamer-local",
      peers: [{ id: "dreamer", role: "planner" }],
      sessions: [{ id: `session-${Date.now()}`, memoryIds: records.map((record) => record.id), startedAt: now }],
      memory: records
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
