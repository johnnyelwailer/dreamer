# Dreamer

Dreamer is a local-first, pluggable system that turns coding-session transcripts into durable memory and generated docs.

This repository is brand new and still WIP. APIs, defaults, and workflows are expected to change.

## Setup Experience

1. Install dependencies:

```bash
pnpm install
```

2. Run the setup wizard:

```bash
pnpm dev setup
```

3. Run one dream cycle:

```bash
pnpm dream
```

What setup does today:
- selects transcript adapter, memory backend, provider mode/auth mode, and model settings
- writes runtime config and `.env.local` fallbacks
- can run basic provider verification

## Supported Providers

Dreamer currently uses the Copilot SDK provider runtime with two provider modes:

- `copilot`
  - auth: `logged-in-user`, `github-token`, `session-github-token`
  - supports GitHub.com and GitHub Enterprise host forwarding (`GITHUB_HOST`)
- `byok`
  - supports OpenAI-compatible endpoint wiring
  - setup options include provider types `openai`, `azure`, `anthropic`
  - common path today is OpenAI-compatible endpoint + model id

## Provider Setup Examples

### 1) Copilot account (logged-in user)

```bash
pnpm dev setup --yes \
  --provider-mode copilot \
  --auth-mode logged-in-user \
  --model gpt-4o
```

### 2) Copilot with GitHub token

```bash
export GITHUB_TOKEN=YOUR_TOKEN
pnpm dev setup --yes \
  --provider-mode copilot \
  --auth-mode github-token \
  --model gpt-4o
```

### 3) BYOK OpenAI-compatible endpoint

```bash
cp .env.example .env.local
```

Set in `.env.local`:

```bash
COPILOT_SDK_BASE_URL=http://localhost:11434/v1
COPILOT_SDK_API_KEY=YOUR_KEY
```

Then run:

```bash
pnpm dev setup --yes \
  --provider-mode byok \
  --auth-mode none \
  --provider-type openai \
  --wire-api completions \
  --model gpt-4o \
  --base-url-env COPILOT_SDK_BASE_URL
```

## Memory Providers And Integration

Built-in backends:
- `backend.file.memory`
  - writes JSON memory snapshot to `~/.dreamer/workspaces/<workspace-id>/memory.json`
- `backend.copilot.memory`
  - writes Copilot-style JSON to `~/.dreamer/workspaces/<workspace-id>/copilot-memory.json`
- `backend.honcho.memory`
  - syncs memory to Honcho and also exports local snapshot to `~/.dreamer/workspaces/<workspace-id>/honcho/workspace.json`

To use Honcho backend, set one of:
- `HONCHO_API_KEY`, `HONCHO_WORKSPACE_ID`
- or `DREAM_HONCHO_*` overrides

Custom backends/adapters/providers/stages can be added through plugins. See `docs/plugins.md`.

## What To Expect

After a run (`pnpm dream`), you should expect:
- generated docs under `docs/generated/`
- run outputs under `reports/` and `reports/evals/` (when evals are run)
- memory snapshots stored under `~/.dreamer/workspaces/<workspace-id>/`

Primary workflows:

```bash
pnpm dream
pnpm eval:dream-quality
pnpm improve:dream
```

## Current Implementation State

This project is functional but still early-stage.

Working today:
- setup wizard and runtime manifest wiring
- multiple transcript adapters and memory backends
- provider mode/auth mode configuration via Copilot SDK runtime
- generated docs + eval report pipeline

Still changing / missing maturity:
- some runtime defaults and UX are still being refined
- cross-provider behavior is not fully exercised in all combinations
- plugin contracts may evolve
- long-running scheduling and operational hardening are still limited
- not all production scenarios are fully tested yet

## Useful Docs

- `docs/getting-started.md`
- `docs/plugins.md`
- `.env.example`
