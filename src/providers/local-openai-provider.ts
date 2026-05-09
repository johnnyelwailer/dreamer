import { OpenAiCompatibleProvider } from "./openai-compatible-provider.js";

export class LocalOpenAiProvider extends OpenAiCompatibleProvider {
  readonly id = "provider.local.openai";
}
