import { cwd } from "node:process";
import { Command } from "commander";
import type { PortableScheduleKind } from "../scheduling/durable-schedule.js";
import { getDurableScheduleStatus, installDurableSchedule, removeDurableSchedule } from "../scheduling/durable-schedule.js";

interface ScheduleOptions {
  install: boolean;
  remove: boolean;
  status: boolean;
  dailyAt: string;
  at: string;
  cron?: string;
  portable?: PortableScheduleKind;
  weekday: string;
  dayOfMonth: string;
  runAtLoad: boolean;
}

export function registerScheduleCommand(program: Command): void {
  program
    .command("schedule")
    .description("Manage dream scheduling")
    .option("--install", "install durable once-per-day scheduler", false)
    .option("--remove", "remove durable scheduler", false)
    .option("--status", "show durable scheduler status", false)
    .option("--daily-at <hh:mm>", "daily local time in 24-hour format", "09:00")
    .option("--portable <kind>", "portable schedule: hourly|daily|weekly|monthly")
    .option("--at <hh:mm>", "execution time for portable daily/weekly/monthly", "09:00")
    .option("--weekday <0-7>", "weekday for portable weekly (0/7=Sun, 1=Mon)", "1")
    .option("--day-of-month <1-31>", "day for portable monthly", "1")
    .option("--cron <expr>", "native cron expression (Linux), e.g. '0 9 * * 1-5'")
    .option("--run-at-load", "run once at login/reboot when supported", false)
    .action(runScheduleAction);
}

async function runScheduleAction(options: ScheduleOptions): Promise<void> {
  const modeCount = [options.install, options.remove, options.status].filter(Boolean).length;
  if (modeCount > 1) throw new Error("Use only one of --install, --remove, or --status at a time.");

  if (options.install) {
    if (options.cron && options.portable) throw new Error("Use either --cron or --portable, not both.");
    const durable = await installDurableSchedule(cwd(), options.dailyAt, {
      runAtLoad: options.runAtLoad,
      cronExpression: options.cron,
      portable: options.portable
        ? {
            kind: options.portable,
            at: options.at,
            weekday: Number(options.weekday),
            dayOfMonth: Number(options.dayOfMonth)
          }
        : undefined
    });
    printDurableStatus(durable.installed, durable.platform, durable.taskLabel, durable.details);
    return;
  }
  if (options.remove) {
    const durable = await removeDurableSchedule(cwd());
    printDurableStatus(durable.installed, durable.platform, durable.taskLabel, durable.details);
    return;
  }
  if (options.status) {
    const durable = await getDurableScheduleStatus(cwd());
    printDurableStatus(durable.installed, durable.platform, durable.taskLabel, durable.details);
    return;
  }

  throw new Error("Specify one of --install, --remove, or --status.");
}

function printDurableStatus(installed: boolean, platform: NodeJS.Platform, taskLabel: string, details?: string): void {
  console.log(`Durable scheduler installed=${installed} platform=${platform} label=${taskLabel}`);
  if (details) console.log(details);
}
