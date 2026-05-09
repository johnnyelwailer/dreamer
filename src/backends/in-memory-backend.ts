import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

export class InMemoryBackend implements MemoryBackend {
  readonly id = "backend.in-memory";
  private records: MemoryRecord[] = [];

  async load(): Promise<MemoryRecord[]> {
    return this.records;
  }

  async save(records: MemoryRecord[]): Promise<void> {
    this.records = [...records];
  }
}
