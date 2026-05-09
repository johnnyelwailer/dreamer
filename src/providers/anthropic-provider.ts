import type { IntelligenceProvider } from "../core/contracts.js";
import { postJson } from "./http.js";

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

export class AnthropicProvider implements IntelligenceProvider {
  readonly id = "provider.anthropic";

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async summarize(input: string): Promise<string> {
    if (!this.baseUrl || !this.apiKey) return "Anthropic provider not configured.";
    const parsed = await postJson<AnthropicResponse>(
      `${this.baseUrl}/messages`,
      this.apiKey,
      {
        model: this.model,
        max_tokens: 400,
        temperature: 0,
        messages: [{ role: "user", content: `Summarize into actionable memory bullets.\n\n${input}` }]
      },
      { "anthropic-version": "2023-06-01" }
    );
    return parsed.content?.find((item) => item.type === "text")?.text ?? "No summary returned.";
  }
}
