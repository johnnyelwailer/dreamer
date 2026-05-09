import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { workspaceStorageDir } from "../dream/dreamer-home.js";

type JsonObject = Record<string, unknown>;

export class JsonStateStore {
  constructor(private readonly filePath: string) {}

  async read<T extends JsonObject>(fallback: T): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async write(data: JsonObject): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }

  static runStatePath(workspaceDir: string): string {
    return join(workspaceStorageDir(workspaceDir), "state.json");
  }
}
