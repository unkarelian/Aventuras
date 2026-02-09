# Phase 2: Preset Pack System & Database - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Create the storage and management infrastructure for preset packs. A pack bundles all prompt templates and custom variable definitions into a single unit. Packs can be created, stored in SQLite, loaded, and validated. The default pack ships with all current prompt templates. UI for editing packs is Phase 4; import/export is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Pack structure & identity
- Packs have: name, description, and author fields
- No versioning — edits overwrite in place. Export (Phase 5) serves as snapshot mechanism
- Packs contain ALL prompt templates, even unmodified ones — complete and self-contained
- Packs do NOT define template grouping — the app (agent profiles) controls how templates are displayed/organized. Packs are just containers for the templates themselves

### Default pack behavior
- Default pack is editable directly — users can modify templates in place
- Default pack cannot be deleted — it's permanent
- Every template in every pack has a "reset to default" action that restores the app's shipped baseline
- When the app updates with new default templates, the "default" baseline updates; users can reset any template to get the latest version
- Modified templates are visually marked — a badge/indicator shows which templates differ from the default baseline

### Custom variable definitions
- Five variable types: text, textarea, enum, number, boolean
- Minimal constraints only: required/optional flag and default value. No min/max, maxLength, or regex
- Enum variables use label + value pairs (display "Fantasy" but store "fantasy")
- Variables have both a variable name (used in templates, e.g., `writing_style`) and a display name (shown in UI, e.g., "Writing Style")

### Pack lifecycle
- New packs start as a copy of the default pack (all templates copied)
- No limit on number of packs
- Packs are assigned per-story — different stories can use different packs
- A pack cannot be deleted while any story uses it — user must reassign stories first

### Claude's Discretion
- SQLite schema design and migration strategy
- Internal data model and repository patterns
- Validation implementation details
- How "modified" status is tracked (hash comparison, flag, etc.)

</decisions>

<specifics>
## Specific Ideas

- Pack grouping is explicitly NOT the pack's responsibility — the existing agent profile system handles template organization/display
- "Reset to default" is per-template, not per-pack — granular control over what gets reset

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-preset-pack-system*
*Context gathered: 2026-02-08*
