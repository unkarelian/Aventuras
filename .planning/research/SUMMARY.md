# Project Research Summary

**Project:** Aventuras - Unified Prompt Template System
**Domain:** AI-powered interactive fiction - Jinja-like template system for prompt management
**Researched:** 2026-02-08
**Confidence:** MEDIUM

## Executive Summary

Aventuras requires a unified prompt template system to replace its current fragmented macro/placeholder dual-engine architecture. Research indicates the optimal approach is a single-pass Jinja-like template engine (LiquidJS) with explicit variable categorization (system/runtime/custom), bundled into preset packs for easy switching and sharing. The system should use CodeMirror 6 for syntax-highlighted editing with mobile-friendly touches.

The core architectural insight is that the existing dual-phase expansion (macros → placeholders) adds unnecessary complexity. A single template engine with unified context building simplifies both implementation and user mental model. The recommended stack prioritizes security (sandboxed execution, no arbitrary code), mobile-first design (touch support, virtual keyboard handling), and developer experience (TypeScript-native, modular architecture).

Key risks center on security (template sandbox escape), migration (data loss from dual-system), and mobile UX (virtual keyboard obscures editor). These are addressable through whitelist-only token matching, pre-migration export tools, and visualViewport API integration. The research identifies 7 phases with clear dependencies, suggesting a bottom-up implementation strategy starting with engine foundations before exposing UI to users.

## Key Findings

### Recommended Stack

LiquidJS emerges as the strongest template engine choice for its TypeScript-native design, safe-by-default sandbox (no arbitrary code execution), Jinja-like syntax familiarity, and browser compatibility. While Nunjucks offers closer Jinja2 syntax compatibility, its maintenance status is uncertain and it's less secure for user-editable templates. CodeMirror 6 provides mobile-friendly editing with modular architecture, avoiding Monaco's 1-2MB bundle bloat.

**Core technologies:**
- **LiquidJS (~10.x):** Safe Jinja-like template engine with synchronous rendering — sandboxed by default, TypeScript-native, reasonable bundle size (~50-80KB)
- **CodeMirror 6:** Syntax highlighting editor with mobile touch support — modular, extensible, needs custom Liquid language mode
- **Svelte 5 runes + SQLite:** State management and persistence — follows existing Aventuras vault pattern

**Critical caveat:** Research was conducted without web access. Version numbers, bundle sizes, and Svelte 5 wrapper availability require verification before implementation.

### Expected Features

Users expect a complete template editing experience with validation, preview, and organization features. Mobile optimization is identified as a key differentiator in this space, where most AI tools remain desktop-only.

**Must have (table stakes):**
- Basic text editor with syntax highlighting for `{{macros}}`
- Variable/macro insertion dropdown (no memorization)
- Template preview/test with current story context
- Save/discard with dirty state tracking and modified indicators
- Reset to default per template
- Import/export preset packs
- Real-time validation feedback (syntax + semantic)
- Template categories/organization (20+ templates = overwhelming)
- Variable documentation (tooltips/reference panel)
- Undo/redo (built into editor)

**Should have (competitive advantage):**
- Macro hover tooltips showing resolved values
- Visual diff for customizations
- Context-aware variable suggestions (filter by template type)
- Batch operations (reset category, bulk export)
- Template linting (unused macros, complexity warnings)
- Version history per template (local history)

**Defer (v2+):**
- Live macro preview in editor (high complexity, unclear ROI)
- Macro variant matrix editor (only benefits power users)
- Template testing playground (preview is usually sufficient)
- Preset pack marketplace (requires community/backend)
- Mobile-optimized editor (desktop-first, evaluate mobile need post-launch)
- Autocomplete for Jinja conditionals/loops (only if control flow added)

**Anti-features to avoid:**
- Rich text editor (AI expects plain text)
- Drag-and-drop visual builder (abstraction layer hinders debugging)
- AI-assisted template generation (recursion problem, unpredictable)
- Real-time collaborative editing (massive complexity, niche use case)
- Per-story template overrides (preset packs already serve this)
- Template scripting/code execution (security nightmare)

### Architecture Approach

The unified system distinguishes three variable categories with clear ownership: system variables (auto-filled from app state), runtime variables (service-injected context), and custom variables (user-defined per pack). A single ContextBuilder merges all sources before one-pass template rendering, eliminating the current dual-phase expansion complexity.

**Major components:**
1. **TemplateEngine** — Parse/render Jinja-like syntax in one pass, handle errors gracefully, support custom filters
2. **PackManager** — CRUD for preset packs (templates + custom variables), activation, export/import, validation
3. **ContextBuilder** — Build unified context from system state (stores), runtime data (services), custom values (active pack)
4. **PromptService** — Singleton API coordinating engine, packs, and context for all prompt operations
5. **promptVault store** — Svelte 5 runes reactive store following existing vault pattern (characterVault, lorebookVault, etc.)
6. **Vault: Prompts UI** — CRUD interface matching existing vault tabs at `/vault/prompts`
7. **CreationWizard** — Multi-step pack creation with auto-discovery of custom variables from template text

**Key patterns:**
- Single-pass resolution (no macro → placeholder phases)
- Preset pack as unit of customization (atomic switching, easy sharing)
- Auto-discovery of variables (wizard scans template, generates UI)
- Unified context pipeline (services isolated, ContextBuilder merges)

**Anti-patterns to avoid:**
- Multi-phase expansion (adds complexity without benefit)
- Global template overrides (breaks pack atomicity)
- Manual variable declaration (extra friction, gets out of sync)
- Template inheritance (over-engineering for flat prompts)
- Context passed through service layers (tight coupling)

### Critical Pitfalls

Security, migration, and mobile UX emerge as the highest-risk areas requiring proactive design.

1. **Template sandbox escape via prototype pollution** — User templates exploiting JavaScript's prototype chain to access restricted globals or execute code. **Avoid:** Whitelist-only token matching (current regex `\{\{(\w+)\}\}` is safe), never use eval/Function, blacklist dangerous properties (__proto__, constructor, prototype).

2. **Silent template expansion failures** — Templates with undefined variables fail silently, rendering as `{{unknownVar}}` without user notification. **Avoid:** Real-time validation in editor, distinguish syntax vs context errors, dry-run preview, clear error messages with token names.

3. **Infinite recursion in nested macro expansion** — Circular references (greeting → welcome → greeting) causing stack overflow. **Avoid:** Track expansion history during recursion, detect circular chains, pre-expansion static analysis, clear error messages showing cycle path.

4. **Mobile virtual keyboard obscures editor content** — Virtual keyboard covers 40-60% of screen, cursor hidden, CSS 100vh doesn't account for keyboard height. **Avoid:** Use visualViewport API to detect keyboard, adjust container height dynamically, auto-scroll to cursor, test on real iOS/Android devices.

5. **Migration data loss from dual-system to unified engine** — Existing templates using both MacroEngine (`{{token}}`) and service placeholders (`{token}`) break during migration. **Avoid:** Pre-migration export tool, clear "templates will reset" warning, manual migration wizard, set legacyMigrationComplete flag.

6. **Template engine performance degradation** — Complex templates with 20+ macros taking 200-500ms, causing UI lag. **Avoid:** Memoize macro resolution, pre-index complex variants, debounce preview (300ms), set <50ms performance budget.

7. **Preset import format instability** — Schema changes across app versions breaking imported presets. **Avoid:** Versioned preset schema separate from internal types, migration functions, clear error messages, stable builtin IDs.

8. **Inconsistent error handling between editor and runtime** — Editor validation passes but runtime fails with cryptic errors. **Avoid:** Use same validation code in both paths, test with multiple context scenarios, three-state indicator (works always/conditionally/never).

## Implications for Roadmap

Based on dependency analysis and risk assessment, research suggests a 7-phase bottom-up implementation strategy. Core engine and validation must be complete before exposing UI to users. Mobile optimization and migration are final phases after desktop experience is validated.

### Phase 1: Template Engine Foundation
**Rationale:** Pure logic with no dependencies on existing code. Security model must be established before any user-facing features. Engine must be stable before building higher layers.

**Delivers:** TemplateEngine with parser, renderer, built-in filters, error handling. Can parse template strings and render with context objects.

**Stack:** LiquidJS evaluation (or minimal custom engine if LiquidJS problematic), TypeScript

**Avoids:**
- Pitfall 1 (sandbox escape) — Whitelist token matching from start
- Pitfall 3 (infinite recursion) — Circular reference detection in core

**Research needs:** Standard template engine patterns are well-documented. Skip `/gsd:research-phase`.

### Phase 2: Validation & Error Handling
**Rationale:** Must be built alongside engine, not as afterthought. Prevents users from creating broken templates. Same validation code used in editor and runtime prevents inconsistency.

**Delivers:** Validation API, error types, syntax/semantic checking, dry-run expansion, detailed error messages.

**Uses:** TemplateEngine from Phase 1

**Avoids:**
- Pitfall 2 (silent failures) — Real-time validation with clear messages
- Pitfall 8 (inconsistent errors) — Shared validation between editor and runtime

**Research needs:** Error handling patterns are well-established. Skip `/gsd:research-phase`.

### Phase 3: Performance Optimization
**Rationale:** Performance budgets must be set before mobile editor is built. Profiling real templates reveals optimization targets. Early optimization prevents UI lag from becoming baked in.

**Delivers:** Memoization, variant indexing, debounced preview, performance tests with <50ms budget.

**Uses:** TemplateEngine with real templates for benchmarking

**Avoids:**
- Pitfall 6 (performance degradation) — Caching and indexing before complexity grows

**Research needs:** Standard optimization patterns. Skip `/gsd:research-phase`.

### Phase 4: Database Schema & PackManager
**Rationale:** Data layer must exist before building UI. Depends on PresetPack types from Phase 1. SQLite migrations and CRUD must be stable before state management.

**Delivers:** SQLite tables (prompt_packs, prompt_templates, custom_variables), database service methods, PackManager with CRUD, validation, activation.

**Implements:** PackManager component from architecture, follows existing vault database pattern

**Avoids:**
- Pitfall 7 (preset instability) — Versioned schema from start

**Research needs:** SQLite patterns well-established in codebase. Skip `/gsd:research-phase`.

### Phase 5: Context System & PromptService
**Rationale:** Orchestrates all prior phases. Reads from existing stores (story, characterVault). Provides public API for services. Must be complete before services can migrate.

**Delivers:** ContextBuilder with system/runtime/custom merging, PromptService singleton, active pack loading, render() method.

**Implements:** ContextBuilder, PromptService components from architecture

**Addresses:** Unified context pipeline pattern, single-pass resolution

**Research needs:** Integration with existing services. Standard patterns. Skip `/gsd:research-phase`.

### Phase 6: Vault UI & Editor
**Rationale:** User-facing CRUD for packs. Follows existing vault pattern. Depends on promptVault store, PackManager, validation. Desktop-first — mobile editor deferred.

**Delivers:** promptVault store (Svelte 5 runes), `/vault/prompts` route, PackList/PackEditor/PackPreview components, template editor with CodeMirror 6, variable editor.

**Addresses:**
- Table stakes features: editor, save/discard, modified indicator, reset, preview, import/export, categories, validation feedback, variable docs, undo/redo

**Uses:**
- CodeMirror 6 for editing
- PromptService for preview
- PackManager for CRUD

**Research needs:** CodeMirror 6 Svelte 5 integration is uncertain. May need `/gsd:research-phase` to evaluate wrapper libraries vs custom integration.

### Phase 7: Creation Wizard & Variable Discovery
**Rationale:** Advanced UX feature for pack creation. Depends on validated PackManager and TemplateEngine. Scans templates to auto-discover custom variables, generates UI dynamically.

**Delivers:** VariableDiscovery (scan for `{{vars}}`), type inference, CreationWizard multi-step form, UI control generation.

**Implements:** Auto-discovery pattern from architecture

**Addresses:** Reduces friction for custom pack creation (no manual variable declaration)

**Research needs:** Pattern-based variable discovery is straightforward. Skip `/gsd:research-phase`.

### Phase 8: Migration from Legacy System
**Rationale:** FINAL phase after all new UI is complete and tested. Cannot recover from data loss, so must be done last with extensive safety measures.

**Delivers:** Pre-migration export tool, warning dialog showing what will reset, migration script converting old MacroEngine to new packs, legacyMigrationComplete flag, migration changelog UI.

**Avoids:**
- Pitfall 5 (migration data loss) — Export before migrate, clear warnings, manual import wizard

**Research needs:** Legacy MacroEngine mapping to new system. May need `/gsd:research-phase` to audit all existing templates and macro types.

### Phase 9: Mobile Editor UX (Optional/Deferred)
**Rationale:** Deferred until desktop validates. Mobile editing is rare use case per feature research. Read-only mobile with network sync may be sufficient. If implemented, requires real device testing.

**Delivers:** visualViewport integration, dynamic height adjustment, touch gesture support, simplified mobile UI, portrait mode support.

**Avoids:**
- Pitfall 4 (keyboard obscures editor) — visualViewport API, auto-scroll to cursor

**Research needs:** Mobile editor patterns in Tauri are niche. Likely needs `/gsd:research-phase` if implemented.

### Phase Ordering Rationale

- **Phases 1-3 (Engine, Validation, Performance):** Independent, no UI dependencies, pure logic. Must be stable before building on top.
- **Phases 4-5 (Database, Context, Service):** Data and orchestration layer. Connects pure logic to existing app state.
- **Phases 6-7 (UI, Wizard):** User-facing features. Depend on stable foundation from prior phases.
- **Phase 8 (Migration):** LAST — cannot undo data loss. All new features must work first.
- **Phase 9 (Mobile):** Optional — evaluate need after desktop validation.

**Dependency chains:**
- Phase 6 UI → Phase 5 Service → Phase 4 Data → Phase 1 Engine
- Phase 7 Wizard → Phase 6 UI
- Phase 8 Migration → Phase 7 Wizard (need new system complete)
- Phase 3 Performance → Phase 1 Engine (needs templates to benchmark)
- Phase 2 Validation → Phase 1 Engine (validates using engine)

**Risk mitigation sequence:**
- Critical security (Phase 1) → Validation (Phase 2) → Performance (Phase 3) → Migration safety (Phase 8)

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (Vault UI):** CodeMirror 6 + Svelte 5 integration uncertain. Wrapper library compatibility needs verification. Consider `/gsd:research-phase` for "CodeMirror 6 Svelte 5 wrapper evaluation".
- **Phase 8 (Migration):** Complex mapping from dual-system (MacroEngine + placeholders) to unified system. All existing templates and macro types need audit. Consider `/gsd:research-phase` for "Legacy template migration strategy".
- **Phase 9 (Mobile Editor):** If implemented, mobile editor patterns in Tauri are niche. Virtual keyboard handling has platform-specific edge cases. Consider `/gsd:research-phase` for "Mobile code editor UX patterns".

Phases with standard patterns (skip research-phase):
- **Phase 1 (Engine):** Template engine design patterns well-documented (Jinja2, Liquid, Mustache).
- **Phase 2 (Validation):** Standard error handling patterns.
- **Phase 3 (Performance):** Memoization and caching are well-established.
- **Phase 4 (Database):** SQLite CRUD follows existing Aventuras vault pattern.
- **Phase 5 (Context & Service):** Service integration follows existing pattern.
- **Phase 7 (Wizard):** Variable discovery via regex parsing is straightforward.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | LiquidJS direction sound based on training data, but version/bundle size/Svelte 5 compatibility unverified. No web access to check current npm ecosystem. |
| Features | MEDIUM | Table stakes identified from codebase + training data on SillyTavern/KoboldAI patterns. Competitor features may have evolved since Jan 2025 cutoff. |
| Architecture | HIGH | Based on thorough Aventuras codebase analysis. Vault pattern, Svelte 5 runes, service architecture are well-understood. Single-pass resolution is sound design. |
| Pitfalls | MEDIUM | Security patterns (prototype pollution, sandboxing) are well-established best practices. Mobile virtual keyboard issues are standard web API. Migration risks are project-specific from codebase analysis. |

**Overall confidence:** MEDIUM

Architectural direction is sound (HIGH confidence from codebase), but technology choices require verification (MEDIUM confidence without web access). Feature prioritization is informed but may miss recent ecosystem evolution.

### Gaps to Address

**Technology verification (before Phase 1):**
- LiquidJS current version, maintenance status, actual bundle size (min+gzip)
- CodeMirror 6 Svelte 5 wrapper availability (codemirror-svelte, svelte-codemirror, or custom)
- Liquid/Jinja syntax mode availability for CodeMirror
- Actual bundle impact in Aventuras build (use vite-bundle-visualizer)

**Feature validation (before Phase 6):**
- Mobile editing necessity — survey users: "Would you edit templates on mobile?" vs read-only + network sync
- Macro variant matrix editor demand — is text editing sufficient or do power users need spreadsheet UI?
- Template linting rules — what are common mistakes from existing templates?

**Migration strategy (before Phase 8):**
- Audit all existing templates (story, service, wizard, image categories)
- Map current macro types (simple, complex with variants) to new system
- Identify ambiguous tokens (same name used as macro and placeholder)
- Test migration with real user data (request volunteer alpha testers)

**Performance budgets (Phase 3):**
- Baseline current MacroEngine expansion time (instrument with timing)
- Profile LiquidJS with real Aventuras templates
- Set mobile performance targets (test on low-end Android)

**Compatibility testing (Phase 6):**
- Test CodeMirror 6 on target mobile devices (768px breakpoint)
- Verify virtual keyboard behavior on iOS Safari vs Chrome Android
- Test Svelte 5 runes reactivity with large preset packs

## Sources

### Primary (HIGH confidence)
- C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/macros.ts — Current MacroEngine implementation
- C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/types.ts — Type definitions
- C:/Users/Admin/Projects/Aventuras/README.md — Mobile-first design, architecture overview
- Aventuras codebase analysis — Vault pattern, Svelte 5 runes, service architecture, SQLite integration

### Secondary (MEDIUM confidence)
- Template engine security patterns — OWASP template injection prevention, prototype pollution (training data)
- JavaScript template engine landscape — Jinja2, LiquidJS, Nunjucks, Eta comparison (training data, Jan 2025)
- Mobile editor UX patterns — Visual Viewport API, virtual keyboard handling (MDN Web Docs standards)
- SillyTavern/KoboldAI/NovelAI feature analysis — Macro systems, preset sharing (training data)

### Tertiary (LOW confidence, needs validation)
- LiquidJS version ~10.x, bundle size ~50-80KB — Training data estimates, not verified
- CodeMirror 6 Svelte wrappers — Package names unverified, Svelte 5 compatibility unknown
- Nunjucks maintenance status — Mozilla archived, current fork status unknown
- Mobile keyboard behavior — iOS 17+ changes not verified

### Research Limitations

Research conducted WITHOUT access to:
- WebSearch (current ecosystem state, 2026 releases)
- WebFetch (official documentation verification)
- Bash/npm (version checking, bundle analysis)

All external technology claims based on training data (January 2025 cutoff) and require verification before implementation.

---
*Research completed: 2026-02-08*
*Ready for roadmap: yes*
