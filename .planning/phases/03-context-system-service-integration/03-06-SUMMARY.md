---
phase: 03-context-system-service-integration
plan: 06
subsystem: prompts
tags: [prompt-service, macro-engine, system-builder, dead-code-removal, context-builder]

# Dependency graph
requires:
  - phase: 03-03
    provides: Core generation services migrated to ContextBuilder
  - phase: 03-04
    provides: Support services and retrieval migrated to ContextBuilder
  - phase: 03-05
    provides: Wizard, translation, and image services migrated to ContextBuilder
provides:
  - "Old PromptService class deleted -- no singleton prompt service"
  - "Old MacroEngine class and all macro definition files deleted"
  - "systemBuilder.ts deleted -- WorldStateContext and buildChapterSummariesBlock moved to NarrativeService"
  - "prompts/index.ts simplified to template exports and legacy type stubs only"
  - "PROMPT_TEMPLATES preserved and accessible for PackService seeding"
  - "All remaining services (characterCardImporter, lorebookImporter) migrated to ContextBuilder"
  - "All UI components (imageStore, CharacterPanel, StoryEntry) migrated to database.getPackTemplate"
affects: [04-ui, 06-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Legacy type stubs preserved for UI component backward compatibility (Phase 4 removal)"
    - "Image style prompts fetched via database.getPackTemplate('default-pack', styleId) in UI"
    - "Portrait generation uses ContextBuilder.render('image-portrait-generation') in UI"

key-files:
  created: []
  modified:
    - src/lib/services/prompts/index.ts
    - src/lib/services/prompts/types.ts
    - src/lib/services/prompts/definitions.ts
    - src/lib/services/prompts/definitions/index.ts
    - src/lib/services/ai/generation/NarrativeService.ts
    - src/lib/services/ai/generation/index.ts
    - src/lib/services/ai/index.ts
    - src/lib/services/characterCardImporter.ts
    - src/lib/services/lorebookImporter.ts
    - src/lib/stores/wizard/imageStore.svelte.ts
    - src/lib/stores/settings.svelte.ts
    - src/lib/services/promptExport.ts
    - src/lib/components/world/CharacterPanel.svelte
    - src/lib/components/story/StoryEntry.svelte
    - src/lib/components/prompts/PromptEditor.svelte
    - src/lib/components/settings/tabs/prompts.svelte
    - src/lib/services/generation/GenerationPipeline.ts
    - src/lib/services/generation/SuggestionsRefreshService.ts
    - src/lib/services/generation/phases/RetrievalPhase.ts
  deleted:
    - src/lib/services/prompts/macros.ts
    - src/lib/services/prompts/definitions/macros/core.ts
    - src/lib/services/prompts/definitions/macros/narrative.ts
    - src/lib/services/prompts/definitions/macros/features.ts
    - src/lib/services/prompts/definitions/macros/context.ts
    - src/lib/services/prompts/definitions/macros/placeholders.ts
    - src/lib/services/prompts/definitions/macros/index.ts
    - src/lib/services/ai/prompts/systemBuilder.ts

key-decisions:
  - "Preserve legacy macro type stubs in types.ts for UI component compilation -- remove in Phase 4"
  - "Move WorldStateContext, formatStoryTime, buildChapterSummariesBlock to NarrativeService (primary consumer)"
  - "PromptSettings keeps customMacros/macroOverrides fields as deprecated for saved data compatibility"
  - "Migrate characterCardImporter and lorebookImporter to ContextBuilder (missed in 03-03/04/05)"
  - "Image style prompts in UI components fetched via database.getPackTemplate instead of promptService"

patterns-established:
  - "All prompt rendering in codebase goes through ContextBuilder + LiquidJS -- no alternative path"

# Metrics
duration: 15min
completed: 2026-02-09
---

# Phase 3 Plan 6: Old Prompt System Cleanup Summary

**MacroEngine, PromptService, and systemBuilder deleted; 3100+ lines of dead code removed; all remaining services migrated to ContextBuilder pipeline**

## Performance

- **Duration:** 15 min
- **Started:** 2026-02-09T22:58:02Z
- **Completed:** 2026-02-09T23:13:08Z
- **Tasks:** 2
- **Files modified:** 27 (19 modified, 8 deleted)

## Accomplishments
- Deleted MacroEngine class, PromptService class, systemBuilder.ts, and all 6 macro definition files (~3100 lines removed)
- Migrated characterCardImporter and lorebookImporter services to ContextBuilder pipeline (not covered by plans 03-03/04/05)
- Migrated imageStore, CharacterPanel, and StoryEntry to database.getPackTemplate for image style prompts
- Removed promptService.init() calls from settings store and prompt export service
- Simplified prompts/index.ts to export only templates, utility functions, and legacy type stubs
- Full TypeScript compilation passes with 0 errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete MacroEngine, PromptService, and macro definitions** - `9e5c0db` (feat)
2. **Task 2: Final cleanup and import verification** - verification only, no additional changes needed

## Files Created/Modified
- `src/lib/services/prompts/macros.ts` - DELETED (MacroEngine class)
- `src/lib/services/prompts/definitions/macros/*.ts` - DELETED (6 macro definition files)
- `src/lib/services/ai/prompts/systemBuilder.ts` - DELETED (manual system prompt builder)
- `src/lib/services/prompts/index.ts` - Simplified to template exports + legacy type stubs
- `src/lib/services/prompts/types.ts` - Kept PromptTemplate/PromptCategory/PromptOverride + legacy stubs
- `src/lib/services/prompts/definitions.ts` - Template-only utilities
- `src/lib/services/ai/generation/NarrativeService.ts` - Now hosts WorldStateContext + buildChapterSummariesBlock
- `src/lib/services/characterCardImporter.ts` - Migrated to ContextBuilder
- `src/lib/services/lorebookImporter.ts` - Migrated to ContextBuilder
- `src/lib/stores/wizard/imageStore.svelte.ts` - Uses database.getPackTemplate for styles
- `src/lib/components/world/CharacterPanel.svelte` - Uses database.getPackTemplate + ContextBuilder
- `src/lib/components/story/StoryEntry.svelte` - Uses database.getPackTemplate for styles
- `src/lib/stores/settings.svelte.ts` - Removed promptService.init() calls
- `src/lib/services/promptExport.ts` - Removed promptService.init() call

## Decisions Made
- **Legacy type stubs preserved:** Macro-related types (Macro, MacroOverride, ContextPlaceholder, etc.) kept as deprecated stubs in types.ts so existing UI components (PromptEditor, MacroEditor, prompts settings tab) continue to compile. These will be removed when UI is rewritten in Phase 4.
- **WorldStateContext moved to NarrativeService:** Rather than creating a new shared types file, moved the interface and utility functions to NarrativeService since it's the primary consumer. Re-exported from generation/index.ts barrel.
- **PromptSettings field deprecation:** customMacros and macroOverrides fields retained with `@deprecated` markers for backward compatibility with existing saved settings JSON.
- **Un-migrated services discovered:** characterCardImporter and lorebookImporter were still using promptService.renderPrompt() -- migrated to ContextBuilder as blocking fix (Deviation Rule 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migrated characterCardImporter to ContextBuilder**
- **Found during:** Task 1 (pre-deletion import scan)
- **Issue:** characterCardImporter.ts still used promptService.renderPrompt() and renderUserPrompt() -- not migrated in plans 03-03/04/05
- **Fix:** Replaced with ContextBuilder().add({vars}).render(templateId) pattern
- **Files modified:** src/lib/services/characterCardImporter.ts
- **Verification:** svelte-check passes
- **Committed in:** 9e5c0db

**2. [Rule 3 - Blocking] Migrated lorebookImporter to ContextBuilder**
- **Found during:** Task 1 (pre-deletion import scan)
- **Issue:** lorebookImporter.ts still used promptService.renderPrompt() and renderUserPrompt()
- **Fix:** Replaced with ContextBuilder().add({vars}).render('lorebook-classifier')
- **Files modified:** src/lib/services/lorebookImporter.ts
- **Verification:** svelte-check passes
- **Committed in:** 9e5c0db

**3. [Rule 3 - Blocking] Migrated imageStore, CharacterPanel, StoryEntry to database.getPackTemplate**
- **Found during:** Task 1 (pre-deletion import scan)
- **Issue:** UI components still used promptService.getPrompt(styleId) for image style prompts
- **Fix:** Replaced with database.getPackTemplate('default-pack', styleId) matching the pattern established in 03-05
- **Files modified:** src/lib/stores/wizard/imageStore.svelte.ts, src/lib/components/world/CharacterPanel.svelte, src/lib/components/story/StoryEntry.svelte
- **Verification:** svelte-check passes
- **Committed in:** 9e5c0db

**4. [Rule 3 - Blocking] Added legacy type stubs for UI component compilation**
- **Found during:** Task 1 (post-deletion svelte-check)
- **Issue:** UI components (PromptEditor, MacroEditor, MacroChip, etc.) import Macro/MacroOverride/ContextPlaceholder types that were deleted
- **Fix:** Added deprecated type stubs in prompts/types.ts and re-exported from barrel
- **Files modified:** src/lib/services/prompts/types.ts, src/lib/services/prompts/index.ts
- **Verification:** svelte-check passes with 0 errors
- **Committed in:** 9e5c0db

---

**Total deviations:** 4 auto-fixed (all Rule 3 - blocking issues)
**Impact on plan:** All fixes were necessary to prevent compilation errors after deleting the prompt system. The characterCardImporter and lorebookImporter migrations follow the established ContextBuilder pattern from 03-03/04/05. No scope creep.

## Issues Encountered
None - execution proceeded smoothly once the full scope of consumers was identified through the pre-deletion grep scan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 3 complete: All services use ContextBuilder + LiquidJS pipeline
- No file in the codebase uses the old MacroEngine or PromptService for prompt rendering
- PROMPT_TEMPLATES preserved for pack seeding and settings UI
- Legacy type stubs in prompts/types.ts should be removed in Phase 4 when UI components are rewritten
- Macro Library UI in settings (prompts.svelte) shows empty -- will need Phase 4 redesign

---
*Phase: 03-context-system-service-integration*
*Completed: 2026-02-09*
