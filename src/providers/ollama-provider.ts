import type { IntelligenceProvider } from "../core/contracts.js";
import { postJson } from "./http.js";

type OllamaResponse = {
  message?: { content?: string };
  response?: string;
};

export class OllamaProvider implements IntelligenceProvider {
  readonly id = "provider.ollama";

  constructor(private readonly baseUrl: string, private readonly model: string) {}

  async summarize(input: string): Promise<string> {
    if (!this.baseUrl) return "Ollama provider not configured.";
    const parsed = await postJson<OllamaResponse>(`${this.baseUrl}/api/chat`, "", {
      model: this.model,
      stream: false,
      messages: [
        { role: "system", content: "Summarize into actionable memory bullets." },
        { role: "user", content: input }
      ]
    });
    return parsed.message?.content ?? parsed.response ?? "No summary returned.";
  }
}
