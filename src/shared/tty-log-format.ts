import chalk from "chalk";

export type TtyLogKind = "toolStart" | "toolComplete" | "agentToken" | "agentPrefix";

function colorTag(tag: string): (text: string) => string {
  const key = tag.trim().toLowerCase();
  if (key === "dream") return chalk.bold.cyan;
  if (key === "tool") return chalk.bold.blueBright;
  if (key === "judge") return chalk.bold.green;
  if (key === "dream agent" || key === "agent") return chalk.bold.magentaBright;
  if (key === "cli subprocess") return chalk.bold.gray;
  return chalk.bold.white;
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
      return chalk.bold.magentaBright("[dream agent] ");
    case "agentToken":
      return chalk.white(data.text ?? "");
    default:
      return data.text ?? "";
  }
}

export function ttyFormatTagged(tag: string, message: string, options: { noisy?: boolean } = {}): string {
  const normalized = normalizeTag(tag);
  const renderedTag = colorTag(normalized)(`[${normalized}]`);
  const body = options.noisy ? chalk.gray(message) : chalk.white(message);
  return `${renderedTag} ${body}`;
}

export function ttyWriteTagged(
  tag: string,
  message: string,
  options: { noisy?: boolean; newline?: boolean; stream?: NodeJS.WriteStream } = {}
): void {
  const stream = options.stream ?? process.stdout;
  const line = ttyFormatTagged(tag, message, { noisy: options.noisy });
  stream.write(options.newline === false ? line : `${line}\n`);
}
