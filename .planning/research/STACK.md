# Technology Stack Research

**Project:** Aventuras - Jinja-like Template System
**Researched:** 2026-02-08
**Confidence:** LOW-MEDIUM (limited to training data, unable to verify with official sources)

## Research Limitations

**IMPORTANT:** This research was conducted without access to:
- WebSearch (to discover current ecosystem state)
- WebFetch (to verify official documentation)
- Bash/npm (to check current versions and bundle sizes)

All findings are based on training data (January 2025 cutoff) and should be verified against official sources before implementation. Version numbers, bundle sizes, and maintenance status need validation.

## Recommended Stack

### Template Engine
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| LiquidJS | ~10.x (VERIFY) | Jinja-like template engine for user-editable prompt templates | **RECOMMENDED:** TypeScript-native, actively maintained, safe by default (no arbitrary code execution), Shopify Liquid syntax is similar to Jinja, synchronous rendering, works in browser |

**Confidence:** MEDIUM - Based on training data indicating LiquidJS is TypeScript-first and designed for browser environments

### Code Editor Component
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| CodeMirror 6 | ~6.x (VERIFY) | Syntax highlighting editor for template editing | **RECOMMENDED:** Modular architecture (bundle only what you need), mobile-friendly, extensible with custom language modes, good Svelte integration via codemirror-svelte or wrapper components |

**Confidence:** MEDIUM - CodeMirror 6 is known to be mobile-capable and modular, but Svelte 5 compatibility needs verification

### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @codemirror/lang-liquid (if exists) or custom mode | TBD | Liquid syntax highlighting | For syntax highlighting in CodeMirror |
| codemirror-svelte or svelte-codemirror | Latest | Svelte wrapper for CodeMirror | For integrating CodeMirror with Svelte 5 |

**Confidence:** LOW - Package names and availability need verification

## Detailed Analysis

### Template Engine Comparison

#### LiquidJS ✅ RECOMMENDED
**Pros:**
- **TypeScript native:** First-class TS support with full type definitions
- **Safe by default:** No arbitrary JavaScript execution - templates cannot run user code
- **Jinja-like syntax:** `{{ variable }}`, `{% if %}`, `{% for %}`, filters via `| filter`
- **Synchronous rendering:** Supports both sync and async, sync is default
- **Browser-compatible:** Works in browser/WebView contexts (not Node-only)
- **Active maintenance:** Well-maintained by Shopify ecosystem
- **Lightweight:** Reasonable bundle size for desktop app (~50-80KB minified, VERIFY)
- **Extensibility:** Custom filters and tags can be added safely
- **Sandboxed:** Templates run in controlled environment

**Cons:**
- Not exactly Jinja (Shopify Liquid), but syntax is very similar
- Slightly different filter names than Jinja (e.g., `upcase` vs `upper`)

**Best for:** Safe, user-editable templates where security is critical

**Confidence:** MEDIUM - Cannot verify current version, bundle size, or exact feature set

---

#### Nunjucks ⚠️ ALTERNATIVE
**Pros:**
- **Exact Jinja2 syntax:** Closest to Jinja2 (created by Mozilla)
- **Feature-rich:** Full Jinja2 feature set (macros, inheritance, includes)
- **Established:** Widely used, good documentation

**Cons:**
- **Maintenance concerns:** Mozilla archived the project (VERIFY current status)
- **No official TypeScript:** Requires @types/nunjucks (community-maintained)
- **Less safe:** Designed for trusted templates, not user input
- **Bundle size:** Larger than LiquidJS (~100KB+ minified, VERIFY)
- **Async-first:** Synchronous mode exists but less optimized

**Best for:** Internal templates where exact Jinja2 compatibility is required

**Confidence:** LOW - Maintenance status and current version unknown

---

#### Eta ⚠️ ALTERNATIVE
**Pros:**
- **Extremely lightweight:** ~2-3KB minified (VERIFY)
- **TypeScript support:** Written in TypeScript
- **Fast:** Performance-optimized
- **Configurable syntax:** Can configure delimiters

**Cons:**
- **Different syntax:** Not Jinja-like by default (uses `<%= %>` EJS-style)
- **Less features:** Simpler than Jinja (no complex control flow)
- **Different philosophy:** Designed for speed over feature richness

**Best for:** When bundle size is critical and Jinja syntax not required

**Confidence:** MEDIUM - Core characteristics match training data

---

#### Handlebars ❌ NOT RECOMMENDED
**Pros:**
- **Popular:** Very widely used
- **Safe:** Logic-less philosophy

**Cons:**
- **Wrong syntax:** `{{#if}}` not `{% if %}` - very different from Jinja
- **Logic-less philosophy:** Deliberately limited, lacks Jinja's control flow
- **Poor fit:** Users expecting Jinja will be confused

**Confidence:** HIGH - Handlebars syntax is well-documented and fundamentally incompatible

---

### Code Editor Comparison

#### CodeMirror 6 ✅ RECOMMENDED
**Pros:**
- **Mobile-friendly:** Touch support, no hover dependencies, works well on tablets
- **Modular:** Import only needed features (reduces bundle size)
- **Extensible:** Custom language modes, custom extensions
- **Modern architecture:** Better than CodeMirror 5
- **Active development:** Well-maintained
- **Framework agnostic:** Works with Svelte via wrappers
- **Accessibility:** Good keyboard navigation
- **Lightweight core:** ~50KB + language modes (VERIFY)

**Cons:**
- **Wrapper needed:** Requires Svelte wrapper component
- **Svelte 5 compatibility:** Need to verify wrapper works with Svelte 5 runes
- **Custom language mode:** May need to create Liquid/Jinja syntax mode

**Best for:** Professional editing experience with syntax highlighting

**Confidence:** MEDIUM - Core features known, but Svelte 5 compatibility unverified

**Integration approach:**
```typescript
// Example wrapper (needs verification for Svelte 5)
import { EditorView, basicSetup } from 'codemirror'
import { liquidLanguage } from './liquidMode' // Custom mode

// In Svelte component
let editorView: EditorView

$effect(() => {
  editorView = new EditorView({
    doc: initialValue,
    extensions: [basicSetup, liquidLanguage],
    parent: editorElement
  })
})
```

---

#### Monaco Editor ❌ NOT RECOMMENDED
**Pros:**
- **Feature-rich:** Powers VS Code
- **Excellent syntax highlighting:** Very powerful

**Cons:**
- **Bundle size:** 1-2MB+ (too heavy for desktop app)
- **Desktop-focused:** Not optimized for mobile/tablet
- **Overkill:** More features than needed for template editing
- **Complex integration:** Harder to integrate with Svelte

**Confidence:** HIGH - Monaco's bundle size and desktop focus are well-known

---

#### Custom textarea + syntax highlighting ⚠️ FALLBACK
**Pros:**
- **Lightweight:** Minimal bundle impact
- **Full control:** Complete customization
- **Mobile-friendly:** Native textarea works everywhere

**Cons:**
- **Limited features:** No autocomplete, line numbers require work
- **Development time:** Must build highlighting from scratch
- **Worse UX:** Not as polished as CodeMirror

**Best for:** MVP or if CodeMirror integration proves problematic

**Confidence:** HIGH - Simple approach with known tradeoffs

---

## Installation

```bash
# Template Engine
npm install liquidjs

# Code Editor
npm install codemirror @codemirror/state @codemirror/view @codemirror/language

# Svelte wrapper (VERIFY package name for Svelte 5)
npm install codemirror-svelte
# OR build custom wrapper

# If creating custom Liquid mode
npm install @codemirror/language @lezer/highlight
```

**Note:** Package names and versions need verification against npm registry.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Template Engine | LiquidJS | Nunjucks | Maintenance concerns, larger bundle, less safe |
| Template Engine | LiquidJS | Eta | Wrong syntax paradigm, less Jinja-like |
| Template Engine | LiquidJS | Handlebars | Completely different syntax, logic-less |
| Editor | CodeMirror 6 | Monaco | Bundle size too large (1-2MB vs ~50KB) |
| Editor | CodeMirror 6 | Custom textarea | Poor UX, more dev time for features |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Nunjucks (unless verified active) | Potentially unmaintained, Mozilla archived project | LiquidJS |
| Handlebars | Wrong syntax paradigm (not Jinja-like) | LiquidJS |
| Monaco Editor | 1-2MB bundle size overkill for template editing | CodeMirror 6 |
| Template literals (`${}`) | Allows arbitrary code execution - security risk | LiquidJS with safe filters |
| eval() or Function() | Major security vulnerability with user input | Never - use sandboxed engine |

## Security Considerations

### Critical: Template Sandboxing

**DANGER:** User-editable templates MUST NOT allow arbitrary code execution.

| Approach | Security | Notes |
|----------|----------|-------|
| LiquidJS | ✅ Safe | No code execution, only safe filters |
| Nunjucks (sandboxed mode) | ⚠️ Requires config | Must explicitly disable dangerous features |
| Template literals | ❌ UNSAFE | User could execute any JavaScript |
| eval() / Function() | ❌ NEVER | Critical security vulnerability |

**Recommendation:** Use LiquidJS with only whitelisted custom filters. Never allow users to define custom filters without code review.

## Custom Filter Examples

LiquidJS allows safe custom filters:

```typescript
// Safe custom filters for LiquidJS
import { Liquid } from 'liquidjs'

const engine = new Liquid()

// String manipulation (safe)
engine.registerFilter('shout', (v: string) => v.toUpperCase() + '!!!')

// Array operations (safe)
engine.registerFilter('random', (arr: any[]) =>
  arr[Math.floor(Math.random() * arr.length)]
)

// Dangerous - DON'T DO THIS
// engine.registerFilter('eval', (code: string) => eval(code)) // ❌
```

## Syntax Highlighting for Liquid

### Option 1: Custom CodeMirror Language Mode

Create a simple Liquid language mode for CodeMirror:

```typescript
// liquidMode.ts - EXAMPLE, needs implementation
import { LanguageSupport, StreamLanguage } from '@codemirror/language'

const liquidSyntax = {
  token(stream: any, state: any) {
    // Match {{ variable }}
    if (stream.match(/\{\{.*?\}\}/)) {
      return 'variable'
    }
    // Match {% tag %}
    if (stream.match(/\{%.*?%\}/)) {
      return 'keyword'
    }
    // Match filters |
    if (stream.match(/\|[\w]+/)) {
      return 'operator'
    }
    stream.next()
    return null
  }
}

export const liquidLanguage = new LanguageSupport(
  StreamLanguage.define(liquidSyntax)
)
```

### Option 2: Use existing Jinja/Liquid mode if available

Check npm for packages like:
- `@codemirror/lang-jinja` (verify existence)
- `codemirror-lang-liquid` (verify existence)
- Fork and adapt existing Jinja mode

**Confidence:** LOW - Package availability needs verification

## Integration with Existing MacroEngine

### Migration Strategy

Current system (from macros.ts):
```typescript
// Current: Simple {{ token }} replacement
macroEngine.expand(prompt, context)
```

With LiquidJS:
```typescript
import { Liquid } from 'liquidjs'

const liquid = new Liquid({
  strictFilters: true,  // Fail on unknown filters
  strictVariables: true // Fail on missing variables (or false for flexibility)
})

// Register custom filters matching current macro behavior
liquid.registerFilter('upper', (v: string) => v.toUpperCase())
liquid.registerFilter('lower', (v: string) => v.toLowerCase())
liquid.registerFilter('join', (arr: any[], sep = ', ') => arr.join(sep))

// Render template
const result = await liquid.parseAndRender(template, context)
// Or synchronous:
const result = liquid.parseAndRenderSync(template, context)
```

**Migration path:**
1. Implement LiquidJS engine alongside MacroEngine
2. Convert simple macros to Liquid variables: `{{protagonistName}}`
3. Convert complex macros to Liquid conditionals: `{% if mode == 'adventure' %}...{% endif %}`
4. Migrate placeholders to context object
5. Deprecate MacroEngine once migration complete

## Bundle Size Estimate

**WARNING:** These are estimates from training data. Verify actual bundle impact.

| Component | Estimated Size | Notes |
|-----------|---------------|-------|
| LiquidJS | ~50-80KB min+gzip | VERIFY - core engine only |
| CodeMirror 6 core | ~40-50KB min+gzip | VERIFY - basic setup |
| CodeMirror language mode | ~5-15KB min+gzip | VERIFY - depends on complexity |
| **Total** | **~95-145KB** | Acceptable for desktop app |

Compare to Monaco: ~1-2MB (10-20x larger)

## TypeScript Support

| Library | TypeScript Support | Notes |
|---------|-------------------|-------|
| LiquidJS | ✅ Native | Written in TypeScript, full type definitions |
| CodeMirror 6 | ✅ Native | Written in TypeScript |
| Nunjucks | ⚠️ Via @types | Community-maintained types |
| Eta | ✅ Native | Written in TypeScript |

## Version Compatibility

**CRITICAL:** These need verification before installation.

| Package | Estimated Version | Compatible With | Notes |
|---------|------------------|-----------------|-------|
| liquidjs | ~10.x | TypeScript 5.6, Vite 6 | VERIFY current version |
| codemirror | ~6.x | Svelte 5, Vite 6 | VERIFY Svelte 5 wrapper |
| codemirror-svelte | Unknown | Svelte 5 | VERIFY existence and Svelte 5 support |

## Validation Checklist

Before implementation, verify:

- [ ] LiquidJS current version and maintenance status
- [ ] LiquidJS actual bundle size (minified + gzipped)
- [ ] LiquidJS synchronous rendering performance
- [ ] CodeMirror 6 current version
- [ ] CodeMirror Svelte 5 wrapper availability (codemirror-svelte, svelte-codemirror, or custom)
- [ ] Liquid/Jinja syntax mode availability for CodeMirror
- [ ] Actual bundle impact in Aventuras build
- [ ] Mobile/touch behavior on target devices (768px breakpoint)
- [ ] TypeScript compatibility with existing tsconfig

## Sources

**NONE - All information from training data (January 2025 cutoff)**

This research requires verification with:
- Official LiquidJS documentation (https://liquidjs.com)
- Official CodeMirror documentation (https://codemirror.net)
- NPM registry for current versions
- Bundle size analysis tools (webpack-bundle-analyzer, vite-bundle-visualizer)
- Svelte 5 integration guides

---

## Summary

**RECOMMENDED STACK:**
- **Template Engine:** LiquidJS (safe, Jinja-like, TypeScript, browser-compatible)
- **Editor:** CodeMirror 6 (lightweight, mobile-friendly, extensible)
- **Syntax Highlighting:** Custom Liquid mode for CodeMirror

**CRITICAL NEXT STEPS:**
1. Verify LiquidJS and CodeMirror current versions and maintenance status
2. Test bundle size impact
3. Verify Svelte 5 integration approach
4. Prototype Liquid syntax highlighting
5. Test on mobile (768px breakpoint)

**CONFIDENCE LEVEL:** LOW-MEDIUM
- Stack direction is sound based on training data
- Specific versions, bundle sizes, and compatibility need verification
- No access to current ecosystem state (2026 docs, releases, community feedback)
- Security considerations are sound regardless of versions

---
*Stack research for: Aventuras Jinja-like Template System*
*Researched: 2026-02-08*
*⚠️ VERIFY ALL CLAIMS - Research based on training data only*
