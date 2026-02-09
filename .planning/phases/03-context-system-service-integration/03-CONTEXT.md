# Phase 3: Context System & Service Integration - Context

**Gathered:** 2026-02-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current two-phase prompt expansion (MacroEngine macros + service placeholders) with a unified pipeline. A ContextBuilder assembles one flat context object from system state, custom variables, and service runtime data. All services migrate to this pipeline. Old PromptService and MacroEngine are deleted in this phase (not deferred to Phase 6).

40 templates total: 17 story-context, 11 wizard-context (treated as progressive story context), 6 translation (story context via settings), 6 standalone/external.

</domain>

<decisions>
## Implementation Decisions

### ContextBuilder Design
- **Flat namespace** — all variables accessible directly: `{{ protagonistName }}`, `{{ recentContent }}`, `{{ genre }}`. No nesting by source.
- **Auto-populate system vars from story** — ContextBuilder reads active story settings and fills mode, pov, tense, genre, protagonistName, etc. automatically. Services don't pass these.
- **Custom vars loaded with story context** — when ContextBuilder initializes for a story, all custom variable values from the active pack are loaded. Always available in every template.
- **All variables registered/defined upfront** — the ContextBuilder knows the full catalog of variables (system, runtime, custom). No ad-hoc variable injection. Claude to determine cleanest approach without duplicating logic.

### ContextBuilder API (Approach B: Builder Pattern)
- Services get a ContextBuilder, add their runtime data, and render:
  ```
  const ctx = contextBuilder.forStory(storyId)
  ctx.add({ recentContent, activeQuests })
  const { system, user } = ctx.render('suggestions')
  ```
- **Single render call returns both system and user prompts** — templates have both system content and user content, one call returns both.
- **Wizard uses same ContextBuilder as story** — wizard selections progressively fill the same context object. No separate wizard path. Early wizard steps simply have fewer variables available.
- **TranslationService uses story context** — calls `contextBuilder.forStory(storyId)`, gets `targetLanguage`/`sourceLanguage` from story translation settings automatically. Custom vars available in translation templates.
- Clean end state is the priority — full rework acceptable regardless of current patterns. Simplest, smallest, cleanest code.

### Template Categories
Two distinct categories based on how variables work:

**1. Standard templates (story/wizard context)** — 34 templates
- Use Liquid syntax with `{{ variables }}` and `{% if/else %}`
- Have access to system variables, custom variables, and runtime data
- Users can fully edit including conditional logic
- Rendered through ContextBuilder pipeline

**2. External templates** — 6 templates (image styles, vault tools)
- Users edit **raw text only** — no `{{ }}` syntax, no custom variables
- System/services append data programmatically outside the template
- Templates: `image-style-*` (3), `interactive-lorebook`, `lorebook-classifier`, `vault-character-import`
- Still live inside preset packs (exportable/shareable per pack)
- Separate rendering path that doesn't go through ContextBuilder

### Migration Strategy
- **All at once** — every service migrated in this phase. No coexistence of old and new.
- **NarrativeService converted to template-based** — systemBuilder.ts manual assembly logic becomes Liquid templates with conditionals. Same pipeline as all other services.
- **Old PromptService and MacroEngine deleted in this phase** — not deferred to Phase 6. Once all services are on the new pipeline, old code is removed immediately.

### Variant Resolution (Complete Redesign)
- **No porting of MacroEngine variant/wildcard/scoring system** — redesigned from scratch for Liquid.
- **Variant logic becomes Liquid conditionals** — `{% if mode == 'adventure' %}...{% endif %}` inside templates. Mode, pov, tense available as simple string variables.
- **Minimize duplication within templates** — shared text stays as the base, only differing parts wrapped in conditionals. Don't duplicate 10 variants when they share most of their text.
- **Simple if statements** — e.g., `{% if pov == 'second' %}` for POV-specific content. No complex scoring or wildcard matching.
- **Users can fully edit conditional logic** — Phase 4 editor will show and allow modification of `{% if/elsif/else %}` blocks. Power users can customize per-mode behavior.
- **Single pass only** — no template includes/references. Each template is self-contained. No `{% render %}` or partials.

### Wizard-Story Unification
- Wizard and story share the same ContextBuilder — wizard selections *become* story settings.
- Progressive context: each wizard step adds variables. Templates for early steps can't reference variables from later steps.
- Custom variables configured at pack selection (step 2), available throughout wizard AND story.
- ContextBuilder knows which variables exist at each point — intelligence about available system variables per wizard step.

### Claude's Discretion
- Exact ContextBuilder internal architecture and how services register runtime data providers vs pass at call time — whatever produces cleanest code
- How the variable catalog/registry works without duplicating logic
- How standalone/external templates are rendered separately
- How wizard step awareness is implemented (which variables are available at each step)
- Error handling for undefined variables during progressive wizard context

</decisions>

<specifics>
## Specific Ideas

- "Don't copy the current logic, make it make sense for Liquid (complete redesign)" — user explicitly wants a clean break from MacroEngine patterns
- "The end result should be the cleanest way regardless of how it is right now" — current code patterns should not constrain the new design
- "Full rework, whatever ends up with smallest, simplest, and cleanest code"
- Translation templates should work in story context: `targetLanguage` comes from story settings, not passed manually
- External templates: users can only edit raw text, system auto-injects variables — keeps utility prompts simple while still being per-pack customizable
- One render call returns both `{ system, user }` — and template editing (Phase 4) needs to handle editing both system prompt and user prompt

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-context-system-service-integration*
*Context gathered: 2026-02-09*
