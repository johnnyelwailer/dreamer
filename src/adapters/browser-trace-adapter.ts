import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonFile } from "./shared.js";

type HarEntry = {
  startedDateTime?: string;
  request?: { url?: string; method?: string };
  response?: { status?: number };
};

export class BrowserTraceAdapter implements TranscriptAdapter {
  readonly id = "adapter.browser.trace";
  readonly supportsIncremental = true;

  constructor(private readonly harPath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const root = await readJsonFile(this.harPath).catch(() => null);
    const entries = this.pickEntries(root);
    const events = entries.map((entry, index) => this.mapEntry(entry, index));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private pickEntries(root: unknown): HarEntry[] {
    if (!root || typeof root !== "object") return [];
    const log = (root as { log?: { entries?: unknown } }).log;
    return Array.isArray(log?.entries) ? (log.entries as HarEntry[]) : [];
  }

  private mapEntry(entry: HarEntry, index: number): NormalizedEvent {
    const method = entry.request?.method ?? "GET";
    const url = entry.request?.url ?? "about:blank";
    const status = Number(entry.response?.status ?? 0);
    const text = `${method} ${url} -> ${status}`;
    return asEvent("browser-trace", `browser:${index}`, "tool", parseIso(entry.startedDateTime), text, {
      method,
      status,
      url
    });
  }
}
