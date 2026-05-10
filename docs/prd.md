

# Agentic Dreaming System for Code Projects

## Vision

A lightweight, pluggable agentic dreaming system that continuously consolidates knowledge from AI coding sessions into durable memory and reusable skills.

The system runs locally by default, works across repositories and workspaces, and helps coding agents stop repeating the same mistakes.

---

# Goals

## Primary Goals

- Extract durable memories from coding-agent conversations.
- Generate and maintain project-specific context.
- Improve agent skills and workflows over time.
- Support multiple memory backends with a single Copilot SDK intelligence runtime.
- Remain lightweight, local-first, and configurable.

## Non Goals

- Fine-tuning or modifying model weights.
- Fully autonomous code modification without oversight.
- Becoming tied to a single IDE, provider, or memory system.
- Replacing authoritative human-written architecture docs.
- Writing directly to workspace files during a dream run (workspaces are always read-only).

---

# Core Concepts

## Dreaming

A scheduled reflective process that:

- Reviews past sessions and transcripts.
- Extracts important patterns and decisions.
- Consolidates memories.
- Detects contradictions and stale knowledge.
- Proposes improvements to skills and workflows.

Dreaming does not retrain models.

## Workspace Read-Only Constraint

**Workspaces are always read-only to the dreamer.**

- The dreamer reads transcripts, logs, and existing files from any workspace during a run.
- It never writes directly into a workspace or repository during a dream run.
- All state mutations are recorded through explicit structured tool contracts:
  - **Memory tools** — write memories to the central memory backend (scoped globally, to user, or to repo).
  - **Skill tools** — write skill patches to the central skills store.
- Any output that targets a specific workspace (e.g. repo-scoped memory, skill patches) is staged on a **separate branch** and requires explicit approval before merging into the workspace.
- The central state store is the single source of truth for all dream outputs; workspace files are never modified in-place.

## Memory

Structured durable context extracted from conversations, workflows, code, and outcomes.

Memory is scoped at multiple levels:

- Global user memory
- Workspace/repository memory
- Team/shared memory (future)
- Session memory

## Skills

Reusable workflows, prompts, scripts, and operating instructions used by agents.

The system should detect:

- Repeated failures
- Missing instructions
- Incorrect assumptions
- Outdated scripts
- Missing validation steps

And propose improvements.

---

# Product Requirements

## 0. Greenfield Delivery Policy (Non-Negotiable)

- This repository is greenfield: no legacy constraints and no backward-compatibility obligations.
- Prefer deletion and replacement over compatibility shims.
- If an old abstraction blocks progress, remove it and rewrite to the current contract.
- Compatibility layers are allowed only when explicitly requested by the user.

## 1. Pluggable Data Adapters

The core system must remain source-agnostic.

### Requirements

- Support multiple transcript/log formats.
- Normalize all sources into a shared internal event format.
- Adapters must be independently installable.
- Adapters should support incremental ingestion.

### Default Adapters

#### VS Code / GitHub Copilot

Support:

- Exported JSON chat sessions
- Workspace storage sessions
- VS Code
- VS Code Insiders
- Copilot CLI
- Future VS Code agent modes

### Future Adapters

- Claude Code
- Cursor
- Windsurf
- Codex
- Terminal recordings
- Browser agent traces

---

# 2. Pluggable Memory Systems

The system must support multiple memory backends.

## Initial Backends

### GitHub Copilot Memory

Use repository-scoped memories with citations and validation.

### Honcho

Use Honcho workspaces, peers, sessions, and reasoning primitives.

## Future Backends

- MemGPT
- Mem0
- Custom filesystem stores
- SQLite/vector databases
- Cloud memory services

---

# 3. Copilot SDK Intelligence Runtime

The default reasoning and dreaming engine runs through GitHub Copilot SDK only.

## Requirements

### GitHub Copilot SDK

Support:

- GitHub.com login
- GitHub Enterprise login
- Enterprise policy boundaries
- Routing dream prompts through Copilot SDK
- BYOK provider routing to OpenAI-compatible endpoints via `provider.baseUrl` and `provider.apiKey`.
- Local and self-hosted model endpoints through OpenAI-compatible protocol.

---

# 4. Dream Pipeline

The dreaming pipeline itself must be modular and configurable.

## Default Pipeline

### Phase 1 — Orientation

- Read existing memories
- Read AGENTS.md and project docs
- Discover current workspace state
- Build context map

### Phase 2 — Signal Gathering

Extract:

- User corrections
- Repeated failures
- Important decisions
- Architecture changes
- Workflow patterns
- Explicit preferences
- Tooling pitfalls

Prefer targeted extraction over exhaustive transcript replay.

### Phase 3 — Consolidation

- Merge duplicate memories
- Remove stale information
- Resolve contradictions
- Convert relative dates into absolute dates
- Promote high-confidence memories
- Generate skill improvements

### Phase 4 — Indexing

Generate or update:

- Memory indexes
- Dream reports

---

# 5. User Context vs Workspace Context

## User Context

Focus on extracting:

- Communication preferences
- Coding preferences
- Preferred workflows
- Repeated user corrections
- Common complex workflows
- Generalized rules
- Reusable global skills
- Collaboration and interaction preferences

Examples:

- Prefers concise implementation plans.
- Uses pnpm over npm.
- Prefers local-first architecture.
- Likes reviewable diffs.

### Interaction Memories

Dreamer must capture how the user wants agents to communicate, reason, and collaborate, not only what technical facts the agent should remember.

Interaction memories should be concrete, contextual, and example-driven. They should describe:

- Preferred answer length and density.
- Preferred explanation format.
- When the user wants pushback.
- When the user wants clarifying questions.
- How much assumption-making is acceptable.
- Review, debugging, and planning expectations.
- Repeated trust/frustration signals caused by agent behavior.

Good interaction memories:

- User prefers terse, plain language when discussing product behavior.
- User prefers examples framed as state transitions: given current state, action, expected resulting state.
- User wants technical pushback on weak plans instead of automatic agreement.
- User prefers clarifying questions before implementation when requirements are ambiguous, architectural, or high-impact.

Bad interaction memories:

- User likes examples.
- User likes pushback.
- Always ask questions before doing anything.

Interaction memories should include `applies_when` whenever possible. Absolute user phrasing such as "always" and "never" should be normalized into context-aware operating rules unless the evidence clearly establishes a hard rule.

Example:

```text
statement: User prefers examples framed as explicit state transitions when discussing behavior.
scope: user
category: communication
tags: examples
applies_when: Explaining requirements, bugs, acceptance criteria, or UI behavior.
rationale: The user asked for examples such as "Given State A and A.y, click button X, A.y becomes ACCEPTED instead of IN PROGRESS."
```

Counterexample:

```text
statement: Always question and interview the user before doing any work.
```

Preferred normalization:

```text
statement: Ask clarifying questions before implementation when the task is underspecified, architectural, or high-impact; proceed directly for small obvious fixes while stating assumptions.
scope: user
category: workflow
tags: clarification, implementation
applies_when: Starting implementation work from an ambiguous request.
```

## Workspace Context

Focus on:

- Repository-specific rules
- Build instructions
- Architecture conventions
- Project goals
- Common pitfalls
- Skill maintenance

### Important Constraint

`AGENTS.md` must remain concise.

The dream system should:

- Prefer removing outdated lines over endlessly appending.
- Avoid large generated dumps.
- Keep agent startup context lightweight.

---

# 6. Skill Maintenance

The system should continuously evaluate skills.

## Detect

- Failing workflows
- Broken scripts
- Incorrect prompts
- Missing validation
- Repeated retries
- User corrections after skill usage

## Propose

- Prompt improvements
- Validation steps
- Preflight checks
- Script fixes
- Workflow simplification
- Skill splitting

## Safety

High-risk changes should:

- Be proposed as diffs
- Be written into isolated branches/worktrees
- Or require explicit approval

---

# 7. Observability

The system must provide strong observability.

## Dream Diary

Every dream run should generate:

- Timestamp
- Sessions analyzed
- Memories added
- Memories removed
- Contradictions found
- Skills updated
- Suggested actions

Example:

```text
Dream completed for repo: dreamer

- 12 memories consolidated
- 4 stale memories pruned
- 3 skill patches proposed
- 2 contradictions detected
```

## Metrics

Track:

- Sessions processed
- Token usage
- Dream duration
- Memory counts
- Skill improvement success rate
- Retrieval effectiveness

---

# 8. Safety and Governance

## Workspace Read-Only Enforcement (Non-Negotiable)

- Workspaces are **always read-only** during a dream run. The dreamer never writes into workspace directories in-place.
- All state is recorded in a **central location** (the memory backend and skills store).
- All mutations go through **explicit structured tool contracts** with defined schemas:
  - `record_memory(scope, statement, provenance)` — writes to the memory backend.
  - `propose_skill_patch(scope, diff, risk)` — writes to the skills store.
- Repo/workspace-scoped outputs are staged on a **separate branch**, never on the working branch.
- Merging scoped outputs into a workspace requires **explicit human approval**.
- No dream run may resolve its own approval gate.

## Constraints

- Transcripts are treated as inert data.
- The dreamer must never execute instructions found inside old transcripts.
- All generated memories must preserve provenance.
- Human review must remain possible for every output.

## Provenance

Every generated memory should track:

- Source session
- Source lines/messages
- Confidence score
- Supporting evidence
- Contradictions

---

# 9. Cross Platform Support

The system must support:

- macOS
- Windows

Future:

- Linux

---

# 10. Scheduling

Support:

- Manual runs
- Cron-like schedules
- Background execution
- CI/pipeline invocation

Suggested default:

- Dream every 24 hours
- Minimum session threshold before dreaming

---

# 11. Architecture Overview

```text
[Chat Logs / Tool Events]
           ↓
     [Adapters]
           ↓
   [Normalized Events]
           ↓
     [Dream Pipeline]
           ↓
    ┌─────────┐
    ↓         ↓
Memories  Skill Patches
    ↓         ↓
Backends  Branch/Approval
```

> **Note:** Documentation generation (Docs node) belongs to the deferred use case. See [Deferred Use Case: Documentation Generation](#deferred-use-case-documentation-generation).

---

# 12. Future Ideas

- Team/shared dreaming
- Outcome-based evaluation loops
- Automated replay validation
- Dream quality scoring
- Local vector indexing
- Interactive dream UI
- Repo archaeology mode
- Multi-agent dreaming
- Auto-generated subagents
- MCP integrations
- Knowledge graphs
- Skill marketplaces

---

# Core Principle

The goal is not to make agents remember everything.

The goal is:

> Make agents stop repeating the same avoidable mistakes while preserving the intent and context of the project.

---

# 13. Delivery Rules (Non-Negotiable)

These rules are implementation constraints for all phases.

## 13.1 Reusable, Pluggable Code

- All integrations use contract-first interfaces and registries.
- Core logic depends on abstractions, never concrete vendors.
- New adapters/backends must be add-only changes where possible.
- Plugin modules must be independently testable.

## 13.2 File Size Budget

- Target: fewer than 150 LOC per source file.
- Preferred split: one responsibility per file.
- If a file grows beyond 150 LOC, split by concern before adding features.

## 13.3 TDD Required

- Red -> Green -> Refactor for each feature increment.
- Start each slice with failing tests that express user-visible behavior.
- Unit tests for contracts and transformations.
- Integration tests for end-to-end pipeline behavior.

## 13.4 Vertical Slice Delivery

- Each slice ships a thin, end-to-end path from input to observable output.
- Avoid horizontal phase-only work that cannot run independently.
- Every slice must produce user-visible value and measurable outcomes.

---

# 14. Concrete Vertical Slice Plan

## Slice 0 - Kernel and Contracts

### Goal

Create the minimal runnable skeleton with plugin contracts and pipeline orchestration.

### Scope

- Define interfaces for transcript adapter, memory backend, intelligence provider, and pipeline stage.
- Build plugin registry and dependency wiring.
- Add a no-op dream command that runs all stages with stub plugins.

### TDD Entry Tests

- Registry loads plugins by id.
- Pipeline runs stages in order.
- Missing plugin ids fail with actionable errors.

### Done Criteria

- CLI command runs successfully with stubs.
- Contract tests pass.
- No file exceeds 150 LOC.

## Slice 1 - VS Code/Copilot Ingestion to Normalized Events

### Goal

Ship one real ingestion path from local session logs into normalized events.

### Scope

- Implement VS Code/Copilot adapter.
- Add incremental ingestion checkpointing.
- Emit normalized events to internal store.

### TDD Entry Tests

- Parser handles known session structure.
- Incremental runs only process new material.
- Malformed records are skipped with diagnostics.

### Done Criteria

- System ingests real local sessions.
- Normalized event snapshots are deterministic.
- Dream diary reports sessions processed.

## Slice 2 - Memory Consolidation (Single Backend)

### Goal

Convert normalized signals into durable memories with provenance.

### Scope

- Implement one backend first (filesystem or Copilot memory).
- Add dedupe and stale-prune logic.
- Record provenance and confidence fields.

### TDD Entry Tests

- Duplicate memories merge correctly.
- Stale memories are pruned by policy.
- Contradictory memories are flagged, not silently overwritten.

### Done Criteria

- A dream run adds, updates, and prunes memories correctly.
- Every memory item contains provenance metadata.
- Consolidation summary appears in diary.

> **DEFERRED — Slice: Documentation Reconstruction**
>
> This slice has been removed from the active plan and moved to the [Deferred Use Case: Documentation Generation](#deferred-use-case-documentation-generation) appendix. It will be scheduled as a separate initiative at a later stage.

## Slice 3 - Skill Maintenance Proposals

### Goal

Detect skill problems and output proposed patches safely.

### Scope

- Detect repeated retries and post-skill user corrections.
- Generate patch proposals and safety labels.
- Route high-risk changes to approval flow.

### TDD Entry Tests

- Detection rules trigger on representative transcripts.
- Proposal format is valid and reviewable.
- High-risk proposals never auto-apply.

### Done Criteria

- Dream run outputs skill proposal artifacts.
- Risk classification is visible in diary.
- No direct mutation of protected files without approval.

## Slice 4 - Multi-Plugin Expansion

### Goal

Prove pluggability by adding at least one additional adapter, backend, and provider.

### Scope

- Add one future adapter.
- Add second memory backend.
- Add second intelligence provider.

### TDD Entry Tests

- Contract test suite passes unchanged for all plugin implementations.
- Runtime plugin switching requires config only.

### Done Criteria

- Same dream scenario runs across plugin combinations.
- No core rewrites required for new integrations.

## Slice 5 - Scheduling, Observability, Governance

### Goal

Operationalize safe recurring dreams.

### Scope

- Add manual and scheduled execution modes.
- Finalize dream diary and metrics export.
- Enforce transcript-as-data safety and write isolation.

### TDD Entry Tests

- Scheduler triggers runs at configured intervals.
- Diary includes all required fields.
- Transcript prompt injection strings are treated as inert data.

### Done Criteria

- Daily scheduled run is stable.
- Metrics are queryable.
- Governance checks block unsafe actions.

---

# 15. Definition of Done Per Slice

- All tests green, with new tests added before implementation.
- End-to-end demo path documented for the slice.
- Observability added for new behavior.
- No file exceeds 150 LOC target.
- Public interfaces documented.
- No backward-compatibility requirement; obsolete contracts can be removed in the same slice.

---

# 16. Suggested Initial Code Topology

This topology supports pluggability and small files.

- src/core/contracts/
- src/core/registry/
- src/core/pipeline/
- src/adapters/
- src/backends/
- src/providers/
- src/dream/
- src/docs/
- src/skills/
- tests/unit/
- tests/integration/

Each folder should prefer many small files over large utility files.

---

# 17. Milestone Sequence

- Milestone A: Slices 0-1 (runnable ingestion pipeline)
- Milestone B: Slice 2 (memory consolidation value loop)
- Milestone C: Slices 3-4 (skill proposals + proven pluggability)
- Milestone D: Slice 5 (operations and governance hardening)

> **Note:** The former Slice 3 (Documentation Reconstruction) has been deferred. Slices have been renumbered accordingly in [Section 15](#15-concrete-vertical-slice-plan). See [Deferred Use Case: Documentation Generation](#deferred-use-case-documentation-generation).

This sequence prioritizes user-visible value early while keeping architecture modular.

---

# 18. Companion Docs

- Execution breakdown: docs/execution-plan.md
- TDD and verification approach: docs/test-strategy.md

---

# 19. Technology Choices (Concrete)

## Core Implementation

- TypeScript (strict) on Node.js 22 LTS
- pnpm for package management
- vitest for TDD workflows
- zod for schema and contract validation
- SQLite for run metadata and checkpoints

## Why

- Strong contracts for pluggable boundaries.
- Fast test cycles for Red -> Green -> Refactor.
- Good ecosystem support for Copilot SDK BYOK routing and local endpoints.
- Easy module splitting to keep files below 150 LOC.

See: docs/technology-decisions.md

---

# 20. Adapter Integration Research Status

## Concrete Research Completed

From this local environment, Copilot debug-log artifacts were sampled directly.

Observed file types under session logs:

- main.jsonl
- models.json

Observed `main.jsonl` sample shape includes fields like:

- `v`
- `ts`
- `sid`
- `type` (`session_start` observed)
- `attrs.copilotVersion`
- `attrs.vscodeVersion`

Observed `models.json` includes model capability metadata such as:

- model id and vendor
- context/token limits
- feature supports (streaming, tools, vision, reasoning effort)

## Current Limitation

In this environment, sampled `main.jsonl` files are currently session-start-only; richer event types were not present in sampled local files.

## Next Research Actions

- Collect richer transcript fixtures from exported chat sessions and longer debug traces.
- Add adapter fixture packs for each supported source (Copilot export, CLI, future IDE adapters).
- Freeze fixtures as contract tests before broad adapter expansion.

---

# 21. Verification Beyond Unit Tests

## Multi-Layer Verification

- Contract tests: cross-plugin compatibility.
- Integration replay tests: transcript -> memory -> skills.
- Golden tests: deterministic normalized events and generated skill patches.
- Safety tests: transcript prompt-injection treated as inert data.
- Evals: rubric + pairwise model comparison on fixed fixtures.

## Evals in This Environment

Use available no-cost endpoints for evaluation runs:

- Hosted OpenAI-compatible endpoint from local untracked env vars
- `qwen3.6-35b-a3b-q3`

Optional local endpoint for side-by-side baseline:

- llama.cpp OpenAI-compatible server

Recommended approach:

- Run the same fixture corpus against both endpoints.
- Score memory quality, contradiction detection, doc completeness, latency, and stability.
- Gate merges on minimum eval thresholds for critical slices.

See: docs/evaluation-plan.md

Initial eval assets:

- evals/promptfooconfig.yaml
- evals/prompts/memory-quality.txt

---

# Deferred Use Case: Documentation Generation

> **Status: DEFERRED — Not in the current implementation scope. This is a separate use case to be planned and implemented in a future initiative.**

## Overview

Documentation generation is intentionally separated from the core dreaming use case. The core system focuses exclusively on memory consolidation and skill maintenance. Documentation generation requires different triggers, quality criteria, and governance concerns that warrant a standalone initiative.

## What This Use Case Covers

### Spec Reconstruction

For repositories built primarily through agent conversations, the system would reconstruct:

- Product vision
- Requirements
- Architecture intent
- Constraints
- Design decisions
- Open questions
- Rejected approaches

The system must distinguish between:

- Explicit user intent
- Implemented behavior
- Inferred requirements
- Contradictions
- Unknowns

### Generated Documentation Artifacts

- VISION.md
- PRODUCT_SPEC.md
- ARCHITECTURE.md
- DECISIONS.md
- OPEN_QUESTIONS.md
- Memory indexes

### AGENTS.md Concision Guard

- `AGENTS.md` must remain concise.
- The doc system should prefer removing outdated lines over endlessly appending.
- Avoid large generated dumps.
- Keep agent startup context lightweight.

### Idempotency

- Reruns with unchanged input must produce minimal or no diff.
- Stable section ordering required.
- PR-friendly diff behavior required.

## Pipeline Placement

When implemented, documentation generation would operate as a dedicated pipeline phase after consolidation:

```text
Phase 4 — Documentation and Indexing
  - Generate or update: VISION.md, PRODUCT_SPEC.md, ARCHITECTURE.md, DECISIONS.md, OPEN_QUESTIONS.md
  - Update memory indexes
  - Enforce AGENTS concision policy
```

## Architecture Impact

When implemented, the architecture would add a Docs output path:

```text
[Dream Pipeline]
       ↓
 ┌─────┼─────────┐
 ↓     ↓         ↓
Memories  Docs  Skill Patches
 ↓     ↓         ↓
Backends  Repo  Branch/Approval
```

## Deferred Slice: Documentation Reconstruction

This slice was originally Slice 3 in the active plan. It is now deferred pending a separate planning session.

### Goal

Generate useful project docs from consolidated memory and events.

### Scope

- Generate PRODUCT_SPEC, ARCHITECTURE, DECISIONS, OPEN_QUESTIONS.
- Enforce concise AGENTS policy.
- Add idempotent doc update strategy (stable ordering, deterministic sections).

### TDD Entry Tests (when implemented)

- Generated docs include required sections.
- Re-running without new signals produces minimal/no diff.
- AGENTS update remains concise under configured max size.

### Done Criteria (when implemented)

- Docs are generated with traceable evidence links.
- Reruns are stable and reviewable.
- PR-friendly diff behavior verified.

## Evaluation Corpus (Deferred)

When this use case is scheduled, the following eval fixtures will be needed:

- 10 doc-generation fixtures with known required outputs.
- Documentation completeness score by required section.
- Idempotency score: rerun diff size on unchanged input.

## Why Deferred

- Core memory consolidation and skill maintenance deliver standalone value without documentation.
- Documentation generation has distinct quality requirements (completeness, idempotency, PR hygiene) that benefit from dedicated design.
- Deferring avoids coupling the core pipeline's stability to doc generation quality.
- Allows the core system to ship and stabilize before adding a higher-complexity output path.
- scripts/run-evals.sh
