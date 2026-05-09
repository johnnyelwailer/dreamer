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
- `pnpm dev setup init`: inspect provider/integration setup and referenced env vars.
- `pnpm dev setup init --write-env`: append missing provider env placeholders to `.env.local`.
- `pnpm dev setup doctor`: run configuration and integration diagnostics.
- `pnpm dev metrics`: print latest pipeline metrics summary.
- `pnpm dev observability`: inspect observability artifact health and latest run metadata.
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

- `.dreamer/config/runtime.json`
- `.dreamer/config/prompts/`
- `.dreamer/config/evals/`

Environment variables are documented in `.env.example`.

When using `backend.honcho.memory`, configure Honcho access with `HONCHO_API_KEY` and `HONCHO_WORKSPACE_ID` or the `DREAM_HONCHO_*` overrides. Dreamer persists exact memory snapshots in Honcho workspace/session metadata and mirrors a local export under `.dreamer/honcho/workspace.json` for diagnostics.

## Provider/Auth Modes

Configured in `.dreamer/config/runtime.json` under `provider.sdk`:

- `providerMode`: `byok` or `copilot`
- `authMode`: `none`, `logged-in-user`, `github-token`, `session-github-token`
- `infiniteSessionsEnabled`: `false` by default to avoid persisting Copilot SDK session state and cluttering session lists

This supports BYOK endpoints, GitHub account auth, GHE host usage, and local OpenAI-compatible model endpoints.

## Output Artifacts

- Generated docs: `docs/generated/`
- Eval reports: `reports/evals/`
- Dream diary and governance outputs: `reports/`

## Getting Started

Use [docs/getting-started.md](docs/getting-started.md) for a complete setup and first-run flow.
