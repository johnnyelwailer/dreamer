import { Command } from "commander";
import { cwd } from "node:process";
import { runDream } from "./dream/run-dream.js";
import { runScheduled } from "./dream/schedule.js";
import { registerInspectCommand } from "./cli/inspect-command.js";
import { runMetricsSummary, runObservabilitySummary } from "./cli/reports.js";
import { registerSetupCommand } from "./cli/setup-command.js";

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

registerSetupCommand(program);

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

registerInspectCommand(program);

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exitCode = 1;
} else {
  await program.parseAsync(process.argv);
}
