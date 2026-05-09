import type { IntelligenceProvider } from "../core/contracts.js";

export type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class OpenAiCompatibleProvider implements IntelligenceProvider {
  readonly id: string = "provider.openai.compat";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async summarize(input: string): Promise<string> {
    if (!this.baseUrl) {
      return "Provider not configured. Using local fallback summary.";
    }
    try {
      const body = {
        model: this.model,
        temperature: 0,
        messages: [
          { role: "system", content: "Summarize into actionable memory bullets." },
          { role: "user", content: input }
        ]
      };
      const headers: Record<string, string> = {
        "content-type": "application/json"
      };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      const parsed = (await response.json()) as ChatResponse;
      return parsed.choices?.[0]?.message?.content ?? "No summary returned.";
    } catch {
      return "Provider request failed. Using local fallback summary.";
    }
  }
}
