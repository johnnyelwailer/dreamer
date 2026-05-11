import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { SetupOptions } from "./setup-wizard-types.js";

export function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

export function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isInteractive(options: SetupOptions): boolean {
  return Boolean(input.isTTY && output.isTTY && !options.yes && options.interactive);
}

export async function select(
  rl: ReturnType<typeof createInterface>,
  title: string,
  choices: Array<{ id: string; label: string }>,
  defaultId: string
): Promise<string> {
  output.write(`\n${chalk.bold(title)}\n`);
  choices.forEach((choice, index) => {
    const suffix = choice.id === defaultId ? chalk.dim(" default") : "";
    output.write(`  ${index + 1}. ${choice.label}${suffix}\n`);
  });
  const answer = (await rl.question(chalk.cyan("Choose: "))).trim();
  if (!answer) return defaultId;
  const selectedIndex = Number.parseInt(answer, 10);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= choices.length) {
    return choices[selectedIndex - 1].id;
  }
  const found = choices.find((choice) => choice.id === answer);
  if (found) return found.id;
  output.write(chalk.yellow(`Unknown choice, using ${defaultId}.\n`));
  return defaultId;
}

export async function ask(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue?: string
): Promise<string | undefined> {
  const suffix = defaultValue ? chalk.dim(` (${defaultValue})`) : "";
  const answer = (await rl.question(`${chalk.cyan(prompt)}${suffix}: `)).trim();
  return answer || defaultValue;
}

export async function confirm(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await rl.question(`${chalk.cyan(prompt)} ${chalk.dim(suffix)}: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "1", "true"].includes(answer);
}