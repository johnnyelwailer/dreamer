/**
 * Isolated test for Copilot SDK tool calling with BYOK provider.
 * Run: node --import tsx scripts/test-tool-calling.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CopilotClient, defineTool, approveAll, type CopilotClientOptions } from "@github/copilot-sdk";
import { readDreamConfig } from "../src/dream/config.js";
import { ttyWriteLine, ttyWriteTagged } from "../src/shared/tty-log-format.js";

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

ttyWriteTagged("test", "provider config");
ttyWriteLine(JSON.stringify({
  model: providerOptions.model,
  baseUrl: providerOptions.sessionConfig.provider?.baseUrl ?? "(none - using copilot auth)",
  hasApiKey: Boolean(providerOptions.sessionConfig.provider?.apiKey),
  configDir: providerOptions.sessionConfig.configDir
}, null, 2));

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
    ttyWriteTagged("test", `tool called message=${params.message}`);
    toolCallReceived = true;
    return { textResultForLlm: "Hello received: " + params.message, resultType: "success" as const };
  }
});

const client = new CopilotClient(providerOptions.clientOptions as Pick<CopilotClientOptions, "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env">);

try {
  ttyWriteTagged("test", "starting client");
  await client.start();
  ttyWriteTagged("test", "client started");

  const sessionOptions: Parameters<typeof client.createSession>[0] = {
    model: providerOptions.model,
    provider: providerOptions.sessionConfig.provider,
    infiniteSessions: providerOptions.sessionConfig.infiniteSessions,
    configDir: providerOptions.sessionConfig.configDir,
    workingDirectory: providerOptions.sessionConfig.workingDirectory,
    onPermissionRequest: approveAll,
    tools: [echoTool]
  };

  ttyWriteTagged("test", `creating session with keys=${Object.keys(sessionOptions).join(", ")}`);
  const session = await client.createSession(sessionOptions) as {
    sendAndWait: (req: { prompt: string }, timeout?: number) => Promise<unknown>;
  };
  ttyWriteTagged("test", "session created");

  const prompt = "You MUST call the say_hello tool right now with message='hi from test'. Do not respond in text, only call the tool.";
  ttyWriteTagged("test", `sending prompt=${prompt}`);

  const timeoutMs = 60_000;
  const response = await session.sendAndWait({ prompt }, timeoutMs);
  ttyWriteTagged("test", "response received");
  ttyWriteLine(JSON.stringify(response, null, 2));
  ttyWriteTagged("test", `tool was called=${String(toolCallReceived)}`);
} catch (err) {
  ttyWriteTagged("test", `error=${String(err)}`, { stream: process.stderr });
} finally {
  await client.stop().catch(() => undefined);
  ttyWriteTagged("test", "done");
}
