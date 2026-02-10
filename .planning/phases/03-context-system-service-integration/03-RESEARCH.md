# Phase 3: Context System & Service Integration - Research

**Researched:** 2026-02-09
**Domain:** Builder pattern, LiquidJS template rendering, service architecture migration
**Confidence:** HIGH

## Summary

Phase 3 replaces the current two-phase prompt expansion system (MacroEngine macros + service placeholder injection) with a unified ContextBuilder pipeline. The research confirms that LiquidJS provides all necessary templating features for the redesign, the Builder pattern offers the cleanest API for service integration, and the migration can safely proceed as an atomic all-at-once cutover.

The existing codebase already has the LiquidJS template engine operational (Phase 1), pack storage infrastructure complete (Phase 2), and a clear pattern of how services currently inject runtime data through the PromptService. The new ContextBuilder will consolidate three data sources—system variables (auto-filled from story), runtime data (service-injected), and custom variables (user-defined per pack)—into a single flat context object rendered through LiquidJS in one pass.

All 12 services migrate in this phase, with special attention to NarrativeService (which uses manual systemBuilder logic that becomes Liquid templates), wizard services (progressive context as selections accumulate), translation services (using story context for language settings), and external templates (raw text only, no variable syntax).

**Primary recommendation:** Implement ContextBuilder with fluent builder API returning `{ system, user }` from a single render call. Services get builder instance, add runtime data, render templates. All services migrate atomically—no coexistence of old and new systems.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**ContextBuilder Design**
- **Flat namespace** — all variables accessible directly: `{{ protagonistName }}`, `{{ recentContent }}`, `{{ genre }}`. No nesting by source.
- **Auto-populate system vars from story** — ContextBuilder reads active story settings and fills mode, pov, tense, genre, protagonistName, etc. automatically. Services don't pass these.
- **Custom vars loaded with story context** — when ContextBuilder initializes for a story, all custom variable values from the active pack are loaded. Always available in every template.
- **All variables registered/defined upfront** — the ContextBuilder knows the full catalog of variables (system, runtime, custom). No ad-hoc variable injection. Claude to determine cleanest approach without duplicating logic.

**ContextBuilder API (Approach B: Builder Pattern)**
- Services get a ContextBuilder, add their runtime data, and render:
  ```typescript
  const ctx = contextBuilder.forStory(storyId)
  ctx.add({ recentContent, activeQuests })
  const { system, user } = ctx.render('suggestions')
  ```
- **Single render call returns both system and user prompts** — templates have both system content and user content, one call returns both.
- **Wizard uses same ContextBuilder as story** — wizard selections progressively fill the same context object. No separate wizard path. Early wizard steps simply have fewer variables available.
- **TranslationService uses story context** — calls `contextBuilder.forStory(storyId)`, gets `targetLanguage`/`sourceLanguage` from story translation settings automatically. Custom vars available in translation templates.
- Clean end state is the priority — full rework acceptable regardless of current patterns. Simplest, smallest, cleanest code.

**Template Categories**
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

**Migration Strategy**
- **All at once** — every service migrated in this phase. No coexistence of old and new.
- **NarrativeService converted to template-based** — systemBuilder.ts manual assembly logic becomes Liquid templates with conditionals. Same pipeline as all other services.
- **Old PromptService and MacroEngine deleted in this phase** — not deferred to Phase 6. Once all services are on the new pipeline, old code is removed immediately.

**Variant Resolution (Complete Redesign)**
- **No porting of MacroEngine variant/wildcard/scoring system** — redesigned from scratch for Liquid.
- **Variant logic becomes Liquid conditionals** — `{% if mode == 'adventure' %}...{% endif %}` inside templates. Mode, pov, tense available as simple string variables.
- **Minimize duplication within templates** — shared text stays as the base, only differing parts wrapped in conditionals. Don't duplicate 10 variants when they share most of their text.
- **Simple if statements** — e.g., `{% if pov == 'second' %}` for POV-specific content. No complex scoring or wildcard matching.
- **Users can fully edit conditional logic** — Phase 4 editor will show and allow modification of `{% if/elsif/else %}` blocks. Power users can customize per-mode behavior.
- **Single pass only** — no template includes/references. Each template is self-contained. No `{% render %}` or partials.

**Wizard-Story Unification**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| LiquidJS | latest | Template rendering engine | Already integrated in Phase 1, provides Jinja-like syntax with safe execution |
| TypeScript | 5.x | Type safety | Project standard, enables builder pattern type inference |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `templateEngine` | Phase 1 | LiquidJS wrapper with error handling | All template rendering goes through this singleton |
| Existing `variableRegistry` | Phase 1 | Variable definition catalog | Extended with runtime variable definitions |
| Existing `PackService` | Phase 2 | Pack loading and custom variable retrieval | Load pack templates and custom variable values |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Builder pattern | Factory pattern | Factory would require passing all data at once; builder allows progressive accumulation needed for wizard |
| Flat context | Nested namespaces | User decision: flat namespace for simpler template syntax |
| Single render call | Separate system/user renders | Single call is more efficient and matches user decision |

## Architecture Patterns

### Recommended Project Structure

```
src/lib/services/context/
├── ContextBuilder.ts        # Main builder class with fluent API
├── RuntimeVariableRegistry.ts # Runtime variable definitions catalog
├── types.ts                  # Type definitions
└── index.ts                  # Public API barrel
```

### Pattern 1: Fluent Builder API

**What:** Builder pattern with method chaining for progressive context accumulation
**When to use:** All service prompt generation, wizard step rendering
**Example:**

```typescript
// Service usage
const ctx = contextBuilder.forStory(storyId)
ctx.add({ recentContent, activeQuests })
const { system, user } = ctx.render('suggestions')

// Wizard usage (progressive)
const ctx = contextBuilder.forWizard(wizardData)
// Step 2: only some variables available
ctx.add({ genre, settingDescription })
const prompts = ctx.render('setting-expansion')
```

**Implementation notes:**
- `forStory(storyId)` loads story, auto-fills system variables, loads custom variable values from active pack
- `forWizard(data)` creates context with incremental variable availability per step
- `add(data)` merges runtime variables into context (returns `this` for chaining)
- `render(templateId)` returns `{ system: string, user: string }`
- Method chaining enables clean progressive accumulation

### Pattern 2: Variable Registry Singleton

**What:** Central registry of all variable definitions (system, runtime, custom)
**When to use:** Validation, editor autocomplete, wizard step awareness
**Example:**

```typescript
// RuntimeVariableRegistry extends existing variableRegistry
class RuntimeVariableRegistry {
  // Inherits system variables from Phase 1 variableRegistry

  // Register runtime variables on init
  registerRuntimeVariables(definitions: VariableDefinition[]): void

  // Check if variable exists and is available in current context
  isAvailable(name: string, contextType: 'story' | 'wizard-step-2' | ...): boolean

  // Get all available variables for context
  getAvailableVariables(contextType: string): VariableDefinition[]
}
```

**Implementation notes:**
- System variables already defined in Phase 1 `variableRegistry`
- Runtime variables registered once at app init (services declare what they inject)
- Custom variables loaded per-pack at ContextBuilder creation time
- No duplication: registry is source of truth, ContextBuilder consumes it

### Pattern 3: Template Content Splitting

**What:** PackTemplate stores system and user content separately, render returns both
**When to use:** All standard templates (story/wizard/service)
**Example:**

```typescript
interface PackTemplate {
  id: string
  packId: string
  templateId: string
  systemContent: string     // NEW: system prompt portion
  userContent: string       // NEW: user prompt portion
  contentHash: string
  // ...
}

// Render produces both
interface RenderResult {
  system: string
  user: string
}
```

**Implementation notes:**
- Migration step: split existing `content` field into `systemContent` + `userContent`
- Some templates may have empty user content (system-only)
- External templates bypass this entirely—rendered differently

### Pattern 4: External Template Bypass

**What:** Certain templates are raw text, not Liquid, and services append data programmatically
**When to use:** 6 external templates (image styles, vault tools)
**Example:**

```typescript
// External templates skip ContextBuilder
class ImageStyleService {
  getStylePrompt(packId: string, styleId: string): string {
    // Load raw template content (no {{ }} syntax)
    const template = packService.getTemplate(packId, styleId)
    return template.content // Just return as-is, no rendering
  }
}

// Service builds final prompt by concatenation
const stylePrompt = getStylePrompt(packId, 'image-style-soft-anime')
const fullPrompt = `${stylePrompt}\n\n${sceneDescription}\n\n${characterInfo}`
```

**Implementation notes:**
- External templates: `image-style-soft-anime`, `image-style-semi-realistic`, `image-style-photorealistic`, `interactive-lorebook`, `lorebook-classifier`, `vault-character-import`
- Users edit raw text in Phase 4 editor (no variable insertion toolbar)
- Services handle data injection through concatenation, not template variables

### Anti-Patterns to Avoid

- **Nested context namespaces:** User decision is flat namespace. Don't introduce `{{ story.protagonistName }}` or `{{ runtime.recentContent }}`—just `{{ protagonistName }}` and `{{ recentContent }}`.
- **Porting MacroEngine variant scoring:** User explicitly requested redesign from scratch. Don't replicate wildcard matching or scoring—use simple `{% if %}` statements.
- **Template includes/partials:** User decision: single pass only, no `{% render %}` tags. Each template is self-contained.
- **Separate system/user render calls:** User decision: single render returns both. Don't make services call render twice.
- **Global context builder instance:** ContextBuilder should be instantiated per-render with `forStory()` or `forWizard()`. Don't share state across requests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template syntax parsing | Custom tokenizer | LiquidJS `parseAndRenderSync` | Already handles all Liquid syntax, filters, conditionals—no need to reinvent |
| Variable value coercion | Type converters | Pass values as correct types | TypeScript + flat context means no complex transformations needed |
| Template inheritance | Include/extend system | Self-contained templates | User decision: no partials. Avoid complexity. |
| Validation messages | Custom error formatter | Phase 1 `templateValidator` | Already translates LiquidJS errors to plain language |
| Pack loading | Direct DB queries | Phase 2 `PackService` | Already has CRUD operations, validation, default pack loading |

**Key insight:** Phase 1 and Phase 2 built the foundation. Don't bypass those abstractions—compose them. The ContextBuilder orchestrates existing pieces, doesn't reimplement them.

## Common Pitfalls

### Pitfall 1: Runtime Variable Registration Timing

**What goes wrong:** Services try to inject runtime variables that aren't registered, causing validation errors or undefined variable warnings.

**Why it happens:** If runtime variables aren't declared upfront in the registry, the ContextBuilder doesn't know they exist. Services passing data on-the-fly breaks the "all variables registered upfront" requirement.

**How to avoid:** Register all runtime variables at app initialization. Each service declares what runtime variables it uses (e.g., SuggestionsService declares `recentContent`, `activeThreads`, `lorebookContext`). Registry is populated once, services consume.

**Warning signs:** Validation errors about unknown variables despite correct service usage. Templates rendering with empty strings for what should be runtime data.

### Pitfall 2: Wizard Step Variable Availability

**What goes wrong:** Wizard templates reference variables that aren't available yet (e.g., Step 2 template tries to use `protagonistName` before character is created in Step 4).

**Why it happens:** Progressive wizard context means early steps have incomplete context. Without step awareness, templates can break.

**How to avoid:** ContextBuilder must know which variables are available at each wizard step. Registry should have step annotations. Validation at template save time can warn if template uses future-step variables.

**Warning signs:** Wizard templates rendering blank sections or throwing errors mid-flow. User confusion about why variables aren't working.

### Pitfall 3: System Variable Duplication

**What goes wrong:** System variables are defined both in the Phase 1 `SYSTEM_VARIABLES` array and duplicated in ContextBuilder initialization logic.

**Why it happens:** Copy-paste between registry and builder without establishing single source of truth.

**How to avoid:** ContextBuilder reads from the registry, never defines variables itself. Registry is the catalog, builder is the consumer. One source of truth.

**Warning signs:** Variables defined in two places, inconsistent behavior if one is updated without the other, hard-to-trace bugs from definition drift.

### Pitfall 4: External Template Variable Leakage

**What goes wrong:** External templates accidentally gain variable syntax when users copy-paste from standard templates, breaking the "raw text only" contract.

**Why it happens:** UI doesn't clearly distinguish external vs standard templates. Users expect all templates to work the same way.

**How to avoid:** Phase 4 editor must visually distinguish external templates (different UI, no variable toolbar). Validation should warn if external templates contain `{{ }}` syntax.

**Warning signs:** Image style templates with broken variable references. Vault tool prompts trying to use custom variables and failing.

### Pitfall 5: Translation Service Context Mismatch

**What goes wrong:** TranslationService creates minimal context instead of story context, losing access to custom variables and story settings.

**Why it happens:** Legacy TranslationService uses `TRANSLATION_CONTEXT` constant with hardcoded values, not story-derived.

**How to avoid:** User decision: TranslationService calls `contextBuilder.forStory(storyId)` like other services. It gets `targetLanguage`/`sourceLanguage` from story translation settings automatically, plus custom variables.

**Warning signs:** Translation templates can't use custom variables. Translation settings not reflected in prompts. Translations inconsistent with story tone.

### Pitfall 6: NarrativeService Manual Logic Porting

**What goes wrong:** Trying to keep systemBuilder.ts manual assembly logic and bolt it onto the new system instead of converting to Liquid templates.

**Why it happens:** Fear of losing complex conditional logic or misunderstanding user intent to template-ify everything.

**How to avoid:** User decision: NarrativeService systemBuilder logic becomes Liquid templates with `{% if %}` conditionals. The conditionals express the same logic, just in template syntax instead of TypeScript.

**Warning signs:** Hybrid system where some prompts use templates and NarrativeService uses old builder. Complexity not reduced. Phase 6 cleanup becomes harder.

## Code Examples

Verified patterns from official sources and existing codebase:

### LiquidJS Conditionals

```typescript
// Source: https://liquidjs.com/tags/if.html
// Basic if
{% if mode == 'adventure' %}
  You are an adventure game narrator.
{% elsif mode == 'creative-writing' %}
  You are a creative writing assistant.
{% endif %}

// Multiple conditions
{% if pov == 'second' and tense == 'present' %}
  Continue the story in second-person present tense.
{% elsif pov == 'second' %}
  Continue the story in second-person.
{% else %}
  Continue the story in third-person.
{% endif %}
```

### ContextBuilder Fluent API

```typescript
// Source: User decisions in CONTEXT.md + Builder pattern research
// https://refactoring.guru/design-patterns/builder/typescript/example

class ContextBuilder {
  private context: TemplateContext = {}

  // Entry point: story context
  static forStory(storyId: string): ContextBuilder {
    const builder = new ContextBuilder()
    builder.loadStoryContext(storyId)
    return builder
  }

  // Entry point: wizard context
  static forWizard(wizardData: WizardStepData, step: number): ContextBuilder {
    const builder = new ContextBuilder()
    builder.loadWizardContext(wizardData, step)
    return builder
  }

  // Add runtime data (chainable)
  add(data: Record<string, any>): this {
    Object.assign(this.context, data)
    return this
  }

  // Render template (returns both system and user)
  render(templateId: string): { system: string; user: string } {
    const template = packService.getTemplate(this.packId, templateId)
    return {
      system: templateEngine.render(template.systemContent, this.context),
      user: templateEngine.render(template.userContent, this.context)
    }
  }

  private loadStoryContext(storyId: string): void {
    // Load story from database
    // Auto-populate system variables (mode, pov, tense, protagonistName, genre, etc.)
    // Load custom variable values from active pack
    // All variables now in this.context
  }

  private loadWizardContext(data: WizardStepData, step: number): void {
    // Populate wizard selections so far
    // Only include variables available at this step
  }
}
```

### Service Integration Pattern

```typescript
// Source: Existing SuggestionsService pattern adapted to ContextBuilder

class SuggestionsService {
  async generateSuggestions(
    recentEntries: StoryEntry[],
    activeThreads: StoryBeat[],
    storyId: string
  ): Promise<SuggestionsResult> {
    // Build runtime data
    const lastContent = this.formatEntries(recentEntries)
    const threadsContext = this.formatThreads(activeThreads)
    const lorebookContext = this.formatLorebook(lorebookEntries)

    // Get context builder with story context pre-filled
    const ctx = ContextBuilder.forStory(storyId)

    // Add runtime data
    ctx.add({
      recentContent: lastContent,
      activeThreads: threadsContext,
      lorebookContext
    })

    // Render template (single call, both system and user)
    const { system, user } = ctx.render('suggestions')

    // Use SDK to generate
    return generateStructured({
      presetId: this.presetId,
      schema: suggestionsResultSchema,
      system,
      prompt: user
    })
  }
}
```

### Runtime Variable Registration

```typescript
// Source: Phase 1 variableRegistry + new runtime variables

// Register runtime variables at app initialization
const runtimeVariables: VariableDefinition[] = [
  {
    name: 'recentContent',
    type: 'text',
    category: 'runtime',
    description: 'Recent story entries formatted for context',
    required: false
  },
  {
    name: 'activeThreads',
    type: 'text',
    category: 'runtime',
    description: 'Active story beats and quests',
    required: false
  },
  {
    name: 'lorebookContext',
    type: 'text',
    category: 'runtime',
    description: 'Retrieved lorebook entries',
    required: false
  },
  {
    name: 'userInput',
    type: 'text',
    category: 'runtime',
    description: 'User action or direction',
    required: true // Classifier needs this
  },
  {
    name: 'narrativeResponse',
    type: 'text',
    category: 'runtime',
    description: 'AI-generated narrative to classify',
    required: true // Classifier needs this
  },
  // ... more runtime variables for each service
]

// Extend existing registry
runtimeVariableRegistry.registerMany(runtimeVariables)
```

### Wizard Progressive Context

```typescript
// Source: User decision on wizard-story unification + wizard step patterns

// Step 2: Pack selection, some variables available
const ctx = ContextBuilder.forWizard(wizardData, 2)
// At step 2: genre, packId available, but no protagonistName yet
ctx.add({ seed: userInput })
const prompts = ctx.render('setting-expansion')

// Step 4: Character creation, more variables available
const ctx2 = ContextBuilder.forWizard(wizardData, 4)
// At step 4: genre, settingDescription, now protagonistName available
ctx2.add({ povInstruction })
const prompts2 = ctx2.render('protagonist-generation')

// Registry knows step boundaries
runtimeVariableRegistry.isAvailable('protagonistName', 'wizard-step-2') // false
runtimeVariableRegistry.isAvailable('protagonistName', 'wizard-step-4') // true
```

### External Template Usage

```typescript
// Source: Existing image service patterns + user decision on external templates

// Load external template (raw text, no Liquid syntax)
const styleTemplate = packService.getTemplate(packId, 'image-style-soft-anime')
const stylePrompt = styleTemplate.content // Just the raw text

// Service builds final prompt programmatically
const characterInfo = `${protagonist.appearance.hair}, ${protagonist.appearance.eyes}`
const sceneDescription = `${location.description}, ${lighting}`

const fullPrompt = [
  stylePrompt,           // Style instructions (raw)
  characterInfo,         // Character appearance
  sceneDescription,      // Scene details
  'detailed, 8K quality' // Additional tags
].join('\n\n')

// No ContextBuilder, no template rendering—just concatenation
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MacroEngine + placeholder two-phase | ContextBuilder single-pass | Phase 3 (this phase) | Simpler flow: one render call, flat namespace, no recursive expansion |
| Complex variant scoring (exact/wildcard/fallback) | Simple Liquid conditionals | Phase 3 (this phase) | Users can edit logic directly, no hidden scoring rules |
| Manual systemBuilder.ts assembly | Liquid templates with conditionals | Phase 3 (this phase) | NarrativeService same pipeline as all other services |
| Services inject placeholders via PromptService | Services inject runtime data via ContextBuilder | Phase 3 (this phase) | Clear separation: system (auto), runtime (service), custom (user) |
| Global template overrides in settings | Pack-based templates with variable values per story | Phase 2 (complete) | Per-story customization, shareable packs |

**Deprecated/outdated:**
- MacroEngine scoring system: Replaced by explicit `{% if %}` conditionals that users can edit
- Two-pass expansion (macros then placeholders): Replaced by single LiquidJS render pass
- PromptService renderPrompt + renderUserPrompt: Replaced by ContextBuilder render returning both

## Open Questions

### 1. How should ContextBuilder handle missing runtime variables?

**What we know:**
- System variables are always filled (story settings)
- Custom variables have defaults (from pack definitions)
- Runtime variables are optional (services may not provide all data)

**What's unclear:**
- Should missing runtime variables render as empty string (current LiquidJS behavior)?
- Should there be warnings/logging for missing expected runtime data?
- Should templates be able to check if runtime variable exists before using it?

**Recommendation:**
- Keep LiquidJS default: missing variables render as empty string (graceful degradation)
- Add DEBUG logging when runtime variables are missing (helps development)
- Templates can use `{% if recentContent %}` to check existence before rendering blocks
- Phase 4 editor validation can warn if template uses runtime variable not provided by that service

### 2. How should wizard step boundaries be defined?

**What we know:**
- Wizard has 8 steps (pack selection, setting creation, character creation, etc.)
- Early steps can't reference later variables
- ContextBuilder needs to know available variables per step

**What's unclear:**
- Should step boundaries be hardcoded enum?
- Should registry store step availability metadata per variable?
- How does this scale if wizard steps change in future?

**Recommendation:**
- Define WizardStep enum with all steps
- Registry stores `availableFrom: WizardStep` per system variable
- Runtime variables are always available (services control when they're used)
- This makes step constraints explicit and maintainable

### 3. Should external templates be a separate database type?

**What we know:**
- 6 templates are "external" (raw text, no Liquid syntax)
- They're still in packs, just rendered differently
- Users need to know they can't use variables in these

**What's unclear:**
- Should PackTemplate have `isExternal: boolean` flag?
- Or should external templates live in separate table?
- How does Phase 4 editor distinguish them?

**Recommendation:**
- Add `isExternal: boolean` to PackTemplate schema
- Keep in same table (they're still templates, just different rendering)
- Phase 4 editor uses flag to show different UI (no variable toolbar)
- Validation can check: if `isExternal` and contains `{{ }}`, warn user

### 4. How should translation template language variables be populated?

**What we know:**
- User decision: TranslationService uses story context
- Translation settings are on story: `story.translationSettings.targetLanguage`
- Templates need `{{ targetLanguage }}` and `{{ sourceLanguage }}`

**What's unclear:**
- Are these system variables (auto-filled) or runtime variables (service-injected)?
- Should they be in SYSTEM_VARIABLES even though they're translation-specific?
- What happens if story has no translation settings?

**Recommendation:**
- Make `targetLanguage` and `sourceLanguage` system variables (auto-filled from story)
- ContextBuilder checks `story.translationSettings` during initialization
- If no translation settings, default to empty string (templates handle gracefully)
- This keeps user decision: translation uses story context, not separate minimal context

## Sources

### Primary (HIGH confidence)

- Phase 1 template engine code: `src/lib/services/templates/engine.ts`, `src/lib/services/templates/variables.ts`, `src/lib/services/templates/validator.ts`
- Phase 2 pack service code: `src/lib/services/packs/pack-service.ts`, `src/lib/services/packs/types.ts`
- Existing service patterns: `src/lib/services/ai/generation/SuggestionsService.ts`, `src/lib/services/ai/generation/ActionChoicesService.ts`, `src/lib/services/ai/generation/ClassifierService.ts`, `src/lib/services/ai/generation/NarrativeService.ts`
- Current prompt system: `src/lib/services/prompts/index.ts`, `src/lib/services/prompts/macros.ts`, `src/lib/services/ai/prompts/systemBuilder.ts`
- User decisions: `.planning/phases/03-context-system-service-integration/03-CONTEXT.md`
- [LiquidJS If Tag Documentation](https://liquidjs.com/tags/if.html) - If/elsif/else conditional syntax
- [LiquidJS Introduction](https://liquidjs.com/tutorials/intro-to-liquid.html) - Core template concepts

### Secondary (MEDIUM confidence)

- [Builder Pattern in TypeScript](https://refactoring.guru/design-patterns/builder/typescript/example) - Fluent API implementation
- [Method Chaining in TypeScript: Best Practices](https://gazar.dev/clean-code/method-chaining-typescript-best-practice) - Chainable method patterns
- [Fluent Interfaces in TypeScript](https://shaky.sh/fluent-interfaces-in-typescript/) - Type-safe builder design
- [TypeScript Singleton Pattern](https://refactoring.guru/design-patterns/singleton/typescript/example) - Service registry patterns
- [How To Build a Multi-Step Form using NextJS, TypeScript, React Context](https://medium.com/@wdswy/how-to-build-a-multi-step-form-using-nextjs-typescript-react-context-and-shadcn-ui-ef1b7dcceec3) - Progressive context patterns

### Tertiary (LOW confidence)

- LiquidJS Render Tag documentation (confirmed: supports partials, but user decided against using them)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - LiquidJS already integrated and working, TypeScript project standard
- Architecture (Builder pattern): HIGH - Well-documented pattern, matches user API decision exactly
- Architecture (variable registry): HIGH - Phase 1 implementation exists, extension is straightforward
- Architecture (service migration): HIGH - Clear existing pattern visible in 12+ services
- Pitfalls (wizard variables): MEDIUM - Requires step boundary decisions, but pattern is clear
- Open questions (translation variables): MEDIUM - Ambiguity between system vs runtime categorization

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable domain, no fast-moving dependencies)
