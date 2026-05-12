import { join } from "node:path";
import type { IntelligenceProvider, PipelineStage } from "../core/contracts.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { writeSessionFiles } from "./signal-stage-file-writer.js";
import { isEnabled, loadPrompt, runSignalSession } from "./signal-stage-runner.js";

export type SignalStageHooks = {
  onInsight?: (context: DreamContext, insight: InsightRecord) => void;
  onSessionComplete?: (context: DreamContext) => Promise<void> | void;
  onComplete?: (context: DreamContext) => Promise<void> | void;
};

export class SignalStage implements PipelineStage {
  readonly id = "stage.signal";

  constructor(
    private readonly provider: IntelligenceProvider,
    private readonly agentPack?: RuntimeStageAgentPackConfig,
    private readonly hooks: SignalStageHooks = {}
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
    const liveStreamEnabled = isEnabled(process.env.DREAM_RUN_LIVE_STREAM ?? process.env.DREAM_EVAL_LIVE_STREAM);
    let runOrdinal = 0;
    const totalRunnableSessions = writtenSessions.reduce((count, session) => {
      const hasUserTurns = session.events.some(
        (event) => event.kind === "message" && String(event.metadata.role ?? "") === "user"
      );
      return count + (hasUserTurns ? 1 : 0);
    }, 0);

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
            prompt: (await import("./stage-agent-templates.js")).renderStageTemplate(
              await (await import("./stage-agent-templates.js")).loadStageTemplate(
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
      await runSignalSession({
        provider: this.provider,
        agentPack: this.agentPack,
        context,
        runDir,
        writtenSessions,
        session,
        runOrdinal: () => ++runOrdinal,
        totalRunnableSessions,
        basePrompt,
        orientationPath,
        liveStreamEnabled,
        captured,
        onInsight: (insight) => this.hooks.onInsight?.(context, insight),
        customAgents
      });
      await this.hooks.onSessionComplete?.(context);
    }

    for (const insight of captured) {
      context.insights.push(insight);
    }
    context.diary.push(`signals:insights_extracted=${captured.length}`);
    await this.hooks.onComplete?.(context);
    return context;
  }
}
