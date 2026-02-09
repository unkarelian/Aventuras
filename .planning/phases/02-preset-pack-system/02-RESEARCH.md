# Phase 2: Preset Pack System & Database - Research

**Researched:** 2026-02-09
**Domain:** SQLite database schema design, data access patterns, TypeScript validation
**Confidence:** HIGH

## Summary

Phase 2 creates the storage and management infrastructure for preset packs, which bundle prompt templates and custom variable definitions into self-contained units. The research reveals a mature ecosystem for SQLite with Tauri, with established patterns for versioned migrations, JSON storage, and referential integrity.

The project already has 24 migrations and a working DatabaseService class with consistent patterns for CRUD operations, JSON serialization of complex fields, and proper foreign key constraints. The Phase 1 template engine provides types and validation infrastructure ready for integration.

Key technical decisions: Use normalized tables for pack metadata with TEXT columns storing template content directly (not JSON), track modifications via SHA-256 content hashing (using Web Crypto API), enforce referential integrity with foreign keys to prevent deletion of in-use packs, and validate pack data with Zod schemas at the service layer.

**Primary recommendation:** Follow existing database patterns (numbered migrations, DatabaseService CRUD methods, JSON for complex nested data only) while adding Zod validation layer for pack import/export integrity.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Pack structure & identity
- Packs have: name, description, and author fields
- No versioning — edits overwrite in place. Export (Phase 5) serves as snapshot mechanism
- Packs contain ALL prompt templates, even unmodified ones — complete and self-contained
- Packs do NOT define template grouping — the app (agent profiles) controls how templates are displayed/organized. Packs are just containers for the templates themselves

#### Default pack behavior
- Default pack is editable directly — users can modify templates in place
- Default pack cannot be deleted — it's permanent
- Every template in every pack has a "reset to default" action that restores the app's shipped baseline
- When the app updates with new default templates, the "default" baseline updates; users can reset any template to get the latest version
- Modified templates are visually marked — a badge/indicator shows which templates differ from the default baseline

#### Custom variable definitions
- Five variable types: text, textarea, enum, number, boolean
- Minimal constraints only: required/optional flag and default value. No min/max, maxLength, or regex
- Enum variables use label + value pairs (display "Fantasy" but store "fantasy")
- Variables have both a variable name (used in templates, e.g., `writing_style`) and a display name (shown in UI, e.g., "Writing Style")

#### Pack lifecycle
- New packs start as a copy of the default pack (all templates copied)
- No limit on number of packs
- Packs are assigned per-story — different stories can use different packs
- A pack cannot be deleted while any story uses it — user must reassign stories first

### Claude's Discretion
- SQLite schema design and migration strategy
- Internal data model and repository patterns
- Validation implementation details
- How "modified" status is tracked (hash comparison, flag, etc.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tauri-apps/plugin-sql | ^2 | SQLite database access from frontend | Official Tauri plugin, already in use for all data persistence |
| tauri-plugin-sql | 2.3.1+ | Rust backend for migrations | Handles versioned migrations with atomic transactions |
| LiquidJS | ^10.24.0 | Template rendering (from Phase 1) | Already integrated, templates stored as Liquid syntax strings |
| Web Crypto API | Built-in | SHA-256 hashing for content comparison | Native browser API, no dependencies, cryptographically secure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | Latest 3.x | Runtime data validation | Pack import/export validation, ensure data integrity at system boundaries |

**Installation:**
```bash
npm install zod
```

No other dependencies required — all core libraries already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/lib/services/
├── database.ts                    # Existing DatabaseService (extend for packs)
├── templates/                     # Phase 1 template engine
│   ├── engine.ts
│   ├── validator.ts
│   └── variables.ts
└── packs/                         # NEW: Pack management system
    ├── types.ts                   # Pack, PackTemplate, CustomVariable interfaces
    ├── repository.ts              # PackRepository class (CRUD operations)
    ├── validator.ts               # Pack validation with Zod schemas
    ├── defaults.ts                # Default pack seed data
    └── index.ts                   # Public API barrel

src-tauri/migrations/
└── 025_preset_packs.sql           # New migration (next sequential number)
```

### Pattern 1: Normalized Schema with Foreign Keys

**What:** Separate tables for packs, pack_templates, pack_variables, with foreign keys enforcing referential integrity.

**When to use:** Always for pack storage. Prevents orphaned data, enables cascade constraints, allows efficient querying.

**Schema:**
```sql
-- Pack metadata
CREATE TABLE IF NOT EXISTS preset_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(name)
);

-- Template content within packs
CREATE TABLE IF NOT EXISTS pack_templates (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  template_id TEXT NOT NULL,          -- References PROMPT_TEMPLATES[].id
  content TEXT NOT NULL,               -- Liquid template string
  content_hash TEXT NOT NULL,          -- SHA-256 of content for modification detection
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (pack_id) REFERENCES preset_packs(id) ON DELETE CASCADE,
  UNIQUE(pack_id, template_id)
);

-- Custom variable definitions
CREATE TABLE IF NOT EXISTS pack_variables (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  variable_name TEXT NOT NULL,         -- Used in templates: {{ writing_style }}
  display_name TEXT NOT NULL,          -- Shown in UI: "Writing Style"
  variable_type TEXT NOT NULL,         -- 'text' | 'textarea' | 'enum' | 'number' | 'boolean'
  is_required INTEGER NOT NULL DEFAULT 0,
  default_value TEXT,                  -- Stored as string, parsed by type
  enum_options TEXT,                   -- JSON array of {label, value} for enum type
  created_at INTEGER NOT NULL,
  FOREIGN KEY (pack_id) REFERENCES preset_packs(id) ON DELETE CASCADE,
  UNIQUE(pack_id, variable_name)
);

-- Track which story uses which pack
ALTER TABLE stories ADD COLUMN pack_id TEXT REFERENCES preset_packs(id) ON DELETE RESTRICT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pack_templates_pack ON pack_templates(pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_variables_pack ON pack_variables(pack_id);
CREATE INDEX IF NOT EXISTS idx_stories_pack ON stories(pack_id);
```

**Why this works:**
- `ON DELETE CASCADE` for pack children (templates, variables) — deleting pack removes all children
- `ON DELETE RESTRICT` for stories → packs — cannot delete pack while stories reference it
- `UNIQUE(pack_id, template_id)` prevents duplicate templates in same pack
- Integer timestamps match existing database pattern
- TEXT primary keys match existing UUID pattern

### Pattern 2: Repository Pattern with DatabaseService Extension

**What:** Extend existing DatabaseService class with pack-specific methods, following established CRUD patterns.

**Example (based on existing patterns):**
```typescript
// In database.ts, add pack methods following existing story/character patterns
class DatabaseService {
  // ... existing methods ...

  // Pack CRUD
  async getAllPacks(): Promise<PresetPack[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM preset_packs ORDER BY name')
    return results.map(this.mapPack)
  }

  async getPack(id: string): Promise<PresetPack | null> {
    const db = await this.getDb()
    const results = await db.select<any[]>('SELECT * FROM preset_packs WHERE id = ?', [id])
    return results.length > 0 ? this.mapPack(results[0]) : null
  }

  async createPack(pack: Omit<PresetPack, 'createdAt' | 'updatedAt'>): Promise<PresetPack> {
    const db = await this.getDb()
    const now = Date.now()
    await db.execute(
      'INSERT INTO preset_packs (id, name, description, author, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pack.id, pack.name, pack.description, pack.author, pack.isDefault ? 1 : 0, now, now]
    )
    return { ...pack, createdAt: now, updatedAt: now }
  }

  // Pack template operations
  async getPackTemplates(packId: string): Promise<PackTemplate[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_templates WHERE pack_id = ? ORDER BY template_id',
      [packId]
    )
    return results.map(this.mapPackTemplate)
  }

  async setPackTemplateContent(packId: string, templateId: string, content: string): Promise<void> {
    const db = await this.getDb()
    const now = Date.now()
    const contentHash = await this.hashContent(content)
    await db.execute(
      `INSERT OR REPLACE INTO pack_templates
       (id, pack_id, template_id, content, content_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), packId, templateId, content, contentHash, now, now]
    )
  }

  // Custom variable operations
  async getPackVariables(packId: string): Promise<CustomVariable[]> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT * FROM pack_variables WHERE pack_id = ? ORDER BY variable_name',
      [packId]
    )
    return results.map(this.mapPackVariable)
  }

  // Check if pack can be deleted (no stories using it)
  async canDeletePack(packId: string): Promise<boolean> {
    const db = await this.getDb()
    const results = await db.select<any[]>(
      'SELECT COUNT(*) as count FROM stories WHERE pack_id = ?',
      [packId]
    )
    return results[0].count === 0
  }

  // Helper: Hash content using Web Crypto API
  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // Mappers follow existing pattern (snake_case DB → camelCase TS)
  private mapPack(row: any): PresetPack {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      author: row.author,
      isDefault: row.is_default === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapPackTemplate(row: any): PackTemplate {
    return {
      id: row.id,
      packId: row.pack_id,
      templateId: row.template_id,
      content: row.content,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapPackVariable(row: any): CustomVariable {
    return {
      id: row.id,
      packId: row.pack_id,
      variableName: row.variable_name,
      displayName: row.display_name,
      variableType: row.variable_type as VariableType,
      isRequired: row.is_required === 1,
      defaultValue: row.default_value,
      enumOptions: row.enum_options ? JSON.parse(row.enum_options) : undefined,
    }
  }
}
```

**Why this pattern:**
- Matches existing database.ts patterns exactly (compare with `getAllStories`, `createStory`, etc.)
- Uses `INSERT OR REPLACE` for upsert behavior
- Boolean stored as INTEGER (0/1) per SQLite convention
- JSON only for complex nested data (enum options), not for entire packs
- Timestamps as INTEGER milliseconds since epoch
- Mapper functions convert snake_case to camelCase

### Pattern 3: Default Pack Seeding via Migration

**What:** Initialize default pack with all current templates in the migration that creates pack tables.

**Example:**
```sql
-- Create tables first
CREATE TABLE IF NOT EXISTS preset_packs (...);
CREATE TABLE IF NOT EXISTS pack_templates (...);
CREATE TABLE IF NOT EXISTS pack_variables (...);

-- Seed default pack
INSERT INTO preset_packs (id, name, description, author, is_default, created_at, updated_at)
VALUES (
  'default-pack',
  'Default',
  'Built-in prompt templates shipped with Aventura',
  'Aventura',
  1,
  strftime('%s', 'now') * 1000,
  strftime('%s', 'now') * 1000
);

-- Note: Template content seeding happens in TypeScript on first run
-- Migration creates empty default pack, app populates templates from PROMPT_TEMPLATES
```

**Why TypeScript populates templates, not SQL migration:**
- `PROMPT_TEMPLATES` array is the single source of truth (in src/lib/services/prompts/definitions.ts)
- Migrating template content to SQL would duplicate data and create sync issues
- App can check on startup: if default pack exists but has no templates, seed from PROMPT_TEMPLATES
- Future app updates add new templates by checking for missing template_ids in default pack

### Pattern 4: Modification Detection via Content Hashing

**What:** Track whether template content differs from default baseline using SHA-256 hash comparison.

**Implementation:**
```typescript
// When user edits a template in a pack
async function saveTemplateEdit(packId: string, templateId: string, newContent: string) {
  // Get default baseline content
  const defaultTemplate = PROMPT_TEMPLATES.find(t => t.id === templateId)
  const defaultHash = await hashContent(defaultTemplate.content)

  // Hash new content
  const newHash = await hashContent(newContent)

  // Save with hash
  await db.setPackTemplateContent(packId, templateId, newContent)

  // Modification flag is implicit: compare hashes
  const isModified = newHash !== defaultHash
  return { isModified }
}

// For UI badge display
async function isTemplateModified(packId: string, templateId: string): Promise<boolean> {
  const packTemplate = await db.getPackTemplate(packId, templateId)
  const defaultTemplate = PROMPT_TEMPLATES.find(t => t.id === templateId)
  const defaultHash = await hashContent(defaultTemplate.content)
  return packTemplate.contentHash !== defaultHash
}

// Reset to default
async function resetTemplateToDefault(packId: string, templateId: string) {
  const defaultTemplate = PROMPT_TEMPLATES.find(t => t.id === templateId)
  await db.setPackTemplateContent(packId, templateId, defaultTemplate.content)
}
```

**Why hashing over string comparison:**
- Hash comparison is faster for large templates (O(1) after initial hash)
- Content hash stored once, compared many times (UI badges, export validation)
- SHA-256 provides collision resistance (no false positives)
- Enables future integrity checking (detect corruption)
- Web Crypto API built-in, no dependencies

### Pattern 5: Zod Validation for Import/Export

**What:** Validate pack data structure at system boundaries using Zod schemas.

**Example:**
```typescript
import { z } from 'zod'

// Pack variable schema
const CustomVariableSchema = z.object({
  variableName: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/), // Valid Liquid variable name
  displayName: z.string().min(1),
  variableType: z.enum(['text', 'textarea', 'enum', 'number', 'boolean']),
  isRequired: z.boolean(),
  defaultValue: z.string().optional(),
  enumOptions: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).optional()
})

// Pack template schema
const PackTemplateSchema = z.object({
  templateId: z.string().min(1),
  content: z.string()
})

// Full pack export schema (for Phase 5 export/import)
const PackExportSchema = z.object({
  version: z.literal(1), // Export format version for future compatibility
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  templates: z.array(PackTemplateSchema),
  variables: z.array(CustomVariableSchema)
})

// Validation helper
function validatePackImport(data: unknown): { valid: boolean; errors?: string[]; pack?: PackExport } {
  const result = PackExportSchema.safeParse(data)
  if (result.success) {
    return { valid: true, pack: result.data }
  } else {
    return {
      valid: false,
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    }
  }
}
```

**When to validate:**
- Pack import from JSON file (Phase 5)
- Pack creation from UI
- Before saving to database (last line of defense)
- NOT for every read — trust database integrity after write validation

### Anti-Patterns to Avoid

- **Storing entire pack as single JSON blob:** Breaks queryability, makes partial updates impossible, loses referential integrity
- **Versioning packs in database:** User decision was "no versioning, export serves as snapshot" — don't add version columns
- **Allowing default pack deletion:** Must enforce `is_default = 1` packs cannot be deleted (check in service layer)
- **Skipping foreign key checks:** SQLite requires `PRAGMA foreign_keys = ON` — existing database.ts likely enables this
- **Manual migration registration in lib.rs:** Migration numbers must be sequential and registered in order

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content hashing | Custom string comparison, MD5, manual byte comparison | Web Crypto API `crypto.subtle.digest('SHA-256', ...)` | Native browser API, cryptographically secure, no dependencies, faster than manual comparison |
| Data validation | Manual type checking, custom validators, assert functions | Zod schemas with `safeParse()` | Type inference, composable schemas, clear error messages, industry standard |
| Migration system | Custom version tracking, manual SQL execution | Tauri plugin-sql Migration struct | Atomic transactions, automatic version tracking, rollback on failure, proven in 24 existing migrations |
| UUID generation | Custom ID generation, timestamps, counters | `crypto.randomUUID()` | Standards-compliant UUID v4, collision-resistant, built-in |
| Database connections | Direct SQL plugin access, connection pooling | Existing DatabaseService singleton pattern | Already initialized, handles connection lifecycle, consistent across app |

**Key insight:** The project already has mature infrastructure (DatabaseService, migration system, type patterns). Don't reinvent — extend existing patterns consistently.

## Common Pitfalls

### Pitfall 1: Foreign Key Constraints Not Enforced by Default

**What goes wrong:** SQLite foreign key constraints are NOT enforced by default. Without `PRAGMA foreign_keys = ON`, you can delete a pack while stories still reference it, orphaning data.

**Why it happens:** SQLite maintains backward compatibility with older applications that didn't use foreign keys.

**How to avoid:** Verify existing DatabaseService enables foreign keys on connection. Check init():
```typescript
async init(): Promise<void> {
  if (this.db) return
  this.db = await Database.load('sqlite:aventura.db')
  // MUST enable foreign keys
  await this.db.execute('PRAGMA foreign_keys = ON')
}
```

**Warning signs:** Can delete pack even when stories reference it; no error thrown on invalid foreign key.

### Pitfall 2: JSON Parsing Errors from Database

**What goes wrong:** `JSON.parse(row.enum_options)` throws when column is NULL or empty string, crashing the mapper.

**Why it happens:** SQLite TEXT columns can be NULL, but JavaScript `JSON.parse(null)` throws.

**How to avoid:** Check before parsing (existing database.ts uses this pattern):
```typescript
enumOptions: row.enum_options ? JSON.parse(row.enum_options) : undefined
```

**Warning signs:** Mapper throws "Unexpected token" or "JSON.parse" errors when loading packs.

### Pitfall 3: Default Pack Duplication on Re-initialization

**What goes wrong:** Running seed logic every time creates duplicate default packs if not idempotent.

**Why it happens:** Migration runs once, but app initialization runs every launch.

**How to avoid:** Check before seeding:
```typescript
async function ensureDefaultPack() {
  const existing = await db.getPack('default-pack')
  if (existing) return existing

  // Create default pack + seed templates
  const pack = await db.createPack({ id: 'default-pack', ... })
  await seedDefaultTemplates(pack.id)
  return pack
}
```

**Warning signs:** Multiple packs with name "Default"; unique constraint violations on second run.

### Pitfall 4: Content Hash Mismatch After Whitespace Changes

**What goes wrong:** Template with trailing newline has different hash than same template without. User sees "modified" badge even though content is semantically identical.

**Why it happens:** SHA-256 hashes raw bytes; whitespace changes are real changes.

**How to avoid:** Normalize template content before hashing:
```typescript
async function hashContent(content: string): Promise<string> {
  // Normalize: trim whitespace, consistent line endings
  const normalized = content.trim().replace(/\r\n/g, '\n')
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}
```

**Warning signs:** All templates show as "modified" after fresh install; hash changes without user edits.

### Pitfall 5: Migration Number Collision

**What goes wrong:** Two developers create migration 025, both merge, database applies one and fails on duplicate version.

**Why it happens:** Migrations numbered sequentially; parallel development creates conflicts.

**How to avoid:** Check existing migrations before creating new one:
```bash
ls src-tauri/migrations/ | tail -1  # Get last migration number
# Create next sequential number: 025_preset_packs.sql
```
Register immediately in lib.rs to claim the number.

**Warning signs:** Migration fails with "version already exists"; database in inconsistent state.

### Pitfall 6: Forgetting ON DELETE RESTRICT for Stories

**What goes wrong:** User deletes pack, all stories using it lose their pack reference (pack_id becomes NULL), breaking pack loading.

**Why it happens:** Default foreign key behavior is SET NULL, not RESTRICT.

**How to avoid:** Explicitly specify `ON DELETE RESTRICT` in stories table:
```sql
ALTER TABLE stories ADD COLUMN pack_id TEXT REFERENCES preset_packs(id) ON DELETE RESTRICT;
```
Validate before delete:
```typescript
async function deletePack(packId: string) {
  const canDelete = await db.canDeletePack(packId)
  if (!canDelete) {
    throw new Error('Cannot delete pack: stories are using it')
  }
  await db.execute('DELETE FROM preset_packs WHERE id = ?', [packId])
}
```

**Warning signs:** Stories load without pack data; pack_id is NULL for active stories.

## Code Examples

### Creating a New Pack (Copy from Default)

```typescript
// Source: Researched pattern based on existing database.ts and user requirements
async function createNewPack(name: string, description: string, author: string): Promise<PresetPack> {
  const packId = crypto.randomUUID()

  // Create pack metadata
  const pack = await db.createPack({
    id: packId,
    name,
    description,
    author,
    isDefault: false
  })

  // Copy all templates from default pack
  const defaultTemplates = await db.getPackTemplates('default-pack')
  for (const template of defaultTemplates) {
    await db.setPackTemplateContent(packId, template.templateId, template.content)
  }

  // Copy all variables from default pack
  const defaultVariables = await db.getPackVariables('default-pack')
  for (const variable of defaultVariables) {
    await db.createPackVariable(packId, {
      variableName: variable.variableName,
      displayName: variable.displayName,
      variableType: variable.variableType,
      isRequired: variable.isRequired,
      defaultValue: variable.defaultValue,
      enumOptions: variable.enumOptions
    })
  }

  return pack
}
```

### Loading Pack with Templates and Variables

```typescript
// Source: Researched pattern based on existing database.ts
interface FullPack {
  pack: PresetPack
  templates: PackTemplate[]
  variables: CustomVariable[]
}

async function loadFullPack(packId: string): Promise<FullPack | null> {
  const pack = await db.getPack(packId)
  if (!pack) return null

  const [templates, variables] = await Promise.all([
    db.getPackTemplates(packId),
    db.getPackVariables(packId)
  ])

  return { pack, templates, variables }
}
```

### Seeding Default Pack from PROMPT_TEMPLATES

```typescript
// Source: Researched pattern based on existing templates and migration seeding
import { PROMPT_TEMPLATES } from '$lib/services/prompts/definitions'

async function seedDefaultTemplates(packId: string): Promise<void> {
  for (const template of PROMPT_TEMPLATES) {
    await db.setPackTemplateContent(packId, template.id, template.content)
  }
}

// Call during app initialization (not migration)
async function initializePackSystem(): Promise<void> {
  let defaultPack = await db.getPack('default-pack')

  if (!defaultPack) {
    // Create default pack if missing
    defaultPack = await db.createPack({
      id: 'default-pack',
      name: 'Default',
      description: 'Built-in prompt templates shipped with Aventura',
      author: 'Aventura',
      isDefault: true
    })
  }

  // Check if templates are seeded
  const templates = await db.getPackTemplates('default-pack')
  if (templates.length === 0) {
    await seedDefaultTemplates('default-pack')
  }

  // Update default pack if new templates added in app update
  const existingTemplateIds = new Set(templates.map(t => t.templateId))
  const allTemplateIds = new Set(PROMPT_TEMPLATES.map(t => t.id))

  for (const templateId of allTemplateIds) {
    if (!existingTemplateIds.has(templateId)) {
      const template = PROMPT_TEMPLATES.find(t => t.id === templateId)!
      await db.setPackTemplateContent('default-pack', template.id, template.content)
    }
  }
}
```

### Checking Template Modification Status

```typescript
// Source: Web Crypto API hashing pattern
async function getTemplateStatus(packId: string, templateId: string): Promise<{
  isModified: boolean
  canReset: boolean
}> {
  const packTemplate = await db.getPackTemplate(packId, templateId)
  if (!packTemplate) {
    return { isModified: false, canReset: false }
  }

  // Get default baseline
  const defaultTemplate = PROMPT_TEMPLATES.find(t => t.id === templateId)
  if (!defaultTemplate) {
    return { isModified: false, canReset: false }
  }

  const defaultHash = await hashContent(defaultTemplate.content)
  const isModified = packTemplate.contentHash !== defaultHash

  return {
    isModified,
    canReset: isModified // Can reset if modified
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store packs as JSON files | SQLite normalized schema with foreign keys | 2026 best practices | Better queryability, referential integrity, supports partial updates |
| MD5 for content hashing | SHA-256 via Web Crypto API | MD5 deprecated ~2020 | Cryptographically secure, collision-resistant, native browser support |
| Manual validation | Zod schema validation with type inference | Zod 3.x mainstream adoption | Type-safe imports, clear error messages, composable schemas |
| Separate migration files and registration | include_str! macro pattern | Tauri plugin-sql v2 | Single source of truth, compile-time verification |
| EF Core HasData seeding | UseSeeding/UseAsyncSeeding methods | EF 9 (2024) | Not applicable (Tauri/SQLite), but pattern shows: seed after migration, check existence first |

**Deprecated/outdated:**
- **JSON1 extension references:** SQLite has native JSON support since 3.38.0 (2022), but for this use case, normalized tables are superior
- **Manual TypeScript validation:** Zod provides both validation AND type inference, eliminating manual type guards
- **MD5/SHA-1 hashing:** Vulnerable to collisions, avoid for integrity checking

## Open Questions

1. **Should pack_id be nullable on stories table initially?**
   - What we know: ALTER TABLE cannot add NOT NULL column with default to populated table in SQLite
   - What's unclear: Are there existing stories in production databases?
   - Recommendation: Make pack_id nullable, set default pack for all existing stories in migration:
     ```sql
     ALTER TABLE stories ADD COLUMN pack_id TEXT REFERENCES preset_packs(id) ON DELETE RESTRICT;
     UPDATE stories SET pack_id = 'default-pack' WHERE pack_id IS NULL;
     ```

2. **How should Phase 1's PromptSettings.templateOverrides migrate to packs?**
   - What we know: Phase 1 stores template overrides in settings store (JSON), not database
   - What's unclear: Should migration 025 convert existing overrides to default pack edits?
   - Recommendation: Migration 020 already handled legacy prompt migration. User's locked decision: "Clean slate migration, no backward compatibility." Leave existing settings as-is; Phase 4 UI will guide users to create packs.

3. **Should we track user_content separately from content?**
   - What we know: Some templates have both system prompt (content) and user message (userContent)
   - What's unclear: Store as two columns or two rows?
   - Recommendation: Two rows approach (follows existing pattern):
     - System prompt: `template_id = 'adventure'`
     - User message: `template_id = 'adventure-user'`
     - Matches Phase 1's naming convention for PromptOverride

## Sources

### Primary (HIGH confidence)
- Existing codebase: src/lib/services/database.ts — DatabaseService patterns, migration 001-024 schema
- Existing codebase: src/lib/services/prompts/types.ts — Template and variable type definitions from Phase 1
- Existing codebase: src-tauri/src/lib.rs — Migration registration pattern
- [Tauri SQL Plugin v2 Documentation](https://v2.tauri.app/plugin/sql/) — Migration struct, versioning, atomic transactions
- [MDN Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest) — SHA-256 hashing implementation

### Secondary (MEDIUM confidence)
- [SQLite Foreign Key Support](https://sqlite.org/foreignkeys.html) — ON DELETE CASCADE/RESTRICT behavior
- [Zod TypeScript Documentation](https://zod.dev/) — Schema validation patterns
- [Beekeeper Studio: Storing and Querying JSON in SQLite](https://www.beekeeperstudio.io/blog/sqlite-json) — JSON storage best practices
- [The Repository Pattern with TypeScript](https://www.abdou.dev/blog/the-repository-pattern-with-typescript) — Data access layer patterns
- [Database Seeding Best Practices (EF Core)](https://learn.microsoft.com/en-us/ef/core/modeling/data-seeding) — Initialization patterns

### Tertiary (LOW confidence, used for verification)
- [tauri-apps/plugins-workspace#509](https://github.com/tauri-apps/plugins-workspace/issues/509) — Community migration discussions
- [Compile7: SHA-256 in TypeScript](https://compile7.org/hashing/how-to-use-sha-256-in-typescript/) — Implementation examples

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries already installed and in use, verified in package.json and existing code
- Architecture: HIGH — Patterns extracted from 24 existing migrations and DatabaseService with 2000+ lines of proven code
- Pitfalls: MEDIUM-HIGH — Derived from official docs (foreign keys, JSON parsing) and common SQLite gotchas, not project-specific

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days for stable ecosystem)

**Notes:**
- User constraints explicitly copied from CONTEXT.md verbatim
- No alternatives explored for locked decisions (normalized schema chosen per user discretion)
- Zod is only new dependency; all other tools already integrated
- Phase 1 template engine integration points verified (types.ts exports, validateTemplate additionalVariables parameter)
