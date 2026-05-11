import type {
  CopilotSdkAuthMode,
  CopilotSdkProviderMode,
  CopilotSdkProviderType,
  CopilotSdkWireApi,
  RuntimeManifest
} from "../dream/runtime-manifest.js";

export type SetupOptions = {
  interactive?: boolean;
  adapter?: string;
  adapterPath?: string;
  backend?: string;
  providerMode?: CopilotSdkProviderMode;
  authMode?: CopilotSdkAuthMode;
  model?: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  providerType?: CopilotSdkProviderType;
  wireApi?: CopilotSdkWireApi;
  contextLength?: string;
  promptTokens?: string;
  maxSubagentParallelism?: string;
  githubHost?: string;
  pluginPath?: string[];
  providerId?: string;
  stageOrder?: string;
  verify?: boolean;
  yes?: boolean;
};

export type SetupAnswers = Required<Pick<SetupOptions, "providerMode" | "authMode" | "providerType" | "wireApi">> & {
  adapter: string;
  backend: string;
  model: string;
  baseUrl?: string;
  baseUrlEnv?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  contextLength?: number;
  promptTokens?: number;
  maxSubagentParallelism?: number;
  githubHost?: string;
  pluginPaths: string[];
  providerId: string;
  stageOrder?: string[];
  verify: boolean;
};

export type EnvWrite = {
  name: string;
  value: string;
};

export const BUILT_IN_STAGE_ORDER = [
  "stage.orientation",
  "stage.signal",
  "stage.consolidation",
  "stage.documentation",
  "stage.skills",
  "stage.governance",
  "stage.observability"
];

export const ADAPTERS = [
  { id: "adapter.copilot.debug", label: "Copilot debug sessions" },
  { id: "adapter.codex.trace", label: "Codex history" },
  { id: "adapter.claude.code", label: "Claude Code history" },
  { id: "adapter.jsonl.event", label: "Custom JSONL event file" },
  { id: "custom", label: "Custom adapter plugin" }
];

export const BACKENDS = [
  { id: "backend.file.memory", label: "Local Dreamer memory file" },
  { id: "backend.copilot.memory", label: "VS Code/Copilot-style local memory file" },
  { id: "backend.honcho.memory", label: "Honcho" },
  { id: "custom", label: "Custom memory plugin" }
];

export type SetupRuntime = RuntimeManifest;