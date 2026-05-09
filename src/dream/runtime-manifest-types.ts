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
};

type RuntimeDiscoveryConfig = {
  copilotDebug?: RuntimeDiscoverySourceConfig;
  claudeCode?: RuntimeDiscoverySourceConfig;
  codexTrace?: RuntimeDiscoverySourceConfig;
};

export type RuntimeManifest = {
  provider: RuntimeProviderConfig;
  pipeline: RuntimePipelineConfig;
  docs: RuntimeDocsConfig;
  eval: RuntimeEvalConfig;
  discovery?: RuntimeDiscoveryConfig;
};

export type EvalCaseConfig = {
  id: string;
  prompt: string;
  mustContain: string[];
};
