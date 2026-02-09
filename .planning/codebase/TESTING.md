# Testing Patterns

**Analysis Date:** 2026-02-08

## Test Framework

**Status:** No formal test framework configured

**Current State:**
- No Jest, Vitest, or other test runner in `package.json`
- No test files in `src/` directory (`.test.ts`, `.spec.ts` files not present)
- No test configuration files (`jest.config.js`, `vitest.config.ts`, etc.)
- Development includes `svelte-check` for type checking and component validation

**Implication:**
Testing is currently manual or external to the codebase. This is a significant gap for a complex AI-powered application with multiple service layers.

## Type Checking (Current Quality Assurance)

**Tools:**
- TypeScript with strict mode enabled
- Svelte type checking via `svelte-check`
- ESLint with TypeScript support

**Run Commands:**
```bash
npm run check                # Run svelte-check once
npm run check:watch         # Watch mode for continuous checking
npm run lint                # Run ESLint
npm run lint:fix            # Auto-fix lint issues
npm run format              # Run Prettier formatting
```

**TypeScript Config:**
- File: `tsconfig.json`
- Strict mode: enabled (`"strict": true`)
- Module resolution: bundler (SvelteKit standard)
- Source maps: enabled
- Allow JS: enabled (supports mixed JS/TS)
- Check JS: enabled

## Code Quality Practices Observed

### Input Validation

Type-based validation is primary approach:

```typescript
// Type guard via shape checking
function migrateVisualDescriptors(data: unknown): VisualDescriptors {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>
    if ('face' in obj || 'hair' in obj || 'eyes' in obj) {
      return data as VisualDescriptors
    }
  }
  // Old format handling...
}
```

### Error Handling in Services

Safe failures via try-catch:

```typescript
// From requestOverrides.ts
try {
  const parsed = JSON.parse(body)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  // validation and return
} catch {
  return null
}
```

### Configuration Management

Centralized defaults and user overrides:

```typescript
// From config.ts: Defaults with user override support
export const AI_CONFIG = { ... } as const

export function getContextConfig() {
  const ctx = settings.serviceSpecificSettings?.contextWindow
  return {
    recentEntriesForNarrative:
      ctx?.recentEntriesForNarrative ?? AI_CONFIG.context.recentEntriesForNarrative,
    // ... more properties with nullish coalescing fallback
  }
}
```

## Testing Recommendations

### Suggested Framework Setup

**Recommended:** Vitest + Testing Library

```bash
npm install -D vitest @vitest/ui @testing-library/svelte @testing-library/dom
npm install -D jsdom  # For DOM simulation
```

**Vitest Config Location:** Create `vitest.config.ts`

### Test File Organization

**Pattern to Implement:**
- Co-located tests: Place `.test.ts` next to source files
- Service tests: `src/lib/services/ai/generation/*.test.ts`
- Utility tests: `src/lib/utils/*.test.ts`
- Component tests (visual): `src/lib/components/**/*.test.ts`

**Example Structure:**
```
src/lib/
├── services/
│   └── ai/
│       └── generation/
│           ├── ClassifierService.ts
│           └── ClassifierService.test.ts
├── utils/
│   ├── cn.ts
│   └── cn.test.ts
```

### Test Structure Recommendations

**Service Tests Pattern:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { ClassifierService } from './ClassifierService'
import type { ClassificationContext } from './ClassifierService'

describe('ClassifierService', () => {
  let service: ClassifierService

  beforeEach(() => {
    service = new ClassifierService('test-preset', 100)
  })

  describe('classify', () => {
    it('should extract characters from narrative response', async () => {
      const context: ClassificationContext = {
        storyId: 'test',
        story: mockStory,
        narrativeResponse: 'A tall wizard entered...',
        userAction: 'Look around',
        existingCharacters: [],
        existingLocations: [],
        existingItems: [],
        existingStoryBeats: [],
      }

      const result = await service.classify(context)
      expect(result).toBeDefined()
      expect(result.characters).toEqual(expect.any(Array))
    })

    it('should handle empty narrative gracefully', async () => {
      const context: ClassificationContext = {
        ...mockContext,
        narrativeResponse: '',
      }
      const result = await service.classify(context)
      expect(result).toBeDefined()
    })
  })
})
```

**Component Tests Pattern:**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import LorebookEntryForm from './LorebookEntryForm.svelte'

describe('LorebookEntryForm', () => {
  it('renders form fields for new entry', () => {
    render(LorebookEntryForm, {
      props: {
        entry: null,
        onSave: () => {},
        onCancel: () => {},
      },
    })

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('calls onSave with entry data when form is submitted', async () => {
    const mockSave = vi.fn()
    render(LorebookEntryForm, {
      props: {
        entry: null,
        onSave: mockSave,
        onCancel: () => {},
      },
    })

    // Fill form and submit...
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      name: expect.any(String),
      type: expect.any(String),
    }))
  })
})
```

## Mocking Recommendations

### Database/Service Mocks

```typescript
import { vi } from 'vitest'

const mockDatabase = {
  getStory: vi.fn().mockResolvedValue(mockStory),
  saveStory: vi.fn().mockResolvedValue(undefined),
}

vi.mock('$lib/services/database', () => ({
  database: mockDatabase,
}))
```

### AI Provider Mocks

```typescript
import { vi } from 'vitest'

const mockProvider = {
  generateResponse: vi.fn().mockResolvedValue({
    content: 'Mocked narrative response',
    model: 'test-model',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  }),
}

vi.mock('$lib/services/ai/core/factory', () => ({
  aiFactory: {
    createProvider: vi.fn().mockReturnValue(mockProvider),
  },
}))
```

### What to Mock
- Database calls (`$lib/services/database`)
- External API providers (AI SDKs)
- Tauri plugin calls (`@tauri-apps/api`)
- File system operations

### What NOT to Mock
- Utility functions (`cn()`, `createLogger()`)
- Type definitions
- Store/state management (test with real stores in integration tests)
- Local computation logic

## Test Coverage Goals

**Priority Areas (by impact):**
1. **AI Service Layer** - Core narrative generation, classification logic
   - Files: `src/lib/services/ai/generation/*.ts`
   - Target: 80%+ coverage

2. **Data Validation & Migration** - Database schema migrations, type coercion
   - Files: `src/lib/services/database.ts`, `migrateVisualDescriptors()`
   - Target: 90%+ coverage (critical for data integrity)

3. **State Management** - Store mutations and derived computations
   - Files: `src/lib/stores/*.svelte.ts`
   - Target: 70%+ coverage

4. **Component Logic** - Complex interactive components
   - Files: `src/lib/components/lorebook/*.svelte`, `src/lib/components/story/*.svelte`
   - Target: 60%+ coverage (snapshot tests acceptable)

**Lower Priority:**
- UI components from `bits-ui` (already tested by library)
- Template/prompt rendering (integration tested manually)
- Tauri-specific code (requires desktop environment)

## Async Testing Pattern

```typescript
import { describe, it, expect, vi } from 'vitest'

describe('Async Service', () => {
  it('should handle async classification', async () => {
    const service = new ClassifierService()
    const result = await service.classify(mockContext)

    expect(result).toBeDefined()
    expect(result.characters).toEqual(expect.any(Array))
  })

  it('should handle errors gracefully', async () => {
    const service = new ClassifierService()
    vi.spyOn(service, 'classify').mockRejectedValue(
      new Error('API error')
    )

    await expect(service.classify(mockContext)).rejects.toThrow('API error')
  })
})
```

## Error Testing Pattern

```typescript
describe('Error Cases', () => {
  it('should return null for invalid JSON in migration', () => {
    const result = migrateVisualDescriptors({ invalid: 'data' })
    expect(result).toEqual({}) // or appropriate default
  })

  it('should validate required fields', () => {
    const context: Partial<ClassificationContext> = {
      storyId: 'test',
      // missing required fields
    }

    // Either type error catches at build time, or runtime validation:
    expect(() => {
      classifierService.classify(context as ClassificationContext)
    }).toThrow()
  })
})
```

## CI/CD Testing Integration

**Recommended npm scripts to add:**

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:watch": "vitest --watch"
  }
}
```

**Pre-commit Hook (via lefthook):**
```yaml
# lefthook.yml additions
pre-commit:
  commands:
    test:
      glob: "src/**/*.{ts,tsx,svelte}"
      run: npm run test -- --run
```

## Current Gaps

1. **No unit tests** - Services lack isolation/behavior tests
2. **No integration tests** - Database + service interactions untested
3. **No E2E tests** - Desktop app workflows (Tauri) not validated
4. **No regression detection** - Complex narrative generation changes unverified
5. **Type-only validation** - Runtime validation minimal

---

*Testing analysis: 2026-02-08*
