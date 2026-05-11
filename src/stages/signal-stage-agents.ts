import type { RuntimeStageAgentPackConfig } from "../dream/runtime-manifest.js";
import { loadStageTemplate, renderStageTemplate } from "./stage-agent-templates.js";

export async function buildSignalCustomAgents(
  workspaceDir: string,
  runDir: string,
  orientationPath: string,
  agentPack?: RuntimeStageAgentPackConfig
) {
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
  );
}