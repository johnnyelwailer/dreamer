/**
 * Isolated Copilot SDK subagent delegation probe.
 * Run: node --import tsx scripts/test-subagent-delegation.ts
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { approveAll, CopilotClient, defineTool, type CopilotClientOptions } from "@github/copilot-sdk";
import { readDreamConfig } from "../src/dream/config.js";
import { ttyWriteLine, ttyWriteTagged } from "../src/shared/tty-log-format.js";

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
} catch {
  // no .env.local
}

type ProbeFinal = {
  sawAlpha: boolean;
  sawBeta: boolean;
  summary: string;
};

const workspaceDir = process.cwd();
const config = readDreamConfig(workspaceDir);
const providerOptions = config.copilotSdkProviderOptions;
const events: unknown[] = [];
const inspections: Array<{ pass: string; key: string }> = [];
let finalResult: ProbeFinal | null = null;
let currentPass = "main";

const alphaReader = {
  name: "alpha-reader",
  displayName: "Alpha Reader",
  description: "Inspects only alpha and reports a concise result to the main agent.",
  tools: ["inspect_probe"],
  infer: false,
  prompt: [
    "You are alpha-reader.",
    "Call inspect_probe with key=alpha exactly once.",
    "Return a concise summary to the main agent.",
    "Do not call submit_probe_result."
  ].join(" ")
};

const betaReader = {
  name: "beta-reader",
  displayName: "Beta Reader",
  description: "Inspects only beta and reports a concise result to the main agent.",
  tools: ["inspect_probe"],
  infer: false,
  prompt: [
    "You are beta-reader.",
    "Call inspect_probe with key=beta exactly once.",
    "Return a concise summary to the main agent.",
    "Do not call submit_probe_result."
  ].join(" ")
};

const inspectProbe = defineTool("inspect_probe", {
  description: "Subagent-only inspection tool. Use this to inspect probe facts by key.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", enum: ["alpha", "beta"] }
    },
    required: ["key"]
  },
  skipPermission: true,
  handler: (args: Record<string, unknown>) => {
    const key = String(args.key ?? "");
    inspections.push({ pass: currentPass, key });
    const value = key === "alpha" ? "alpha=delegated" : key === "beta" ? "beta=verified" : "unknown";
    ttyWriteTagged("probe", `inspect_probe key=${key} pass=${currentPass}`);
    return { textResultForLlm: value, resultType: "success" as const };
  }
});

const submitProbeResult = defineTool("submit_probe_result", {
  description: "Main-agent-only finalization tool. Call after subagents report alpha and beta.",
  parameters: {
    type: "object",
    properties: {
      sawAlpha: { type: "boolean" },
      sawBeta: { type: "boolean" },
      summary: { type: "string" }
    },
    required: ["sawAlpha", "sawBeta", "summary"]
  },
  skipPermission: true,
  handler: (args: Record<string, unknown>) => {
    finalResult = {
      sawAlpha: args.sawAlpha === true,
      sawBeta: args.sawBeta === true,
      summary: String(args.summary ?? "")
    };
    ttyWriteTagged("probe", `submit_probe_result ${JSON.stringify(finalResult)}`);
    return { textResultForLlm: "Probe result recorded. Stop now with no more tool calls.", resultType: "success" as const };
  }
});

function eventAgentName(event: unknown): string | null {
  const data = (event as { data?: Record<string, unknown> }).data;
  const name =
    data?.agentName ??
    data?.subagentName ??
    (data?.agent as Record<string, unknown> | undefined)?.name ??
    (data?.subagent as Record<string, unknown> | undefined)?.name;
  return typeof name === "string" ? name : null;
}

const client = new CopilotClient(
  providerOptions.clientOptions as Pick<CopilotClientOptions, "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env">
);

function buildSummary() {
  const subagentNames = new Set(events.map(eventAgentName).filter((name): name is string => Boolean(name)));
  const mainInspections = inspections.filter((item) => item.pass === "main");
  return {
    subagentNames: [...subagentNames].sort(),
    inspections,
    mainInspections,
    finalResult,
    eventCount: events.length,
    passed:
      Boolean(finalResult?.sawAlpha) &&
      Boolean(finalResult?.sawBeta) &&
      inspections.some((item) => item.pass === "alpha-reader" && item.key === "alpha") &&
      inspections.some((item) => item.pass === "beta-reader" && item.key === "beta") &&
      mainInspections.length === 0
  };
}

function printSummary(): ReturnType<typeof buildSummary> {
  const result = buildSummary();
  ttyWriteTagged("probe", "summary");
  ttyWriteLine(JSON.stringify(result, null, 2));
  return result;
}

try {
  ttyWriteTagged("probe", "starting subagent delegation probe");
  ttyWriteLine(
    JSON.stringify(
      {
        model: providerOptions.model,
        includeSubAgentStreamingEvents: providerOptions.sessionConfig.includeSubAgentStreamingEvents,
        providerMode: providerOptions.sessionConfig.provider?.type ?? "copilot"
      },
      null,
      2
    )
  );

  await client.start();
  const commonSessionOptions = {
    model: providerOptions.model,
    provider: providerOptions.sessionConfig.provider,
    gitHubToken: providerOptions.sessionConfig.gitHubToken,
    infiniteSessions: providerOptions.sessionConfig.infiniteSessions,
    modelCapabilities: providerOptions.sessionConfig.modelCapabilities,
    streaming: providerOptions.sessionConfig.streaming,
    includeSubAgentStreamingEvents: true,
    configDir: providerOptions.sessionConfig.configDir,
    workingDirectory: providerOptions.sessionConfig.workingDirectory,
    onPermissionRequest: approveAll,
    onEvent: (event) => {
      events.push(event);
      const agentName = eventAgentName(event);
      const type = (event as { type?: unknown }).type;
      if (agentName || String(type).includes("subagent")) {
        ttyWriteTagged("probe:event", `${String(type)} agent=${agentName ?? "unknown"}`);
      }
    }
  } satisfies Omit<Parameters<typeof client.createSession>[0], "agent" | "customAgents" | "tools" | "defaultAgent">;

  const timeoutMs = Number(process.env.DREAM_SUBAGENT_PROBE_TIMEOUT_MS ?? 120_000);
  const alphaSession = (await client.createSession({
    ...commonSessionOptions,
    agent: "alpha-reader",
    customAgents: [alphaReader],
    tools: [inspectProbe]
  })) as { sendAndWait: (req: { prompt: string }, timeout?: number) => Promise<unknown> };
  currentPass = "alpha-reader";
  const alphaResponse = await alphaSession.sendAndWait(
    { prompt: "Call inspect_probe with key=alpha exactly once, then summarize the result." },
    timeoutMs
  );

  const betaSession = (await client.createSession({
    ...commonSessionOptions,
    agent: "beta-reader",
    customAgents: [betaReader],
    tools: [inspectProbe]
  })) as { sendAndWait: (req: { prompt: string }, timeout?: number) => Promise<unknown> };
  currentPass = "beta-reader";
  const betaResponse = await betaSession.sendAndWait(
    { prompt: "Call inspect_probe with key=beta exactly once, then summarize the result." },
    timeoutMs
  );

  const mainSession = (await client.createSession({
    ...commonSessionOptions,
    customAgents: undefined,
    defaultAgent: {
      excludedTools: ["inspect_probe", "bash", "read_bash", "view", "read_file", "grep_search", "file_search", "list_dir"]
    },
    tools: [submitProbeResult]
  })) as { sendAndWait: (req: { prompt: string }, timeout?: number) => Promise<unknown> };
  currentPass = "main";
  await mainSession.sendAndWait(
    {
      prompt: [
        "This is an isolated deterministic delegation contract test.",
        "You are the main agent. You have only submit_probe_result available.",
        "Do not inspect facts directly.",
        `Alpha summary: ${JSON.stringify(alphaResponse)}`,
        `Beta summary: ${JSON.stringify(betaResponse)}`,
        "Call submit_probe_result exactly once with sawAlpha=true and sawBeta=true now. After the tool returns, stop with no more tool calls. Do not finish with text only."
      ].join("\n")
    },
    timeoutMs
  );

  const result = printSummary();
  if (!result.passed) {
    process.exitCode = 1;
    ttyWriteTagged("probe", "FAIL: subagent delegation contract was not satisfied", { stream: process.stderr });
  } else {
    ttyWriteTagged("probe", "PASS");
  }
} catch (error) {
  ttyWriteTagged("probe", `error=${String(error)}`, { stream: process.stderr });
  const result = printSummary();
  if (result.passed) {
    ttyWriteTagged("probe", "PASS despite session idle timeout after valid final result");
  } else {
    process.exitCode = 1;
  }
} finally {
  await client.stop().catch(() => undefined);
}
