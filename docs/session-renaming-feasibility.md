# Feature Idea: Smart Session Renaming

## Problem

VS Code Copilot chat sessions often accumulate with generic names, including forks and partial threads. Manual renaming is tedious and makes later session triage harder.

## Idea

Use Dreamer to derive better session names from recent transcript content, then surface those names where useful.

Example output:

- Before: New Chat, New Chat (2), Forked Chat
- After (suggested): Fix flaky eval parser tests, Compare judge outputs for qwen model, Add inspect insights CLI JSON mode

## What We Can Reuse Today

### Existing session discovery

Dreamer already discovers Copilot sessions and transcript files across workspace storage roots.

- Session discovery and transcript path resolution: [src/dream/discovery/copilot-debug/discover-copilot-debug-sessions.ts](src/dream/discovery/copilot-debug/discover-copilot-debug-sessions.ts#L13)
- Discovery export used by adapters: [src/dream/copilot-debug-session-discovery.ts](src/dream/copilot-debug-session-discovery.ts#L1)

### Existing message extraction

Dreamer already parses transcript records and maps user/assistant messages to normalized events with role metadata.

- Transcript parsing and message mapping: [src/adapters/copilot-debug-transcript.ts](src/adapters/copilot-debug-transcript.ts#L40)
- Normalized event schema for message text and metadata: [src/core/types.ts](src/core/types.ts#L3)

### Existing per-session reporting output

Dreamer already writes per-session markdown summaries and has a place where session display labels are rendered.

- Session markdown writer: [src/stages/signal-stage-file-writer.ts](src/stages/signal-stage-file-writer.ts#L27)

## Feasibility Assessment

## 1. Suggesting better names: Feasible now

This can be implemented with current primitives by:

1. Selecting the most recent user messages in each session.
2. Generating a short candidate title with deterministic heuristics or provider summarization.
3. Writing suggestions to a new artifact, for example reports/session-name-suggestions.json.
4. Showing suggestions in CLI output and/or generated docs.

No platform/API changes are required for this path.

## 2. Renaming sessions via Copilot SDK: Feasible with added primitive

New research shows the Copilot SDK exposes a session name API on the session-scoped RPC surface.

- Session-scoped RPC includes `name.get` and `name.set`: [node_modules/@github/copilot-sdk/dist/generated/rpc.d.ts](node_modules/@github/copilot-sdk/dist/generated/rpc.d.ts#L1817)
- Name payload contract (`NameSetRequest`): [node_modules/@github/copilot-sdk/dist/generated/rpc.d.ts](node_modules/@github/copilot-sdk/dist/generated/rpc.d.ts#L818)
- Session object exposes typed RPC access: [node_modules/@github/copilot-sdk/dist/session.d.ts](node_modules/@github/copilot-sdk/dist/session.d.ts#L69)
- Client supports session discovery/resume/list metadata: [node_modules/@github/copilot-sdk/dist/client.d.ts](node_modules/@github/copilot-sdk/dist/client.d.ts#L326)

Important implication: we can add a Dreamer primitive that does:

1. resolve session id,
2. resume/open session via SDK,
3. call `session.rpc.name.set({ name })`,
4. verify with `session.rpc.name.get()`.

This path is the preferred mutation mechanism because it uses supported API contracts instead of reverse-engineering storage files.

## 3. Renaming via raw workspace storage files: Technically possible but high-risk

Workspace chat session data appears to persist title-like state in multiple places (event log plus indexed state). In local inspection, one session log included a `customTitle` patch event, while workspace state DB held a chat session index entry containing `title`.

Operational risk areas:

1. Multi-location writes: patching one file may leave index/state out of sync.
2. Live-process races: VS Code may overwrite manual edits while running.
3. Format drift risk: internal storage schema can change without compatibility guarantees.
4. Corruption risk: malformed JSONL or DB writes can break session loading.

Conclusion for raw-file approach: keep as last-resort fallback only, and only with strict safeguards.

## 4. Safe Implementation Order

1. Add SDK-backed rename primitive first.
2. Keep suggestion generation as confidence-gated preview.
3. Add apply mode that calls SDK rename API only.
4. Add optional raw-storage fallback behind an explicit `--unsafe-storage-edit` flag.
5. Add post-rename verification checks and rollback journal.

Current Dreamer code still needs new command plumbing for mutation:

- Ingestion is read-oriented today (session files to normalized events): [src/adapters/copilot-debug/session-ingest.ts](src/adapters/copilot-debug/session-ingest.ts#L14)
- Current CLI has inspect/run/schedule/report commands, but no rename command yet: [src/cli.ts](src/cli.ts#L12)

## Proposed MVP (Built on Existing Primitives)

## Scope

- Produce high-confidence rename suggestions only.
- Do not attempt in-product title mutation.

## Candidate algorithm

1. For each discovered session, collect last N user messages from normalized transcript events.
2. Build a concise working summary:
- Prefer imperative phrase patterns (Fix X, Add Y, Investigate Z).
- Strip boilerplate and generic prefixes.
- Cap at 6 to 10 words.
3. Score suggestion confidence:
- Message count and lexical specificity.
- Presence of concrete entities (file names, commands, error IDs).
4. Fallback name when low confidence:
- Session YYYY-MM-DD HH:mm plus top keyword.

## Suggested outputs

- reports/session-name-suggestions.json
- Optional markdown companion: reports/session-name-suggestions.md

Each entry could include:

- sessionId
- transcriptPath
- suggestedName
- confidence
- evidenceSnippet
- generatedAt

## Future Path (Hardened Apply Flow)

With the SDK rename surface available, we can add:

1. Dry-run preview mode (default).
2. Apply mode with confidence threshold and max changes per run.
3. Idempotency safeguards (do not overwrite manually set names unless forced).
4. Audit log for all applied renames.

## Risks and Mitigations

- Risk: Overly generic or wrong names.
- Mitigation: confidence threshold + preview-only default.

- Risk: Sensitive data leaks into title.
- Mitigation: redact secrets/patterns and avoid full command lines.

- Risk: Session drift over time (title no longer matches latest direction).
- Mitigation: optional recency-weighted updates with cooldown windows.

## Validation Plan

1. Unit tests for title synthesis heuristics on synthetic transcript fixtures.
2. Regression tests for parser compatibility with existing transcript event types.
3. Golden snapshot test for JSON suggestion artifact shape.
4. Manual review of top 50 sessions for precision/acceptance rate.

## Recommendation

Proceed in two steps:

1. Ship suggestion-only MVP first for immediate value.
2. Add SDK-backed rename apply mode next, with preview default and verification safeguards.

Treat raw storage edits as emergency fallback only.