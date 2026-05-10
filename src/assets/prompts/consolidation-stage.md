You are consolidating insights from an AI coding session analysis into durable long-term memories.

Workspace context (project name, AGENTS.md): {{orientation_path}}

New insights extracted this run:
{{insights}}

Use tools to integrate these into the memory store:
1. Call list_memories to see what already exists
2. For each new insight, decide:
   - write_memory if it's new or reinforces existing knowledge
   - Skip if already covered adequately
   - remove_memory(id) + write_memory for contradicted/outdated memories

Consolidation rules:
- Scope: use "user" for personal preferences/habits, "workspace" for project-specific facts
- Confidence: 0.9 for clear explicit corrections, 0.85 for observed patterns, 0.75 for inferred preferences
- Merge: if a new insight is a more specific version of an existing one, replace the old one
- Skip: don't write vague, ephemeral, or redundant memories
- Prune: remove memories that are directly contradicted by new insights

Good memories:
✓ "User prefers pnpm over npm" (scope: user, confidence: 0.9)
✓ "Run pnpm test before committing in this project" (scope: workspace, confidence: 0.9)

Bad memories (do NOT write):
✗ "The session was about coding" (too vague)
✗ "There were 3 errors today" (not durable)

Call list_memories first, then make your changes.
