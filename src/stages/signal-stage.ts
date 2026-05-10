import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { IntelligenceProvider, PipelineStage } from "../core/contracts.js";
import { resolveAssetPath, workspaceStorageDir } from "../dream/dreamer-home.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { createSignalTools } from "./signal-stage-tools.js";
import { writeSessionFiles } from "./signal-stage-file-writer.js";

async function loadPrompt(): Promise<string> {
  try {
    return await readFile(resolveAssetPath("prompts/signal-stage.md"), "utf8");
  } catch {
    return "Explore the run directory. Call list_run_files first, read orientation.md, then explore session files and record_insight for each durable finding.";
  }
}

async function loadTemplate(workspaceDir: string, templatePath: string, fallback: string): Promise<string> {
  const absolutePath = isAbsolute(templatePath) ? templatePath : join(workspaceDir, templatePath);
  try {
    return await readFile(absolutePath, "utf8");
  } catch {
    return fallback;
  }
}

function renderPrompt(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, value), template);
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
            prompt: renderPrompt(
              await loadTemplate(
                context.workspaceDir,
                agent.promptTemplatePath,
                `Focus ONLY on {{session_file}}. Extract durable insights and call record_insight when supported by evidence.`
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
    const explicitSequence =
      this.agentPack?.execution?.mode === "explicit-sequence" ? this.agentPack.execution.explicitSequence ?? [] : [];

    for (const session of writtenSessions) {
      const sessionStart = session.events.find((event) => event.kind === "session_start");
      const tools = createSignalTools(runDir, writtenSessions, (insight) => captured.push(insight), {
        sessionId: String(sessionStart?.metadata.sessionId ?? "").slice(0, 64) || undefined
      });
      const sessionFile = `session-${session.sessionIndex}.md`;
      const scopedPrompt = `${basePrompt}\n\nFocus ONLY on ${sessionFile}. ` +
        `Do not summarize other sessions. Extract durable insights for this session and call record_insight for each one.`;
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
          retries: [`Continue only on ${sessionFile}. Call record_insight for any remaining durable findings, then finish.`],
          customAgents: sessionCustomAgents,
          defaultAgent: this.agentPack?.defaultAgent
        };

        if (sessionCustomAgents && explicitSequence.length > 0) {
          const customAgentByName = new Map(sessionCustomAgents.map((agent) => [agent.name, agent]));
          for (const agentName of explicitSequence) {
            const selectedAgent = customAgentByName.get(agentName);
            if (!selectedAgent) continue;
            const agentPrompt = selectedAgent.prompt
              .replaceAll("{{session_file}}", sessionFile)
              .replaceAll("{{session_list}}", `  ${sessionFile} (${session.messageCount} messages)`)
              .replaceAll("{{run_dir}}", runDir)
              .replaceAll("{{orientation_path}}", orientationPath);
            await this.provider.runAgent(agentPrompt, tools, { ...runOptions, selectedAgent: agentName, retries: [] });
          }
        } else {
          await this.provider.runAgent(prompt, tools, runOptions);
        }
      } catch (error) {
        context.diary.push(`signals:agent_error:${sessionFile}=${String(error).slice(0, 120)}`);
      }
    }

    for (const insight of captured) {
      context.insights.push(insight);
    }
    context.diary.push(`signals:insights_extracted=${captured.length}`);
    return context;
  }
}
