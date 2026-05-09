# Evaluation Plan

## Objectives

- Verify dream outputs are correct, stable, and useful.
- Measure quality beyond unit tests.
- Compare providers using the same evaluation corpus.

## Verification Layers

- Contract tests: plugin compatibility across adapters/backends/providers.
- Integration replay tests: transcript to memory to docs end-to-end.
- Golden snapshot tests: deterministic normalized events and generated docs.
- Regression tests: every production bug gets a fixed fixture.
- LLM evals: quality scoring and pairwise model comparison.

## Metrics

- Memory precision and recall against labeled fixtures.
- Contradiction detection precision and recall.
- Documentation completeness score by required sections.
- Idempotency score: rerun diff size on unchanged input.
- Cost and latency per dream run.

## Evals Using Free Environment Models

### Provider Set

- qwen3.6-35b-a3b-q3 via hosted OpenAI-compatible endpoint configured through local untracked env vars.
- Optional local baseline via llama.cpp OpenAI-compatible server.

### Copilot SDK Live Eval Path

- Primary live eval path uses GitHub Copilot SDK with BYOK provider config.
- Use OpenAI-compatible provider settings:
  - `baseUrl`: `https://chat.nexplore.dev/v1`
  - `model`: `qwen3.6-35b-a3b-q3`
  - `apiKey`: local untracked secret
- This confirms the same endpoint/model can run through Copilot SDK runtime, not only direct HTTP wrappers.

### Eval Types

- Rubric grading for memory usefulness and doc usefulness.
- Structured assertions on required fields and provenance.
- Pairwise win-rate between provider outputs for same fixture.
- Stability checks across repeated runs with fixed seed.

## Recommended Eval Tooling

- promptfoo for model comparison and rubric assertions.
- Custom eval harness for deterministic task metrics.

## Ready-to-Run Assets

- Promptfoo config: evals/promptfooconfig.yaml
- Eval prompt: evals/prompts/memory-quality.txt
- Runner script: scripts/run-evals.sh
- Copilot SDK live runner: scripts/run-copilot-sdk-eval.ts
- Usage guide: evals/README.md

## Minimal Eval Corpus

- 20 ingestion fixtures from real Copilot session formats.
- 20 consolidation fixtures with duplicates and contradictions.
- 10 doc-generation fixtures with known required outputs.
- 10 safety fixtures containing malicious transcript content.

## Pass Gates

- Memory precision >= 0.85 on labeled fixtures.
- Contradiction detection recall >= 0.80.
- Idempotency diff <= 2 percent on unchanged reruns.
- Safety violations = 0 on malicious transcript fixtures.

## Llama.cpp Local Setup (Optional)

- Start local server in OpenAI-compatible mode.
- Point eval runner base URL to local endpoint.
- Run same corpus to compare against qwen endpoint.

Example request shape:

```json
{
  "model": "local-model",
  "messages": [
    {"role": "system", "content": "You are a strict evaluator."},
    {"role": "user", "content": "Evaluate memory extraction quality."}
  ],
  "temperature": 0,
  "max_tokens": 512
}
```

## Research Status Notes

- Concrete local evidence gathered for Copilot debug-log artifacts:
  - main.jsonl
  - models.json
- Current local main.jsonl samples are session_start-only in this environment.
- Additional fixture capture is needed for richer event coverage.
