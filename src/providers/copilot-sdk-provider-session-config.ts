import type { CopilotSdkProviderOptions } from "./copilot-sdk-provider.js";

export function buildProviderSessionConfig(options: CopilotSdkProviderOptions, workingDirectory?: string) {
  const resolvedWorkingDirectory = workingDirectory ?? options.sessionConfig.workingDirectory;
  return {
    model: options.model,
    ...(options.sessionConfig.provider ? { provider: options.sessionConfig.provider } : {}),
    ...(options.sessionConfig.gitHubToken ? { gitHubToken: options.sessionConfig.gitHubToken } : {}),
    ...(options.sessionConfig.infiniteSessions ? { infiniteSessions: options.sessionConfig.infiniteSessions } : {}),
    ...(options.sessionConfig.modelCapabilities ? { modelCapabilities: options.sessionConfig.modelCapabilities } : {}),
    ...(typeof options.sessionConfig.streaming === "boolean" ? { streaming: options.sessionConfig.streaming } : {}),
    ...(typeof options.sessionConfig.includeSubAgentStreamingEvents === "boolean"
      ? { includeSubAgentStreamingEvents: options.sessionConfig.includeSubAgentStreamingEvents }
      : {}),
    ...(typeof options.sessionConfig.enableConfigDiscovery === "boolean"
      ? { enableConfigDiscovery: options.sessionConfig.enableConfigDiscovery }
      : {}),
    ...(options.sessionConfig.configDir ? { configDir: options.sessionConfig.configDir } : {}),
    ...(resolvedWorkingDirectory ? { workingDirectory: resolvedWorkingDirectory } : {}),
    ...(options.sessionConfig.skillDirectories ? { skillDirectories: options.sessionConfig.skillDirectories } : {}),
    ...(options.sessionConfig.disabledSkills ? { disabledSkills: options.sessionConfig.disabledSkills } : {})
  };
}