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
- selects transcript adapter, memory backend, and agent harness/runtime settings (provider mode/auth mode/model)
- writes runtime config and `.env.local` fallbacks
- can run basic provider verification

## Pluggable Categories

Dreamer currently has three main pluggable surfaces:

- transcript adapters
  - ingest conversation/session data into normalized events
- memory systems (backends)
  - load/save final memory records
- agent harness/runtime
  - runs the model/tool loop (currently via Copilot SDK runtime)

## Transcript Adapters

Built-in adapters today:

- `adapter.copilot.debug`
- `adapter.codex.trace`
- `adapter.claude.code`
- `adapter.jsonl.event`

These are selectable in setup and can be replaced by plugin adapters.

## Agent Harness Runtime

The current harness uses the Copilot SDK runtime with two provider modes:

- `copilot`
  - auth: `logged-in-user`, `github-token`, `session-github-token`
  - supports GitHub.com and GitHub Enterprise host forwarding (`GITHUB_HOST`)
- `byok`
  - supports OpenAI-compatible endpoint wiring
  - setup options include provider types `openai`, `azure`, `anthropic`
  - common path today is OpenAI-compatible endpoint + model id

## Agent Harness Setup Examples

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

## Memory Systems And Integration

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

Honcho scoping follows Honcho's application/peer/session model:
- `HONCHO_WORKSPACE_ID` is the Dreamer/tool namespace, defaulting to `dreamer`.
- Dreamer reuses repo-scoped Honcho sessions such as `dreamer-memory-<repo>` and `raw-<repo>`.
- The user, Dreamer, and memory scopes are represented as peers; source transcript session ids, run ids, repo URL, branch, and commit are stored as metadata.

Custom backends/adapters/agent-runtime providers/stages can be added through plugins. See `docs/plugins.md`.

## What To Expect

After a run (`pnpm dream`), you should expect:
- generated docs under `docs/generated/`
- run outputs under `reports/` and `reports/evals/` (when evals are run)
- memory snapshots stored under `~/.dreamer/workspaces/<workspace-id>/`

Primary workflows:

```bash
pnpm dream
pnpm dream:honcho
pnpm dream:honcho:safe
pnpm eval:dream-quality
pnpm improve:dream
```

- `pnpm dream` uses repo worktree isolation.
- `pnpm dream:honcho` runs without worktree isolation (useful for global/non-repo style runs).
- `pnpm dream:honcho:safe` runs Honcho with repo worktree isolation.

Session scoping controls:

```bash
pnpm dev run --max-sessions 20 --session-scope newest-first
pnpm dev run --session-scope oldest-first
pnpm dev run --session-scope coverage
```

- `newest-first` processes sessions from newest activity to oldest.
- `oldest-first` processes sessions from oldest activity to newest.
- `coverage` prioritizes sessions that have never been processed, then least-recently processed sessions.

Scheduled runs support the same controls and default to coverage mode:

```bash
pnpm dev schedule --interval-ms 3600000 --max-sessions 20
```

## Current Implementation State

This project is functional but still early-stage.

Working today:
- setup wizard and runtime manifest wiring
- multiple transcript adapters and memory backends
- agent harness mode/auth configuration via Copilot SDK runtime
- generated docs + eval report pipeline

Tested with reasonable confidence so far:
- memory extraction from transcripts
- the dreaming pipeline end-to-end flow
- dream-quality evaluation flow (primarily a development verification feature)

Still changing / missing maturity:
- some runtime defaults and UX are still being refined
- cross-runtime/provider behavior is not fully exercised in all combinations
- actual memory backend behavior is not fully tested across all backends
- Windows support is not fully tested
- plugin contracts may evolve
- long-running scheduling and operational hardening are still limited
- broader production scenarios are still not fully tested yet
- CI/test matrix coverage is still incomplete in several areas

## Useful Docs

- `docs/getting-started.md`
- `docs/plugins.md`
- `.env.example`
