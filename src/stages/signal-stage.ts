import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IntelligenceProvider, PipelineStage } from "../core/contracts.js";
import { resolveAssetPath, workspaceStorageDir } from "../dream/dreamer-home.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { createSignalTools } from "./signal-stage-tools.js";
import { writeSessionFiles } from "./signal-stage-file-writer.js";
import { loadStageTemplate, renderStageTemplate } from "./stage-agent-templates.js";

async function loadPrompt(): Promise<string> {
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

export class SignalStage implements PipelineStage {
  readonly id = "stage.signal";

  constructor(
    private readonly provider: IntelligenceProvider,
    private readonly agentPack?: RuntimeStageAgentPackConfig
  ) {}

  async run(context: DreamContext): Promise<DreamContext> {
    const safeEvents = enforceTranscriptInertness(context.events);
    context.events = safeEvents;

    const sessions = safeEvents.filter((e) => e.kind === "session_start").length;
    const messages = safeEvents.filter((e) => e.kind === "message").length;
    context.signals.push(`session_starts=${sessions}`);
    context.signals.push(`message_events=${messages}`);
    context.diary.push(`signals:events=${safeEvents.length}`);
    context.metrics.sessionsProcessed += sessions;

    if (sessions === 0) return context;

    const runDir = join(workspaceStorageDir(context.workspaceDir), "runs", context.runId);
    const writtenSessions = await writeSessionFiles(runDir, safeEvents);

    const captured: InsightRecord[] = [];
    const orientationPath = join(runDir, "orientation.md");
    const basePrompt = await loadPrompt();
    const customAgents = this.agentPack
      ? await Promise.all(
          this.agentPack.customAgents.map(async (agent) => ({
            name: agent.name,
            displayName: agent.displayName,
            description: agent.description,
            tools: agent.tools,
            infer: agent.infer,
            prompt: renderStageTemplate(
              await loadStageTemplate(
                context.workspaceDir,
                agent.promptTemplatePath,
                `Focus ONLY on {{session_file}}. Inspect evidence and return durable insight candidates for the main agent to record.`
              ),
              {
                run_dir: runDir,
                session_file: "{{session_file}}",
                orientation_path: orientationPath,
                session_list: "{{session_file}}"
              }
            )
          }))
        )
      : undefined;
    for (const session of writtenSessions) {
      const userTurns = session.events.filter(
        (event) => event.kind === "message" && String(event.metadata.role ?? "") === "user"
      ).length;
      if (userTurns === 0) {
        context.diary.push(`signals:skipped_no_user_turns=session-${session.sessionIndex}.md`);
        continue;
      }
      const sessionStart = session.events.find((event) => event.kind === "session_start");
      const sessionCaptured: InsightRecord[] = [];
      const finalVerdict: { current: { status: string; summary: string } | null } = { current: null };
      const tools = createSignalTools(
        runDir,
        writtenSessions,
        (insight) => sessionCaptured.push(insight),
        {
          sessionId: String(sessionStart?.metadata.sessionId ?? "").slice(0, 64) || undefined
        },
        (verdict) => {
          finalVerdict.current = verdict;
        }
      );
      const sessionFile = `session-${session.sessionIndex}.md`;
      const scopedPrompt = `${basePrompt}\n\nFocus ONLY on ${sessionFile}. ` +
        `Do not summarize other sessions. Extract durable insights for this session, call record_insight for each one, ` +
        `and call finalize_signal_extraction before finishing.`;
      const prompt = scopedPrompt
        .replace("{{run_dir}}", runDir)
        .replace("{{session_list}}", `  ${sessionFile} (${session.messageCount} messages)`)
        .replace("{{orientation_path}}", orientationPath);
      const sessionCustomAgents = customAgents?.map((agent) => ({
        ...agent,
        prompt: agent.prompt
          .replaceAll("{{session_file}}", sessionFile)
          .replaceAll("{{session_list}}", `  ${sessionFile} (${session.messageCount} messages)`)
          .replaceAll("{{run_dir}}", runDir)
          .replaceAll("{{orientation_path}}", orientationPath)
      }));

      try {
        const runOptions = {
          streamTag: "signal main",
          retries: [
            `Continue only on ${sessionFile}. Call record_insight for any remaining durable findings, then call finalize_signal_extraction before finishing.`
          ],
          customAgents: sessionCustomAgents,
          defaultAgent: this.agentPack?.defaultAgent
        };
        await this.provider.runAgent(prompt, tools, runOptions);
      } catch (error) {
        context.diary.push(`signals:agent_error:${sessionFile}=${String(error).slice(0, 120)}`);
      }

      if (!finalVerdict.current) {
        context.diary.push(`signals:missing_final_verdict=${sessionFile}`);
        context.diary.push(`signals:user_message=Signal extraction must call finalize_signal_extraction to finish ${sessionFile}.`);
        continue;
      }

      context.diary.push(`signals:final_status:${sessionFile}=${finalVerdict.current.status}`);
      captured.push(...sessionCaptured);
    }

    for (const insight of captured) {
      context.insights.push(insight);
    }
    context.diary.push(`signals:insights_extracted=${captured.length}`);
    return context;
  }
}
