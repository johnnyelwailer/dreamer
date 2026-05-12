import type {
  IntelligenceProvider,
  RunAgentCustomAgentConfig,
  RunAgentDefaultAgentConfig
} from "../core/contracts.js";
import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";

type StageAgentPackExecutionInput = {
  provider: IntelligenceProvider;
  prompt: string;
  specialistContextPrompt?: string;
  tools: unknown[];
  streamTag: string;
  workingDirectory?: string;
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
  const specialistContext = input.specialistContextPrompt ?? input.prompt;
  const specialistFindings: Array<{ agentName: string; output: string }> = [];

  for (const [index, agentName] of sequence.entries()) {
    const specialistPrompt = [
      `Specialist pass ${index + 1}/${sequence.length}: ${agentName}.`,
      "Run your specialist review and return findings for the main stage agent.",
      "Do not call finalization tools in this pass.",
      "Keep output compact: max 12 bullet points and max 1200 words.",
      "Return only durable candidate memories and evidence references; omit narration.",
      "Stage context:",
      specialistContext
    ].join("\n\n");

    const output = await input.provider.runAgent(specialistPrompt, input.tools, {
      streamTag: `${input.streamTag} specialist:${agentName}`,
      workingDirectory: input.workingDirectory,
      selectedAgent: agentName,
      customAgents: input.customAgents,
      defaultAgent: input.defaultAgent,
      retries: []
    });
    specialistFindings.push({ agentName, output: output.trim() });
  }

  const findingsSection = specialistFindings
    .filter((finding) => finding.output.length > 0)
    .map((finding, index) => `Specialist ${index + 1} (${finding.agentName}) findings:\n${finding.output}`)
    .join("\n\n");
  const mainPrompt = findingsSection.length > 0
    ? `${input.prompt}\n\nUse the specialist findings below as your primary evidence.\n\n${findingsSection}`
    : input.prompt;

  await input.provider.runAgent(mainPrompt, input.tools, {
    streamTag: input.streamTag,
    workingDirectory: input.workingDirectory,
    retries: input.retries,
    shouldRetry: input.shouldRetry
      ? async () => await input.shouldRetry?.()
      : undefined,
    customAgents: input.customAgents,
    defaultAgent: input.defaultAgent
  });
}
