---
phase: 02-preset-pack-system
plan: 02
subsystem: database-layer
tags: [database, repository, crud, content-hashing]
dependency_graph:
  requires: [02-01-pack-types-and-schema]
  provides: [pack-database-operations, pack-crud-methods, content-hashing]
  affects: [database-service]
tech_stack:
  added: [web-crypto-api]
  patterns: [repository-pattern, content-hashing, foreign-key-enforcement]
key_files:
  created: []
  modified:
    - src/lib/services/database.ts
decisions:
  - Hash content using SHA-256 via Web Crypto API with whitespace normalization
  - setPackTemplateContent preserves original created_at on update via INSERT OR REPLACE
  - deletePack includes AND is_default = 0 guard to prevent deleting default pack
  - canDeletePack checks both isDefault and story references before deletion
  - Foreign key enforcement enabled via PRAGMA foreign_keys = ON
  - Boolean to integer conversion follows existing DatabaseService pattern (? 1 : 0)
metrics:
  duration: 201
  completed: 2026-02-09T06:36:16Z
---

# Phase 2 Plan 2: Pack Database Operations Summary

**One-liner:** Complete data access layer for preset packs with CRUD operations, content hashing, and foreign key enforcement

## What Was Built

Extended DatabaseService with comprehensive pack database operations following established repository patterns:

**Pack CRUD Operations:**
- `getAllPacks()`: Get all packs ordered by is_default DESC, name ASC
- `getPack(id)`: Get single pack by ID
- `getDefaultPack()`: Get the default pack (is_default = 1)
- `createPack(pack)`: Create new pack with timestamps
- `updatePack(id, updates)`: Update pack name, description, or author
- `deletePack(id)`: Delete pack with is_default = 0 guard
- `canDeletePack(packId)`: Safety check for deletion (checks isDefault and story references)

**Pack Template Operations:**
- `getPackTemplates(packId)`: Get all templates for a pack
- `getPackTemplate(packId, templateId)`: Get single template
- `setPackTemplateContent(packId, templateId, content)`: Upsert template with content hashing
- `deletePackTemplate(packId, templateId)`: Delete template

**Pack Variable Operations:**
- `getPackVariables(packId)`: Get all variables for a pack
- `getPackVariable(packId, variableName)`: Get single variable
- `createPackVariable(packId, variable)`: Create variable with enum option serialization
- `updatePackVariable(id, updates)`: Update variable with dynamic SET clauses
- `deletePackVariable(id)`: Delete variable

**Story-Pack Assignment:**
- `getStoryPackId(storyId)`: Get pack assigned to story
- `setStoryPack(storyId, packId)`: Assign pack to story

**Utility Methods:**
- `hashContent(content)`: SHA-256 content hashing with whitespace normalization

**Mapper Functions:**
- `mapPack(row)`: Map preset_packs row to PresetPack
- `mapPackTemplate(row)`: Map pack_templates row to PackTemplate
- `mapPackVariable(row)`: Map pack_variables row to CustomVariable with enum JSON deserialization

**Database Initialization:**
- Added `PRAGMA foreign_keys = ON` to init() method for foreign key enforcement

## Key Design Decisions

**Content Hashing Strategy:**
- SHA-256 via Web Crypto API (crypto.subtle.digest)
- Whitespace normalization: trim() and \r\n → \n conversion
- Prevents false positives from different line endings or trailing whitespace
- Foundation for "modified from default" detection in Phase 4 UI

**Template Upsert Pattern:**
- `setPackTemplateContent` uses INSERT OR REPLACE
- Preserves original created_at by fetching existing record first
- Generates new UUID if template doesn't exist
- Updates content_hash on every change

**Deletion Safety:**
- `deletePack` includes `AND is_default = 0` in WHERE clause
- `canDeletePack` performs two checks:
  1. Pack exists and is not default
  2. No stories reference the pack (COUNT(*) === 0)
- Foreign key enforcement ensures database-level constraint via PRAGMA

**Pattern Consistency:**
- Follows existing DatabaseService patterns exactly:
  - `getDb()` for database access
  - `select<any[]>()` for queries
  - `execute()` for mutations
  - Boolean to integer: `? 1 : 0`
  - JSON serialization for complex types (enumOptions)
  - Null coalescing: `?? null` and `?? undefined`
  - Dynamic SET clauses for flexible updates

**Foreign Key Enforcement:**
- PRAGMA foreign_keys = ON added to init() method
- Critical for ON DELETE RESTRICT constraint on stories.pack_id
- Ensures pack deletion fails if stories reference it (database-level safety)

## Verification Results

All verification criteria passed:

- [x] database.ts imports PresetPack, PackTemplate, CustomVariable, EnumOption from packs/types
- [x] getAllPacks, getPack, getDefaultPack, createPack, updatePack, deletePack methods exist
- [x] canDeletePack checks both isDefault and story references
- [x] deletePack includes `AND is_default = 0` guard
- [x] getPackTemplates, getPackTemplate, setPackTemplateContent, deletePackTemplate methods exist
- [x] setPackTemplateContent uses hashContent for content_hash
- [x] setPackTemplateContent preserves original created_at on update
- [x] getPackVariables, getPackVariable, createPackVariable, updatePackVariable, deletePackVariable methods exist
- [x] createPackVariable serializes enumOptions as JSON
- [x] mapPackVariable deserializes enum_options with null guard
- [x] getStoryPackId and setStoryPack methods exist
- [x] hashContent normalizes whitespace before hashing
- [x] PRAGMA foreign_keys = ON is in init() method
- [x] TypeScript compilation passes (svelte-check: 0 errors, 0 warnings)

## Deviations from Plan

None - plan executed exactly as written. All tasks completed without modifications or additional work.

## Task Breakdown

| Task | Name                                              | Status | Commit  | Files                          |
| ---- | ------------------------------------------------- | ------ | ------- | ------------------------------ |
| 1    | Add pack CRUD and template operations             | Done   | 7d0e259 | src/lib/services/database.ts   |
| 2    | Add PRAGMA foreign_keys enforcement to init       | Done   | 5eda2ab | src/lib/services/database.ts   |

## Files Modified

**src/lib/services/database.ts (+269 lines)**
- Added imports: PresetPack, PackTemplate, CustomVariable, EnumOption
- Added 18 public methods for pack CRUD operations
- Added 1 private method for content hashing
- Added 3 private mapper functions
- Added PRAGMA foreign_keys = ON to init()

## Implementation Details

**Hash Content Method:**
```typescript
private async hashContent(content: string): Promise<string> {
  const normalized = content.trim().replace(/\r\n/g, '\n')
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

**Template Upsert Pattern:**
```typescript
const existing = await this.getPackTemplate(packId, templateId)
const createdAt = existing ? existing.createdAt : now
await db.execute(
  `INSERT OR REPLACE INTO pack_templates (id, pack_id, template_id, content, content_hash, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  [existing?.id ?? crypto.randomUUID(), packId, templateId, content, contentHash, createdAt, now],
)
```

**Deletion Safety Check:**
```typescript
async canDeletePack(packId: string): Promise<boolean> {
  const db = await this.getDb()
  // Cannot delete default pack
  const pack = await this.getPack(packId)
  if (!pack || pack.isDefault) return false
  // Cannot delete if stories reference it
  const results = await db.select<any[]>(
    'SELECT COUNT(*) as count FROM stories WHERE pack_id = ?',
    [packId],
  )
  return results[0].count === 0
}
```

**Variable Update Pattern:**
```typescript
const setClauses: string[] = []
const values: any[] = []

if (updates.variableName !== undefined) {
  setClauses.push('variable_name = ?')
  values.push(updates.variableName)
}
// ... (similar for other fields)

if (setClauses.length === 0) return

values.push(id)
await db.execute(`UPDATE pack_variables SET ${setClauses.join(', ')} WHERE id = ?`, values)
```

## Testing Strategy

**Type Safety:**
- All TypeScript types compile cleanly (svelte-check: 0 errors, 0 warnings)
- Type imports verified via import statement
- Method signatures match type definitions

**Pattern Verification:**
- All 22 method names verified via grep
- Boolean conversion pattern verified
- JSON serialization pattern verified
- Mapper functions verified

**Runtime Validation (will occur on first use):**
- Pack CRUD operations will interact with preset_packs table
- Template operations will interact with pack_templates table
- Variable operations will interact with pack_variables table
- Content hashing will normalize whitespace and generate SHA-256 hashes
- Foreign key enforcement will prevent invalid deletions

## What's Next

This plan completes the data access layer for preset packs. Subsequent plans in Phase 2 will:

1. **Plan 03**: Create pack service layer for business logic and validation
2. **Plan 04**: Build pack template seeding from PROMPT_TEMPLATES
3. **Plan 05**: Create pack variable resolution and rendering integration

The database operations are now ready for Phase 2 Plan 3 to build the service layer.

## Self-Check: PASSED

**Modified files exist:**
- FOUND: src/lib/services/database.ts

**Commits exist:**
- FOUND: 7d0e259 (feat(02-02): add pack CRUD and template operations to DatabaseService)
- FOUND: 5eda2ab (feat(02-02): enable foreign key enforcement in database init)

**Method verification:**
- FOUND: async getAllPacks
- FOUND: async getPack
- FOUND: async getDefaultPack
- FOUND: async createPack
- FOUND: async updatePack
- FOUND: async deletePack
- FOUND: async canDeletePack
- FOUND: async getPackTemplates
- FOUND: async getPackTemplate
- FOUND: async setPackTemplateContent
- FOUND: async deletePackTemplate
- FOUND: async getPackVariables
- FOUND: async getPackVariable
- FOUND: async createPackVariable
- FOUND: async updatePackVariable
- FOUND: async deletePackVariable
- FOUND: async getStoryPackId
- FOUND: async setStoryPack
- FOUND: async hashContent
- FOUND: private mapPack
- FOUND: private mapPackTemplate
- FOUND: private mapPackVariable

**Import verification:**
- FOUND: import type { PresetPack, PackTemplate, CustomVariable, EnumOption } from '$lib/services/packs/types'

**Foreign key enforcement:**
- FOUND: PRAGMA foreign_keys = ON in init() method

**TypeScript compilation:**
- PASSED: 0 errors, 0 warnings

All claims verified. No missing files or commits.
