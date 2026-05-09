/**
 * Isolated test for Copilot SDK tool calling with BYOK provider.
 * Run: node --import tsx scripts/test-tool-calling.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CopilotClient, defineTool, approveAll, type CopilotClientOptions } from "@github/copilot-sdk";
import { readDreamConfig } from "../src/dream/config.js";

// Auto-load .env.local
try {
  const envLocal = await readFile(join(process.cwd(), ".env.local"), "utf8");
  for (const line of envLocal.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch { /* no .env.local */ }

const workspaceDir = process.cwd();
const config = readDreamConfig(workspaceDir);
const providerOptions = config.copilotSdkProviderOptions;

console.log("[TEST] Provider config:", {
  model: providerOptions.model,
  baseUrl: providerOptions.sessionConfig.provider?.baseUrl ?? "(none - using copilot auth)",
  hasApiKey: Boolean(providerOptions.sessionConfig.provider?.apiKey),
  configDir: providerOptions.sessionConfig.configDir
});

// Simple tool that the LLM should call
let toolCallReceived = false;
const echoTool = defineTool("say_hello", {
  description: "Call this tool to say hello. You MUST call this tool.",
  parameters: {
    type: "object",
    properties: {
      message: { type: "string", description: "Your hello message" }
    },
    required: ["message"]
  },
  skipPermission: true,
  handler: (params: { message: string }) => {
    console.log("[TEST] ✅ Tool called! message =", params.message);
    toolCallReceived = true;
    return { textResultForLlm: "Hello received: " + params.message, resultType: "success" as const };
  }
});

const client = new CopilotClient(providerOptions.clientOptions as Pick<CopilotClientOptions, "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env">);

try {
  console.log("[TEST] Starting client...");
  await client.start();
  console.log("[TEST] Client started.");

  const sessionOptions: Record<string, unknown> = {
    model: providerOptions.model,
    infiniteSessions: providerOptions.sessionConfig.infiniteSessions,
    configDir: providerOptions.sessionConfig.configDir,
    workingDirectory: providerOptions.sessionConfig.workingDirectory,
    onPermissionRequest: approveAll,
    tools: [echoTool]
  };
  if (providerOptions.sessionConfig.provider) {
    sessionOptions.provider = providerOptions.sessionConfig.provider;
  }

  console.log("[TEST] Creating session with keys:", Object.keys(sessionOptions).join(", "));
  const session = await client.createSession(sessionOptions) as {
    sendAndWait: (req: { prompt: string }, timeout?: number) => Promise<unknown>;
  };
  console.log("[TEST] Session created.");

  const prompt = "You MUST call the say_hello tool right now with message='hi from test'. Do not respond in text, only call the tool.";
  console.log("[TEST] Sending prompt:", prompt);

  const timeoutMs = 60_000;
  const response = await session.sendAndWait({ prompt }, timeoutMs);
  console.log("[TEST] Response received:", JSON.stringify(response, null, 2));
  console.log("[TEST] Tool was called:", toolCallReceived);
} catch (err) {
  console.error("[TEST] ❌ Error:", err);
} finally {
  await client.stop().catch(() => undefined);
  console.log("[TEST] Done.");
}
