import { defineTool } from "@github/copilot-sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { WrittenSession } from "./signal-stage-file-writer.js";

function safePath(runDir: string, path: string): string | null {
  const abs = resolve(path);
  return abs.startsWith(resolve(runDir)) ? abs : null;
}

export function createReadFileTool(runDir: string) {
  return defineTool("read_file", {
    description: "Read lines from a file by absolute path. Use start_line/end_line (1-based) for ranges; defaults to first 120 lines.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, start_line: { type: "number" }, end_line: { type: "number" } },
      required: ["path"]
    },
    skipPermission: true,
    handler: async (args: Record<string, unknown>) => {
      const abs = safePath(runDir, String(args.path ?? ""));
      if (!abs) return { textResultForLlm: "Path not allowed.", resultType: "error" as const };
      try {
        const lines = (await readFile(abs, "utf8")).split("\n");
        const start = Math.max(1, Number(args.start_line) || 1);
        const end = Math.min(lines.length, Number(args.end_line) || start + 119);
        return { textResultForLlm: `[${start}-${end} of ${lines.length}]\n${lines.slice(start - 1, end).join("\n")}`, resultType: "success" as const };
      } catch {
        return { textResultForLlm: "File not found.", resultType: "error" as const };
      }
    }
  });
}

export function createGetMessageDetailsTool(sessions: WrittenSession[]) {
  return defineTool("get_message_details", {
    description: "Get raw event data (tool calls, arguments, results) for a message ID range in a session. Useful for drill-down after reading a session-N.md summary.",
    parameters: {
      type: "object",
      properties: {
        session: { type: "number", description: "Session number (1-based, matching session-N.md)" },
        from_msg: { type: "number", description: "First message [ID] to fetch (1-based)" },
        to_msg: { type: "number", description: "Last message [ID] inclusive. Defaults to from_msg." }
      },
      required: ["session", "from_msg"]
    },
    skipPermission: true,
    handler: (args: Record<string, unknown>) => {
      const session = sessions[Number(args.session ?? 1) - 1];
      if (!session) return { textResultForLlm: "Session not found.", resultType: "error" as const };
      const from = Math.max(1, Number(args.from_msg) || 1);
      const to = Math.max(from, Number(args.to_msg) || from);
      const messages = session.events.filter((event) => event.kind === "message");
      const fromMsg = messages[from - 1];
      if (!fromMsg) return { textResultForLlm: "Message ID out of range.", resultType: "error" as const };
      const afterTo = messages[to];
      const slice = session.events.filter((event) => event.timestamp >= fromMsg.timestamp && (!afterTo || event.timestamp < afterTo.timestamp));
      return {
        textResultForLlm: JSON.stringify(slice.map((event) => ({ kind: event.kind, role: event.metadata.role, tool: event.metadata.toolName, text: event.text.slice(0, 300) }))),
        resultType: "success" as const
      };
    }
  });
}