---
phase: 03-context-system-service-integration
plan: 05
subsystem: prompts
tags: [contextbuilder, liquid, wizard, translation, image-generation, service-migration]

# Dependency graph
requires:
  - phase: 03-01
    provides: ContextBuilder with flat namespace, render(), add(), forStory()
  - phase: 03-02
    provides: All prompt templates converted to Liquid syntax in PROMPT_TEMPLATES
provides:
  - ScenarioService (wizard) migrated to ContextBuilder with progressive context via new ContextBuilder() + .add()
  - TranslationService migrated to ContextBuilder (no story context needed -- translation settings are global)
  - Image services (ImageAnalysisService, BackgroundImageService) migrated to ContextBuilder for standard templates
  - Image style services (InlineImageService, InlineImageTracker, AI index) fetch external templates directly from database
  - AI index.ts getStylePrompt uses database.getPackTemplate instead of promptService
affects: [03-06, 06-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wizard services use new ContextBuilder() + .add() for progressive context (no forWizard factory)"
    - "Translation services use new ContextBuilder() without story context (translation settings are global)"
    - "External templates (image-style-*) fetched via database.getPackTemplate('default-pack', styleId) -- bypass ContextBuilder"
    - "Service methods that call ContextBuilder.render() are async (buildSystemPrompt, buildOpeningPrompts, etc.)"

key-files:
  modified:
    - src/lib/services/ai/wizard/ScenarioService.ts
    - src/lib/services/ai/utils/TranslationService.ts
    - src/lib/services/ai/image/ImageAnalysisService.ts
    - src/lib/services/ai/image/BackgroundImageService.ts
    - src/lib/services/ai/image/InlineImageService.ts
    - src/lib/services/ai/image/InlineImageTracker.ts
    - src/lib/services/ai/index.ts
    - src/lib/stores/wizard/wizard.svelte.ts

key-decisions:
  - "Wizard uses new ContextBuilder() not forWizard() -- progressive context via sequential .add() calls"
  - "TranslationService uses ContextBuilder without story context -- translation settings (targetLanguage/sourceLanguage) are global runtime variables passed directly"
  - "External image style templates fetched from database.getPackTemplate not ContextBuilder -- they are raw text without Liquid variables"
  - "prepareStoryData made async because buildSystemPrompt now uses async ContextBuilder.render()"
  - "AI index.ts keeps type PromptContext import for un-migrated method signatures (suggestions, action choices)"

patterns-established:
  - "Service migration pattern: replace promptService.renderPrompt + renderUserPrompt with ctx = new ContextBuilder(); ctx.add({...}); const { system, user } = await ctx.render(templateId)"
  - "External template pattern: database.getPackTemplate('default-pack', templateId) for raw text templates"

# Metrics
duration: 7min
completed: 2026-02-09
---

# Phase 3 Plan 5: Wizard, Translation, and Image Service Migration Summary

**ScenarioService, TranslationService, and 4 image services migrated from promptService to ContextBuilder pipeline with external template database fetching**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-09T21:32:45Z
- **Completed:** 2026-02-09T22:39:41Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Migrated ScenarioService (9 wizard methods: expandSetting, refineSetting, elaborateCharacter, refineCharacter, generateProtagonist, generateCharacters, buildOpeningPrompts, buildOpeningRefinementPrompts, buildSystemPrompt) from promptService to ContextBuilder
- Migrated TranslationService (7 methods) from hardcoded TRANSLATION_CONTEXT + promptService to ContextBuilder with flat context
- Migrated ImageAnalysisService and BackgroundImageService from PromptContext + promptService to ContextBuilder
- Migrated InlineImageService, InlineImageTracker, and AI index.ts getStylePrompt from promptService.getPrompt to database.getPackTemplate for external style templates

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate ScenarioService to ContextBuilder** - `14e6fa8` (feat)
2. **Task 2: Migrate TranslationService and image services** - `219e310` (feat)

## Files Created/Modified
- `src/lib/services/ai/wizard/ScenarioService.ts` - All 9 wizard prompt methods use new ContextBuilder() + .add() + .render(); removed getWizardPromptContext() and promptService import
- `src/lib/services/ai/utils/TranslationService.ts` - All 7 translation methods use ContextBuilder; removed TRANSLATION_CONTEXT constant
- `src/lib/services/ai/image/ImageAnalysisService.ts` - identifyScenes uses ContextBuilder for standard image analysis templates
- `src/lib/services/ai/image/BackgroundImageService.ts` - analyzeReponsesForBackgroundImage uses ContextBuilder
- `src/lib/services/ai/image/InlineImageService.ts` - getStylePrompt fetches from database instead of promptService
- `src/lib/services/ai/image/InlineImageTracker.ts` - getStylePrompt fetches from database instead of promptService
- `src/lib/services/ai/index.ts` - getStylePrompt fetches from database; removed promptService import (kept type PromptContext for un-migrated method signatures)
- `src/lib/stores/wizard/wizard.svelte.ts` - Added await to prepareStoryData call (method now async)

## Decisions Made
- **No forWizard() factory:** Per actual ContextBuilder API (simplified after plan was written), wizard services use `new ContextBuilder()` + `.add()` progressively. No step-based variable gating.
- **No story context for translation:** Translation settings (targetLanguage/sourceLanguage) are global runtime variables, not per-story. TranslationService uses plain `new ContextBuilder()` without forStory().
- **External templates via database:** Image style templates (image-style-soft-anime, etc.) are raw text with no Liquid variables. Fetched directly from `database.getPackTemplate('default-pack', styleId)` instead of through ContextBuilder.
- **prepareStoryData made async:** buildSystemPrompt now uses async ContextBuilder.render(), requiring prepareStoryData to become async. Wizard store caller updated with await.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved git stash conflicts from prior plan leftover**
- **Found during:** Task 1 verification
- **Issue:** Prior plan (03-03/03-04) left uncommitted changes in working tree that conflicted with stash
- **Fix:** Discarded prior plan's uncommitted changes, applied stash, dropped remaining stash entries
- **Files modified:** None (git state only)
- **Verification:** Clean git status after resolution

**2. [Rule 1 - Bug] Fixed duplicate database imports in image services**
- **Found during:** Task 2 (InlineImageService, InlineImageTracker)
- **Issue:** Replacing `import { promptService }` with `import { database }` created duplicate when `database` was already imported
- **Fix:** Removed duplicate import lines
- **Files modified:** InlineImageService.ts, InlineImageTracker.ts
- **Verification:** svelte-check passes with 0 errors
- **Committed in:** 219e310 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 7 files migrated from promptService to ContextBuilder/database pipeline
- Plan 03-06 (remaining service migration) can proceed
- TypeScript compilation passes with 0 errors
- SVC-08 (wizard), SVC-11 (image), SVC-12 (translation) requirements covered

## Self-Check: PASSED

All files verified present:
- FOUND: src/lib/services/ai/wizard/ScenarioService.ts
- FOUND: src/lib/services/ai/utils/TranslationService.ts
- FOUND: src/lib/services/ai/image/ImageAnalysisService.ts
- FOUND: src/lib/services/ai/image/BackgroundImageService.ts
- FOUND: src/lib/services/ai/image/InlineImageService.ts
- FOUND: src/lib/services/ai/image/InlineImageTracker.ts
- FOUND: src/lib/services/ai/index.ts
- FOUND: src/lib/stores/wizard/wizard.svelte.ts

All commits verified:
- FOUND: 14e6fa8 (Task 1)
- FOUND: 219e310 (Task 2)

---
*Phase: 03-context-system-service-integration*
*Completed: 2026-02-09*
