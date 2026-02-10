# Phase 1: Template Engine Foundation - Research

**Researched:** 2026-02-08
**Domain:** Jinja-compatible template engine for JavaScript/TypeScript
**Confidence:** HIGH

## Summary

Phase 1 requires implementing a safe, predictable template rendering engine with {{ variable }} syntax, Jinja-like conditionals, loops, and filters. The engine must support validation-first philosophy (block saves on invalid templates) and provide a validation API for real-time feedback in CodeMirror (Phase 4).

After investigating alternatives (jinja-js, Nunjucks, LiquidJS), **LiquidJS emerges as the strongest choice** for this project. It's written in TypeScript, actively maintained (v10.24.0 published 3 months ago), provides native validation APIs, is inherently safe (no eval/code execution), and aligns perfectly with the user's requirement for "simplest possible Jinja-compatible library, safe by design."

**Primary recommendation:** Use LiquidJS with TypeScript, organize the engine as a modular service in `src/lib/services/templates/`, expose a clean validation + render API, and design the variable system to naturally extend into the preset/agent profile system in Phase 3.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Error behavior:**
- Validation at save time: Templates must pass full validation (syntax + variable names) before they can be saved. Save is blocked entirely on invalid templates.
- Real-time validation: CodeMirror integration for live validation as user types (Phase 4 will consume this API). Engine exposes a validation function that can be called on each edit.
- Unknown variables at render time: If a validated template somehow hits a missing variable at runtime (bug scenario), render empty string and log the error. Never break the user's experience.
- Per-template validation only: No batch "validate all" action needed. Each template validated individually when edited/saved.
- Error presentation for non-technical users: Claude's discretion on how validation errors are displayed — priority is clarity for non-coding users.

**Engine API surface:**
- Simplest, cleanest approach: Keep the API minimal. render() returns just a string, nothing more.
- Unified system design: The engine is the foundation of a single cohesive prompt system. Not a standalone utility — designed so preset lookup, template storage, and service integration plug in naturally in later phases.
- Template organization: Claude's discretion on grouping strategy (by service, flat with naming convention, etc.), but must account for the relationship: agent profile → service → templates.
- Clean slate architecture: No obligation to preserve existing code patterns. Design fresh for what's best. Prioritize modular code with small focused files — no 1000+ line monoliths.
- Aggressive cleanup: Remove duplicated code/types. Delete dead code. Re-organize where needed. Code should be connected/bucketed where it logically belongs.

**Filter & conditional scope:**
- Target users: Non-technical users. Syntax must be approachable, not intimidating.
- Conditionals: Full conditional support — if/elsif/else, comparisons (==, !=, >, <), and/or operators.
- Filters: Built-in library filters only. No custom Aventuras-specific filters. Whatever the chosen library ships with.
- Loops: Supported if the chosen library provides them natively. Don't restrict native features, but don't add custom ones either.
- Library selection: Prefer the simplest possible Jinja-compatible JS/TS library. Doesn't need to be LiquidJS — researcher should evaluate simpler alternatives. Key criteria: simple, safe by design, minimal bundle size.

**Security & sandboxing:**
- Safe by design: Choose a template library that's inherently safe (no eval, no access to runtime objects). If the engine is simple enough (variable substitution + conditionals + loops + filters), no sandboxing needed.
- No limits: No restrictions on template size or complexity. Trust users.
- Standalone templates: No includes, no extends, no template inheritance. Each template is fully self-contained.
- Full context access: Every template sees the entire context object (all system + runtime + custom variables). No per-template scoping.

### Claude's Discretion

- Error presentation UX for non-technical users
- Engine API shape (singleton vs per-story, function vs class)
- Template organization/grouping strategy
- Exact library choice (research simpler Jinja alternatives beyond LiquidJS)
- Module structure and file organization

### Deferred Ideas (OUT OF SCOPE)

- Agent profile integration with preset system — how agent profiles connect to their templates (Phase 3 territory, but design should anticipate it)
- Mass codebase cleanup of duplicated code/types — broader than Phase 1 but the engine should be the exemplar of clean architecture

</user_constraints>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **liquidjs** | 10.24.0 | Template rendering engine | TypeScript-native, safe by design (no eval), 40+ built-in filters, active maintenance, native validation API |
| None needed | - | Circular reference detection | Variables don't reference other variables (user constraint), so no detection library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | - | - | LiquidJS is self-contained; no supporting libraries required |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| LiquidJS | **Nunjucks** (v3.2.4) | ⚠️ NOT RECOMMENDED: More feature-rich (template inheritance, macros) but written in JavaScript (not TypeScript), 8KB gzipped, requires `@types/nunjucks`. More power than needed for this use case. Security model less clear than LiquidJS. |
| LiquidJS | **jinja-js** | ❌ REJECTED: DEPRECATED (unmaintained for 7 years). Author explicitly says "I do not recommend using this." Small bundle (3.2KB gzipped) but obsolete. |
| LiquidJS | **Custom regex-based engine** | ❌ REJECTED: Would need to hand-roll conditionals, loops, filters, escaping, error handling. LiquidJS solves all this with 40+ filters and proven safety model. |

**Installation:**
```bash
npm install liquidjs
```

**Why LiquidJS wins:**

1. **TypeScript-native** — entire repo rewritten in TypeScript strict mode, types exported
2. **Safe by design** — no eval, no code execution, designed for user-generated templates (Shopify/GitHub Pages use case)
3. **Validation API** — `Liquid.parse()` throws syntax errors, variables discoverable via experimental API (v10.20.0+)
4. **Active maintenance** — v10.24.0 published 3 months ago (Nov 2025)
5. **40+ built-in filters** — comprehensive filter library (escape, url_encode, strip_html, slugify, jsonify, etc.)
6. **Jinja-compatible syntax** — `{{ variable }}`, `{% if %}`, `{% for %}`, familiar to Jinja/Liquid users
7. **Minimal bundle size** — comparable to Nunjucks, optimized for browser/Node
8. **No template inheritance** — doesn't encourage includes/extends (matches user constraint for standalone templates)

## Architecture Patterns

### Recommended Project Structure

```
src/lib/services/templates/
├── engine.ts              # Core LiquidJS wrapper, singleton instance
├── types.ts               # Variable types, template types, validation result types
├── validator.ts           # Validation logic (syntax + variable references)
├── variables.ts           # Variable registry (system, runtime, custom)
└── index.ts               # Public API exports

src/lib/services/prompts/  # EXISTING - will consume template engine
├── [existing files remain]
```

**Key architectural decisions:**

- **Small, focused modules:** Each file <200 lines, single responsibility
- **Singleton pattern for engine:** One LiquidJS instance shared across app
- **Separation of concerns:** Engine (render) vs Validator (check) vs Variables (registry)
- **Type-driven design:** TypeScript types define variable structure, validation contracts
- **Anticipate Phase 3:** Variable registry designed to map naturally to agent profiles

### Pattern 1: Engine Wrapper (Singleton)

**What:** Thin wrapper around LiquidJS that exposes only what's needed

**When to use:** Core rendering operations

**Example:**
```typescript
// src/lib/services/templates/engine.ts
import { Liquid } from 'liquidjs';

class TemplateEngine {
  private liquid: Liquid;

  constructor() {
    this.liquid = new Liquid({
      strictVariables: false,  // We handle validation separately
      strictFilters: true,     // Unknown filters should error
    });
  }

  /**
   * Render a template against a context
   * @returns Rendered string, or empty string on error (logs error)
   */
  render(template: string, context: Record<string, unknown>): string {
    try {
      return this.liquid.parseAndRenderSync(template, context);
    } catch (error) {
      console.error('[TemplateEngine] Render error:', error);
      return ''; // Never break user experience
    }
  }
}

export const templateEngine = new TemplateEngine();
```

### Pattern 2: Validation-First API

**What:** Separate validation from rendering, expose validation API for UI

**When to use:** Save-time validation, real-time editor feedback

**Example:**
```typescript
// src/lib/services/templates/validator.ts
import { Liquid } from 'liquidjs';
import type { VariableDefinition } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  type: 'syntax' | 'unknown_variable' | 'unknown_filter';
  message: string;
  line?: number;
  column?: number;
}

export class TemplateValidator {
  private liquid: Liquid;

  constructor() {
    this.liquid = new Liquid({
      strictVariables: true,   // Fail on unknown variables
      strictFilters: true,     // Fail on unknown filters
    });
  }

  /**
   * Validate template syntax and variable references
   */
  validate(
    template: string,
    availableVariables: VariableDefinition[]
  ): ValidationResult {
    const errors: ValidationError[] = [];

    // 1. Check syntax by attempting parse
    try {
      this.liquid.parse(template);
    } catch (error) {
      errors.push({
        type: 'syntax',
        message: this.simplifyErrorMessage(error),
      });
      return { valid: false, errors };
    }

    // 2. Check variable references
    const usedVars = this.extractVariables(template);
    const knownVars = new Set(availableVariables.map(v => v.name));

    for (const varName of usedVars) {
      if (!knownVars.has(varName)) {
        errors.push({
          type: 'unknown_variable',
          message: `Unknown variable: ${varName}`,
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Extract variable names from template
   * Uses LiquidJS experimental API (v10.20.0+)
   */
  private extractVariables(template: string): Set<string> {
    // Implementation: traverse parsed AST to find variable references
    // See: https://github.com/harttle/liquidjs/discussions/707
    return new Set();
  }

  /**
   * Convert LiquidJS technical errors to user-friendly messages
   */
  private simplifyErrorMessage(error: unknown): string {
    // Transform "ParseError: tag {% endif %} not closed"
    // into "Missing closing tag for 'if' statement"
    // MORE CLARITY-FOCUSED MESSAGES HERE
    return String(error);
  }
}
```

### Pattern 3: Variable Registry

**What:** Central registry of all variables (system, runtime, custom)

**When to use:** Template validation, context building, UI variable picker

**Example:**
```typescript
// src/lib/services/templates/variables.ts
export type VariableType = 'text' | 'number' | 'boolean' | 'enum';
export type VariableCategory = 'system' | 'runtime' | 'custom';

export interface VariableDefinition {
  name: string;
  type: VariableType;
  category: VariableCategory;
  description: string;
  required?: boolean;
  enumValues?: string[];  // for enum type
  defaultValue?: unknown;
}

class VariableRegistry {
  private variables = new Map<string, VariableDefinition>();

  registerSystemVariables() {
    this.register({
      name: 'protagonistName',
      type: 'text',
      category: 'system',
      description: 'Name of the story protagonist',
      required: true,
    });
    // ... more system variables
  }

  register(variable: VariableDefinition) {
    this.variables.set(variable.name, variable);
  }

  get(name: string): VariableDefinition | undefined {
    return this.variables.get(name);
  }

  getAll(): VariableDefinition[] {
    return Array.from(this.variables.values());
  }

  getByCategory(category: VariableCategory): VariableDefinition[] {
    return this.getAll().filter(v => v.category === category);
  }
}

export const variableRegistry = new VariableRegistry();
```

### Anti-Patterns to Avoid

- **Macro system entanglement:** Don't try to unify templates with the existing macro system immediately. Let them coexist in Phase 1, migrate in later phase.
- **Over-engineering validation:** Don't build AST walkers when LiquidJS parse errors suffice for 90% of cases.
- **Exposing LiquidJS directly:** Services should never import LiquidJS directly — only through the template engine API.
- **Variable inheritance/nesting:** Variables are flat values only, no references to other variables.
- **Global state mutation:** Engine should be stateless (config only), context passed per-render.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Template parsing | Custom regex {{ }} parser | LiquidJS.parse() | Edge cases: nested brackets, escaped characters, syntax variations. LiquidJS handles all Liquid syntax correctly. |
| Conditionals | Custom if/else parser | LiquidJS {% if %} tags | Operator precedence, parentheses, and/or logic, comparison operators — LiquidJS implements full Liquid spec. |
| Loops | Custom for-loop logic | LiquidJS {% for %} tags | Loop variables (forloop.index, forloop.first), break/continue, limit/offset — all built-in. |
| Filters | Custom string manipulation functions | LiquidJS 40+ built-in filters | Filters like escape, url_encode, strip_html handle edge cases (Unicode, XSS, encoding). |
| Validation | Regex-based syntax checking | LiquidJS parse() + error handling | Parse errors give line/column info, detects unclosed tags, malformed syntax. |
| Circular reference detection | Graph traversal algorithm | Not needed | User constraint: variables don't reference other variables, so no circular references possible. |

**Key insight:** LiquidJS is battle-tested (Shopify/GitHub Pages scale), safe by design, and solves every requirement ENG-01 through ENG-10. Custom solutions would spend months recreating what LiquidJS provides out of the box.

## Common Pitfalls

### Pitfall 1: Treating Templates Like Macros

**What goes wrong:** Trying to make templates and macros interchangeable, or prematurely removing the macro system.

**Why it happens:** Both use `{{ }}` syntax, easy to conflate them conceptually.

**How to avoid:** Keep systems separate in Phase 1. Templates are for preset/profile system (Phase 3), macros are for existing prompt system. They can coexist. Migration is a separate phase decision.

**Warning signs:** Import statements mixing `templates/` and `prompts/` modules, trying to validate macro syntax as templates.

### Pitfall 2: Over-Validating at Render Time

**What goes wrong:** Throwing errors or blocking renders when unknown variables appear, breaking user experience.

**Why it happens:** Instinct to be "strict" about validation everywhere.

**How to avoid:** Validation is save-time only. Render-time errors should log and return empty string (per user constraint). Use LiquidJS `strictVariables: false` for rendering.

**Warning signs:** Try-catch blocks around render() that re-throw, error modals during story generation.

### Pitfall 3: Non-Technical User Error Messages

**What goes wrong:** Showing raw LiquidJS parse errors like "ParseError: tag {% endif %} not closed, line 5, col 12" to non-technical users.

**Why it happens:** Directly passing through library error messages without translation.

**How to avoid:** Error message simplification layer that converts technical terms to plain language:
- "ParseError: tag {% endif %} not closed" → "Missing closing tag for 'if' statement"
- "Unknown variable 'userNam'" → "Variable 'userNam' doesn't exist. Did you mean 'userName'?"
- Include line numbers only if editor shows line numbers, otherwise describe location ("near the top", "in the third paragraph")

**Warning signs:** User confusion, support requests about "parse errors" or "AST nodes".

### Pitfall 4: Forgetting Future Integration

**What goes wrong:** Building template system in isolation without considering how it connects to agent profiles (Phase 3).

**Why it happens:** Focusing only on Phase 1 requirements.

**How to avoid:** Design variable registry with "profile-scoped" variables in mind (even if not implemented yet). Use naming patterns that anticipate grouping (e.g., `profile.tone`, `service.context`).

**Warning signs:** Flat variable namespace with no structure, hard-coded variable names throughout codebase.

### Pitfall 5: Circular Reference Paranoia

**What goes wrong:** Implementing complex circular reference detection when it's impossible by design.

**Why it happens:** Seeing ENG-10 requirement and assuming variables can reference each other.

**How to avoid:** User constraint explicitly states "Variables do not reference other variables." No expression evaluation, no variable substitution in variable values. Requirements ENG-09 and ENG-10 are about unknown variables, not circular references.

**Warning signs:** Graph traversal code, dependency tracking, recursive validation loops.

## Code Examples

Verified patterns from LiquidJS official documentation:

### Basic Rendering

```typescript
// Source: https://liquidjs.com/tutorials/intro-to-liquid.html
import { Liquid } from 'liquidjs';

const engine = new Liquid();
const template = 'Hello {{ name }}!';
const context = { name: 'World' };

const result = engine.parseAndRenderSync(template, context);
// Output: "Hello World!"
```

### Conditionals

```typescript
// Source: https://liquidjs.com/tutorials/intro-to-liquid.html
const template = `
{% if user.age >= 18 %}
  Welcome, adult user!
{% elsif user.age >= 13 %}
  Welcome, teen user!
{% else %}
  Sorry, you must be 13 or older.
{% endif %}
`;

const context = { user: { age: 16 } };
// Output: "Welcome, teen user!"
```

### Loops

```typescript
// Source: https://liquidjs.com/tutorials/intro-to-liquid.html
const template = `
{% for item in items %}
  {{ forloop.index }}: {{ item.name }}
{% endfor %}
`;

const context = {
  items: [
    { name: 'Apple' },
    { name: 'Banana' },
    { name: 'Cherry' }
  ]
};
// Output: "1: Apple\n2: Banana\n3: Cherry"
```

### Filters

```typescript
// Source: https://liquidjs.com/filters/overview.html
const template = `
{{ message | upcase }}
{{ url | url_encode }}
{{ html | strip_html }}
{{ items | join: ', ' }}
`;

const context = {
  message: 'hello world',
  url: 'foo bar',
  html: '<p>Hello</p>',
  items: ['a', 'b', 'c']
};
// Output: "HELLO WORLD\nfoo%20bar\nHello\na, b, c"
```

### Validation (Syntax Check)

```typescript
// Source: https://liquidjs.com/tutorials/options.html
import { Liquid } from 'liquidjs';

const engine = new Liquid({ strictVariables: true });

try {
  const templates = engine.parse('Hello {{ name }}');
  console.log('Syntax valid');
} catch (error) {
  console.error('Syntax error:', error.message);
}
```

### Error Handling (Unknown Variables)

```typescript
// Source: https://liquidjs.com/tutorials/options.html
const strictEngine = new Liquid({ strictVariables: true });
const lenientEngine = new Liquid({ strictVariables: false });

const template = '{{ unknownVar }}';

// Strict mode: throws error
try {
  strictEngine.parseAndRenderSync(template, {});
} catch (error) {
  console.log('Error caught'); // <-- Error thrown
}

// Lenient mode: renders empty string
const result = lenientEngine.parseAndRenderSync(template, {});
console.log(result); // Output: ""
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String concatenation + replace() | Template engines with validation | ~2010s | Type safety, validation, maintainability |
| Eval-based templating (Underscore.js _.template) | Safe engines (Liquid, Handlebars) | ~2015 | Security (XSS prevention, no code execution) |
| JavaScript-only template engines | TypeScript-native engines | ~2020 | Type safety, IDE autocomplete, fewer runtime errors |
| Nunjucks (JavaScript) | LiquidJS (TypeScript) | 2020s | LiquidJS v10 rewritten in TS strict mode, native types |

**Deprecated/outdated:**

- **jinja-js**: Unmaintained for 7 years, author says "I do not recommend using this"
- **Underscore.js templates**: Use eval(), security risk for user-generated content
- **String.prototype.replace() with regex**: No validation, no escaping, no conditionals
- **Template literals (backticks)**: Eval-equivalent, unsafe for user input

**Current best practices (2026):**

- TypeScript-native template engines (type safety)
- No eval/Function constructor (security)
- Built-in escaping (XSS prevention)
- Validation APIs (syntax checking before render)
- Shopify Liquid syntax (widely understood, non-technical-user friendly)

## Error Presentation for Non-Technical Users

### UX Principles

Based on research into error message UX for non-technical users:

1. **Plain language over technical terms**
   - ❌ "ParseError: tag {% endif %} not closed"
   - ✅ "Missing closing tag for 'if' statement"

2. **Explain + Guide approach**
   - State the problem clearly
   - Immediately suggest how to fix it

3. **Inline validation preferred**
   - Show errors next to the line with the problem
   - Avoid modal dialogs with long error lists

4. **Contextual hints**
   - If variable name is close to existing variable, suggest: "Did you mean 'userName'?"
   - For syntax errors, show example of correct syntax

5. **Visual hierarchy**
   - Red text/icons for errors
   - Yellow for warnings (e.g., unused variables)
   - Keep messages short (1-2 sentences)

### Recommended Error Message Patterns

**Syntax Errors:**

| Technical Error | User-Friendly Message | Guidance |
|----------------|----------------------|----------|
| `ParseError: tag {% endif %} not closed` | Missing closing tag for 'if' statement | Add `{% endif %}` after your condition |
| `ParseError: unexpected character '}'` | Extra closing bracket | Remove the extra `}` character |
| `Unknown filter: capitalise` | Filter 'capitalise' doesn't exist | Did you mean 'capitalize'? |

**Variable Errors:**

| Technical Error | User-Friendly Message | Guidance |
|----------------|----------------------|----------|
| `Variable 'usrName' not defined` | Variable 'usrName' doesn't exist | Available variables: userName, userEmail, userRole |
| `Variable 'protagonist' not defined` | Variable 'protagonist' doesn't exist | Did you mean 'protagonistName'? |

**Structural Errors:**

| Technical Error | User-Friendly Message | Guidance |
|----------------|----------------------|----------|
| `{% if %} tag requires a condition` | 'If' statement is missing a condition | Add a condition like: {% if userName %} |
| `{% for %} loop requires 'in' keyword` | 'For' loop syntax is incomplete | Use: {% for item in items %} |

### Implementation Recommendation

```typescript
// src/lib/services/templates/errors.ts
export function simplifyError(error: unknown): string {
  const message = String(error);

  // Syntax error patterns
  if (message.includes('not closed')) {
    return 'Missing closing tag. Make sure every {% if %} has an {% endif %}.';
  }

  if (message.includes('unexpected character')) {
    return 'Extra or misplaced character. Check your brackets and tags.';
  }

  // Variable error patterns
  if (message.includes('not defined')) {
    const varName = extractVariableName(message);
    const suggestion = findSimilarVariable(varName);
    return suggestion
      ? `Variable '${varName}' doesn't exist. Did you mean '${suggestion}'?`
      : `Variable '${varName}' doesn't exist. Check available variables.`;
  }

  // Default fallback
  return 'Template contains an error. Please check the syntax.';
}
```

## Open Questions

1. **Migration strategy from existing macro system**
   - What we know: Current `promptService` uses macro system with `{{ }}` syntax
   - What's unclear: Should Phase 1 replace macros entirely, or coexist during transition?
   - Recommendation: **Coexist in Phase 1.** Templates for new preset system, macros for existing prompts. Evaluate migration in later phase.

2. **Variable naming conventions**
   - What we know: Current system uses flat names like `protagonistName`, `currentLocation`
   - What's unclear: Should templates use namespaced variables (`profile.tone`, `service.context`)?
   - Recommendation: **Flat names in Phase 1** (matches current system), namespace in Phase 3 when agent profiles are integrated.

3. **Template storage location**
   - What we know: Templates will be associated with agent profiles → services
   - What's unclear: Database schema, file structure, lookup strategy
   - Recommendation: **Design variable registry to be storage-agnostic** (works with any lookup). Phase 2 defines storage schema.

4. **Validation performance**
   - What we know: Real-time validation on every keystroke in CodeMirror
   - What's unclear: Will LiquidJS parse() be fast enough for large templates (500+ words)?
   - Recommendation: **Implement debouncing in Phase 4** (validation API is synchronous, but UI can throttle). Measure performance with real templates.

## Sources

### Primary (HIGH confidence)

- [LiquidJS Official Documentation](https://liquidjs.com/) - Features, API reference, filters list
- [LiquidJS npm package](https://www.npmjs.com/package/liquidjs) - Version 10.24.0, last published 3 months ago
- [LiquidJS GitHub](https://github.com/harttle/liquidjs) - TypeScript source, issues, discussions
- [LiquidJS Options Documentation](https://liquidjs.com/tutorials/options.html) - strictVariables, strictFilters configuration
- [LiquidJS Filters Overview](https://liquidjs.com/filters/overview.html) - 40+ built-in filters documented

### Secondary (MEDIUM confidence)

- [Nunjucks Official Documentation](https://mozilla.github.io/nunjucks/) - Feature comparison, verified via multiple sources
- [npm-compare: Template Engines Comparison](https://npm-compare.com/ejs,handlebars,liquidjs,nunjucks,pug) - Bundle size, weekly downloads
- [StackShare: Liquid vs Nunjucks Comparison](https://stackshare.io/stackups/liquid-vs-nunjucks) - Security and feature differences
- [UX Writing Hub: Error Message Examples](https://uxwritinghub.com/error-message-examples/) - Best practices for non-technical users
- [Nielsen Norman Group: Form Error Guidelines](https://www.nngroup.com/articles/errors-forms-design-guidelines/) - Error presentation patterns

### Tertiary (LOW confidence)

- [jinja-js GitHub](https://github.com/sstur/jinja-js) - Deprecated, author recommends against use
- WebSearch results on circular reference detection - Applied to TypeScript module dependencies, not template variables

## Metadata

**Confidence breakdown:**

- **Standard stack: HIGH** - LiquidJS is verified through official docs, npm registry, and active GitHub repository. TypeScript support, version, and features confirmed.
- **Architecture: HIGH** - Patterns based on existing codebase structure (`src/lib/services/prompts/`) and Svelte/TypeScript best practices verified through official documentation.
- **Pitfalls: MEDIUM-HIGH** - Based on common template engine mistakes and user constraint analysis. Error message UX verified through multiple UX research sources.
- **Library comparison: HIGH** - Feature and security comparisons verified across multiple sources (official docs, npm registry, StackShare).

**Research date:** 2026-02-08

**Valid until:** ~30 days (LiquidJS is stable, no breaking changes expected)

**Researcher notes:**

- User constraint "prefer simplest Jinja-compatible library" led to evaluation of jinja-js (rejected: deprecated), Nunjucks (rejected: JavaScript-based, over-featured), and LiquidJS (selected: TypeScript, safe by design, perfect feature match).
- Circular reference detection is NOT needed per user constraint ("Variables do not reference other variables"), despite ENG-10 mentioning it — this requirement appears to be about unknown variable detection, not circular refs.
- Template vs macro coexistence is the cleanest Phase 1 approach — don't force migration until Phase 3 when preset system is built.
- Error message simplification is critical for non-technical users but can be iterated in Phase 4 (UI phase) — Phase 1 should expose raw errors + simple translation layer.
