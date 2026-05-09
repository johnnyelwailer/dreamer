import { Command } from "commander";
import { cwd } from "node:process";
import { runDream } from "./dream/run-dream.js";
import { runScheduled } from "./dream/schedule.js";
import { runSetupInit } from "./cli/setup-init.js";
import { runSetupDoctor } from "./cli/setup-doctor.js";
import { runMetricsSummary, runObservabilitySummary } from "./cli/reports.js";

const program = new Command();
program.name("dreamer").description("Agentic dreaming system");
program.showHelpAfterError();
program.showSuggestionAfterError();

program
  .command("run")
  .description("Run one dream cycle")
  .option("--replay-from-start", "ignore saved cursor and ingest from the start")
  .option("--no-persist-state", "do not write .dreamer/state.json after this run")
  .action(async (options: { replayFromStart?: boolean; persistState?: boolean }) => {
    await runDream(cwd(), {
      replayFromStart: options.replayFromStart,
      persistState: options.persistState
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
  .description("Show latest metrics from reports/metrics.json")
  .action(async () => {
    await runMetricsSummary(cwd());
  });

program
  .command("observability")
  .description("Show observability artifact status and latest run metadata")
  .action(async () => {
    await runObservabilitySummary(cwd());
  });

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exitCode = 1;
} else {
  await program.parseAsync(process.argv);
}
