import { CopilotClient, approveAll, type CopilotClientOptions } from "@github/copilot-sdk";
import { homedir } from "node:os";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { JudgeEvidenceFile } from "./dream-quality-evidence.js";
import { extractAssistantText, type ToolJudgePayload } from "./dream-quality-tool-judge-helpers.js";
import { createEvidenceTools } from "./dream-quality-evidence-tools.js";
import { createTtyStatus } from "../shared/tty-progress.js";

type CopilotSession = {
  sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
};

type ToolJudgeResult = {
  rawOutput: string;
  toolPayload?: ToolJudgePayload;
  toolUsed: boolean;
  toolError?: string;
  judgeTimeoutMs: number;
  attempts: number;
  elapsedMs: number;
  lastOutputChars: number;
};

type ToolJudgeInput = {
  providerOptions: CopilotSdkProviderOptions;
  prompt: string;
  rubricDimensionIds: string[];
  evidenceFiles: JudgeEvidenceFile[];
};

function isEnabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export async function runToolContractJudge(input: ToolJudgeInput): Promise<ToolJudgeResult> {
  const client = new CopilotClient(input.providerOptions.clientOptions as Pick<CopilotClientOptions, "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env">);
  const status = createTtyStatus("[eval:dream-quality]");
  let captured: ToolJudgePayload | undefined;
  let lastRawOutput = "";
  let attempts = 0;
  const startedAt = Date.now();
  let streamEventCount = 0;
  let streamDeltaCount = 0;
  let firstStreamDeltaMs: number | undefined;
  const liveStream = isEnabled(process.env.DREAM_EVAL_LIVE_STREAM);

  const tools = createEvidenceTools(input.evidenceFiles, input.rubricDimensionIds, (payload) => {
    captured = payload;
  });
  // Give the judge at least 5 minutes — evidence reading + tool-calling on large transcripts is slow
  const judgeTimeoutMs = Math.max(input.providerOptions.requestTimeoutMs, 300_000);
  status.update(`judge timeout=${judgeTimeoutMs}ms`);

  try {
    status.update("starting judge client");
    await client.start();
    const session = (await client.createSession({
      model: input.providerOptions.model,
      provider: input.providerOptions.sessionConfig.provider,
      gitHubToken: input.providerOptions.sessionConfig.gitHubToken,
      infiniteSessions: input.providerOptions.sessionConfig.infiniteSessions,
      modelCapabilities: input.providerOptions.sessionConfig.modelCapabilities,
      streaming: input.providerOptions.sessionConfig.streaming,
      includeSubAgentStreamingEvents: input.providerOptions.sessionConfig.includeSubAgentStreamingEvents,
      configDir: input.providerOptions.sessionConfig.configDir,
      // Use homedir so the agent's built-in file tools can reach transcript/memory paths
      workingDirectory: homedir(),
      onPermissionRequest: approveAll,
      onEvent: (event) => {
        streamEventCount += 1;
        if (event.type === "assistant.message_delta" || event.type === "assistant.streaming_delta") {
          streamDeltaCount += 1;
          if (firstStreamDeltaMs === undefined) firstStreamDeltaMs = Date.now() - startedAt;
        }
        if (liveStream && event.type === "assistant.message_delta") {
          const text = typeof event.data?.deltaContent === "string" ? event.data.deltaContent : "";
          if (text) process.stdout.write(text);
        }
        if (liveStream && event.type === "assistant.message") process.stdout.write("\n");
      },
      tools
    })) as CopilotSession;

    const prompts = [
      `${input.prompt}\n\nCall submit_quality_scores now with your complete evaluation results.`,
      "You must call submit_quality_scores. Call it now with all rubric scores, strengths, weaknesses, and improvements.",
      "Final attempt: call submit_quality_scores immediately with complete results."
    ];

    for (const prompt of prompts) {
      attempts += 1;
      const attemptLabel = `judge attempt ${attempts}/${prompts.length}`;
      const response = liveStream
        ? (status.update(attemptLabel), await session.sendAndWait({ prompt }, judgeTimeoutMs))
        : await status.track(attemptLabel, session.sendAndWait({ prompt }, judgeTimeoutMs));
      lastRawOutput = extractAssistantText(response);
      if (captured) break;
    }
    status.done(`judge complete usedTool=${String(Boolean(captured))}`);

    return {
      rawOutput: lastRawOutput,
      toolPayload: captured,
      toolUsed: Boolean(captured),
      toolError: captured ? undefined : "tool_not_called_after_retries",
      judgeTimeoutMs,
      attempts,
      elapsedMs: Date.now() - startedAt,
      lastOutputChars: lastRawOutput.length
    };
  } catch (error) {
    const message = String(error);
    const streamDiag = `stream_events=${streamEventCount},stream_deltas=${streamDeltaCount},first_delta_ms=${firstStreamDeltaMs ?? "none"}`;
    status.done(`judge failed: ${message}`);
    return {
      rawOutput: lastRawOutput,
      toolUsed: false,
      toolError: `tool_judge_failed: ${message}${message.includes("session.idle") ? ` [${streamDiag}]` : ""}`,
      judgeTimeoutMs,
      attempts,
      elapsedMs: Date.now() - startedAt,
      lastOutputChars: lastRawOutput.length
    };
  } finally {
    await client.stop().catch(() => undefined);
  }
}
