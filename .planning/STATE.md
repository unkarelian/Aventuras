# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-08)

**Core value:** Every {{ variable }} in every prompt template resolves correctly, predictably, through one pipeline — and users can create, edit, and share prompt presets without fighting the system.
**Current focus:** Phase 3 - Context System & Service Integration

## Current Position

Phase: 3 of 6 (Context System & Service Integration) -- COMPLETE
Plan: 6 of 6 in current phase -- COMPLETE
Status: Phase 3 complete, ready for Phase 4
Last activity: 2026-02-09 -- Completed plan 03-06 (Old prompt system cleanup)

Progress: [████████░░] 79%

## Performance Metrics

**Velocity:**
- Total plans completed: 11
- Average duration: 11.4 minutes
- Total execution time: 1.98 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 2 | 436s | 218s |
| 02 | 3 | 525s | 175s |
| 03 | 6 | 9885s | 1648s |

**Recent Executions:**

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 03 | 06 | 906s | 2 | 27 |
| 03 | 05 | 420s | 2 | 8 |
| 03 | 04 | 3498s | 2 | 9 |
| 03 | 03 | 3554s | 2 | 5 |
| 03 | 02 | 725s | 2 | 8 |
| 03 | 01 | 782s | 2 | 4 |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Template engine choice: LiquidJS for safe Jinja-like syntax (verified and working)
- Three variable categories: system (auto-filled), runtime (service-injected), custom (user-defined)
- Clean slate migration: No backward compatibility with old macro overrides
- Error message simplification: Transform LiquidJS technical errors into plain language for non-technical users
- Levenshtein distance threshold: maxDistance=2 for "did you mean?" suggestions
- Validation stateless design: No side effects, safe for real-time editor keystroke validation
- Pack variable types: 5 types including textarea (distinct from Phase 1's 4 VariableTypes)
- Enum variables use label+value pairs for display vs storage separation
- Variables have dual naming: variableName (template) and displayName (UI)
- No versioning on packs: edits overwrite in place, export serves as snapshot mechanism
- Pack deletion protection: ON DELETE RESTRICT prevents deleting packs with active stories
- Content hashing: SHA-256 via Web Crypto API with whitespace normalization for modification detection
- Foreign key enforcement: PRAGMA foreign_keys = ON in database init ensures constraints work
- Template upsert preserves original created_at via INSERT OR REPLACE pattern
- PackService singleton follows existing service pattern (database, templateEngine)
- Template seeding handles both content and userContent from PROMPT_TEMPLATES
- User content uses templateId-user naming convention (matches PromptOverride pattern)
- Zod validation at system boundaries only (not every database read)
- ContextBuilder flat namespace: all variables as {{ variableName }} (no nesting)
- ContextBuilder per-render instantiation: not a singleton, use static factories
- External templates bypass Liquid rendering (image generation, interactive)
- Wizard progressive context: variables available based on step number
- templateEngine imported from engine.ts directly (not barrel) to avoid RenderResult name collision
- Translation settings (targetLanguage/sourceLanguage) are runtime variables (global settings, not per-story)
- 67 runtime variables cataloged with wizard step availability annotations
- Narrative templates include full system prompt instruction text (POV/tense/mode conditionals, story context, chapter summaries, style guidance)
- 7 external templates identified: 3 image-style (raw text), interactive-lorebook, lorebook-classifier, character-card-import, vault-character-import (service-injected)
- Complex macro variants inlined as Liquid {% if/elsif/else %} conditionals -- eliminates MacroEngine scoring-based resolution
- External templates (interactive-lorebook) fetched via database.getPackTemplate() with manual placeholder injection
- Generation ContextBuilder imports new pipeline as ContextPipeline to avoid class name collision
- Services without storyId use new ContextBuilder() with add() for mode/pov/tense as flat variables
- Service migration pattern: ContextBuilder.forStory(storyId) + ctx.add({vars}) + ctx.render(templateId) replaces promptService.renderPrompt/renderUserPrompt
- Priming message moved to NarrativeService private methods (no macro engine dependency)
- buildChapterSummariesBlock kept in systemBuilder as pure utility import
- AIService orchestrator bridges old PromptContext API to new storyId-based ContextBuilder API
- Wizard uses new ContextBuilder() not forWizard() -- progressive context via sequential .add() calls
- TranslationService uses ContextBuilder without story context -- translation settings are global runtime variables
- External image style templates fetched from database.getPackTemplate not ContextBuilder -- raw text without Liquid variables
- prepareStoryData made async because buildSystemPrompt now uses async ContextBuilder.render()
- Legacy macro type stubs preserved in prompts/types.ts for UI component compilation -- remove in Phase 4
- WorldStateContext, formatStoryTime, buildChapterSummariesBlock moved from systemBuilder to NarrativeService
- PromptSettings keeps deprecated customMacros/macroOverrides fields for saved data backward compatibility
- All prompt rendering in codebase now goes through ContextBuilder + LiquidJS -- no alternative path

### Pending Todos

None yet.

### Blockers/Concerns

**Phase 1 readiness:**
- ✓ LiquidJS installed and verified (v11.3.7) - working correctly with all test cases
- ✓ Security model (sandboxing, prototype pollution prevention) - validated via strictFilters: true configuration
- ✓ Phase 1 complete: Template engine with validation and public API ready for Phase 2

**Phase 4 readiness:**
- CodeMirror 6 Svelte 5 wrapper availability uncertain — may need research-phase during planning
- Mobile editor UX patterns for virtual keyboard handling need validation

**Phase 6 readiness:**
- Legacy template audit required — all existing templates and macro types must be mapped to new system before migration

## Session Continuity

Last session: 2026-02-09 (phase execution)
Stopped at: Completed 03-06-PLAN.md (Old prompt system cleanup) -- Phase 3 complete
Resume file: .planning/phases/03-context-system-service-integration/03-06-SUMMARY.md
