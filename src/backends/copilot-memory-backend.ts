import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

type CopilotMemoryDoc = {
  version: string;
  generatedAt: string;
  records: Array<MemoryRecord & { citations: string[]; validated: boolean }>;
};

export class CopilotMemoryBackend implements MemoryBackend {
  readonly id = "backend.copilot.memory";
  private readonly filePath: string;

  constructor(workspaceDir: string, targetPath?: string) {
    this.filePath = targetPath ?? join(workspaceStorageDir(workspaceDir), "copilot-memory.json");
  }

  async load(): Promise<MemoryRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as CopilotMemoryDoc;
      return parsed.records.map((record) => ({
        id: record.id,
        scope: record.scope,
        statement: record.statement,
        confidence: record.confidence,
        provenance: record.provenance,
        contradictoryTo: record.contradictoryTo
      }));
    } catch {
      return [];
    }
  }

  async save(records: MemoryRecord[]): Promise<void> {
    const payload: CopilotMemoryDoc = {
      version: "1",
      generatedAt: new Date().toISOString(),
      records: records.map((record) => ({
        ...record,
        citations: record.provenance.eventIds,
        validated: record.confidence >= 0.7
      }))
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}
