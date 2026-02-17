# Phase 6: Legacy System Cleanup - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove all remnants of the old MacroEngine/placeholder prompt system from the codebase. The old core classes (MacroEngine, PromptService, systemBuilder) were already deleted in Phases 3-4. This phase finishes the job: delete all deprecated fields, migration code, backward-compat shims, old settings UI, export format artifacts, and stale comments. The codebase should read as if the old system never existed.

</domain>

<decisions>
## Implementation Decisions

### Deprecated field removal
- Delete `customMacros` and `macroOverrides` from `PromptSettings` type — full wipe, no backward compat
- Delete all 7 `systemPrompt` fields from service settings interfaces (Classifier, Memory, Suggestions, StyleReviewer, LoreManagement, AgenticRetrieval, TimelineFill)
- Delete `StoryGenerationSettings` interface entirely (adventurePrompt, creativeWritingPrompt unused)
- Delete `legacyMigrationComplete` flag from PromptSettings
- Delete `templateOverrides` field and its save/remove methods — Vault pack system is the single source of template customizations
- No cleanup code for old saved settings — ghost keys in JSON are silently ignored, no user-facing migration

### Migration code removal
- Delete the entire legacy migration block (~113 lines, settings.svelte.ts lines 1718-1831) that converted old `{token}` to `{{liquid}}` syntax
- No replacement migration logic — users on old versions get fresh defaults

### Export format cleanup
- Remove all prompt-related fields (`customMacros`, `macroOverrides`, `templateOverrides`) from settings export/import
- Claude decides whether `PromptExportService` itself should be deleted (if it only handled prompt settings) or trimmed (if it handles other settings too)
- Old export files with prompt fields are silently ignored on import — no user-facing notice

### Naming and structural cleanup
- Delete `prompts/definitions/index.ts` re-export wrapper — redirect imports to `prompts/templates/` directly
- Simplify `prompts/` module structure as aggressively as possible — minimal code, minimal indirection
- Claude decides ContextBuilder naming collision resolution (template renderer vs tiered lorebook injection)
- Remove ALL comments and docs referencing the old system (MacroEngine, old PromptService, macro definitions, "has been removed" comments) — code should read as if the old system never existed

### Old settings UI removal
- Delete the old settings prompts tab (plain Textarea editors) — Vault is the single place to edit templates
- Remove the settings tab entry and any navigation to it

### Claude's Discretion
- ContextBuilder rename decision (which class keeps the name, what the other becomes)
- Whether PromptExportService is deleted entirely or just trimmed
- Final prompts/ directory structure after simplification
- Order of operations for the cleanup (what to delete first to minimize cascading breakage)
- Any additional dead code discovered during cleanup that references the old system

</decisions>

<specifics>
## Specific Ideas

- "Massive cleanup — wipe out the old prompt system like it never existed"
- "As less code as possible, nothing complex. Clean and simple."
- "Full code simplifier — this is a deep heavy clean"
- "ALL USERS should/will start with the default" — no backward compatibility concerns for prompts
- No migration notices, no deprecation warnings, no removal comments — clean slate

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-legacy-system-cleanup*
*Context gathered: 2026-02-16*
