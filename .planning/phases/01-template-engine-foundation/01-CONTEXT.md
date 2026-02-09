# Phase 1: Template Engine Foundation - Context

**Gathered:** 2026-02-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a safe, predictable template rendering engine that resolves {{ variable }} syntax in one pass against a unified context object. Supports Jinja-like conditionals (if/elsif/else), filters, and loops. Includes validation API for checking both syntax and variable references. This is the foundation that all services will call — designed from the start as the core of a unified prompt system (templates, variables, preset lookup).

Variables are simple values only: text, boolean, enum, number. Variables do not reference other variables — no expression evaluation, no circular reference risk.

</domain>

<decisions>
## Implementation Decisions

### Error behavior
- **Validation at save time:** Templates must pass full validation (syntax + variable names) before they can be saved. Save is blocked entirely on invalid templates.
- **Real-time validation:** CodeMirror integration for live validation as user types (Phase 4 will consume this API). Engine exposes a validation function that can be called on each edit.
- **Unknown variables at render time:** If a validated template somehow hits a missing variable at runtime (bug scenario), render empty string and log the error. Never break the user's experience.
- **Per-template validation only:** No batch "validate all" action needed. Each template validated individually when edited/saved.
- **Error presentation for non-technical users:** Claude's discretion on how validation errors are displayed — priority is clarity for non-coding users.

### Engine API surface
- **Simplest, cleanest approach:** Keep the API minimal. render() returns just a string, nothing more.
- **Unified system design:** The engine is the foundation of a single cohesive prompt system. Not a standalone utility — designed so preset lookup, template storage, and service integration plug in naturally in later phases.
- **Template organization:** Claude's discretion on grouping strategy (by service, flat with naming convention, etc.), but must account for the relationship: agent profile → service → templates.
- **Clean slate architecture:** No obligation to preserve existing code patterns. Design fresh for what's best. Prioritize modular code with small focused files — no 1000+ line monoliths.
- **Aggressive cleanup:** Remove duplicated code/types. Delete dead code. Re-organize where needed. Code should be connected/bucketed where it logically belongs.

### Filter & conditional scope
- **Target users:** Non-technical users. Syntax must be approachable, not intimidating.
- **Conditionals:** Full conditional support — if/elsif/else, comparisons (==, !=, >, <), and/or operators.
- **Filters:** Built-in library filters only. No custom Aventuras-specific filters. Whatever the chosen library ships with.
- **Loops:** Supported if the chosen library provides them natively. Don't restrict native features, but don't add custom ones either.
- **Library selection:** Prefer the simplest possible Jinja-compatible JS/TS library. Doesn't need to be LiquidJS — researcher should evaluate simpler alternatives. Key criteria: simple, safe by design, minimal bundle size.

### Security & sandboxing
- **Safe by design:** Choose a template library that's inherently safe (no eval, no access to runtime objects). If the engine is simple enough (variable substitution + conditionals + loops + filters), no sandboxing needed.
- **No limits:** No restrictions on template size or complexity. Trust users.
- **Standalone templates:** No includes, no extends, no template inheritance. Each template is fully self-contained.
- **Full context access:** Every template sees the entire context object (all system + runtime + custom variables). No per-template scoping.

### Claude's Discretion
- Error presentation UX for non-technical users
- Engine API shape (singleton vs per-story, function vs class)
- Template organization/grouping strategy
- Exact library choice (research simpler Jinja alternatives beyond LiquidJS)
- Module structure and file organization

</decisions>

<specifics>
## Specific Ideas

- "We shouldn't be able to save invalid templates in the first place" — validation-first philosophy, not error-recovery
- "Simple and organized... keep stuff clean and connected where it should be" — architectural cleanliness is a core value
- "Clean slate" — no obligation to existing patterns, design from scratch
- "It should be extremely simple where security is not necessary to worry about" — simplicity IS the security model
- Agent profiles are connected to services which use prompts — the system should reflect this relationship (agent profile → service → templates)
- Files should be small and modular, not 1000+ line monoliths

</specifics>

<deferred>
## Deferred Ideas

- Agent profile integration with preset system — how agent profiles connect to their templates (Phase 3 territory, but design should anticipate it)
- Mass codebase cleanup of duplicated code/types — broader than Phase 1 but the engine should be the exemplar of clean architecture

</deferred>

---

*Phase: 01-template-engine-foundation*
*Context gathered: 2026-02-08*
