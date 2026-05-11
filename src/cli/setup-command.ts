import type { Command } from "commander";
import { cwd } from "node:process";
import { runSetupDoctor } from "./setup-doctor.js";
import { runSetupInit } from "./setup-init.js";
import { runSetupWizard } from "./setup-wizard.js";

export function registerSetupCommand(program: Command): void {
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
    .option("--max-subagent-parallelism <count>", "maximum number of subagents allowed to run in parallel")
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

  setupCommand.command("init").description("Show setup summary and optionally write missing provider env placeholders")
    .option("--write-env", "append missing provider env placeholders to .env.local", false)
    .action(async (options: { writeEnv: boolean }) => runSetupInit(cwd(), options.writeEnv));

  setupCommand.command("doctor").description("Run integration/provider diagnostics against current runtime config")
    .option("--strict", "treat warnings as failures", false)
    .action(async (options: { strict: boolean }) => runSetupDoctor(cwd(), options.strict));
}