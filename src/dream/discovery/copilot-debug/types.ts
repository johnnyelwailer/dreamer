export type CopilotDiscoveryDeps = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  homeDir: string;
  exists: (path: string) => boolean;
  readdir: (path: string) => string[];
  mtimeMs: (path: string) => number;
};

export type CopilotDiscoveryMode = "append" | "override";

export type CopilotDiscoveryOptions = {
  searchPaths?: string[];
  mode?: CopilotDiscoveryMode;
  lookbackDays?: number;
};

export type DiscoveredCopilotSession = {
  sessionId: string;
  path: string;
  workspaceDir?: string;
  mainJsonlPath: string;
  transcriptPath?: string;
  mainMtimeMs: number;
  transcriptMtimeMs: number;
  activityMs: number;
  richnessScore: number;
  transcriptLineCount: number;
};
