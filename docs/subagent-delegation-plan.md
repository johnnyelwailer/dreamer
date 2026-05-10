# Subagent Delegation Plan (Dreamer Orchestrator)

Date: 2026-05-10
Status: Ready for implementation
Owner: Dreamer runtime

## 1. Objective

Preserve the existing staged Dream pipeline while introducing specialist subagents inside each agent-driven stage.

Design intent:
- Keep Dreamer as the top-level orchestrator.
- Keep stage order and stage boundaries intact.
- Delegate focused tasks within a stage to isolated custom agents.
- Use explicit tool scoping and default-agent tool exclusion for least privilege.

## 2. Current Baseline

Current stage orchestration:
- Stage orchestration runs sequentially through configured stageOrder.
- Signal and Consolidation currently run as one broad agent each.
- Orientation, Governance, Observability, Documentation are mostly deterministic.
- Skills is currently placeholder behavior.

Current provider shape:
- IntelligenceProvider exposes summarize and runAgent.
- runAgent creates a Copilot session with tools and sends prompt/retries.
- includeSubAgentStreamingEvents is already wired at session level.

## 3. Target Architecture

Top-level flow remains unchanged:
- Orientation -> Signal -> Consolidation -> Documentation -> Skills -> Governance -> Observability

Inside each stage, add a stage-local agent pack:
- A default orchestrator agent for stage control.
- Specialist agents with dedicated prompt + scoped tools.
- Optional infer=false specialists for explicit invocation only.
- defaultAgent.excludedTools to force delegation for heavy or sensitive tools.

## 4. Stage-Level Delegation Design

### 4.1 Orientation (optional enhancement)

Purpose:
- Keep deterministic artifact creation.
- Optionally add read-only scouts in very large repos.

Specialists:
- docs-scout: reads AGENTS and core docs.
- repo-scout: maps code layout and key scripts.

Write authority:
- None.

### 4.2 Signal (first implementation slice)

Purpose:
- Extract durable insights from session artifacts with stronger separation of concerns.

Specialists:
- timeline-analyst: chronology, retries, loops, breakpoints.
- behavior-analyst: user preferences and communication patterns.
- architecture-analyst: technical conventions and project decisions.
- evidence-auditor: validates each candidate against primary evidence.
- insight-recorder: final mutation path for record_insight.

Tool scopes:
- read_file and get_message_details for analysts/auditor.
- record_insight only for insight-recorder.
- Default agent excludes get_message_details and record_insight.

Output contract:
- Only validated insights are recorded.

### 4.3 Consolidation (second implementation slice)

Purpose:
- Convert insights into memory updates with explicit role separation.

Specialists:
- deduper: duplicate clustering.
- contradiction-checker: stale/conflicting memory detection.
- confidence-calibrator: confidence and scope decisions.
- memory-editor: writes/removes using tools.

Tool scopes:
- list_memories for all specialists.
- write_memory/remove_memory only for memory-editor.
- Default agent excludes write/remove.

Output contract:
- Memory mutations occur only through memory-editor pass.

### 4.4 Skills (third implementation slice)

Purpose:
- Replace placeholder with delegated skill-patch generation.

Specialists:
- failure-miner: repeated failure pattern extraction.
- patch-designer: actionable skill patch drafts.
- risk-reviewer: classify risk and rollout requirements.

Output contract:
- Proposal artifacts only, no direct workspace mutation.

### 4.5 Documentation/Governance/Observability

Purpose:
- Keep deterministic outputs.
- Optionally add read-only reviewer agents for quality checks and summaries.

## 5. Runtime Configuration Contract

Add stage agent-pack config to runtime manifest.

Proposed schema (conceptual):

- pipeline.agentPacks[stageId]
  - defaultAgent
    - excludedTools: string[]
  - customAgents: CustomAgentConfig[]
    - name: string
    - displayName?: string
    - description?: string
    - tools?: string[] | null
    - promptTemplatePath: string
    - infer?: boolean
  - execution
    - mode: "inferred" | "explicit-sequence"
    - explicitSequence?: string[]

Notes:
- Keep stageOrder unchanged.
- agentPacks are optional; if absent, stage behavior remains current single-agent behavior.

## 6. Provider/Contract Changes

### 6.1 Core contract extension

Extend RunAgentOptions with optional subagent config payload:
- customAgents
- defaultAgent
- selectedAgent (optional preselection)
- onSubagentEvent hook (optional)

### 6.2 Copilot SDK provider

Enhance runAgent session creation to pass:
- customAgents
- defaultAgent
- agent (when selectedAgent provided)

Maintain current behavior when none are provided.

### 6.3 Stage adapters

Each stage builds:
- Stage tool registry.
- Agent-pack from runtime config.
- Stage controller prompt + retries.

## 7. Prompting Strategy

Prompt files become configurable and stage-local:
- Existing stage prompts remain baseline.
- Add specialist prompt templates under assets/prompts/stages/<stage>/agents/.
- Keep prompts short, role-focused, and tool-aware.

Prompt principles:
- Single responsibility per specialist.
- Explicit output shape expected from each specialist.
- Auditor role verifies before recorder/editor mutation roles execute.

## 8. Observability and Evidence

Capture delegation signals in diary/metrics:
- subagent_started_count
- subagent_completed_count
- subagent_failed_count
- per-agent invocation counts
- per-agent tool usage counts

If available, ingest subagent stream events for richer traces.

## 9. Safety and Isolation

Non-negotiables:
- Least privilege tool scoping.
- Mutating tools restricted to final mutation roles.
- Stage boundaries preserved.
- No workspace write during dream run.

Guardrails:
- Require evidence auditor before mutation role in explicit-sequence mode.
- Reject mutations not tied to validated insights/candidates.

## 10. Rollout Plan

### Slice A: Provider and config plumbing

Deliverables:
- Contract updates for runAgent options.
- Runtime manifest types/parser support for agent packs.
- Provider support for customAgents/defaultAgent/selectedAgent.
- Backward compatibility path when config absent.

Exit criteria:
- Existing tests pass unchanged.
- New unit tests cover option pass-through and defaults.

### Slice B: Signal delegation

Deliverables:
- Signal agent pack + specialist prompts.
- Tool scoping and default-agent exclusion.
- Explicit-sequence execution path with auditor then recorder.

Exit criteria:
- Signal tests verify only recorder can mutate insights.
- No regressions in signal outputs for baseline fixtures.

### Slice C: Consolidation delegation

Deliverables:
- Consolidation agent pack + specialist prompts.
- Mutation authority isolated to memory-editor.

Exit criteria:
- Consolidation tests verify mutation isolation and contradiction handling.

### Slice D: Skills stage activation

Deliverables:
- Replace placeholder with delegated skill proposal pipeline.

Exit criteria:
- Generates deterministic proposal artifact format and quality checks.

## 11. Test Plan

Unit tests:
- Runtime manifest parse/validation for agent packs.
- Provider runAgent option wiring.
- Stage tool-access constraints.

Integration tests:
- Signal delegated flow from sessions -> validated insights.
- Consolidation delegated flow from insights -> memory changes.
- Fallback behavior when agent packs are not configured.

Failure tests:
- Specialist failure does not corrupt state.
- Missing prompt template yields deterministic fallback.
- Tool misuse attempts are rejected by scope.

## 12. Acceptance Criteria

- Dreamer remains stage orchestrator.
- Stage order remains externally configurable.
- Each delegated concern has a specialist with configurable prompt.
- Tool permissions enforce strict isolation.
- Mutation paths are isolated and auditable.
- Backward compatibility preserved when agent packs are absent.
- Tests pass for legacy and delegated modes.

## 13. Immediate Next PR (recommended)

PR 1 scope:
- Implement Slice A only (provider + config plumbing + tests).

Reason:
- Enables safe incremental adoption without changing stage behavior yet.
- Reduces risk before Signal and Consolidation logic changes.
