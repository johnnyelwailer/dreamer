import chalk from "chalk";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { runtimeManifestPath } from "../dream/runtime-manifest.js";
import { ttyWriteLine } from "../shared/tty-log-format.js";
import { collectInteractive, collectNonInteractive } from "./setup-wizard-answers.js";
import { ensureRuntimeManifest, applyAnswers, envWrites, upsertEnvFile, verifyProvider } from "./setup-wizard-runtime.js";
import { isInteractive } from "./setup-wizard-shared.js";
import { BUILT_IN_STAGE_ORDER, type SetupOptions } from "./setup-wizard-types.js";

export async function runSetupWizard(workspaceDir: string, options: SetupOptions): Promise<void> {
  const runtime = await ensureRuntimeManifest(workspaceDir);
  const answers = isInteractive(options) ? await collectInteractive(runtime) : collectNonInteractive(options, runtime);
  const nextRuntime = applyAnswers(runtime, answers);
  const runtimePath = runtimeManifestPath(workspaceDir);

  await mkdir(join(runtimePath, ".."), { recursive: true });
  await writeFile(runtimePath, `${JSON.stringify(nextRuntime, null, 2)}\n`, "utf8");
  await upsertEnvFile(workspaceDir, envWrites(answers));

  ttyWriteLine(chalk.bold("\nSetup complete"));
  ttyWriteLine(`- runtime config: ${relative(workspaceDir, runtimePath)}`);
  ttyWriteLine(`- context provider: ${answers.adapter}`);
  ttyWriteLine(`- dream pipeline: ${(answers.stageOrder ?? BUILT_IN_STAGE_ORDER).join(",")}`);
  ttyWriteLine(
    `- intelligence: ${
      answers.providerId === "provider.copilot.sdk"
        ? `${answers.providerMode}/${answers.authMode} model=${answers.model}`
        : `${answers.providerId} (plugin)`
    }`
  );
  ttyWriteLine(`- memory: ${answers.backend}`);

  if (answers.verify && answers.providerId !== "provider.copilot.sdk") {
    ttyWriteLine("- verification: skipped for custom provider plugins");
  } else if (answers.verify) {
    const message = await verifyProvider(workspaceDir, nextRuntime, answers.model).catch((error) => {
      return `fail: ${error instanceof Error ? error.message : String(error)}`;
    });
    ttyWriteLine(`- verification: ${message}`);
    if (message.startsWith("fail:")) process.exitCode = 1;
  } else {
    ttyWriteLine("- verification: skipped");
  }
}
