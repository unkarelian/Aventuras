---
phase: 03-context-system-service-integration
plan: 03
subsystem: generation
tags: [contextbuilder, liquidjs, narrative, classifier, suggestions, action-choices, service-migration]

# Dependency graph
requires:
  - phase: 03-01
    provides: "ContextBuilder class with forStory/add/render API, RenderResult type"
  - phase: 03-02
    provides: "All 41 prompt templates converted to Liquid syntax with inline conditionals"
provides:
  - "NarrativeService using ContextBuilder.forStory() + ctx.render('adventure'/'creative-writing')"
  - "SuggestionsService using ContextBuilder.forStory() + ctx.render('suggestions')"
  - "ActionChoicesService using ContextBuilder.forStory() + ctx.render('action-choices')"
  - "ClassifierService using ContextBuilder.forStory() + ctx.render('classifier') with 16 runtime variables"
  - "Priming message logic moved to NarrativeService private methods (no macro engine dependency)"
affects: [03-04, 03-05, 03-06, 06-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ContextBuilder.forStory(storyId) + ctx.add({runtime vars}) + ctx.render(templateId) for all 4 generation services"
    - "Optional storyId parameter for backward-compatible service migration"
    - "Priming message as private service method instead of macro engine resolution"

key-files:
  modified:
    - src/lib/services/ai/generation/NarrativeService.ts
    - src/lib/services/ai/generation/SuggestionsService.ts
    - src/lib/services/ai/generation/ActionChoicesService.ts
    - src/lib/services/ai/generation/ClassifierService.ts
    - src/lib/services/ai/index.ts

key-decisions:
  - "Keep buildChapterSummariesBlock import from systemBuilder (pure utility, not prompt assembly)"
  - "Move priming message logic to NarrativeService private methods instead of importing from macro engine"
  - "Add optional storyId to SuggestionsService and ActionChoicesContext for backward compatibility"
  - "AIService orchestrator passes story.currentStory?.id to services; callers unchanged"
  - "NarrativeService renders mode-specific template (adventure/creative-writing) via ctx.render()"
  - "ClassifierService passes all 16 runtime variables explicitly via single ctx.add() call"

patterns-established:
  - "Service migration pattern: replace promptService.renderPrompt/renderUserPrompt with ctx = ContextBuilder.forStory(storyId) + ctx.add({vars}) + ctx.render(templateId)"
  - "Fallback pattern: when storyId unavailable, use new ContextBuilder() + ctx.add() with caller-provided data"
  - "Data formatting stays in services, template rendering moves to ContextBuilder pipeline"

# Metrics
duration: 59min
completed: 2026-02-09
---

# Phase 3 Plan 3: Core Generation Service Migration Summary

**4 core generation services migrated from PromptService/MacroEngine to ContextBuilder pipeline with Liquid template rendering**

## Performance

- **Duration:** 59 min
- **Started:** 2026-02-09T21:32:43Z
- **Completed:** 2026-02-09T22:31:57Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- NarrativeService rewritten: buildSystemPrompt/buildPrimingMessage replaced with ContextBuilder.forStory() + ctx.add() + ctx.render() through Liquid templates
- SuggestionsService, ActionChoicesService, ClassifierService all migrated from promptService.renderPrompt to ContextBuilder pipeline
- ClassifierService passes all 16 runtime variables (genre, mode, entityCounts, currentTimeInfo, chatHistoryBlock, inputLabel, userAction, narrativeResponse, existingCharacters, existingLocations, existingItems, existingBeats, storyBeatTypes, itemLocationOptions, defaultItemLocation, sceneLocationDesc) explicitly via ctx.add()
- Zero compilation errors after migration (svelte-check: 0 errors, 0 warnings)

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate NarrativeService and remove systemBuilder dependency** - `40a360b` (feat)
2. **Task 2: Migrate SuggestionsService, ActionChoicesService, and ClassifierService** - `f62f4fd` (feat)

## Files Created/Modified
- `src/lib/services/ai/generation/NarrativeService.ts` - Replaced buildSystemPrompt/buildPrimingMessage with ContextBuilder.forStory() + add() + render(); priming message moved to private methods
- `src/lib/services/ai/generation/SuggestionsService.ts` - Replaced promptService with ContextBuilder.forStory() + add() + render('suggestions')
- `src/lib/services/ai/generation/ActionChoicesService.ts` - Replaced promptService with ContextBuilder.forStory() + add() + render('action-choices'); added storyId to context interface
- `src/lib/services/ai/generation/ClassifierService.ts` - Replaced promptService with ContextBuilder.forStory() + add() + render('classifier'); 16 runtime variables passed explicitly
- `src/lib/services/ai/index.ts` - Updated orchestrator to pass storyId from story store to SuggestionsService and ActionChoicesService

## Decisions Made
- **buildChapterSummariesBlock kept in systemBuilder:** Pure utility function (string formatting), not prompt assembly logic. NarrativeService imports just this function. Avoids code duplication.
- **Priming message moved to NarrativeService:** Instead of importing from macro engine, priming message logic (12 mode/pov/tense variants) is now private methods on NarrativeService. Eliminates macro engine dependency for this service.
- **Optional storyId for backward compatibility:** SuggestionsService and ActionChoicesService accept optional storyId. When absent, they create a ContextBuilder manually with caller-provided data. This avoids cascading changes to callers (PostGenerationPhase, SuggestionsRefreshService).
- **Orchestrator bridges old and new APIs:** AIService.generateSuggestions() still accepts PromptContext from callers but passes story.currentStory?.id to the underlying service. Callers remain unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AIService orchestrator updated to pass storyId**
- **Found during:** Task 2
- **Issue:** SuggestionsService and ActionChoicesService need storyId, but the AIService orchestrator only had promptContext. Without updating the orchestrator, the services would never receive a storyId.
- **Fix:** Updated AIService.generateSuggestions() to pass story.currentStory?.id, and added storyId to the action choices context object
- **Files modified:** src/lib/services/ai/index.ts
- **Verification:** svelte-check passes with 0 errors
- **Committed in:** f62f4fd (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for services to receive storyId. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 core generation services now use ContextBuilder pipeline
- Requirements SVC-02 through SVC-06 covered
- Plan 03-04 (remaining service migrations) can proceed
- systemBuilder.ts still exists but is no longer imported by NarrativeService for prompt assembly
- The old PromptService/MacroEngine is still used by other services (MemoryService, StyleReviewerService, wizard services, etc.) -- those are covered by later plans

## Self-Check: PASSED
- All 5 modified files exist on disk
- Commit 40a360b (Task 1) verified in git log
- Commit f62f4fd (Task 2) verified in git log
- svelte-check: 0 errors, 0 warnings

---
*Phase: 03-context-system-service-integration*
*Completed: 2026-02-09*
