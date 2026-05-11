import type {
  IntelligenceProvider,
  RunAgentCustomAgentConfig,
  RunAgentDefaultAgentConfig
} from "../core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";

type StageAgentPackExecutionInput = {
  provider: IntelligenceProvider;
  prompt: string;
  tools: unknown[];
  streamTag: string;
  retries?: string[];
  shouldRetry?: () => boolean | Promise<boolean>;
  customAgents?: RunAgentCustomAgentConfig[];
  defaultAgent?: RunAgentDefaultAgentConfig;
  agentPack?: RuntimeStageAgentPackConfig;
};

function explicitSequence(
  agentPack: RuntimeStageAgentPackConfig | undefined,
  customAgents: RunAgentCustomAgentConfig[] | undefined
): string[] {
  if (!agentPack?.execution || agentPack.execution.mode !== "explicit-sequence") return [];
  const configured = new Set((customAgents ?? []).map((agent) => agent.name));
  const sequence = agentPack.execution.explicitSequence ?? [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of sequence) {
    if (!configured.has(name) || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

export async function runStageAgentPack(input: StageAgentPackExecutionInput): Promise<void> {
  const sequence = explicitSequence(input.agentPack, input.customAgents);

  for (const [index, agentName] of sequence.entries()) {
    const specialistPrompt = [
      `Specialist pass ${index + 1}/${sequence.length}: ${agentName}.`,
      "Run your specialist review and return findings for the main stage agent.",
      "Do not call finalization tools in this pass.",
      "Stage context:",
      input.prompt
    ].join("\n\n");

    await input.provider.runAgent(specialistPrompt, input.tools, {
      streamTag: `${input.streamTag} specialist:${agentName}`,
      selectedAgent: agentName,
      customAgents: input.customAgents,
      defaultAgent: input.defaultAgent,
      retries: []
    });
  }

  await input.provider.runAgent(input.prompt, input.tools, {
    streamTag: input.streamTag,
    retries: input.retries,
    shouldRetry: input.shouldRetry
      ? async () => await input.shouldRetry?.()
      : undefined,
    customAgents: input.customAgents,
    defaultAgent: input.defaultAgent
  });
}
