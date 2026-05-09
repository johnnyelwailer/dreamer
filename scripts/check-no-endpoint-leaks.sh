#!/usr/bin/env bash
set -euo pipefail

# Scan tracked files for accidental key leaks and hardcoded authenticated endpoints.
PATTERN='(HOSTED_LLM_API_KEY\\s*=\\s*[^$[:space:]]+|COPILOT_SDK_API_KEY\\s*=\\s*[^$[:space:]]+|authorization:\s*Bearer\s+[A-Za-z0-9._-]+)'
TMP_FILE="${TMPDIR:-.}/dreamer_leaks.$$"

if git grep -nE "$PATTERN" -- . ':(exclude).env.example' ':(exclude)docs/**' >"$TMP_FILE" 2>/dev/null; then
  echo "Potential endpoint or secret leakage detected in tracked files:"
  cat "$TMP_FILE"
  rm -f "$TMP_FILE"
  exit 1
fi

rm -f "$TMP_FILE"
printf "No endpoint or secret leakage patterns found in tracked files.\n"
