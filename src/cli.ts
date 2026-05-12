import { Command } from "commander";
import { cwd } from "node:process";
import { runDream } from "./dream/run-dream.js";
import { runScheduled } from "./dream/schedule.js";
import { registerInspectCommand } from "./cli/inspect-command.js";
import { runMetricsSummary, runObservabilitySummary } from "./cli/reports.js";
import { registerSetupCommand } from "./cli/setup-command.js";
import type { CopilotSessionScopeMode } from "./adapters/copilot-debug/types.js";

const workspaceDir = process.env.DREAMER_WORKSPACE_DIR ?? cwd();

function parseSessionScopeMode(raw: string | undefined, optionName: string): CopilotSessionScopeMode | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "newest-first" || normalized === "oldest-first" || normalized === "coverage") {
    return normalized;
  }
  throw new Error(`${optionName} must be one of: newest-first, oldest-first, coverage.`);
}

function parseSessionCount(raw: string | undefined, optionName: string): number | "all" | undefined {
  if (!raw) return undefined;
  if (raw.toLowerCase() === "all") return "all";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer or 'all'.`);
  }
  return parsed;
}

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
  .option("--batch-sessions <count|all>", "sessions per ingest/pipeline cycle (or all)")
  .option("--since-days <days>", "only include sessions active in the last N days")
  .option("--session-scope <mode>", "session scope mode: newest-first|oldest-first|coverage")
  .action(async (options: {
    replayFromStart?: boolean;
    persistState?: boolean;
    maxSessions?: string;
    batchSessions?: string;
    sinceDays?: string;
    sessionScope?: string;
  }) => {
    const maxSessions = parseSessionCount(options.maxSessions, "--max-sessions");
    const batchSessions = parseSessionCount(options.batchSessions, "--batch-sessions");

    const sinceDays = options.sinceDays ? Number.parseFloat(options.sinceDays) : undefined;
    if (sinceDays !== undefined && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
      throw new Error("--since-days must be a positive number.");
    }

    const sessionScopeMode = parseSessionScopeMode(options.sessionScope, "--session-scope");

    await runDream(workspaceDir, {
      replayFromStart: options.replayFromStart,
      persistState: options.persistState,
      maxSessions,
      batchSessions,
      sinceDays,
      sessionScopeMode
    });
  });

program
  .command("schedule")
  .description("Run scheduled dream cycles")
  .option("--interval-ms <number>", "interval in milliseconds", "86400000")
  .option("--max-sessions <count|all>", "process at most N sessions per run (or all)")
  .option("--batch-sessions <count|all>", "sessions per ingest/pipeline cycle (or all)")
  .option("--since-days <days>", "only include sessions active in the last N days")
  .option("--session-scope <mode>", "session scope mode: newest-first|oldest-first|coverage", "coverage")
  .option("--once", "run once and exit", false)
  .action(async (options: {
    intervalMs: string;
    once: boolean;
    maxSessions?: string;
    batchSessions?: string;
    sinceDays?: string;
    sessionScope?: string;
  }) => {
    const interval = Number(options.intervalMs);

    const maxSessions = parseSessionCount(options.maxSessions, "--max-sessions");
    const batchSessions = parseSessionCount(options.batchSessions, "--batch-sessions");

    const sinceDays = options.sinceDays ? Number.parseFloat(options.sinceDays) : undefined;
    if (sinceDays !== undefined && (!Number.isFinite(sinceDays) || sinceDays <= 0)) {
      throw new Error("--since-days must be a positive number.");
    }

    const sessionScopeMode = parseSessionScopeMode(options.sessionScope, "--session-scope");

    await runScheduled(workspaceDir, interval, options.once, {
      maxSessions,
      batchSessions,
      sinceDays,
      sessionScopeMode
    });
  });

registerSetupCommand(program);

program
  .command("metrics")
  .description("Show numeric run counters from reports/metrics.json")
  .action(async () => {
    await runMetricsSummary(workspaceDir);
  });

program
  .command("status")
  .description("Show report file status and latest run metadata")
  .action(async () => {
    await runObservabilitySummary(workspaceDir);
  });

registerInspectCommand(program);

if (process.argv.slice(2).length === 0) {
  program.outputHelp();
  process.exitCode = 1;
} else {
  await program.parseAsync(process.argv);
}
