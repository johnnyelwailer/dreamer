import { Command } from "commander";
import { cwd } from "node:process";
import { runDream } from "./dream/run-dream.js";
import { runScheduled } from "./dream/schedule.js";

const program = new Command();
program.name("dreamer").description("Agentic dreaming system");

program
  .command("run")
  .description("Run one dream cycle")
  .action(async () => {
    await runDream(cwd());
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

await program.parseAsync(process.argv);
