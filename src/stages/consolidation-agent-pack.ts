import type {
  IntelligenceProvider,
  RunAgentCustomAgentConfig,
} from "../core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { runStageAgentPack } from "./stage-agent-pack-execution.js";
import {
  loadStageTemplate,
  renderStageTemplate,
} from "./stage-agent-templates.js";

export async function buildConsolidationCustomAgents(
  agentPack: RuntimeStageAgentPackConfig | undefined,
  workspaceDir: string,
  runDir: string,
  orientationPath: string,
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
          "(missing consolidation specialist prompt)",
        ),
        { run_dir: runDir, orientation_path: orientationPath },
      ),
    })),
  );
}

export async function runConsolidationAgentPasses(
  provider: IntelligenceProvider,
  prompt: string,
  tools: unknown[],
  agentPack: RuntimeStageAgentPackConfig | undefined,
  customAgents: RunAgentCustomAgentConfig[] | undefined,
  retries: string[],
  shouldRetry?: () => boolean | Promise<boolean>,
): Promise<void> {
  await runStageAgentPack({
    provider,
    prompt,
    tools,
    streamTag: "consolidation main",
    retries,
    shouldRetry,
    customAgents,
    defaultAgent: agentPack?.defaultAgent,
    agentPack,
  });
}

export async function requestConsolidationFinalVerdict(
  provider: IntelligenceProvider,
  tools: unknown[],
  agentPack: RuntimeStageAgentPackConfig | undefined,
  customAgents: RunAgentCustomAgentConfig[] | undefined,
  insistPrompt: string,
): Promise<void> {
  const runOptions = {
    streamTag: "consolidation agent",
    defaultAgent: agentPack?.defaultAgent,
    retries: [],
  };
  await provider.runAgent(insistPrompt, tools, runOptions);
}
