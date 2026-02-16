# Phase 5: Import/Export & Variable Discovery - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable users to share preset packs via file export/import with validation, and integrate custom variable configuration into the story creation wizard. Users can select which preset pack to use when creating a story, and the wizard auto-discovers and presents custom variables for per-story configuration.

</domain>

<decisions>
## Implementation Decisions

### Export format
- Single JSON file with `.prompt.json` extension
- No schema versioning — if format changes, old exports won't import (user re-exports)
- Full self-contained export: all templates, all custom variable definitions, and pack metadata (name, description)
- No partial/diff exports — every export is the complete pack

### Import flow
- Preview before applying — show pack name, template count, variable count, and any name conflicts
- Validation checks both JSON structure AND runs each template through Liquid validation
- If template validation finds syntax errors, block the import entirely (user fixes the file externally)
- On name conflict (imported pack name matches existing): prompt user to replace existing, rename new, or cancel

### Wizard pack selection
- Pack selection step appears after Adventure/Creative mode selection
- Uses a dropdown selector (not cards) — compact fits wizard flow
- Variable inputs appear on the same step as pack selection
- Step visibility logic:
  - Only default pack, no custom variables → show step with placeholder message (pack awareness), no dropdown
  - Only default pack, has custom variables → show step with variable inputs, no dropdown
  - Multiple packs → show dropdown + variable inputs for selected pack
- Pack is locked at story creation — cannot be changed after
- If pack selection changes, variable inputs update to reflect the new pack's variables

### Variable configuration in wizard
- Variables displayed as a scrollable list in the order the pack author defined them
- Display name shown as label, description shown as help text below the input
- Pre-fill default values for variables that have defaults
- All variables must be filled — no optional variables
- The "required" toggle on variables is redundant and should be removed from the variable manager (variables with defaults are pre-filled, variables without defaults must be filled by user — all end up with a value)
- UI controls per type: text field, dropdown (enum), number input, toggle (boolean), textarea
- Variable values stored per-story and used in template resolution

### Claude's Discretion
- Import preview dialog layout and styling
- Export filename suggestion (pack name based)
- Validation error message formatting
- Wizard step transition animations
- How variable inputs respond to pack switching (clear vs preserve matching names)

</decisions>

<specifics>
## Specific Ideas

- User specified `.prompt.json` as the file extension — distinctive but recognizable as JSON
- Pack step should always be visible (even with only default pack) for discoverability, but adapt its contents based on context
- The required/optional distinction on variables is a modeling simplification — remove the toggle, infer from presence of default value

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-import-export-variable-discovery*
*Context gathered: 2026-02-16*
