import type { IntelligenceProvider } from "../core/contracts.js";

export class EchoProvider implements IntelligenceProvider {
  readonly id = "provider.echo";

  async summarize(input: string): Promise<string> {
    const trimmed = input.replace(/\s+/g, " ").trim();
    return `summary:${trimmed.slice(0, 200)}`;
  }
}
