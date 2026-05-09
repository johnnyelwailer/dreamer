import type { TranscriptAdapter } from "../core/contracts.js";
import type { NormalizedEvent } from "../core/types.js";
import { asEvent, parseIso, readJsonFile } from "./shared.js";

type CursorMessage = { id?: string; createdAt?: string | number; text?: string; role?: string };
type CursorChat = { id?: string; createdAt?: string | number; messages?: CursorMessage[] };

export class CursorChatAdapter implements TranscriptAdapter {
  readonly id = "adapter.cursor.chat";
  readonly supportsIncremental = true;

  constructor(private readonly filePath: string) {}

  async ingest(since?: string): Promise<{ events: NormalizedEvent[]; cursor?: string }> {
    const root = await readJsonFile(this.filePath).catch(() => null);
    const chats = this.pickChats(root);
    const events = chats.flatMap((chat) => this.mapChat(chat));
    const filtered = since ? events.filter((event) => event.timestamp > since) : events;
    return { events: filtered, cursor: filtered.at(-1)?.timestamp ?? since };
  }

  private pickChats(root: unknown): CursorChat[] {
    if (!root || typeof root !== "object") return [];
    const maybe = (root as { chats?: unknown; conversations?: unknown }).chats ??
      (root as { conversations?: unknown }).conversations;
    return Array.isArray(maybe) ? (maybe as CursorChat[]) : [];
  }

  private mapChat(chat: CursorChat): NormalizedEvent[] {
    const chatId = chat.id ?? "cursor";
    const start = parseIso(chat.createdAt, new Date().toISOString());
    const startEvent = asEvent("cursor", `${chatId}:start`, "session_start", start, `Cursor chat ${chatId}`);
    const messageEvents = (chat.messages ?? []).map((msg, index) =>
      asEvent("cursor", msg.id ?? `${chatId}:msg:${index}`, "message", parseIso(msg.createdAt, start), msg.text ?? "", {
        role: msg.role ?? "unknown"
      })
    );
    return [startEvent, ...messageEvents];
  }
}
