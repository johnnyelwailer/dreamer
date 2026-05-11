# Dreamer

Dreamer is a local-first, pluggable "agentic dreaming" system for consolidating coding-session knowledge into durable memory, generated docs, and iterative quality improvements.

It uses the official GitHub Copilot SDK runtime and supports multiple provider/auth modes via data-driven config.

## What It Does

- Ingests session/transcript signals from pluggable adapters.
- Consolidates memory with contradiction tracking.
- Generates provider-authored docs under `docs/generated`.
- Runs real evals through the same runtime provider implementation.
- Runs a self-improvement loop that updates prompt hints from measured quality feedback.

## Key Commands

- `pnpm dream`: run one dream cycle.
- `pnpm dream:schedule`: run scheduled dream cycles (currently once mode).
- `pnpm dev setup`: run the interactive setup wizard when a TTY is available.
- `pnpm dev setup --yes --provider-mode byok --model <model> --base-url <url> --no-verify`: configure Dreamer non-interactively for agent/bootstrap flows.
- `pnpm dev setup init`: inspect provider/integration setup and referenced env vars.
- `pnpm dev setup init --write-env`: append missing provider env placeholders to `.env.local`.
- `pnpm dev setup doctor`: run configuration and integration diagnostics.
- `pnpm dev metrics`: print numeric run counters from `reports/metrics.json`.
- `pnpm dev status`: inspect report file health and latest run metadata.
- `pnpm dev inspect memories`: inspect individual memory records.
- `pnpm dev inspect contradictions`: inspect contradictory memories.
- `pnpm dev inspect insights`: inspect latest run/eval insights from generated artifacts.
- `pnpm eval:copilot-sdk`: run provider response eval cases.
- `pnpm eval:dream-quality`: run quality eval against generated dream artifacts.
- `pnpm eval:dream-quality:tool`: run quality eval using Copilot SDK tool-contract judge.
- `pnpm eval:judge-comparison`: run both legacy and tool-contract judges and write a comparison report.
- `pnpm improve:dream`: run quality-driven self-improvement loop.
- `pnpm safe:eval:dream-quality`: run quality eval in an isolated git worktree + dedicated branch.
- `pnpm safe:improve:dream`: run self-improvement in an isolated git worktree + dedicated branch.
- `pnpm test`: run test suite.
- `pnpm build`: build CLI output.

The quality-eval command replays transcripts from the start by default (`DREAM_EVAL_REPLAY_TRANSCRIPTS=1`) so stale cursor state does not mask ingestion failures.

Judge modes:

- `legacy-json`: strict JSON-in-prompt scoring (existing behavior).
- `tool-contract`: Copilot SDK custom tool (`submit_quality_scores`) returns typed evaluation payload.

Use `pnpm eval:judge-comparison` to produce `reports/evals/dream-judge-comparison.json` and `reports/evals/dream-judge-comparison.md` for side-by-side evidence.

`dream`, `eval:dream-quality`, and `improve:dream` are safe-by-default and run in isolated git worktrees on dedicated branches.

## Real Usage Examples

### Inspect available CLI commands

```bash
pnpm dev --help
```

Example output:

```text
Usage: dreamer [options] [command]

Commands:
  run [options]       Run one dream cycle
  schedule [options]  Run scheduled dream cycles
  setup [options]     Setup, integration checks, and provider onboarding helpers
  metrics             Show numeric run counters from reports/metrics.json
  status              Show report file status and latest run metadata
  inspect             Inspect memories and generated insights
```

### Run focused stream tests

```bash
pnpm vitest run tests/unit/copilot-sdk-stream.test.ts tests/unit/copilot-sdk-stream-state.test.ts
```

Example output:

```text
Test Files  2 passed (2)
Tests      10 passed (10)
```

### Run dream quality eval

```bash
pnpm eval:dream-quality
```

This command writes evaluation artifacts under `reports/evals/`, including `dream-quality-eval.json`.

## Safe Workspace Mode

For mutation-heavy workflows, isolated worktrees are now the default so the primary branch is untouched:

- `pnpm safe:eval:dream-quality`
- `pnpm safe:improve:dream`

These commands create:

- a dedicated branch (`dreamer/agent-<timestamp>`)
- an isolated git worktree under your temp directory

By default, the worktree is kept for inspection and manual merge.

The safe runner requires a clean workspace. To proceed intentionally with local uncommitted changes:

```bash
tsx scripts/run-safe-workspace.ts --command "pnpm improve:dream:unsafe" --allow-dirty
```

Explicit direct-run (unsafe) commands are available when needed:

- `pnpm dream:unsafe`
- `pnpm eval:dream-quality:unsafe`
- `pnpm improve:dream:unsafe`

For custom commands:

```bash
tsx scripts/run-safe-workspace.ts --command "pnpm dream"
```

To auto-clean the worktree and branch after execution:

```bash
tsx scripts/run-safe-workspace.ts --command "pnpm improve:dream" --cleanup
```

## Configuration

Runtime behavior is data-driven via:

- the workspace runtime manifest under Dreamer storage
- `.dreamer/config/prompts/`
- `.dreamer/config/evals/`

Environment variables are documented in `.env.example`.
`dreamer setup` writes `.env.local` entries for selected adapter, backend, provider, plugins, and model limits. Runtime commands load non-empty `.env.local` values as fallbacks without overriding exported process env vars.

When using `backend.honcho.memory`, configure Honcho access with `HONCHO_API_KEY` and `HONCHO_WORKSPACE_ID` or the `DREAM_HONCHO_*` overrides. Dreamer persists exact memory snapshots in Honcho workspace/session metadata and mirrors a local export under `.dreamer/honcho/workspace.json` for diagnostics.

## Plugins

Dreamer auto-loads JavaScript and TypeScript plugins from `.dreamer/plugins`, workspace storage plugins, `DREAMER_HOME/plugins`, and `DREAM_PLUGIN_PATHS`.

Plugins can register custom transcript adapters, memory backends, intelligence providers, or pipeline stages. A custom dreaming system should register a `PipelineStage`; it receives the full `DreamContext` after conversation aggregation and memory loading.

Use `DREAM_ADAPTER_ID`, `DREAM_BACKEND_ID`, `DREAM_PROVIDER_ID`, and `DREAM_STAGE_ORDER` to select plugin implementations at runtime. See [docs/plugins.md](docs/plugins.md) for examples.

## Provider/Auth Modes

Configured in the runtime manifest under `provider.sdk`:

- `providerMode`: `byok` or `copilot`
- `authMode`: `none`, `logged-in-user`, `github-token`, `session-github-token`
- `infiniteSessionsEnabled`: `true` by default in runtime defaults; set to `false` to avoid persisting Copilot SDK session state and cluttering session lists

This supports BYOK endpoints, GitHub account auth, GHE host usage, and local OpenAI-compatible model endpoints.

## Setup Wizard

Run `pnpm dev setup` in a terminal for a guided setup across:

- context providers: Copilot debug sessions, Codex history, Claude Code history, JSONL events, or a custom adapter plugin
- dream pipeline: the built-in stage pipeline or custom stage ids from plugins
- intelligence provider: Copilot SDK GitHub login, GitHub token modes, GHE host forwarding, or BYOK endpoint settings
- memory system: local Dreamer memory, Copilot-style local memory, Honcho, or a custom backend plugin

For automation, pass flags and `--yes`:

```bash
pnpm dev setup --yes \
  --adapter adapter.copilot.debug \
  --backend backend.file.memory \
  --provider-mode byok \
  --auth-mode none \
  --model gpt-4o \
  --base-url http://localhost:11434/v1 \
  --context-length 65536 \
  --no-verify
```

Use `--verify` to run a small provider request after writing config.

## Output Artifacts

- Generated docs: `docs/generated/`
- Eval reports: `reports/evals/`
- Dream diary and governance outputs: `reports/`

## Getting Started

Use [docs/getting-started.md](docs/getting-started.md) for a complete setup and first-run flow.
