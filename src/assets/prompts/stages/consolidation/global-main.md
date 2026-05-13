Apply global consolidation from specialist recommendations.

Only write globally valid user-scope memories; do not create workspace-scoped memories in this pass.
If a workspace memory is globally valid, keep the workspace fact and add/merge a separate user-scope global rule.
Remove or narrow global memories that are actually workspace-local.
Call finalize_consolidation when done.
