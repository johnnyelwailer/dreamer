import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readEvalCases, readRuntimeManifest } from "../src/dream/runtime-manifest.js";
import {
  COPILOT_SDK_PROVIDER_REQUEST_FAILED,
  CopilotSdkProvider
} from "../src/providers/copilot-sdk-provider.js";
import { readDreamConfig } from "../src/dream/config.js";
import { createTtyStatus } from "../src/shared/tty-progress.js";

type EvalResult = {
  id: string;
  latencyMs: number;
  passed: boolean;
  missing: string[];
  output: string;
  error?: string;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Eval request timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function main(): Promise<void> {
  const workspaceDir = process.cwd();
  const config = readDreamConfig(workspaceDir);
  const runtime = readRuntimeManifest(workspaceDir);
  const model = config.copilotSdkModel;
  const evalCases = readEvalCases(workspaceDir, runtime);
  const provider = new CopilotSdkProvider(config.copilotSdkProviderOptions);
  const status = createTtyStatus("[eval:copilot-sdk]");

  try {
    status.update(`start cases=${evalCases.length} model=${model}`);
    const results: EvalResult[] = [];
    for (const [index, test] of evalCases.entries()) {
      status.update(`case ${index + 1}/${evalCases.length} ${test.id}`);
      const started = Date.now();
      let output = "";
      let lastError = "";
      for (let attempt = 1; attempt <= runtime.eval.maxAttempts; attempt += 1) {
        try {
          output = await status.track(`case ${index + 1}/${evalCases.length} ${test.id} · attempt ${attempt}/${runtime.eval.maxAttempts}`, withTimeout(provider.summarize(test.prompt), runtime.eval.requestTimeoutMs));
          if (output && output !== COPILOT_SDK_PROVIDER_REQUEST_FAILED) break;
          lastError = output;
        } catch (error) {
          lastError = String(error);
        }
      }

      const lowered = output.toLowerCase();
      const missing = output
        ? test.mustContain.filter((token) => !lowered.includes(token.toLowerCase()))
        : [...test.mustContain];
      results.push({
        id: test.id,
        latencyMs: Date.now() - started,
        passed: output.length > 0 && missing.length === 0,
        missing,
        output,
        error: output ? undefined : lastError || "No response text returned"
      });
      status.update(`case done ${test.id} passed=${String(results.at(-1)?.passed ?? false)}`);
    }

    const passed = results.filter((result) => result.passed).length;
    const summary = {
      provider: "copilot-sdk-byok",
      baseUrl: "configured-via-env",
      model,
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };

    const outPath = join(workspaceDir, runtime.eval.reportPath);
    const reportsDir = dirname(outPath);
    await mkdir(reportsDir, { recursive: true });
    await writeFile(outPath, JSON.stringify(summary, null, 2), "utf8");

    console.log(JSON.stringify(summary, null, 2));
    console.log(`saved_eval_report=${outPath}`);
    status.done(`finished passed=${passed}/${results.length}`);
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await provider.dispose();
  }
}

await main();
