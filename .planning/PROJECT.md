# Aventuras Prompt System Rework

## What This Is

A complete rework of Aventuras' prompt templating, variable resolution, and prompt editing system. Replaces the fragmented macro/placeholder dual-engine with a unified Jinja-like template system, introduces user-defined custom variables per preset pack, adds a full prompt editor in the Vault, and cleans up how services build and pass context to prompts. This is a full-stack rework touching the template engine, prompt editor UI, service context pipeline, wizard integration, and preset management.

## Core Value

Every `{{ variable }}` in every prompt template resolves correctly, predictably, through one pipeline — and users can create, edit, and share prompt presets without fighting the system.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. Inferred from existing codebase. -->

- ✓ Story generation with system prompts built from templates — existing
- ✓ Multi-provider AI generation via Vercel AI SDK — existing
- ✓ Story mode variants (adventure, creative-writing) with different prompt behavior — existing
- ✓ POV and tense settings that affect prompt generation — existing
- ✓ Lorebook context injection into prompts — existing
- ✓ Memory/chapter summarization with prompts — existing
- ✓ World state classification via prompts — existing
- ✓ Multi-step creation wizard (setting, character, narrative) — existing
- ✓ Prompt template override system — existing
- ✓ Visual prose and inline image instruction injection — existing
- ✓ Translation prompt support — existing
- ✓ Vault system for characters, lorebooks, scenarios — existing
- ✓ Agent profiles for AI model configuration — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] Unified variable resolution — one Jinja-like template engine, one pass, one context object
- [ ] Three variable categories: system (auto-filled), runtime (service-injected), custom (user-defined)
- [ ] All variables typed: text, enum, number, or boolean
- [ ] Jinja-like conditional syntax in templates (if/elif/else/endif)
- [ ] Jinja-like filters in templates (upper, join, etc.)
- [ ] Remove old MacroEngine + placeholder dual-pass system entirely
- [ ] Remove complex macro variant tables — replace with inline Jinja conditionals in templates
- [ ] Custom variables: user-defined per preset pack with type, options (for enum), and default/required
- [ ] Custom variables auto-discovered by wizard from active preset's templates
- [ ] Wizard generates UI controls per custom variable type (text field, dropdown, toggle, number input)
- [ ] Custom variables configured per-story in a wizard step
- [ ] Preset packs: full bundles of all prompt templates + custom variable definitions
- [ ] Preset pack selection as a wizard step
- [ ] Prompt Vault tab: prompts as first-class vault items alongside characters, lorebooks, scenarios
- [ ] Vault prompt cards for each preset pack with import + new buttons
- [ ] Prompt editor: click card replaces search area with editor view (not modal)
- [ ] Prompt editor layout: left = grouped template list + Variables tab, right = editor for selected item
- [ ] Templates grouped by function in editor (Story Generation, Analysis, Memory, Wizard, etc.)
- [ ] Variables tab in editor for managing custom variable definitions per pack
- [ ] Prompt editor: mobile-first, minimal UX, no hover-dependent interactions
- [ ] Prompt editor: syntax-highlighted text with bottom toolbar for inserting variables/conditionals
- [ ] All ~20+ prompt templates editable by users
- [ ] Ship default prompt templates users can edit directly (with reset-to-original option)
- [ ] Create new preset (copies defaults as starting point)
- [ ] Export/import preset packs
- [ ] Unified service context pipeline — services build one context object, no manual placeholder injection
- [ ] Clean migration of all existing templates to Jinja syntax
- [ ] Clean slate for existing prompt overrides (no backward compatibility)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Backward compatibility with old macro overrides — clean slate, full rework
- Drag-and-drop visual block editor — too complex for mobile-first, use toolbar insertion instead
- Hover-dependent UI interactions — must work on mobile
- Custom variable sharing between presets — each pack is self-contained
- Real-time collaborative preset editing — single-user desktop app
- Prompt version history/diffing — unnecessary complexity for v1

## Context

**Current system problems (from bug reports and codebase analysis):**
- Two separate resolution systems (MacroEngine + applyPlaceholders) using identical `{{token}}` syntax
- `settingDescription` defined as BOTH a macro and a context placeholder — resolution depends on which service calls it
- SuggestionsService doesn't pass tone, themes, or settingDescription into context
- ActionChoicesService doesn't pass genre, tone, or settingDescription
- Complex macros (styleInstruction, responseInstruction, primingMessage) use opaque variant tables with 12 entries each
- Each service manually rebuilds prompt context instead of sharing a builder
- Current preset creation is painful because macro vs placeholder distinction is invisible to users
- Some macros silently fail to expand when services forget to pass required context

**Existing codebase architecture:**
- SvelteKit 2 + Svelte 5 with Tauri desktop wrapper
- Svelte 5 runes for reactive state ($state, $derived, $effect)
- Tailwind CSS 4 for styling, bits-ui for components
- Mobile-responsive design (768px breakpoint via is-mobile hook)
- Vault pattern established for characters, lorebooks, scenarios
- Prompt system currently at `src/lib/services/prompts/` with templates, macros, types, definitions
- Prompt UI components at `src/lib/components/prompts/`

**Files to be fully replaced:**
- `src/lib/services/prompts/macros.ts` — MacroEngine class
- `src/lib/services/prompts/index.ts` — PromptService
- `src/lib/services/prompts/types.ts` — type definitions
- `src/lib/services/prompts/definitions/` — all macro/placeholder definitions
- `src/lib/services/prompts/templates/` — all template files (rewrite in Jinja syntax)
- `src/lib/components/prompts/` — prompt editor UI components
- `src/lib/services/ai/prompts/systemBuilder.ts` — system prompt builder

**Files requiring significant changes:**
- All services that build prompt context (NarrativeService, SuggestionsService, ActionChoicesService, StyleReviewerService, ClassifierService, MemoryService, LoreManagementService, wizard services)
- `src/lib/stores/settings.svelte.ts` — prompt settings structure
- `src/lib/services/database.ts` — prompt/preset storage schema
- `src/lib/components/vault/` — add Prompts tab
- `src/lib/stores/wizard/` — add preset selection and custom variable steps

## Constraints

- **Tech stack**: Must use SvelteKit 5 / Svelte 5 runes / Tailwind CSS 4 / TypeScript — existing stack
- **Template engine**: Need a JavaScript Jinja-like library (e.g., Nunjucks, LiquidJS) that's safe for user-editable templates (no arbitrary code execution)
- **Mobile-first**: All new UI must work on mobile (768px breakpoint), no hover-dependent interactions
- **Desktop wrapper**: Runs in Tauri — file system access via Tauri plugins, SQLite for persistence
- **Bundle size**: Template engine library should be lightweight — this is a desktop app but bundle size still matters
- **No tests**: Codebase has no test framework — maintain consistency (no tests to break)
- **Clean slate**: No backward compatibility needed — existing prompt overrides will be wiped

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Jinja-like template syntax | Familiar paradigm, supports conditionals/filters/variables, one-pass resolution | — Pending |
| Three variable categories (system, runtime, custom) | Clean separation of concerns by value source | — Pending |
| All variables typed (text, enum, number, boolean) | Enables auto-generated wizard UI from variable definitions | — Pending |
| Prompts as Vault tab | First-class citizen alongside characters/lorebooks/scenarios, established UX pattern | — Pending |
| Preset packs (not individual templates) | Coherent prompt sets, exportable/importable like agent profiles | — Pending |
| Editor replaces vault search area (not modal) | Better editing experience, consistent with mobile-first approach | — Pending |
| Clean slate migration | Full rework, no backward compat hacks — simpler, cleaner result | — Pending |
| Custom variables per-story in wizard | Auto-discovered from preset templates, wizard generates UI controls per type | — Pending |
| Template engine library choice (Nunjucks vs LiquidJS vs other) | Need to research — safety, bundle size, feature set | — Pending |

---
*Last updated: 2026-02-08 after initialization*
