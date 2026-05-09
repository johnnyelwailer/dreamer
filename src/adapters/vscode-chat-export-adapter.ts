import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonFile } from "./shared.js";

type ExportMessage = { id?: string; role?: string; content?: string; timestamp?: string | number };
type ExportConversation = { id?: string; createdAt?: string | number; messages?: ExportMessage[] };

export class VsCodeChatExportAdapter implements TranscriptAdapter {
  readonly id = "adapter.vscode.chat-export";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const doc = await readJsonFile(this.filePath).catch(() => null);
    if (!doc) return { events: [], cursor: since };
    const conversations = this.pickConversations(doc);
    const events = conversations.flatMap((conv) => this.mapConversation(conv));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private pickConversations(doc: unknown): ExportConversation[] {
    if (Array.isArray(doc)) return doc as ExportConversation[];
    if (doc && typeof doc === "object") {
      const maybe = (doc as { conversations?: unknown }).conversations;
      return Array.isArray(maybe) ? (maybe as ExportConversation[]) : [];
    }
    return [];
  }

  private mapConversation(conv: ExportConversation): NormalizedEvent[] {
    const convId = conv.id ?? "conversation";
    const start = parseIso(conv.createdAt, new Date().toISOString());
    const root = asEvent("vscode-chat-export", `${convId}:start`, "session_start", start, `Conversation ${convId}`);
    const messages = (conv.messages ?? []).map((msg, index) => {
      const id = msg.id ?? `${convId}:msg:${index}`;
      const ts = parseIso(msg.timestamp, start);
      return asEvent("vscode-chat-export", id, "message", ts, msg.content ?? "", { role: msg.role ?? "unknown" });
    });
    return [root, ...messages];
  }
}
