import { CopilotClient } from "@github/copilot-sdk";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

type EvalCase = {
  id: string;
  prompt: string;
  mustContain: string[];
};

type EvalResult = {
  id: string;
  latencyMs: number;
  passed: boolean;
  missing: string[];
  output: string;
};

function requireEnv(primary: string, fallback?: string): string {
  const value = process.env[primary] ?? (fallback ? process.env[fallback] : undefined);
  if (!value) {
    throw new Error(`Missing required env: ${primary}${fallback ? ` (or ${fallback})` : ""}`);
  }
  return value;
}

function optionalEnv(primary: string, fallback?: string): string | undefined {
  const value = process.env[primary] ?? (fallback ? process.env[fallback] : undefined);
  return value && value.trim().length > 0 ? value : undefined;
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => normalizeText(item)).join("\n");
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.content === "string") return record.content;
  if (typeof record.text === "string") return record.text;
  return JSON.stringify(value);
}

function extractAssistantText(response: unknown): string {
  const record = response as Record<string, unknown>;
  const data = record?.data as Record<string, unknown> | undefined;
  const content = data?.content;
  if (content) return normalizeText(content).trim();
  return normalizeText(response).trim();
}

async function main(): Promise<void> {
  const baseUrl = requireEnv("COPILOT_SDK_BASE_URL", "HOSTED_LLM_BASE_URL");
  const apiKey = optionalEnv("COPILOT_SDK_API_KEY", "HOSTED_LLM_API_KEY");
  const model = process.env.COPILOT_SDK_MODEL ?? "qwen3.6-35b-a3b-q3";

  const evalCases: EvalCase[] = [
    {
      id: "constraints",
      prompt:
        "User asked to keep files under 150 LOC and enforce TDD. Agent repeatedly exceeded file length and added no tests. Current memory says: 'Use TDD.' Return a corrected memory note that preserves both constraints and concrete enforcement.",
      mustContain: ["150 LOC", "TDD"]
    },
    {
      id: "contradiction",
      prompt:
        "Earlier session says provider A only. Latest user says provider B and keep provider-agnostic design. Current memory says: 'Provider A is mandatory.' Return updated memory that explicitly flags contradiction and avoids silent overwrite.",
      mustContain: ["contradiction", "provider-agnostic"]
    }
  ];

  const client = new CopilotClient({ useLoggedInUser: false });
  await client.start();

  try {
    const provider: {
      type: "openai";
      baseUrl: string;
      wireApi: "completions";
      apiKey?: string;
    } = {
      type: "openai",
      baseUrl,
      wireApi: "completions"
    };
    if (apiKey) provider.apiKey = apiKey;

    const session = await client.createSession({
      model,
      provider,
      onPermissionRequest: async () => ({ kind: "approved" })
    });

    const results: EvalResult[] = [];
    for (const test of evalCases) {
      const started = Date.now();
      const response = await session.sendAndWait({ prompt: test.prompt });
      const output = extractAssistantText(response);
      const lowered = output.toLowerCase();
      const missing = test.mustContain.filter((token) => !lowered.includes(token.toLowerCase()));
      results.push({
        id: test.id,
        latencyMs: Date.now() - started,
        passed: missing.length === 0,
        missing,
        output
      });
    }

    const passed = results.filter((result) => result.passed).length;
    const summary = {
      provider: "copilot-sdk-byok",
      baseUrl: "configured-via-env",
      model,
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };

    const reportsDir = join(process.cwd(), "reports", "evals");
    await mkdir(reportsDir, { recursive: true });
    const outPath = join(reportsDir, "copilot-sdk-eval.json");
    await writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(JSON.stringify(summary, null, 2));
    console.log(`saved_eval_report=${outPath}`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await client.stop();
  }
}

await main();
