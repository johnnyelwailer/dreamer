import { readFile } from "node:fs/promises";
import type { IntelligenceProvider } from "../core/contracts.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import { resolveAssetPath } from "../dream/dreamer-home.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { ttyWriteLine, ttyWriteTagged } from "../shared/tty-log-format.js";
import { createSignalTools } from "./signal-stage-tools.js";
import { runStageAgentPack } from "./stage-agent-pack-execution.js"
import type { WrittenSession } from "./signal-stage-file-writer.js";
import { buildSignalCustomAgents } from "./signal-stage-agents.js";

type SessionRunArgs = {
  provider: IntelligenceProvider;
  agentPack?: RuntimeStageAgentPackConfig;
  context: DreamContext;
  runDir: string;
  writtenSessions: WrittenSession[];
  session: WrittenSession;
  runOrdinal: () => number;
  totalRunnableSessions: number;
  basePrompt: string;
  orientationPath: string;
  liveStreamEnabled: boolean;
  captured: InsightRecord[];
  onInsight?: (insight: InsightRecord) => void;
  customAgents?: NonNullable<RuntimeStageAgentPackConfig["customAgents"]>;
};

export function isEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export async function loadPrompt(): Promise<string> {
  try {
    return await readFile(resolveAssetPath("prompts/signal-stage.md"), "utf8");
  } catch {
    return [
      "Use the specialist summaries as evidence for durable insights.",
      "Do not inspect files or run shell tools directly.",
      "Call record_insight for each durable finding, then call finalize_signal_extraction.",
      "If the specialist summaries contain no durable findings, call finalize_signal_extraction with status=no_insights_found."
    ].join(" ");
  }
}

export async function runSignalSession(args: SessionRunArgs): Promise<void> {
  const { provider, agentPack, context, runDir, writtenSessions, session, runOrdinal, totalRunnableSessions, basePrompt, orientationPath, liveStreamEnabled, captured } = args;
  const sessionFile = `session-${session.sessionIndex}.md`;
  const userTurns = session.events.filter((event) => event.kind === "message" && String(event.metadata.role ?? "") === "user").length;
  if (userTurns === 0) {
    context.diary.push(`signals:skipped_no_user_turns=${sessionFile}`);
    ttyWriteTagged("dream", `signal skipped ${sessionFile} user_turns=0`);
    return;
  }

  const sessionStart = session.events.find((event) => event.kind === "session_start");
  const sessionCaptured: InsightRecord[] = [];
  const finalVerdict: { current: { status: string; summary: string } | null } = { current: null };
  const tools = createSignalTools(
    runDir,
    writtenSessions,
    (insight) => {
      sessionCaptured.push(insight);
      args.onInsight?.(insight);
    },
    {
      sessionId: String(sessionStart?.metadata.sessionId ?? "").slice(0, 64) || undefined,
      sessionReference: sessionFile.replace(/\.md$/, "")
    },
    (verdict) => {
      finalVerdict.current = verdict;
    }
  );
  const currentOrdinal = runOrdinal();
  const streamTag = `signal:${sessionFile}`;
  const scopedPrompt = `${basePrompt}\n\nFocus ONLY on ${sessionFile}. Do not summarize other sessions. Extract durable insights for this session, call record_insight for each one, and call finalize_signal_extraction before finishing.`;
  const prompt = scopedPrompt
    .replace("{{run_dir}}", runDir)
    .replace("{{session_list}}", `  ${sessionFile} (${session.messageCount} messages)`)
    .replace("{{orientation_path}}", orientationPath);
  const specialistContextPrompt = [
    `Analyze ${sessionFile} only.`,
    "Return concise candidate memories for the main stage agent to record.",
    "Inputs:",
    `- orientation: ${orientationPath}`,
    `- session file: ${runDir}/sessions/${sessionFile}`
  ].join("\n");
  const configuredCustomAgents = await buildSignalCustomAgents(context.workspaceDir, runDir, orientationPath, agentPack);
  const sessionCustomAgents = configuredCustomAgents?.map((agent) => ({
    ...agent,
    prompt: agent.prompt
      .replaceAll("{{session_file}}", sessionFile)
      .replaceAll("{{session_list}}", `  ${sessionFile} (${session.messageCount} messages)`)
      .replaceAll("{{run_dir}}", runDir)
      .replaceAll("{{orientation_path}}", orientationPath)
  }));

  try {
    if (liveStreamEnabled) {
      ttyWriteLine();
      ttyWriteTagged("dream", `signal run start ${currentOrdinal}/${totalRunnableSessions} ${sessionFile} run=${context.runId.slice(0, 12)}`, { noisy: true });
    }
    context.diary.push(`signals:agent_run_start:${sessionFile}=run_${currentOrdinal}_of_${totalRunnableSessions}`);
    await runStageAgentPack({
      provider,
      prompt,
      specialistContextPrompt,
      tools,
      streamTag,
      retries: [
        `Continue only on ${sessionFile}. Call record_insight for any remaining durable findings, then call finalize_signal_extraction before finishing.`
      ],
      shouldRetry: () => !finalVerdict.current,
      customAgents: sessionCustomAgents,
      defaultAgent: agentPack?.defaultAgent,
      agentPack
    });
  } catch (error) {
    context.diary.push(`signals:agent_error:${sessionFile}=${String(error).slice(0, 120)}`);
  } finally {
    if (liveStreamEnabled) {
      ttyWriteTagged("dream", `signal run end ${currentOrdinal}/${totalRunnableSessions} ${sessionFile}`, { noisy: true });
      ttyWriteLine();
    }
    context.diary.push(`signals:agent_run_end:${sessionFile}=run_${currentOrdinal}_of_${totalRunnableSessions}`);
  }

  if (!finalVerdict.current) {
    try {
      await provider.runAgent(
        [
          `You attempted to finish signal extraction for ${sessionFile} without recording the required final verdict.`,
          "Call finalize_signal_extraction now with status and summary.",
          "Do not finish without calling finalize_signal_extraction."
        ].join(" "),
        tools,
        {
          streamTag: `${streamTag}:finalize`,
          customAgents: sessionCustomAgents,
          defaultAgent: agentPack?.defaultAgent,
          retries: []
        }
      );
    } catch (error) {
      context.diary.push(`signals:agent_error:${sessionFile}=${String(error).slice(0, 120)}`);
    }
  }

  if (!finalVerdict.current) {
    context.diary.push(`signals:missing_final_verdict=${sessionFile}`);
    context.diary.push(`signals:user_message=Signal extraction must call finalize_signal_extraction to finish ${sessionFile}.`);
    return;
  }

  context.diary.push(`signals:final_status:${sessionFile}=${finalVerdict.current.status}`);
  captured.push(...sessionCaptured);
}
