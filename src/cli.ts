import { Command } from "commander";
import { cwd } from "node:process";
import { runDream } from "./dream/run-dream.js";
import { runScheduled } from "./dream/schedule.js";
import { runSetupInit } from "./cli/setup-init.js";
import { runSetupDoctor } from "./cli/setup-doctor.js";
import { runSetupWizard } from "./cli/setup-wizard.js";
import { runMetricsSummary, runObservabilitySummary } from "./cli/reports.js";
import { runInspectMemories } from "./cli/inspect-memories.js";
import { runInspectInsights } from "./cli/inspect-insights.js";

const program = new Command();
program.name("dreamer").description("Agentic dreaming system");
program.showHelpAfterError();
program.showSuggestionAfterError();

program
  .command("run")
  .description("Run one dream cycle")
  .option("--replay-from-start", "ignore saved cursor and ingest from the start")
  .option("--no-persist-state", "do not write .dreamer/state.json after this run")
  .option("--max-sessions <count|all>", "process at most N sessions per run (or all)")
  .option("--since-days <days>", "only include sessions active in the last N days")
  .action(async (options: { replayFromStart?: boolean; persistState?: boolean; maxSessions?: string; sinceDays?: string }) => {
    let maxSessions: number | "all" | undefined;
    if (options.maxSessions?.toLowerCase() === "all") {
      maxSessions = "all";
    } else if (options.maxSessions) {
      const parsed = Number.parseInt(options.maxSessions, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("--max-sessions must be a positive integer or 'all'.");
      }
      maxSessions = parsed;
    }

    const sinceDays = options.sinceDays ? Number.parseFloat(options.sinceDays) : undefined;
    if (sinceDays !== undefined && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
      throw new Error("--since-days must be a positive number.");
    }

    await runDream(cwd(), {
      replayFromStart: options.replayFromStart,
      persistState: options.persistState,
      maxSessions,
      sinceDays
    });
  });

program
  .command("schedule")
  .description("Run scheduled dream cycles")
  .option("--interval-ms <number>", "interval in milliseconds", "86400000")
  .option("--once", "run once and exit", false)
  .action(async (options: { intervalMs: string; once: boolean }) => {
    const interval = Number(options.intervalMs);
    await runScheduled(cwd(), interval, options.once);
  });

const setupCommand = program.command("setup").description("Setup, integration checks, and provider onboarding helpers");

setupCommand
  .option("--yes", "run non-interactively with defaults and provided flags", false)
  .option("--adapter <id>", "context provider adapter id")
  .option("--adapter-path <path>", "plugin path that provides a custom adapter")
  .option("--backend <id>", "memory backend id")
  .option("--provider-mode <mode>", "copilot|byok")
  .option("--auth-mode <mode>", "none|logged-in-user|github-token|session-github-token")
  .option("--model <model>", "default model id")
  .option("--base-url <url>", "BYOK endpoint base URL")
  .option("--base-url-env <name>", "env var that provides the BYOK endpoint base URL")
  .option("--api-key <key>", "BYOK API key to write to .env.local")
  .option("--api-key-env <name>", "env var that provides the BYOK API key")
  .option("--provider-type <type>", "openai|azure|anthropic")
  .option("--wire-api <api>", "completions|responses")
  .option("--context-length <tokens>", "model context window tokens")
  .option("--prompt-tokens <tokens>", "max prompt tokens")
  .option("--github-host <host>", "GitHub Enterprise host")
  .option("--plugin-path <path>", "plugin path to add; repeatable", (value, previous: string[] = []) => [...previous, value], [])
  .option("--provider-id <id>", "intelligence provider id")
  .option("--stage-order <ids>", "comma-separated pipeline stage ids")
  .option("--verify", "run provider verification after writing config", false)
  .option("--no-verify", "skip provider verification")
  .action(async (options) => {
    await runSetupWizard(cwd(), {
      ...options,
      interactive: process.argv.slice(2).length === 1 && process.argv[2] === "setup"
    });
  });

setupCommand
  .command("init")
  .description("Show setup summary and optionally write missing provider env placeholders")
  .option("--write-env", "append missing provider env placeholders to .env.local", false)
  .action(async (options: { writeEnv: boolean }) => {
    await runSetupInit(cwd(), options.writeEnv);
  });

setupCommand
  .command("doctor")
  .description("Run integration/provider diagnostics against current runtime config")
  .option("--strict", "treat warnings as failures", false)
  .action(async (options: { strict: boolean }) => {
    await runSetupDoctor(cwd(), options.strict);
  });

program
  .command("metrics")
  .description("Show numeric run counters from reports/metrics.json")
  .action(async () => {
    await runMetricsSummary(cwd());
  });

program
  .command("status")
  .description("Show report file status and latest run metadata")
  .action(async () => {
    await runObservabilitySummary(cwd());
  });

const inspectCommand = program.command("inspect").description("Inspect memories and generated insights");

inspectCommand
  .command("memories")
  .description("Inspect memory records from local backends")
  .option("--source <source>", "file|copilot|honcho|all", "all")
  .option("--scope <scope>", "user|workspace|session")
  .option("--limit <number>", "maximum rows", "20")
  .option("--prune-noise", "remove autogenerated Observed* noise before listing", false)
  .option("--json", "print raw JSON", false)
  .action(async (options: { source: "file" | "copilot" | "honcho" | "all"; scope?: "user" | "workspace" | "session"; limit: string; pruneNoise: boolean; json: boolean }) => {
    await runInspectMemories(cwd(), {
      source: options.source,
      scope: options.scope,
      limit: Number(options.limit),
      contradictionsOnly: false,
      pruneNoise: options.pruneNoise,
      json: options.json
    });
  });

inspectCommand
  .command("contradictions")
  .description("Inspect only contradictory memory records")
  .option("--source <source>", "file|copilot|honcho|all", "all")
  .option("--limit <number>", "maximum rows", "20")
  .option("--prune-noise", "remove autogenerated Observed* noise before listing", false)
  .option("--json", "print raw JSON", false)
  .action(async (options: { source: "file" | "copilot" | "honcho" | "all"; limit: string; pruneNoise: boolean; json: boolean }) => {
    await runInspectMemories(cwd(), {
      source: options.source,
      limit: Number(options.limit),
      contradictionsOnly: true,
      pruneNoise: options.pruneNoise,
      json: options.json
    });
  });

inspectCommand
  .command("insights")
  .description("Inspect latest evaluation and pipeline insights")
  .option("--json", "print raw JSON", false)
  .action(async (options: { json: boolean }) => {
    await runInspectInsights(cwd(), options.json);
  });

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exitCode = 1;
} else {
  await program.parseAsync(process.argv);
}
