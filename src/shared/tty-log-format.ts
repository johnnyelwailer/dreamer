import chalk from "chalk";

export type TtyLogKind = "toolStart" | "toolComplete" | "agentToken" | "agentPrefix";

function colorTag(tag: string): (text: string) => string {
  const key = tag.trim().toLowerCase();
  if (key === "dream") return chalk.bold.cyan;
  if (key === "tool") return chalk.bold.blueBright;
  if (key === "judge") return chalk.bold.green;
  if (key === "delegate") return chalk.bold.yellow;
  if (key === "dream agent" || key === "agent" || key.endsWith(" agent") || key.includes("analyst") || key.includes("recorder")) return chalk.bold.magentaBright;
  if (key === "cli subprocess") return chalk.bold.gray;
  return chalk.bold.white;
}

function colorSubagentSuffix(text: string): string {
  return chalk.bold.cyanBright(text);
}

function renderColoredTag(tag: string): string {
  const normalized = normalizeTag(tag);
  const at = normalized.indexOf("@");
  if (at <= 0 || at >= normalized.length - 1) return colorTag(normalized)(normalized);
  const base = normalized.slice(0, at);
  const suffix = normalized.slice(at);
  return `${colorTag(base)(base)}${colorSubagentSuffix(suffix)}`;
}

function renderBracketedTag(tag: string): string {
  return `[${renderColoredTag(tag)}]`;
}

function normalizeTag(tag: string): string {
  const trimmed = tag.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed.slice(1, -1);
  return trimmed;
}

export function ttyFormat(kind: TtyLogKind, data: { name?: string; success?: boolean; text?: string } = {}): string {
  switch (kind) {
    case "toolStart":
      return chalk.bold.blueBright("[tool]") + " " + chalk.cyanBright(data.name ?? "tool") + " " + chalk.yellow("start");
    case "toolComplete":
      return (
        chalk.bold.blueBright("[tool]") +
        " " + chalk.cyanBright(data.name ?? "tool") +
        " " + chalk.yellow("complete") +
        (data.success === true ? " " + chalk.green("✓") : data.success === false ? " " + chalk.red("✗") : "")
      );
    case "agentPrefix":
      return `${renderBracketedTag(data.name ?? "dream agent")} `;
    case "agentToken":
      return chalk.white(data.text ?? "");
    default:
      return data.text ?? "";
  }
}

export function ttyFormatTagged(tag: string, message: string, options: { noisy?: boolean; error?: boolean } = {}): string {
  const renderedTag = renderBracketedTag(tag);
  const body = options.error ? chalk.redBright(message) : options.noisy ? chalk.gray(message) : chalk.white(message);
  return `${renderedTag} ${body}`;
}

function ttyFormatBody(message: string, options: { noisy?: boolean; error?: boolean } = {}): string {
  return options.error ? chalk.redBright(message) : options.noisy ? chalk.gray(message) : chalk.white(message);
}

export function ttyWriteTagged(
  tag: string,
  message: string,
  options: { noisy?: boolean; error?: boolean; newline?: boolean; stream?: NodeJS.WriteStream } = {}
): void {
  const stream = options.stream ?? process.stdout;
  const line = ttyFormatTagged(tag, message, { noisy: options.noisy, error: options.error });
  stream.write(options.newline === false ? line : `${line}\n`);
}

export function ttyWriteContinuation(
  message: string,
  options: { noisy?: boolean; error?: boolean; indent?: number; newline?: boolean; stream?: NodeJS.WriteStream } = {}
): void {
  const stream = options.stream ?? process.stdout;
  const indent = " ".repeat(Math.max(0, options.indent ?? 2));
  const line = `${indent}${ttyFormatBody(message, { noisy: options.noisy, error: options.error })}`;
  stream.write(options.newline === false ? line : `${line}\n`);
}

export function ttyWriteLine(message = "", options: { stream?: NodeJS.WriteStream } = {}): void {
  const stream = options.stream ?? process.stdout;
  stream.write(`${message}\n`);
}
