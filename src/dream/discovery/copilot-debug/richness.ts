import { existsSync, readFileSync } from "node:fs";

export type TranscriptRichness = {
  richnessScore: number;
  lineCount: number;
};

export function scoreTranscriptRichness(transcriptPath: string): TranscriptRichness {
  if (!existsSync(transcriptPath)) return { richnessScore: 0, lineCount: 0 };

  try {
    let messageCount = 0;
    let toolCount = 0;
    let lineCount = 0;
    let substantiveMessageCount = 0;
    let noisyMessageCount = 0;
    for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      lineCount += 1;
      const parsed = JSON.parse(line) as { type?: string; data?: { content?: string } };
      if (parsed.type === "user.message" || parsed.type === "assistant.message") {
        messageCount += 1;
        const content = parsed.data?.content?.trim() ?? "";
        const isNoisy = content.startsWith("[") || /notification:|waiting for input|command completed/i.test(content);
        if (isNoisy) noisyMessageCount += 1;
        if (content.length >= 40 && !isNoisy) substantiveMessageCount += 1;
      }
      if (parsed.type?.startsWith("tool.")) toolCount += 1;
    }
    return {
      richnessScore: substantiveMessageCount * 1000 + messageCount * 50 + toolCount * 5 + lineCount - noisyMessageCount * 200,
      lineCount
    };
  } catch {
    return { richnessScore: 0, lineCount: 0 };
  }
}
