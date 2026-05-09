# Evals

This folder contains model eval assets for Dreamer.

## Providers

- Hosted endpoint: configured via local env vars only
- Model baseline: qwen3.6-35b-a3b-q3
- Optional local baseline: llama.cpp OpenAI-compatible server

## Environment Variables

Set these in `.env.local` or your shell before running evals:

- HOSTED_LLM_BASE_URL
- HOSTED_LLM_API_KEY (optional when endpoint does not require auth)
- LOCAL_LLAMA_BASE_URL
- LOCAL_LLAMA_API_KEY (example: sk-no-key-required)
- LOCAL_LLAMA_MODEL (example: llama-3.1-8b)
- COPILOT_SDK_BASE_URL (or HOSTED_LLM_BASE_URL)
- COPILOT_SDK_API_KEY (or HOSTED_LLM_API_KEY, optional when endpoint does not require auth)
- COPILOT_SDK_MODEL (default: qwen3.6-35b-a3b-q3)

## Run

- npx promptfoo@latest eval -c evals/promptfooconfig.yaml
- npx promptfoo@latest view
- pnpm eval:copilot-sdk

## Notes

- Keep fixture prompts deterministic.
- Use temperature 0 for grading consistency.
- Add one regression test case for each bug found in production.
