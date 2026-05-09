import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

export type TranscriptSummary = {
  path: string;
  exists: boolean;
  sessionId?: string;
  lineCount?: number;
  messageCount?: number;
  toolCount?: number;
  userMessageCount?: number;
  assistantMessageCount?: number;
  substantiveMessageCount?: number;
  noisyMessageCount?: number;
  sampleUserMessages?: string[];
  sampleAssistantMessages?: string[];
};

export async function summarizeCopilotTranscript(sessionDir: string): Promise<TranscriptSummary | undefined> {
  const sessionId = basename(sessionDir);
  const transcriptPath = join(sessionDir, "..", "..", "transcripts", `${sessionId}.jsonl`);

  try {
    const raw = await readFile(transcriptPath, "utf8");
    let lineCount = 0;
    let messageCount = 0;
    let toolCount = 0;
    let userMessageCount = 0;
    let assistantMessageCount = 0;
    let substantiveMessageCount = 0;
    let noisyMessageCount = 0;
    const sampleUserMessages: string[] = [];
    const sampleAssistantMessages: string[] = [];

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      lineCount += 1;
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          data?: { content?: string; toolRequests?: Array<{ name?: string }> };
        };
        if (parsed.type === "user.message" || parsed.type === "assistant.message") {
          messageCount += 1;
          const content = parsed.data?.content?.trim();
          const toolRequests = (parsed.data?.toolRequests ?? [])
            .map((request) => request.name)
            .filter((name): name is string => Boolean(name));
          const isNoisy = Boolean(content) &&
            (content.startsWith("[") || /notification:|waiting for input|command completed/i.test(content));
          if (isNoisy) noisyMessageCount += 1;
          if (content && content.length >= 40 && !isNoisy) substantiveMessageCount += 1;
          const text = content || (toolRequests.length > 0 ? `Tool requests: ${toolRequests.join(", ")}` : undefined);
          if (parsed.type === "user.message") {
            userMessageCount += 1;
            if (text && sampleUserMessages.length < 3) sampleUserMessages.push(text.slice(0, 180));
          } else {
            assistantMessageCount += 1;
            if (text && sampleAssistantMessages.length < 3) sampleAssistantMessages.push(text.slice(0, 180));
          }
        }
        if (parsed.type?.startsWith("tool.")) toolCount += 1;
      } catch {
        continue;
      }
    }

    return {
      path: transcriptPath,
      exists: true,
      sessionId,
      lineCount,
      messageCount,
      toolCount,
      userMessageCount,
      assistantMessageCount,
      substantiveMessageCount,
      noisyMessageCount,
      sampleUserMessages,
      sampleAssistantMessages
    };
  } catch {
    return { path: transcriptPath, exists: false, sessionId };
  }
}
