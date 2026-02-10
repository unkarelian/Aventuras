# Coding Conventions

**Analysis Date:** 2026-02-08

## Naming Patterns

**Files:**
- Component files: PascalCase (e.g., `LorebookEntryForm.svelte`, `ContextBuilder.ts`)
- Utility/helper files: camelCase (e.g., `cn.ts`, `is-mobile.svelte.ts`)
- Store files: camelCase with `.svelte.ts` extension (e.g., `settings.svelte.ts`, `story.svelte.ts`)
- Service classes: PascalCase ending with `Service` (e.g., `ClassifierService.ts`, `NarrativeService.ts`)
- Index/barrel files: `index.ts` for exports

**Functions:**
- Service methods: camelCase (e.g., `buildContext()`, `classify()`, `generateResponse()`)
- Utilities: camelCase (e.g., `createLogger()`, `formatExistingCharacters()`)
- Svelte lifecycle/utility functions: camelCase (e.g., `createIsMobile()`, `handleSwipeLeft()`)

**Variables:**
- Constants: SCREAMING_SNAKE_CASE (e.g., `DEFAULT_CONTEXT_CONFIG`, `AI_CONFIG`, `MIN_SIDEBAR_WIDTH`)
- Local/state variables: camelCase (e.g., `isResizing`, `entry`, `presetId`)
- Derived values in Svelte components: camelCase with `$derived` rune (e.g., `let name = $derived(entry?.name ?? '')`)
- Reactive state in Svelte: camelCase with `$state` rune (e.g., `let saving = $state(false)`)

**Types:**
- Interfaces: PascalCase, often suffixed with descriptors (e.g., `ClassificationContext`, `ContextConfig`, `ClassifierSettings`)
- Type definitions: PascalCase (e.g., `StoryMode = 'adventure' | 'creative-writing'`)
- Generic naming: Concise but descriptive (e.g., `RelevantEntry`, `ToolCall`, `AgenticMessage`)

## Code Style

**Formatting:**
- Prettier with custom config in `.prettierrc`
- Tab width: 2 spaces (no tabs)
- Line width: 100 characters
- Single quotes for strings
- Trailing commas: all
- No semicolons

**Linting:**
- ESLint with flat config (`eslint.config.js`)
- TypeScript ESLint support
- Svelte ESLint plugin
- Unused imports detection via `eslint-plugin-unused-imports`
- Variables prefixed with underscore (`_`) are allowed unused (convention for intentionally unused parameters)
- `no-explicit-any` disabled (allowed for complex integrations)

**Applied Rules:**
- `unused-imports/no-unused-vars`: Error - removes unused variables
- `unused-imports/no-unused-imports`: Error - removes unused import statements
- `prettier/prettier`: Warn - enforces Prettier formatting
- `svelte/no-navigation-without-resolve`: Off - custom override
- `svelte/no-at-html-tags`: Off - custom override

## Import Organization

**Order:**
1. Type imports from external packages (`import type { ... } from '@...'`)
2. Default exports from packages (`import Package from 'package'`)
3. Named imports from external packages (`import { Component } from 'lib'`)
4. Type imports from internal paths (`import type { Story } from '$lib/types'`)
5. Named imports from internal paths (`import { cn } from '$lib/utils/cn'`)
6. Relative imports (rare in favor of `$lib` alias)

**Path Aliases:**
- `$lib`: Maps to `src/lib/` - standard SvelteKit alias for all internal code
- Type imports use `import type { }` syntax for clarity
- All service imports use `$lib/services/...` pattern

**Example Import Pattern:**
```typescript
import type { Story, Entry } from '$lib/types'
import { database } from '$lib/services/database'
import { createLogger } from '../core/config'
import { Input } from '$lib/components/ui/input'
```

## Error Handling

**Patterns:**
- Try-catch with empty catch blocks to handle JSON parsing and validation failures
- Silent failures via `return null` in catch blocks (e.g., `requestOverrides.ts`)
- Optional chaining (`?.`) and nullish coalescing (`??`) for safe property access
- Type narrowing before operations (e.g., checking `typeof data === 'object'`)
- Validation before data transformation in migration functions (e.g., `migrateVisualDescriptors()`)

**Service Layer:**
- Services validate input types and shapes
- Errors logged via `createLogger()` in development mode only
- Promise-based error propagation (no custom error classes observed)

## Logging

**Framework:** Console-based with custom `createLogger()` utility

**Pattern:**
- Services create logger instance via `createLogger(serviceName)` in `config.ts`
- Logger respects `DEBUG.enabled` flag (true in dev mode via `import.meta.env.DEV`)
- Logger output format: `[ServiceName] message, data` (prefix + arguments)
- Development-only logging (no output in production builds)

**Usage:**
```typescript
const log = createLogger('Classifier')
log('classify', { narrativeLength: 100, characterCount: 5 })
```

## Comments

**When to Comment:**
- JSDoc comments on exported functions with `@param` and `@example` tags
- Inline comments for non-obvious logic (e.g., coordinate transformation in `AppShell.svelte`)
- Block comments explaining algorithms or design decisions
- NOTE/MIGRATION comments for refactoring context (e.g., in `config.ts`)

**JSDoc/TSDoc:**
- Exported services have JSDoc headers explaining purpose
- Function parameters documented with `@param`
- Return types documented with `@returns`
- Examples provided for complex functions via `@example`
- Design doc references included (e.g., "Per design doc section 3.2.3")

**Example:**
```typescript
/**
 * Creates a logger function for an AI service.
 * Logs are only output when DEBUG.enabled is true (dev mode).
 *
 * @param serviceName - Name of the service (shown as prefix in logs)
 * @returns A logging function that respects the DEBUG configuration
 *
 * @example
 * const log = createLogger('Classifier');
 * log('Processing entry', { id: entry.id }); // [Classifier] Processing entry { id: ... }
 */
export function createLogger(serviceName: string) { ... }
```

## Function Design

**Size:** Mix of small utility functions and larger service methods; no strict line limits enforced

**Parameters:**
- Use object parameters for functions with 3+ parameters (e.g., `ClassificationContext`)
- Type parameters explicitly defined via interfaces
- Optional parameters using nullish coalescing (`??`)

**Return Values:**
- Explicit types defined in all service methods
- Promise-based for async operations
- Nullish returns (`null`) acceptable for optional results
- Structured return objects (e.g., `ContextResult` with `tier1`, `tier2`, `tier3`, `all`, `contextBlock`)

**Example:**
```typescript
async classify(
  context: ClassificationContext,
  visibleEntries?: StoryEntry[],
  currentStoryTime?: TimeTracker | null,
): Promise<ClassificationResult> { ... }
```

## Module Design

**Exports:**
- Barrel files (`index.ts`) re-export public APIs from feature modules
- Services export class definition and related types
- Types exported separately (often from `types/` or within service file)
- Selective exports in barrel files (not `export *`)

**Barrel Files:**
- Located at module level (e.g., `src/lib/services/ai/generation/index.ts`)
- Document purpose in block comment at top
- Group related exports with comments
- Include type re-exports from schema/type modules

**Example Barrel Pattern:**
```typescript
// AI Generation Module - Main orchestrator and services
export { aiService } from '../index'
export { NarrativeService, type NarrativeWorldState } from './NarrativeService'
// Type exports from schemas
export type { ClassificationResult } from '../sdk/schemas/classifier'
```

## Svelte 5 Specific

**Reactivity:**
- `$state` rune for component-level reactive variables
- `$derived` rune for computed/derived values (read-only)
- `$effect` rune for side effects and lifecycle
- No `reactive` declarations or `onMount` for simple initialization

**Component Props:**
- Interface `Props` defined for component props
- Props destructured via rune: `let { entry = null, onSave, onCancel }: Props = $props()`

**Styling:**
- Tailwind CSS classes with `cn()` utility for conditional merging
- `prettier-plugin-tailwindcss` automatically sorts Tailwind classes
- TailwindCSS v4 with vite integration

**Events:**
- Callback props pattern (e.g., `onSave`, `onCancel`)
- Event listeners on svelte directives (e.g., `onmousemove`, `onmouseup`)
- No custom event bubbling observed

---

*Convention analysis: 2026-02-08*
