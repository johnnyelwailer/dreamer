#!/usr/bin/env bash
set -euo pipefail

# Load untracked local environment values when present.
if [[ -f .env.local ]]; then
  # shellcheck disable=SC1091
  source .env.local
fi

RUNTIME_MODE="$(node -e 'const fs=require("fs");const p=".dreamer/config/runtime.json";const c=JSON.parse(fs.readFileSync(p,"utf8"));process.stdout.write(c.provider?.sdk?.providerMode||"byok")')"

if [[ "$RUNTIME_MODE" == "byok" ]]; then
  if [[ -z "${COPILOT_SDK_BASE_URL:-}" && -z "${HOSTED_LLM_BASE_URL:-}" ]]; then
    echo "BYOK mode requires COPILOT_SDK_BASE_URL or HOSTED_LLM_BASE_URL"
    exit 1
  fi
fi

# HOSTED_LLM_API_KEY is optional for keyless OpenAI-compatible endpoints.
export HOSTED_LLM_API_KEY="${HOSTED_LLM_API_KEY:-}"

# Optional local provider defaults for side-by-side runs.
export LOCAL_LLAMA_BASE_URL="${LOCAL_LLAMA_BASE_URL:-http://localhost:8080/v1}"
export LOCAL_LLAMA_API_KEY="${LOCAL_LLAMA_API_KEY:-sk-no-key-required}"
export LOCAL_LLAMA_MODEL="${LOCAL_LLAMA_MODEL:-llama-3.1-8b}"

npx promptfoo@latest eval -c evals/promptfooconfig.yaml
