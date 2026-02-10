---
phase: 02-preset-pack-system
plan: 03
subsystem: business-logic
tags: [pack-service, validation, zod, business-rules]
dependency_graph:
  requires: [02-01-pack-types-and-schema, 02-02-pack-database-operations]
  provides: [pack-service, pack-validation, pack-business-logic]
  affects: []
tech_stack:
  added: [zod-validation]
  patterns: [singleton-service, content-hashing, template-seeding]
key_files:
  created:
    - src/lib/services/packs/pack-service.ts
    - src/lib/services/packs/validation.ts
    - src/lib/services/packs/index.ts
  modified: []
decisions:
  - PackService singleton follows existing service pattern (database, templateEngine)
  - initialize() is idempotent and called on app startup
  - Template seeding handles both content and userContent from PROMPT_TEMPLATES
  - User content uses templateId-user naming convention (matches PromptOverride pattern)
  - hashContent duplicated from DatabaseService for service-layer comparisons
  - deletePack returns structured result with reason (better UX than throwing)
  - Zod validation at system boundaries only (not every database read)
  - Variable name regex enforces lowercase, underscores, must start with letter/underscore
  - PackExportSchema versioned with z.literal(1) for Phase 5 forward compatibility
metrics:
  duration: 152
  completed: 2026-02-09T06:42:29Z
---

# Phase 2 Plan 3: Pack Service and Validation Summary

**One-liner:** Complete business logic layer with PackService for pack management, Zod validation schemas for import/export, and public API barrel

## What Was Built

Created the service layer and validation infrastructure for the preset pack system:

**Pack Service (src/lib/services/packs/pack-service.ts):**
- `PackService` class with singleton pattern matching existing services
- `initialize()`: Idempotent startup method that creates default pack and seeds templates
  - Creates 'default-pack' on first run
  - Seeds all templates from PROMPT_TEMPLATES
  - Handles both system prompt content and user content
  - Adds new templates from app updates automatically
- `getAllPacks()`, `getPack()`, `getFullPack()`: Pack retrieval methods
- `createPack()`: Creates new pack by copying all templates and variables from default
- `deletePack()`: Safely deletes pack with business rule checks
  - Prevents default pack deletion
  - Prevents deletion of packs in use by stories
  - Returns structured result with reason
- `isTemplateModified()`: Checks if template differs from default baseline via hash comparison
- `getModifiedTemplates()`: Returns modification status for all templates in a pack
- `resetTemplate()`: Restores default content for a specific template
- Private `getDefaultContent()`: Handles both 'templateId' and 'templateId-user' patterns
- Private `hashContent()`: SHA-256 hashing with whitespace normalization (duplicates database method for service-layer comparisons)

**Validation (src/lib/services/packs/validation.ts):**
- `EnumOptionSchema`: Validates label+value pairs for enum options
- `CustomVariableSchema`: Validates variable definitions
  - Enforces lowercase, underscore naming via regex
  - Requires enum types to have at least one option
- `PackTemplateSchema`: Validates template ID and content
- `PackExportSchema`: Validates complete pack export data
  - Versioned with `z.literal(1)` for Phase 5 forward compatibility
- `validatePackImport()`: Returns structured result with human-readable error messages
- `validateCustomVariable()`: Validates single variable definitions for Phase 4 UI

**Public API (src/lib/services/packs/index.ts):**
- Barrel file exports packService, validation functions, schemas, and types
- Single import point: `$lib/services/packs`
- Follows same pattern as templates module with grouped exports

## Key Design Decisions

**Template Seeding Strategy:**
- initialize() seeds both system prompts and user content from PROMPT_TEMPLATES
- User content uses `templateId-user` naming (e.g., 'adventure-user')
- Matches existing PromptOverride pattern for consistency
- ~41 templates in PROMPT_TEMPLATES, ~35 with userContent = ~76 pack_templates rows

**Content Hash Duplication:**
- hashContent() duplicated from DatabaseService intentionally
- Service layer needs hashing for comparison without database round-trips
- Ensures same normalization logic (trim, \r\n → \n)

**Business Rule Enforcement:**
- deletePack() checks isDefault and story references before deletion
- Returns structured result `{ deleted: boolean, reason?: string }` for better UX
- No throwing exceptions - callers can handle gracefully

**Validation Philosophy:**
- Zod validation at system boundaries only (creation, import/export)
- NOT used for every database read (trust database integrity after validated writes)
- Variable name regex: `^[a-z_][a-z0-9_]*$` (lowercase, underscores, starts with letter/underscore)
- Enum refinement ensures at least one option

**Singleton Pattern:**
- PackService follows existing service patterns (database, templateEngine)
- Exported as singleton: `export const packService = new PackService()`
- Consumers import and use directly: `await packService.initialize()`

**Idempotent Initialization:**
- initialize() safe to call multiple times
- Checks this.initialized flag to prevent redundant work
- Creates default pack if missing
- Only seeds templates that don't already exist
- Foundation for app startup sequence

## Verification Results

All verification criteria passed:

- [x] Zod is installed (package.json: "zod": "^3.25.76")
- [x] validation.ts defines EnumOptionSchema, CustomVariableSchema, PackTemplateSchema, PackExportSchema
- [x] CustomVariableSchema validates variableName regex (lowercase, underscores only)
- [x] CustomVariableSchema enforces enum type must have at least one option
- [x] PackExportSchema has version: z.literal(1) for forward compatibility
- [x] validatePackImport returns structured result with human-readable errors
- [x] validateCustomVariable validates single variable definitions
- [x] pack-service.ts exports packService singleton
- [x] initialize() creates default pack if missing, seeds templates from PROMPT_TEMPLATES
- [x] initialize() handles both content and userContent template seeding
- [x] initialize() adds new templates from app updates (idempotent)
- [x] createPack() copies all templates and variables from default pack
- [x] deletePack() prevents default pack deletion and in-use pack deletion
- [x] isTemplateModified() compares pack hash against default baseline hash
- [x] getModifiedTemplates() returns modification status for all templates in a pack
- [x] resetTemplate() restores default content for a specific template
- [x] getDefaultContent() handles both 'templateId' and 'templateId-user' patterns
- [x] index.ts barrel exports packService, validation functions, schemas, and all types
- [x] TypeScript compilation passes (svelte-check: 0 errors, 0 warnings)

## Deviations from Plan

None - plan executed exactly as written. All tasks completed without modifications or additional work.

## Task Breakdown

| Task | Name                                           | Status | Commit  | Files                                                                                       |
| ---- | ---------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------- |
| 1    | Install Zod and create pack service with validation | Done   | a4bc940 | package.json, package-lock.json, src/lib/services/packs/pack-service.ts, src/lib/services/packs/validation.ts |
| 2    | Create public API barrel for packs module      | Done   | 53ee7f0 | src/lib/services/packs/index.ts                                                             |

## Files Created

**src/lib/services/packs/pack-service.ts (232 lines)**
- PackService class with 12 public methods
- Private helper methods: getDefaultContent, hashContent
- Singleton export pattern
- Handles default pack initialization
- Template seeding from PROMPT_TEMPLATES
- Pack creation by copying default
- Safe pack deletion with business rules
- Template modification detection via hash comparison
- Template reset to default baseline

**src/lib/services/packs/validation.ts (93 lines)**
- 4 Zod schemas: EnumOption, CustomVariable, PackTemplate, PackExport
- Variable name regex validation
- Enum refinement (must have at least one option)
- 2 validation functions with structured error results
- PackExport type inferred from schema

**src/lib/services/packs/index.ts (55 lines)**
- Public API barrel with JSDoc
- Grouped exports: service, validation, types
- Single import point for all pack functionality

## Files Modified

**package.json and package-lock.json**
- Zod already installed (no changes needed, was already a dependency)

## Implementation Details

**Template Seeding Pattern:**
```typescript
// Seed or update templates from PROMPT_TEMPLATES
for (const template of PROMPT_TEMPLATES) {
  // Seed system prompt content
  if (!existingIds.has(template.id)) {
    await database.setPackTemplateContent('default-pack', template.id, template.content)
  }
  // Seed user content (if template has it)
  const userContentId = `${template.id}-user`
  if (template.userContent && !existingIds.has(userContentId)) {
    await database.setPackTemplateContent('default-pack', userContentId, template.userContent)
  }
}
```

**Default Content Resolution:**
```typescript
private getDefaultContent(templateId: string): string | null {
  // Check for user content template (e.g., 'adventure-user')
  if (templateId.endsWith('-user')) {
    const baseId = templateId.replace(/-user$/, '')
    const template = PROMPT_TEMPLATES.find(t => t.id === baseId)
    return template?.userContent ?? null
  }

  // System prompt content
  const template = PROMPT_TEMPLATES.find(t => t.id === templateId)
  return template?.content ?? null
}
```

**Deletion Safety Check:**
```typescript
async deletePack(packId: string): Promise<{ deleted: boolean, reason?: string }> {
  const pack = await database.getPack(packId)
  if (!pack) return { deleted: false, reason: 'Pack not found' }
  if (pack.isDefault) return { deleted: false, reason: 'Cannot delete the default pack' }

  const canDelete = await database.canDeletePack(packId)
  if (!canDelete) {
    return { deleted: false, reason: 'Pack is in use by one or more stories. Reassign stories first.' }
  }

  await database.deletePack(packId)
  return { deleted: true }
}
```

**Validation with Structured Errors:**
```typescript
export function validatePackImport(data: unknown): {
  valid: boolean
  errors?: string[]
  pack?: PackExport
} {
  const result = PackExportSchema.safeParse(data)
  if (result.success) {
    return { valid: true, pack: result.data }
  }
  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  }
}
```

## Testing Strategy

**Type Safety:**
- All TypeScript types compile cleanly (svelte-check: 0 errors, 0 warnings)
- All exports verified via barrel file
- Singleton pattern verified

**Method Verification:**
- All 12 public methods verified via grep
- All validation functions verified
- All Zod schemas verified
- Import statements verified (database, PROMPT_TEMPLATES)

**Runtime Validation (will occur on first use):**
- initialize() will create default pack and seed templates
- Template seeding will handle both system and user content
- Pack creation will copy all default templates and variables
- Deletion will enforce business rules (no default, no in-use)
- Modification detection will compare content hashes
- Validation will catch invalid pack data at system boundaries

## What's Next

This plan completes the core pack service layer for Phase 2. The system can now:
1. Initialize default pack with all PROMPT_TEMPLATES
2. Create new packs as copies of default
3. Detect which templates have been modified
4. Reset templates to default baseline
5. Safely delete packs with business rule enforcement
6. Validate pack data at import/export boundaries

Subsequent work in Phase 2 will integrate the pack system with:
- Phase 3: Context resolution (pack assignment per story)
- Phase 4: UI for pack management (creation, editing, deletion)
- Phase 5: Import/export functionality (using Zod validation)

The business logic layer is now complete and ready for integration.

## Self-Check: PASSED

**Created files exist:**
- FOUND: src/lib/services/packs/pack-service.ts
- FOUND: src/lib/services/packs/validation.ts
- FOUND: src/lib/services/packs/index.ts

**Commits exist:**
- FOUND: a4bc940 (feat(02-03): create pack service with validation and business logic)
- FOUND: 53ee7f0 (feat(02-03): create public API barrel for packs module)

**Zod installation:**
- FOUND: "zod": "^3.25.76" in package.json

**Validation schemas:**
- FOUND: EnumOptionSchema
- FOUND: CustomVariableSchema
- FOUND: PackTemplateSchema
- FOUND: PackExportSchema
- FOUND: variableNameRegex: /^[a-z_][a-z0-9_]*$/
- FOUND: version: z.literal(1)
- FOUND: Enum variables must have at least one option

**Validation functions:**
- FOUND: validatePackImport
- FOUND: validateCustomVariable

**PackService methods:**
- FOUND: class PackService
- FOUND: async initialize()
- FOUND: async getAllPacks()
- FOUND: async getPack()
- FOUND: async getFullPack()
- FOUND: async createPack()
- FOUND: async deletePack()
- FOUND: async isTemplateModified()
- FOUND: async getModifiedTemplates()
- FOUND: async resetTemplate()
- FOUND: private getDefaultContent()
- FOUND: private hashContent()
- FOUND: export const packService

**Imports and dependencies:**
- FOUND: import { database } from '$lib/services/database'
- FOUND: import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'
- FOUND: userContent handling in seeding

**Barrel exports:**
- FOUND: export { packService } from './pack-service'

**TypeScript compilation:**
- PASSED: 0 errors, 0 warnings

All claims verified. No missing files or commits.
