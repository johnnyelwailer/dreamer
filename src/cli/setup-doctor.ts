import { join, relative } from "node:path";
import { readDreamConfig } from "../dream/config.js";
import { workspaceStorageDir } from "../dream/dreamer-home.js";
import { readRuntimeManifest, runtimeManifestPath } from "../dream/runtime-manifest.js";
import { ttyWriteLine } from "../shared/tty-log-format.js";
import { buildEnvSnapshot, collectProviderEnvVarNames, envValue, envValueSource } from "./env.js";
import { type HealthCheck, pathExists, printChecks } from "./shared.js";

function sourcePathForAdapter(adapterId: string, config: ReturnType<typeof readDreamConfig>): string {
  if (adapterId === "adapter.copilot.debug") return config.copilotDebugSessionDir;
  if (adapterId === "adapter.jsonl.event") return config.jsonlEventsPath;
  if (adapterId === "adapter.claude.code") return config.claudeCodePath;
  if (adapterId === "adapter.codex.trace") return config.codexTracePath;
  if (adapterId === "adapter.terminal.recording") return config.terminalCastPath;
  if (adapterId === "adapter.browser.trace") return config.browserHarPath;
  return "";
}

export async function runSetupDoctor(workspaceDir: string, strict: boolean): Promise<void> {
  const checks: HealthCheck[] = [];
  const envSnapshot = await buildEnvSnapshot(workspaceDir);
  const runtimePath = runtimeManifestPath(workspaceDir);
  checks.push({ status: (await pathExists(runtimePath)) ? "ok" : "fail", label: "runtime manifest", detail: relative(workspaceDir, runtimePath) });

  try {
    const runtime = readRuntimeManifest(workspaceDir);
    const config = readDreamConfig(workspaceDir);
    checks.push({ status: "ok", label: "provider", detail: runtime.provider.id });
    checks.push({ status: "ok", label: "provider mode", detail: runtime.provider.sdk.providerMode });
    checks.push({ status: "ok", label: "auth mode", detail: runtime.provider.sdk.authMode });
    checks.push({ status: "ok", label: "model", detail: config.copilotSdkModel });
    checks.push({ status: "ok", label: "adapter", detail: config.adapterId });
    checks.push({
      status: "ok",
      label: "backend",
      detail: config.backendIds.join(","),
    });

    const byok = runtime.provider.sdk.byok;
    const byokBaseUrl = byok
      ? byok.baseUrl ?? envValue(byok.baseUrlEnvVar, envSnapshot) ?? envValue(byok.fallbackBaseUrlEnvVar, envSnapshot)
      : undefined;
    if (runtime.provider.sdk.providerMode === "byok" && !byokBaseUrl) {
      checks.push({ status: "fail", label: "byok provider endpoint", detail: "missing resolved baseUrl" });
    } else if (runtime.provider.sdk.providerMode === "byok") {
      const source = byok?.baseUrl ? "runtime.json" : envValue(byok?.baseUrlEnvVar, envSnapshot) || envValue(byok?.fallbackBaseUrlEnvVar, envSnapshot) ? "env" : "unknown";
      checks.push({
        status: source === "runtime.json" ? "ok" : "warn",
        label: "byok provider endpoint",
        detail: source === "runtime.json" ? "resolved from runtime manifest" : "resolved from env; load env before running dream commands"
      });
    }

    const sourcePath = sourcePathForAdapter(config.adapterId, config);
    if (!sourcePath) checks.push({ status: "warn", label: "adapter source", detail: `unknown adapter id: ${config.adapterId}` });
    else {
      const absolute = sourcePath.startsWith("/") ? sourcePath : join(workspaceDir, sourcePath);
      checks.push({
        status: (await pathExists(absolute)) ? "ok" : "fail",
        label: "adapter source",
        detail: (await pathExists(absolute)) ? relative(workspaceDir, absolute) || "." : `missing: ${relative(workspaceDir, absolute) || absolute}`
      });
    }

    const envNames = collectProviderEnvVarNames(workspaceDir);
    if (!envNames.length) checks.push({ status: "ok", label: "provider env vars", detail: "none required by runtime manifest" });
    for (const name of envNames) {
      const source = envValueSource(name, envSnapshot);
      checks.push({
        status: source === "unset" ? "warn" : "ok",
        label: `env:${name}`,
        detail: source === "process" ? "set (process env)" : source === "dotenv" ? "set (.env.local, not exported)" : "unset"
      });
    }

    const reportsDir = join(workspaceStorageDir(workspaceDir), "reports");
    checks.push({ status: (await pathExists(reportsDir)) ? "ok" : "warn", label: "reports directory", detail: reportsDir });
  } catch (error) {
    checks.push({ status: "fail", label: "config parse", detail: error instanceof Error ? error.message : String(error) });
  }

  printChecks("Dreamer doctor", checks);
  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  ttyWriteLine(`\nSummary: ${failCount} fail, ${warnCount} warn.`);
  if (failCount > 0 || (strict && warnCount > 0)) process.exitCode = 1;
}
