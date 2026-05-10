import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { IntelligenceProvider, PipelineStage } from "../core/contracts.js";
import { resolveAssetPath, workspaceStorageDir } from "../dream/dreamer-home.js";
import { enforceTranscriptInertness } from "../core/safety.js";
import type { DreamContext } from "../core/types.js";
import { createSignalTools } from "./signal-stage-tools.js";
import { writeSessionFiles } from "./signal-stage-file-writer.js";

async function loadPrompt(): Promise<string> {
  try {
    return await readFile(resolveAssetPath("prompts/signal-stage.md"), "utf8");
  } catch {
    return "Explore the run directory. Call list_run_files first, read orientation.md, then explore session files and record_insight for each durable finding.";
  }
}

export class SignalStage implements PipelineStage {
  readonly id = "stage.signal";

  constructor(private readonly provider: IntelligenceProvider) {}

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

    const captured: Array<{ statement: string; scope: "user" | "workspace" }> = [];
    const tools = createSignalTools(runDir, writtenSessions, (statement, scope) => captured.push({ statement, scope }));
    const sessionList = writtenSessions
      .map((s) => `  session-${s.sessionIndex}.md (${s.messageCount} messages)`)
      .join("\n");
    const orientationPath = join(runDir, "orientation.md");
    const prompt = (await loadPrompt())
      .replace("{{run_dir}}", runDir)
      .replace("{{session_list}}", sessionList || "  (none)")
      .replace("{{orientation_path}}", orientationPath);

    try {
      await this.provider.runAgent(prompt, tools, [
        "Continue exploring. Call record_insight for any remaining durable findings, then finish."
      ]);
    } catch (error) {
      context.diary.push(`signals:agent_error=${String(error).slice(0, 120)}`);
    }

    for (const { statement } of captured) {
      context.insights.push(statement);
    }
    context.diary.push(`signals:insights_extracted=${captured.length}`);
    return context;
  }
}
