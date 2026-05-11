import type {
  IntelligenceProvider,
  RunAgentCustomAgentConfig
} from "../core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { loadStageTemplate, renderStageTemplate } from "./stage-agent-templates.js";
import { runStageAgentPack } from "./stage-agent-pack-execution.js";

const CONSOLIDATION_RETRY =
  "Continue from specialist review. Delegate to specialists if more evidence is needed, then call write_memory/remove_memory for final changes and finalize_consolidation before finishing.";

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
  customAgents: RunAgentCustomAgentConfig[] | undefined,
  shouldRetry?: () => boolean | Promise<boolean>
): Promise<void> {
  await runStageAgentPack({
    provider,
    prompt,
    tools,
    streamTag: "consolidation main",
    retries: [CONSOLIDATION_RETRY],
    shouldRetry,
    customAgents,
    defaultAgent: agentPack?.defaultAgent,
    agentPack
  });
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
    defaultAgent: agentPack?.defaultAgent,
    retries: []
  };
  await provider.runAgent(insistPrompt, tools, runOptions);
}
