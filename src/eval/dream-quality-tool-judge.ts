import { CopilotClient, approveAll, type CopilotClientOptions } from "@github/copilot-sdk";
import type { CopilotSdkProviderOptions } from "../providers/copilot-sdk-provider.js";
import type { JudgeEvidenceFile } from "./dream-quality-evidence.js";
import { extractAssistantText, type ToolJudgePayload } from "./dream-quality-tool-judge-helpers.js";
import { createEvidenceTools } from "./dream-quality-evidence-tools.js";

type CopilotSession = {
  sendAndWait: (request: { prompt: string }, timeoutMs?: number) => Promise<unknown>;
};

type ToolJudgeResult = {
  rawOutput: string;
  toolPayload?: ToolJudgePayload;
  toolUsed: boolean;
  toolError?: string;
};

type ToolJudgeInput = {
  providerOptions: CopilotSdkProviderOptions;
  prompt: string;
  rubricDimensionIds: string[];
  evidenceFiles: JudgeEvidenceFile[];
};

export async function runToolContractJudge(input: ToolJudgeInput): Promise<ToolJudgeResult> {
  const client = new CopilotClient(input.providerOptions.clientOptions as Pick<CopilotClientOptions, "useLoggedInUser" | "gitHubToken" | "cliPath" | "cliUrl" | "env">);
  let captured: ToolJudgePayload | undefined;
  let lastRawOutput = "";

  const tools = createEvidenceTools(input.evidenceFiles, input.rubricDimensionIds, (payload) => {
    captured = payload;
  });

  try {
    await client.start();
    const session = (await client.createSession({
      model: input.providerOptions.model,
      provider: input.providerOptions.sessionConfig.provider,
      gitHubToken: input.providerOptions.sessionConfig.gitHubToken,
      infiniteSessions: input.providerOptions.sessionConfig.infiniteSessions,
      configDir: input.providerOptions.sessionConfig.configDir,
      workingDirectory: input.providerOptions.sessionConfig.workingDirectory,
      onPermissionRequest: approveAll,
      tools
    })) as CopilotSession;

    const prompts = [
      `${input.prompt}\n\nCall submit_quality_scores now with your complete evaluation results.`,
      "You must call submit_quality_scores. Call it now with all rubric scores, strengths, weaknesses, and improvements.",
      "Final attempt: call submit_quality_scores immediately with complete results."
    ];

    for (const prompt of prompts) {
      const response = await session.sendAndWait({ prompt }, input.providerOptions.requestTimeoutMs);
      lastRawOutput = extractAssistantText(response);
      if (captured) break;
    }

    return {
      rawOutput: lastRawOutput,
      toolPayload: captured,
      toolUsed: Boolean(captured),
      toolError: captured ? undefined : "tool_not_called_after_retries"
    };
  } catch (error) {
    return {
      rawOutput: lastRawOutput,
      toolUsed: false,
      toolError: `tool_judge_failed: ${String(error)}`
    };
  } finally {
    await client.stop().catch(() => undefined);
  }
}
