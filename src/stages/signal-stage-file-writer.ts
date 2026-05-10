import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NormalizedEvent } from "../core/types.js";

export type WrittenSession = {
  sessionIndex: number; // 1-based, matches session-N.md
  events: NormalizedEvent[]; // all events in this session
  messageCount: number;
};

const FILE_CHANGE_TOOLS = new Set([
  "replace_string_in_file", "multi_replace_string_in_file", "create_file",
  "write_file", "edit_file", "rename_file", "delete_file"
]);

function toolCounts(toolEvents: NormalizedEvent[]): string {
  const counts = new Map<string, number>();
  for (const e of toolEvents) {
    if (e.metadata.type !== "tool.execution_start") continue;
    const name = String(e.metadata.toolName ?? "tool");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(", ");
}

export async function writeSessionFiles(runDir: string, events: NormalizedEvent[]): Promise<WrittenSession[]> {
  const sessionsDir = join(runDir, "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const startIndexes = events
    .map((event, index) => ({ event, index }))
    .filter((entry) => entry.event.kind === "session_start");
  const starts = startIndexes.map((entry) => entry.event);
  if (starts.length === 0) return [];

  const written: WrittenSession[] = [];

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const startIndex = startIndexes[i]!.index;
    const nextStartIndex = i + 1 < startIndexes.length ? startIndexes[i + 1]!.index : events.length;
    const sessionEvents = events.slice(startIndex, nextStartIndex);
    const msgEvents = sessionEvents.filter((e) => e.kind === "message");
    const toolEvents = sessionEvents.filter((e) => e.kind === "tool");

    const label = `session-${i + 1}`;
    const sessionId = String(start.metadata.sessionId ?? "unknown").slice(0, 8);
    const transcriptPath = start.metadata.transcriptPath ? String(start.metadata.transcriptPath) : null;
    const activity = toolCounts(toolEvents);
    const fileChangers = toolEvents.filter((e) =>
      e.metadata.type === "tool.execution_start" && FILE_CHANGE_TOOLS.has(String(e.metadata.toolName))
    ).map((e) => String(e.metadata.toolName));
    const uniqueFileChangers = [...new Set(fileChangers)].join(", ");

    const header = [
      `# Session ${i + 1} — ${start.timestamp.slice(0, 16).replace("T", " ")}`,
      `Source: ${start.source} | ID: ${sessionId}`,
      `User turns: ${msgEvents.filter((m) => m.metadata.role === "user").length} | Messages: ${msgEvents.length} | Tool calls: ${toolEvents.filter((e) => e.metadata.type === "tool.execution_start").length}`,
      activity ? `Activity: ${activity}` : "",
      uniqueFileChangers ? `File ops: ${uniqueFileChangers}` : "",
      transcriptPath ? `Raw transcript: ${transcriptPath}` : "",
      "---", ""
    ].filter(Boolean);

    let msgCounter = 0;
    const body: string[] = [];
    for (let j = 0; j < msgEvents.length; j++) {
      const msg = msgEvents[j]!;
      const nextMsg = msgEvents[j + 1];
      const toolsHere = toolEvents.filter(
        (t) => t.metadata.type === "tool.execution_start" &&
               t.timestamp >= msg.timestamp && (!nextMsg || t.timestamp < nextMsg.timestamp)
      );
      msgCounter++;
      const toolLabel = toolsHere.length ? ` *(${toolCounts(toolsHere)})*` : "";
      body.push(`[${msgCounter}] **${String(msg.metadata.role ?? "unknown")}**${toolLabel}`);
      body.push(msg.text || "(no content)");
      body.push("");
    }

    await writeFile(join(sessionsDir, `${label}.md`), [...header, ...body].join("\n"), "utf8");
    written.push({ sessionIndex: i + 1, events: sessionEvents, messageCount: msgEvents.length });
  }

  return written;
}
