import { join } from "node:path";
import type { IntelligenceProvider, PipelineStage } from "../core/contracts.js";
import type { DreamContext, InsightRecord } from "../core/types.js";
import {
  resolveAssetPath,
  workspaceStorageDir,
} from "../dream/dreamer-home.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import {
  buildConsolidationCustomAgents,
  requestConsolidationFinalVerdict,
  runConsolidationAgentPasses,
} from "./consolidation-agent-pack.js";
import { createConsolidationTools } from "./consolidation-stage-tools.js";
import { loadStageTemplate } from "./stage-agent-templates.js";

const GLOBAL_EXTRACTOR_NAME = "global-rule-extractor";

function splitGlobalExtractor<T extends { name: string }>(
  agents: T[] | undefined,
): { prePass: T[] | undefined; globalExtractor: T | undefined } {
  if (!agents?.length)
    return { prePass: undefined, globalExtractor: undefined };
  const globalExtractor = agents.find(
    (agent) => agent.name === GLOBAL_EXTRACTOR_NAME,
  );
  const prePass = agents.filter(
    (agent) => agent.name !== GLOBAL_EXTRACTOR_NAME,
  );
  return { prePass, globalExtractor };
}

function formatGlobalCandidateMemories(context: DreamContext): string {
  const workspaceCandidates = context.memories
    .filter((memory) => memory.scope === "workspace")
    .map((memory, index) => `${index + 1}. ${memory.statement}`)
    .slice(0, 200)
    .join("\n");
  return workspaceCandidates || "(none)";
}

async function runGlobalConsolidationPass(
  context: DreamContext,
  provider: IntelligenceProvider,
  agentPack: RuntimeStageAgentPackConfig | undefined,
  globalExtractor: { name: string } | undefined,
  runDir: string,
  orientationPath: string,
): Promise<void> {
  if (!globalExtractor) return;

  const specialistPrompt = await loadStageTemplate(
    context.workspaceDir,
    "prompts/stages/consolidation/global-specialist.md",
    "(missing consolidation global specialist prompt)",
  );
  const mainPrompt = await loadStageTemplate(
    context.workspaceDir,
    "prompts/stages/consolidation/global-main.md",
    "(missing consolidation global main prompt)",
  );
  const finalVerdictPrompt = await loadStageTemplate(
    context.workspaceDir,
    "prompts/stages/consolidation/global-finalize.md",
    "(missing consolidation global finalize prompt)",
  );
  const retryPrompt = await loadStageTemplate(
    context.workspaceDir,
    "prompts/stages/consolidation/global-retry.md",
    "(missing consolidation global retry prompt)",
  );

  const { tools, applyChanges, hasFinalVerdict, getFinalVerdict } =
    createConsolidationTools(
      context.memories,
      context.nowIso,
      context.insights,
      context.events,
      context.runId,
      context.workspaceDir,
      runDir,
      "global",
    );

  const specialistPromptWithCandidates = `${specialistPrompt}\n\nWorkspace-scope memories available for generalization:\n${formatGlobalCandidateMemories(context)}`;

  const specialistOutput = await provider.runAgent(
    specialistPromptWithCandidates,
    tools,
    {
    streamTag: "consolidation global specialist",
    selectedAgent: GLOBAL_EXTRACTOR_NAME,
    customAgents: [globalExtractor],
    defaultAgent: agentPack?.defaultAgent,
    retries: [],
    },
  );

  const mainPromptWithFindings = `${mainPrompt}\n\nSpecialist findings:\n${specialistOutput || "(no findings)"}`;

  try {
    await provider.runAgent(mainPromptWithFindings, tools, {
      streamTag: "consolidation global main",
      retries: [retryPrompt],
      shouldRetry: async () => !hasFinalVerdict(),
      customAgents: [globalExtractor],
      defaultAgent: agentPack?.defaultAgent,
    });
  } catch (error) {
    context.diary.push(
      `consolidation:global_pass_error=${String(error).slice(0, 120)}`,
    );
  }

  if (!hasFinalVerdict()) {
    try {
      await requestConsolidationFinalVerdict(
        provider,
        tools,
        agentPack,
        [globalExtractor],
        finalVerdictPrompt,
      );
    } catch (error) {
      context.diary.push(
        `consolidation:global_pass_error=${String(error).slice(0, 120)}`,
      );
    }
  }

  if (!hasFinalVerdict()) {
    context.diary.push("consolidation:global_missing_final_verdict=1");
    throw new Error(
      "consolidation global pass missing required finalize_consolidation",
    );
  }

  const finalVerdict = getFinalVerdict();
  if (finalVerdict) {
    context.diary.push(
      `consolidation:global_final_status=${finalVerdict.status}`,
    );
  }

  applyChanges(context);
}

function formatInsights(insights: InsightRecord[]): string {
  if (!insights.length)
    return "(none - only review and prune existing memories)";
  return insights
    .map((insight, index) => {
      const parts = [
        `${index + 1}. statement: ${insight.statement}`,
        `   scope: ${insight.scope}`,
      ];
      if (insight.context?.category)
        parts.push(`   category: ${insight.context.category}`);
      if (insight.context?.tags?.length)
        parts.push(`   tags: ${insight.context.tags.join(", ")}`);
      if (insight.context?.rationale)
        parts.push(`   rationale: ${insight.context.rationale}`);
      if (insight.context?.appliesWhen)
        parts.push(`   applies_when: ${insight.context.appliesWhen}`);
      if (insight.capture?.horizon)
        parts.push(`   horizon: ${insight.capture.horizon}`);
      if (insight.capture?.expiresAt)
        parts.push(`   expires_at: ${insight.capture.expiresAt}`);
      if (insight.capture?.reason)
        parts.push(`   reason: ${insight.capture.reason}`);
      if (insight.capture?.references?.length) {
        const references = insight.capture.references
          .map((ref) => `${ref.kind}:${ref.value}`)
          .join("; ");
        parts.push(`   references: ${references}`);
      }
      if (insight.evidence?.length) {
        const evidence = insight.evidence
          .map((item) => {
            const fields: string[] = [];
            if (item.sessionId) fields.push(`session_id=${item.sessionId}`);
            if (item.fromMessage) fields.push(`from=${item.fromMessage}`);
            if (item.toMessage) fields.push(`to=${item.toMessage}`);
            return fields.length ? fields.join(" ") : "unscoped";
          })
          .join("; ");
        parts.push(`   evidence: ${evidence}`);
      }
      return parts.join("\n");
    })
    .join("\n");
}

async function loadPrompt(
  workspaceDir: string,
  insights: InsightRecord[],
  orientationPath: string,
): Promise<string> {
  const insightList = insights.length
    ? formatInsights(insights)
    : "(none - only review and prune existing memories)";
  try {
    const template = await loadStageTemplate(
      workspaceDir,
      "prompts/consolidation-stage.md",
      "(missing consolidation workspace prompt)",
    );
    return template
      .replace("{{insights}}", insightList)
      .replace("{{orientation_path}}", orientationPath);
  } catch {
    return "(missing consolidation workspace prompt)";
  }
}

export class ConsolidationStage implements PipelineStage {
  readonly id = "stage.consolidation";

  constructor(
    private readonly provider: IntelligenceProvider,
    private readonly agentPack?: RuntimeStageAgentPackConfig,
  ) {}

  async run(context: DreamContext): Promise<DreamContext> {
    // Remove autogenerated noise from previous runs
    const priorCount = context.memories.length;
    context.memories = context.memories.filter(
      (m) => !m.statement.startsWith("Observed "),
    );
    const removedNoise = priorCount - context.memories.length;
    if (removedNoise > 0)
      context.diary.push(
        `consolidation:removed-noise-memories=${removedNoise}`,
      );

    if (context.insights.length === 0 && context.memories.length === 0)
      return context;

    const runDir = join(
      workspaceStorageDir(context.workspaceDir),
      "runs",
      context.runId,
    );
    const orientationPath = join(runDir, "orientation.md");
    const { tools, applyChanges, hasFinalVerdict, getFinalVerdict } =
      createConsolidationTools(
        context.memories,
        context.nowIso,
        context.insights,
        context.events,
        context.runId,
        context.workspaceDir,
        runDir,
        "workspace",
      );
    const prompt = await loadPrompt(context.workspaceDir, context.insights, orientationPath);
    const customAgents = await buildConsolidationCustomAgents(
      this.agentPack,
      context.workspaceDir,
      runDir,
      orientationPath,
    );
    const { prePass: prePassAgents, globalExtractor } =
      splitGlobalExtractor(customAgents);

    try {
      await runConsolidationAgentPasses(
        this.provider,
        prompt,
        tools,
        this.agentPack,
        prePassAgents,
        () => !hasFinalVerdict(),
      );
    } catch (error) {
      context.diary.push(
        `consolidation:agent_error=${String(error).slice(0, 120)}`,
      );
    }

    if (!hasFinalVerdict()) {
      try {
        await requestConsolidationFinalVerdict(
          this.provider,
          tools,
          this.agentPack,
          prePassAgents,
        );
      } catch (error) {
        context.diary.push(
          `consolidation:agent_error=${String(error).slice(0, 120)}`,
        );
      }
    }

    if (!hasFinalVerdict()) {
      context.diary.push("consolidation:missing_final_verdict=1");
      context.diary.push(
        "consolidation:user_message=Consolidation must call finalize_consolidation to finish.",
      );
      throw new Error(
        "consolidation stage missing required finalize_consolidation",
      );
    }

    const finalVerdict = getFinalVerdict();
    if (finalVerdict) {
      context.diary.push(`consolidation:final_status=${finalVerdict.status}`);
    }

    applyChanges(context);
    context.diary.push(
      `consolidation:memories_added=${context.metrics.memoriesAdded}`,
    );

    await runGlobalConsolidationPass(
      context,
      this.provider,
      this.agentPack,
      globalExtractor,
      runDir,
      orientationPath,
    );

    return context;
  }
}
