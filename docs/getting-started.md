# Getting Started

## 1. Prerequisites

- Node.js 24+
- pnpm 11+

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Configure Environment

Copy the template and set values locally:

```bash
cp .env.example .env.local
```

At minimum for default BYOK mode, set one of:

- `COPILOT_SDK_BASE_URL`
- `HOSTED_LLM_BASE_URL`

Optional API key variables:

- `COPILOT_SDK_API_KEY`
- `HOSTED_LLM_API_KEY`

## 4. Verify Runtime Mode

Open `.dreamer/config/runtime.json` and check:

- `provider.sdk.providerMode`
- `provider.sdk.authMode`

Default is BYOK (`providerMode: byok`, `authMode: none`).

## 5. Run Your First Dream Cycle

```bash
pnpm dream
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

## 8. Validate Locally

```bash
pnpm test
./node_modules/.bin/tsc --noEmit
```

## 9. Common Troubleshooting

- If provider calls fail, re-check `.env.local` values and runtime mode in `.dreamer/config/runtime.json`.
- If you use GHE, set `GITHUB_HOST` and include correct auth mode.
- If cert-chain issues appear in local environments, verify endpoint TLS configuration before applying temporary local overrides.
