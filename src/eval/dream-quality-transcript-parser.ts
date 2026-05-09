import { readFile } from "node:fs/promises";

type TranscriptToolRequest = {
  name?: string;
  arguments?: string;
};

type TranscriptRecord = {
  type?: string;
  data?: {
    content?: string;
    toolRequests?: TranscriptToolRequest[];
  };
};

function extractKeyArg(name: string, argsJson: string | undefined): string {
  if (!argsJson) return "";
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const filePath = args.filePath ?? args.path ?? args.target ?? args.uri;
    if (typeof filePath === "string") {
      const short = filePath.replace(/.*\/(src|scripts|tests|docs|reports)\//, "$1/").slice(0, 50);
      return `(${short})`;
    }
    if (typeof args.command === "string") return `(${args.command.slice(0, 50)})`;
    const q = args.query ?? args.pattern ?? args.glob;
    if (typeof q === "string") return `("${q.slice(0, 40)}")`;
  } catch { /* ignore */ }
  return "";
}

function compressToolRequests(requests: TranscriptToolRequest[]): string {
  const SHOW = 3;
  const named = requests.map((r) => `${r.name ?? "tool"}${extractKeyArg(r.name ?? "", r.arguments)}`);
  const shown = named.slice(0, SHOW).join(", ");
  const overflow = named.length - SHOW;
  return overflow > 0
    ? `[${named.length} tools: ${shown}, +${overflow} more]`
    : `[${named.length > 1 ? named.length + " tools: " : ""}${shown}]`;
}

function formatTranscriptRecord(line: string): string | null {
  try {
    const parsed = JSON.parse(line) as TranscriptRecord;
    if (parsed.type === "user.message") {
      const content = parsed.data?.content?.trim();
      if (!content || content.length < 2) return null;
      return `USER: ${content}`;
    }
    if (parsed.type === "assistant.message") {
      const content = parsed.data?.content?.trim();
      const toolRequests = (parsed.data?.toolRequests ?? []).filter((r) => r.name);
      const toolSummary = toolRequests.length > 0 ? compressToolRequests(toolRequests) : null;
      if (content && content.length >= 10 && toolSummary) return `ASSISTANT ${toolSummary}: ${content.slice(0, 300)}`;
      if (content && content.length >= 10) return `ASSISTANT: ${content.slice(0, 300)}`;
      if (toolSummary) return `ASSISTANT ${toolSummary}`;
      return null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function readLines(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    const allLines = raw.split("\n").filter((line) => line.length > 0);
    if (path.endsWith(".jsonl")) {
      return allLines
        .map((line) => formatTranscriptRecord(line))
        .filter((line): line is string => line !== null);
    }
    return allLines;
  } catch {
    return [];
  }
}

export function summarizeTranscriptLine(line: string): string {
  // After readLines() filtering, lines are already formatted strings.
  // Fall through to raw parse only when called with unprocessed JSONL.
  try {
    const parsed = JSON.parse(line) as TranscriptRecord;
    const result = formatTranscriptRecord(line);
    if (result) return result.slice(0, 280);
    return parsed.type ? `[${parsed.type}]` : line.slice(0, 280);
  } catch {
    return line.slice(0, 280);
  }
}
