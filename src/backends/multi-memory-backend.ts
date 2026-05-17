import type { MemoryBackend } from "../core/contracts.js";
import type { MemoryRecord } from "../core/types.js";

export class MultiMemoryBackend implements MemoryBackend {
  readonly id: string;

  constructor(private readonly backends: MemoryBackend[]) {
    if (backends.length === 0) {
      throw new Error("MultiMemoryBackend requires at least one backend");
    }
    this.id = `backend.multi(${backends.map((backend) => backend.id).join(",")})`;
  }

  async load(): Promise<MemoryRecord[]> {
    for (const backend of this.backends) {
      const records = await backend.load();
      if (records.length > 0) return records;
    }
    return [];
  }

  async save(records: MemoryRecord[]): Promise<void> {
    await Promise.all(this.backends.map((backend) => backend.save(records)));
  }

  getBackends(): MemoryBackend[] {
    return [...this.backends];
  }
}
