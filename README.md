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
- `pnpm eval:copilot-sdk`: run provider response eval cases.
- `pnpm eval:dream-quality`: run quality eval against generated dream artifacts.
- `pnpm improve:dream`: run quality-driven self-improvement loop.
- `pnpm test`: run test suite.
- `pnpm build`: build CLI output.

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

This supports BYOK endpoints, GitHub account auth, GHE host usage, and local OpenAI-compatible model endpoints.

## Output Artifacts

- Generated docs: `docs/generated/`
- Eval reports: `reports/evals/`
- Dream diary and governance outputs: `reports/`

## Getting Started

Use [docs/getting-started.md](docs/getting-started.md) for a complete setup and first-run flow.
