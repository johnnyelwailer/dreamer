import type { IntelligenceProvider } from "../core/contracts.js";
import type { ChatResponse } from "./openai-compatible-provider.js";
import { postJson } from "./http.js";

export class LmStudioProvider implements IntelligenceProvider {
  readonly id = "provider.lmstudio";

  constructor(private readonly baseUrl: string, private readonly model: string) {}

  async summarize(input: string): Promise<string> {
    if (!this.baseUrl) return "LM Studio provider not configured.";
    const parsed = await postJson<ChatResponse>(`${this.baseUrl}/chat/completions`, "", {
      model: this.model,
      temperature: 0,
      messages: [
        { role: "system", content: "Summarize into actionable memory bullets." },
        { role: "user", content: input }
      ]
    });
    return parsed.choices?.[0]?.message?.content ?? "No summary returned.";
  }
}
