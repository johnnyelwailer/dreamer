# Getting Started

## 1. Prerequisites

- Node.js 24+
- pnpm 11+

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Dreamer

Run the setup wizard:

```bash
pnpm dev setup
```

In non-interactive environments, pass flags:

```bash
pnpm dev setup --yes \
  --provider-mode byok \
  --auth-mode none \
  --model gpt-4o \
  --max-subagent-parallelism 2 \
  --base-url http://localhost:11434/v1 \
  --no-verify
```

The wizard writes runtime config and `.env.local` fallbacks. You can still copy the template and edit values manually:

```bash
cp .env.example .env.local
```

For BYOK mode, set one of:

- `COPILOT_SDK_BASE_URL`
- `HOSTED_LLM_BASE_URL`

Optional API key variables:

- `COPILOT_SDK_API_KEY`
- `HOSTED_LLM_API_KEY`

Optional subagent concurrency override (recommended for BYOK/rate-limited endpoints):

- `COPILOT_SDK_MAX_SUBAGENT_PARALLELISM`

## 4. Verify Runtime Mode

Run:

```bash
pnpm dev setup doctor
```

Check:

- `provider.sdk.providerMode`
- `provider.sdk.authMode`
- `provider.sdk.maxSubagentParallelism`
- `provider.sdk.infiniteSessionsEnabled`

Use `pnpm dev setup --verify` to run a small provider request against the selected settings.

## 5. Run Your First Dream Cycle

```bash
pnpm dream
```

This runs in an isolated git worktree on a dedicated branch by default.

To run with Honcho backend in isolated mode, use:

```bash
pnpm dream:honcho
```

Expected outputs include:

- `docs/generated/*.md`
- `reports/dream-diary.md`
- `reports/governance.json`

## 6. Run Real Evals

Run provider eval:

```bash
pnpm eval:copilot-sdk
```

Run dream-output quality eval:

```bash
pnpm eval:dream-quality
```

`eval:dream-quality` replays transcript ingestion by default so prior cursor state does not hide ingest failures.

Outputs are written under `reports/evals/`.

## 7. Run Self-Improvement Loop

```bash
pnpm improve:dream
```

This runs:

1. Dream cycle
2. Quality evaluation
3. Hint persistence (if needed)
4. Re-run and re-evaluate

It updates:

- `reports/evals/dream-self-improve.json`
- `.dreamer/config/prompts/docs-improvement-hints.md` (when improvements are persisted)

All dream/improve runs use isolated worktree mode by default.

## 8. Validate Locally

```bash
pnpm test
./node_modules/.bin/tsc --noEmit
```

## 9. Common Troubleshooting

## Session Scope And Scheduling

Run-time session scope controls:

```bash
pnpm dev run --session-scope newest-first
pnpm dev run --session-scope oldest-first
pnpm dev run --session-scope coverage
pnpm dev run --session-workspace workspace-default
pnpm dev run --session-workspace session-preferred
pnpm dev run --session-workspace session-required
pnpm dev run --max-sessions 25 --since-days 14
```

Mode meanings:

- `newest-first`: newest activity to oldest.
- `oldest-first`: oldest activity to newest.
- `coverage`: unprocessed first, then least-recently processed.

Session workspace modes:

- `workspace-default`: always run agent calls in the current Dream workspace.
- `session-preferred`: use transcript-derived workspace when available, otherwise fallback to current workspace.
- `session-required`: use transcript-derived workspace only; if missing/unavailable, run without a workspace override.

Scheduled mode can run indefinitely and avoid overlapping runs. It supports per-run limits for gradual full coverage over time:

```bash
pnpm dev schedule --interval-ms 3600000 --max-sessions 20 --session-scope coverage
```

`--session-scope` defaults to `coverage` in scheduled mode.

- If provider calls fail, re-check `.env.local` values and runtime mode in `.dreamer/config/runtime.json`.
- If you use GHE, set `GITHUB_HOST` and include correct auth mode.
- If cert-chain issues appear in local environments, verify endpoint TLS configuration before applying temporary local overrides.
