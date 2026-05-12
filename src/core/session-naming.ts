import type { IntelligenceProvider } from "./contracts.js";
import type { InsightRecord } from "./types.js";

export type SessionNameInput = {
  repoName: string;
  workspaceId: string;
  runId: string;
  nowIso: string;
  insights: InsightRecord[];
};

export type SessionName = {
  title: string;
};

export type SessionNamer = {
  id: string;
  nameSession: (input: SessionNameInput) => Promise<SessionName>;
};

function cleanTitle(value: string): string {
  const firstLine = value.split("\n").find((line) => line.trim()) ?? "";
  const cleaned = firstLine.replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 80).replace(/[.!?]+$/g, "");
}

export function fallbackSignalSessionTitle(input: SessionNameInput): string {
  const firstInsight = input.insights[0]?.statement.trim();
  return cleanTitle(firstInsight ? `Signal insights: ${firstInsight}` : "Signal insights");
}

export class ProviderSessionNamer implements SessionNamer {
  readonly id = "session-namer.provider";

  constructor(private readonly provider: IntelligenceProvider) {}

  async nameSession(input: SessionNameInput): Promise<SessionName> {
    const insights = input.insights.slice(0, 8).map((insight, index) => `${index + 1}. ${insight.statement}`).join("\n");
    const fallback = fallbackSignalSessionTitle(input);
    try {
      const output = await this.provider.runAgent(
        [
          "Name this memory/signal ingestion session.",
          "Return only a short human-readable title, 3 to 7 words.",
          "Do not include dates, repo names, prefixes, quotes, or punctuation.",
          `Repository: ${input.repoName}`,
          `Workspace: ${input.workspaceId}`,
          "Signal insights:",
          insights || "(none)"
        ].join("\n"),
        [],
        { streamTag: "session-namer", retries: [] }
      );
      return { title: cleanTitle(output) || fallback };
    } catch {
      return { title: fallback };
    }
  }
}
