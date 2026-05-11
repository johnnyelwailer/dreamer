export type CopilotSdkAuthMode = "none" | "logged-in-user" | "github-token" | "session-github-token";
export type CopilotSdkProviderMode = "copilot" | "byok";
export type CopilotSdkProviderType = "openai" | "azure" | "anthropic";
export type CopilotSdkWireApi = "completions" | "responses";
export type DiscoveryMode = "append" | "override";

export type RuntimeCopilotSdkByokConfig = {
  type: CopilotSdkProviderType;
  wireApi: CopilotSdkWireApi;
  baseUrl?: string;
  baseUrlEnvVar?: string;
  fallbackBaseUrlEnvVar?: string;
  apiKeyEnvVar?: string;
  fallbackApiKeyEnvVar?: string;
  bearerTokenEnvVar?: string;
  headers?: Record<string, string>;
  azureApiVersion?: string;
};

export type RuntimeCopilotSdkConfig = {
  authMode: CopilotSdkAuthMode;
  providerMode: CopilotSdkProviderMode;
  requestTimeoutMs: number;
  maxSubagentParallelism?: number;
  infiniteSessionsEnabled?: boolean;
  gitHubTokenEnvVar?: string;
  sessionGitHubTokenEnvVar?: string;
  cliPathEnvVar?: string;
  cliUrlEnvVar?: string;
  clientExtraEnvVars: string[];
  byok?: RuntimeCopilotSdkByokConfig;
};

type RuntimeProviderConfig = {
  id: string;
  defaultModel: string;
  sdk: RuntimeCopilotSdkConfig;
};

type RuntimePipelineConfig = {
  stageOrder: string[];
  agentPacks?: Record<string, RuntimeStageAgentPackConfig>;
};

export type RuntimeDefaultAgentConfig = {
  excludedTools: string[];
};

export type RuntimeCustomAgentConfig = {
  name: string;
  displayName?: string;
  description?: string;
  tools?: string[] | null;
  promptTemplatePath: string;
  infer?: boolean;
};

export type RuntimeAgentPackExecutionConfig = {
  mode: "inferred" | "explicit-sequence";
  explicitSequence?: string[];
};

export type RuntimeStageAgentPackConfig = {
  defaultAgent?: RuntimeDefaultAgentConfig;
  customAgents: RuntimeCustomAgentConfig[];
  execution?: RuntimeAgentPackExecutionConfig;
};

type RuntimeDocsConfig = {
  outputRootPath: string;
  fallbackOutputPath: string;
  promptTemplatePath: string;
  improvementHintsPath: string;
  maxSignals: number;
  maxMemories: number;
  maxEvents: number;
};

export type DreamQualityDimensionConfig = {
  id: string;
  description: string;
  weight: number;
};

export type DreamQualityRubricConfig = {
  judgePromptTemplatePath: string;
  dimensions: DreamQualityDimensionConfig[];
};

type RuntimeQualityEvalConfig = {
  rubricPath: string;
  reportPath: string;
  selfImproveReportPath: string;
  minPassingScore: number;
  maxHintsToPersist: number;
};

type RuntimeEvalConfig = {
  casesPath: string;
  reportPath: string;
  requestTimeoutMs: number;
  maxAttempts: number;
  quality: RuntimeQualityEvalConfig;
};

export type RuntimeDiscoverySourceConfig = {
  mode: DiscoveryMode;
  searchPaths: string[];
  lookbackDays?: number;
  maxSessionsPerRun?: number;
};

type RuntimeDiscoveryConfig = {
  copilotDebug?: RuntimeDiscoverySourceConfig;
  claudeCode?: RuntimeDiscoverySourceConfig;
  codexTrace?: RuntimeDiscoverySourceConfig;
};

type RuntimePluginsConfig = {
  paths: string[];
};

export type RuntimeManifest = {
  provider: RuntimeProviderConfig;
  pipeline: RuntimePipelineConfig;
  docs: RuntimeDocsConfig;
  eval: RuntimeEvalConfig;
  discovery?: RuntimeDiscoveryConfig;
  plugins?: RuntimePluginsConfig;
};

export type EvalCaseConfig = {
  id: string;
  prompt: string;
  mustContain: string[];
};
