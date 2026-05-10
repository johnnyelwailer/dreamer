import type {
  IntelligenceProvider,
  RunAgentCustomAgentConfig
} from "../core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { loadStageTemplate, renderStageTemplate } from "./stage-agent-templates.js";

const CONSOLIDATION_RETRY =
  "Finish consolidation. Write any remaining memories, call remove_memory for contradictions, and call finalize_consolidation before finishing.";

export async function buildConsolidationCustomAgents(
  agentPack: RuntimeStageAgentPackConfig | undefined,
  workspaceDir: string,
  runDir: string,
  orientationPath: string
): Promise<RunAgentCustomAgentConfig[] | undefined> {
  if (!agentPack) return undefined;
  return Promise.all(
    agentPack.customAgents.map(async (agent) => ({
      name: agent.name,
      displayName: agent.displayName,
      description: agent.description,
      tools: agent.tools,
      infer: agent.infer,
      prompt: renderStageTemplate(
        await loadStageTemplate(
          workspaceDir,
          agent.promptTemplatePath,
          "Review all memories and produce consolidation recommendations."
        ),
        { run_dir: runDir, orientation_path: orientationPath }
      )
    }))
  );
}

export async function runConsolidationAgentPasses(
  provider: IntelligenceProvider,
  prompt: string,
  tools: unknown[],
  agentPack: RuntimeStageAgentPackConfig | undefined,
  customAgents: RunAgentCustomAgentConfig[] | undefined
): Promise<void> {
  const runOptions = {
    streamTag: "consolidation agent",
    retries: [CONSOLIDATION_RETRY],
    customAgents,
    defaultAgent: agentPack?.defaultAgent
  };
  const explicitSequence =
    agentPack?.execution?.mode === "explicit-sequence" ? agentPack.execution.explicitSequence ?? [] : [];

  if (customAgents && explicitSequence.length > 0) {
    const customAgentByName = new Map(customAgents.map((agent) => [agent.name, agent]));
    for (const agentName of explicitSequence) {
      const selectedAgent = customAgentByName.get(agentName);
      if (!selectedAgent) continue;
      await provider.runAgent(selectedAgent.prompt, tools, {
        ...runOptions,
        selectedAgent: agentName,
        retries: []
      });
    }
    return;
  }

  await provider.runAgent(prompt, tools, runOptions);
}

export async function requestConsolidationFinalVerdict(
  provider: IntelligenceProvider,
  tools: unknown[],
  agentPack: RuntimeStageAgentPackConfig | undefined,
  customAgents: RunAgentCustomAgentConfig[] | undefined
): Promise<void> {
  const insistPrompt = [
    "You attempted to finish consolidation without recording the required final verdict.",
    "Call finalize_consolidation now with status and summary to complete the stage.",
    "Do not finish without calling finalize_consolidation."
  ].join(" ");
  const runOptions = {
    streamTag: "consolidation agent",
    customAgents,
    defaultAgent: agentPack?.defaultAgent,
    retries: []
  };
  await provider.runAgent(insistPrompt, tools, runOptions);
}
