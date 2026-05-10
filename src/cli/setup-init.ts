import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { runtimeManifestPath } from "../dream/runtime-manifest.js";
import { resolveAssetPath } from "../dream/dreamer-home.js";
import { ttyWriteLine, ttyWriteTagged } from "../shared/tty-log-format.js";
import { buildEnvSnapshot, collectProviderEnvVarNames, envValueSource } from "./env.js";
import { pathExists } from "./shared.js";

export async function runSetupInit(workspaceDir: string, writeEnv: boolean): Promise<void> {
  const runtimePath = runtimeManifestPath(workspaceDir);
  const envNames = collectProviderEnvVarNames(workspaceDir);
  const envSnapshot = await buildEnvSnapshot(workspaceDir);
  const envPath = join(workspaceDir, ".env.local");

  // Bootstrap runtime.json from bundled defaults if missing
  if (!(await pathExists(runtimePath))) {
    await mkdir(join(runtimePath, ".."), { recursive: true });
    const defaultConfig = readFileSync(resolveAssetPath("runtime-defaults.json"), "utf8");
    await writeFile(runtimePath, defaultConfig, "utf8");
    ttyWriteTagged("setup", `created runtime config at ${runtimePath}`);
  }

  ttyWriteTagged("setup", "summary");
  ttyWriteLine(`- runtime config: ${runtimePath}`);
  ttyWriteLine(`- env file: ${envPath} (${(await pathExists(envPath)) ? "present" : "missing"})`);
  ttyWriteLine(`- provider env vars referenced: ${envNames.length}`);

  for (const name of envNames) {
    const source = envValueSource(name, envSnapshot);
    if (source === "process") ttyWriteLine(`  - ${name}: set (process env)`);
    else if (source === "dotenv") ttyWriteLine(`  - ${name}: set (.env.local)`);
    else ttyWriteLine(`  - ${name}: unset`);
  }

  if (!writeEnv) {
    ttyWriteLine("\nTip: run setup init with --write-env to append missing placeholders to .env.local.");
    return;
  }

  let existing = "";
  try {
    existing = await readFile(envPath, "utf8");
  } catch {
    existing = "";
  }

  const declared = new Set<string>();
  for (const line of existing.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match?.[1]) declared.add(match[1]);
  }

  const missing = envNames.filter((name) => !declared.has(name));
  if (!missing.length) {
    ttyWriteLine("\nNo missing env placeholders. .env.local already declares all referenced vars.");
    return;
  }

  const block = ["", "# Added by dreamer setup init", ...missing.map((name) => `${name}=`)].join("\n");
  await appendFile(envPath, block, "utf8");
  ttyWriteLine(`\nAppended ${missing.length} placeholder entries to ${envPath}.`);
}
