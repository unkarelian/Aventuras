# Pitfalls Research: Prompt Template System Rework

**Domain:** User-editable template engines for AI prompt management
**Researched:** 2026-02-08
**Confidence:** MEDIUM (based on template engine security best practices, mobile editor patterns, and existing codebase analysis)

## Critical Pitfalls

### Pitfall 1: Template Sandbox Escape via Prototype Pollution

**What goes wrong:**
User-editable templates that support object property access (like Jinja's dot notation) can exploit JavaScript's prototype chain to access restricted globals or execute arbitrary code. Example: `{{constructor.constructor('return process')()}}` or accessing `__proto__` to modify object behavior.

**Why it happens:**
Template engines that naively evaluate object property access without restricting the property chain allow traversal up to Object.prototype and constructor functions. This is especially dangerous in Electron/Tauri apps where Node.js APIs are accessible.

**How to avoid:**
- Use a whitelist-only property accessor for template variables (no arbitrary dot notation)
- Explicitly check property names against a blacklist: `__proto__`, `constructor`, `prototype`, `__defineGetter__`, `__defineSetter__`
- Consider using Proxy objects to intercept property access and reject dangerous paths
- Never use `eval()`, `Function()`, or `new Function()` for template expansion
- The current MacroEngine's regex-based token matching (`/\{\{(\w+)\}\}/g`) is safe because it only matches word characters, preventing dot notation entirely

**Warning signs:**
- Template syntax supports dot notation (e.g., `{{user.settings.apiKey}}`)
- Template expansion uses `eval()` or dynamic function creation
- Error messages expose internal object structures or prototype chains
- Users can access object methods in templates

**Phase to address:**
Phase 1 (Engine Design) - Security model must be established before any user-facing editor exists.

---

### Pitfall 2: Silent Template Expansion Failures

**What goes wrong:**
Templates with undefined variables or missing context fail silently, rendering as `{{unknownVar}}` or empty strings without notifying the user. This makes debugging user-created templates nearly impossible and creates confusion when prompts don't work as expected.

**Why it happens:**
Current MacroEngine returns `{{token}}` unchanged for unknown tokens (line 94 of macros.ts). While this preserves the template for debugging, users don't know if this is intentional syntax or an error. No validation happens at template save time, only at expansion time when context may be incomplete.

**How to avoid:**
- Add template validation API: `validateTemplate(template, expectedContext)` that reports unknown tokens
- Distinguish between "macro not found" vs "macro found but context missing value" errors
- Show validation warnings in the template editor UI in real-time
- Provide a "dry run" expansion mode that shows what would be rendered with sample context
- Log expansion failures with clear error messages including token name and available context keys
- Add a template health indicator in the UI (green/yellow/red based on validation)

**Warning signs:**
- User reports "template not working" but provides no error details
- Debugging requires inspecting expanded prompt text manually
- Templates work in one mode (adventure) but fail silently in another (creative-writing)
- Context variables are misspelled or renamed in code but templates aren't updated

**Phase to address:**
Phase 2 (Validation & Error Handling) - Must be built before exposing editor to users. Include validation API with the engine.

---

### Pitfall 3: Infinite Recursion in Nested Macro Expansion

**What goes wrong:**
User creates macros that reference each other circularly (e.g., `{{greeting}}` contains `{{welcome}}`, which contains `{{greeting}}`), causing stack overflow or browser freeze when expanding templates.

**Why it happens:**
The current MacroEngine has recursion depth limiting (maxDepth=5, clamped to 0-10 on line 120), but this only prevents infinite recursion, not circular references. A circular reference will still attempt expansion up to maxDepth times, wasting CPU and potentially creating confusing output.

**How to avoid:**
- Track expansion history during recursion: maintain a Set of tokens currently being expanded
- If a token appears in its own expansion chain, break the cycle and return an error marker like `[CIRCULAR: {{token}}]`
- Add a pre-expansion static analysis pass that detects circular dependencies before runtime
- Provide clear error messages: "Macro 'greeting' contains circular reference: greeting → welcome → greeting"
- Consider disallowing nested macros entirely in user-defined macros (only allow in builtins)

**Warning signs:**
- Template expansion takes >100ms for simple prompts
- Browser becomes unresponsive when editing certain templates
- Expanded prompt contains repeated content or truncated mid-expansion
- maxDepth limit is hit frequently (can be logged)

**Phase to address:**
Phase 1 (Engine Design) - Add circular reference detection to MacroEngine.expand() before user editor is built.

---

### Pitfall 4: Mobile Virtual Keyboard Obscures Editor Content

**What goes wrong:**
On mobile (especially phones <768px), the virtual keyboard appears and covers 40-60% of the screen. The code editor's scroll container doesn't account for this, leaving the user's cursor and text they're editing completely hidden behind the keyboard. Tapping "Done" dismisses the keyboard but doesn't scroll the editor back into view.

**Why it happens:**
CSS `100vh` doesn't account for virtual keyboard height on mobile browsers. The viewport height remains constant even when keyboard is shown, causing the editor to extend beneath it. Standard `position: fixed` keyboards don't trigger resize events on iOS Safari.

**How to avoid:**
- Use `visualViewport` API to detect keyboard appearance: `window.visualViewport.addEventListener('resize', handleKeyboardChange)`
- Adjust editor container height dynamically: `maxHeight = visualViewport.height - header - footer`
- Automatically scroll focused input into view with extra padding: `element.scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Add `env(safe-area-inset-bottom)` padding to account for iOS home indicator
- Use `inputmode` attribute on textarea to suggest appropriate keyboard type
- Provide a "minimize keyboard" button in editor toolbar for quick access
- Consider a detached floating toolbar that repositions above keyboard

**Warning signs:**
- Users complain they can't see what they're typing on mobile
- Scroll position jumps unexpectedly when keyboard dismisses
- Editor is usable on desktop but breaks on phone/tablet
- Testing only done on desktop Chrome or with external keyboard attached

**Phase to address:**
Phase 4 (Mobile Editor UX) - Test on real mobile devices (iOS Safari, Chrome Android) before shipping.

---

### Pitfall 5: Migration Data Loss from Dual-System to Unified Engine

**What goes wrong:**
Existing stories have prompts using both MacroEngine tokens (`{{protagonistName}}`) and service-level placeholders (like `{recentContent}` with single braces). The migration to Jinja-like unified syntax loses these placeholders or double-escapes them, breaking existing stories. User-created template overrides in PromptSettings may reference deprecated macro IDs that no longer exist.

**Why it happens:**
Different parts of the system use different placeholder syntax conventions (double braces for macros, single braces for runtime context). Migration code assumes a clean mapping exists, but some tokens have ambiguous meanings (e.g., `settingDescription` is both a macro AND a context placeholder in different services). Global macro overrides (MacroOverride[]) and template overrides (PromptOverride[]) use macro IDs that may be renamed or removed in the new system.

**How to avoid:**
- **DO NOT** attempt backward compatibility - project context specifies "clean slate migration"
- Create a migration script that warns users BEFORE migrating: "20 templates will be reset to defaults. Your custom text will be lost unless exported."
- Provide a pre-migration export tool: "Export current templates as text files for reference"
- Build a template import wizard that helps users manually migrate custom content to new syntax
- Add a migration changelog in the UI showing what changed: "Macro 'settingDescription' renamed to 'setting', default value changed"
- Clear all `PromptSettings.templateOverrides` and `macroOverrides` after migration, set `legacyMigrationComplete: true`
- Detect old-style templates (single braces, deprecated tokens) and show a "needs migration" warning in the UI

**Warning signs:**
- User reports prompts "stopped working" after update
- Expanded prompts contain raw `{recentContent}` instead of actual content
- Custom templates show errors or render incorrectly
- Migration runs on every app launch (forgetting to set `legacyMigrationComplete`)

**Phase to address:**
Phase 5 (Migration) - This must be the FINAL phase. All new template UI must be complete and tested before migration runs.

---

### Pitfall 6: Template Engine Performance Degradation with Many Variables

**What goes wrong:**
Complex prompts with 20+ macro tokens take 200-500ms to expand, causing UI lag when rendering live previews in the editor. Each macro expansion may trigger nested expansions (depth 5), and complex macros iterate through 12+ variants to find the best match. On mobile devices, this becomes a noticeable freeze.

**Why it happens:**
The MacroEngine uses a linear search through variants for complex macros (O(n) per macro). With 20 macros × 5 depth × 12 variants = 1200 variant lookups per expansion. Regex-based token finding (`/\{\{(\w+)\}\}/g`) is called recursively at each depth level. No caching exists for resolved macro values.

**How to avoid:**
- Add memoization for macro resolution: cache `(token, context) → value` mappings per expansion session
- Pre-index complex macro variants by key: build a Map<string, MacroVariant> where key is `${mode}:${pov}:${tense}`
- For editor live preview, debounce expansion requests (wait 300ms after last keystroke)
- Use a scoring threshold to early-exit variant matching once a perfect match is found (score = maxPossible)
- Consider compiling templates to functions once and reusing (advanced optimization)
- Profile expansion performance and set budget: warn if any template takes >50ms to expand
- Add a "complexity score" to templates based on macro count and depth

**Warning signs:**
- Editor preview lags while typing
- Expansion time increases linearly with macro count
- Mobile devices stutter when rendering prompt previews
- Users avoid using macros because the editor becomes slow

**Phase to address:**
Phase 3 (Performance Optimization) - After basic engine works but before mobile editor is built. Set performance budgets early.

---

### Pitfall 7: Preset Import Format Instability

**What goes wrong:**
User exports a preset pack (templates + variables + macros) as JSON. After an app update, importing this preset fails because the schema changed: renamed fields, added required fields, or changed macro ID conventions. User loses their carefully crafted preset library.

**Why it happens:**
Preset export uses raw internal type serialization (PromptSettings, Macro[], PromptOverride[]) without a versioned schema. When types evolve (e.g., adding `variableType: 'text' | 'number'` to custom macros), old exports become incompatible. No migration path exists for preset files.

**How to avoid:**
- Define a versioned preset schema separate from internal types: `{ version: 1, templates: [...], macros: [...] }`
- Write schema migration functions: `migratePresetV1toV2(oldPreset)` that handle format changes
- Include schema version in export filename: `my-preset.v1.json`
- Validate imported presets and show clear errors: "This preset is version 2, but only version 1 is supported. Please update the app."
- Use a stable ID scheme for builtins: never rename builtin macro IDs, only add new ones or mark as deprecated
- Provide preset upgrade tool in the UI: "Update old preset to current format"
- Test preset import/export in automated tests to catch breaking changes early

**Warning signs:**
- Import fails with "JSON parse error" or "property undefined"
- Old presets work but missing data (fields added in new schema)
- Users complain they can't share presets across app versions
- No migration path exists when internal types change

**Phase to address:**
Phase 6 (Preset System) - Define schema before building export UI. Add versioning from the start.

---

### Pitfall 8: Inconsistent Error Handling Between Editor and Runtime

**What goes wrong:**
User saves a template with syntax errors in the editor. No validation warning appears. Later, when the template is expanded at runtime (during prompt generation), it fails with a cryptic error or renders incorrectly. User doesn't understand why their template "worked" in the editor but failed in use.

**Why it happens:**
Validation in the editor uses a different code path than runtime expansion. Editor validation may use mock context with all variables defined, while runtime has partial context (e.g., `currentLocation` is undefined before a location is set). Editor shows a preview, but preview uses placeholder values that hide missing data errors.

**How to avoid:**
- Use the SAME validation function in editor and runtime: `macroEngine.expand(template, context)` should be called in both places
- Editor should test expansion with multiple context scenarios: minimal context, full context, and "typical" context
- Show a three-state validation indicator:
  - Green: "Works in all contexts"
  - Yellow: "Works only when [variable] is set"
  - Red: "Syntax error or circular reference"
- Provide a "Test with sample story" button that expands the template using real story data
- Runtime errors should link back to the editor: "Template 'adventure' failed at macro {{genre}} - click to edit"

**Warning signs:**
- Users report templates work in preview but fail in production
- Validation passes but runtime throws errors
- Error messages in console don't appear in UI
- Template editor and prompt generation use different expansion logic

**Phase to address:**
Phase 2 (Validation & Error Handling) - Build validation alongside engine, not as an afterthought.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Using `eval()` for template expansion | Simpler initial implementation | Critical security vulnerability, impossible to sandbox | Never acceptable with user input |
| No template validation at save time | Faster editor implementation | Users create broken templates, debugging nightmare | Never - validation must be immediate |
| Single-device testing (desktop only) | Faster QA cycle | Mobile users encounter broken UI, virtual keyboard issues | Only in early prototypes, not for release |
| Hardcoded macro IDs in migration | Quick migration script | Breaking change when refactoring macro definitions | Never - use stable ID scheme from start |
| No caching for macro expansion | Simpler engine code | Performance degrades with template complexity | MVP only, must optimize before mobile |
| Unversioned preset format | Easier export implementation | Presets break across app versions, user frustration | Never - versioning is cheap to add upfront |
| Separate validation logic in editor vs runtime | Faster UI iteration | Inconsistent behavior, false confidence in templates | Never - reuse same validation code |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Monaco Editor (code editor) | Loading full Monaco bundle (3MB+) in Electron/Tauri app | Use lightweight alternatives like CodeMirror 6 or simple `<textarea>` with syntax highlighting via Shiki |
| Virtual Keyboard (mobile) | Using `window.innerHeight` to size editor | Use `window.visualViewport.height` and listen to `visualViewport.resize` events |
| Jinja.js (template engine) | Using Jinja.js directly with user templates | Write custom parser - Jinja.js allows arbitrary Python-like expressions that can't be sandboxed in JS |
| Svelte stores for template state | Directly mutating `PromptSettings` in store | Use immutable updates or Svelte 5's `$state()` with proper reactivity |
| Tauri IPC for template sync | Synchronous template read on every expansion | Cache templates in frontend state, sync only on user save |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recursive regex execution | Editor freezes when typing in large templates | Use incremental parsing instead of re-scanning entire template on each keystroke | Templates >5000 characters |
| Unthrottled live preview | UI lag while typing in editor | Debounce preview rendering (300ms), cancel in-flight expansions | Any template with >5 macros |
| Deep macro nesting | Expansion takes >100ms | Limit nesting depth to 3, use circular reference detection | Macros referencing macros >3 levels deep |
| Large variant tables | Slow variant matching in complex macros | Pre-index variants by key, use early exit optimization | >20 variants per macro |
| Synchronous template expansion | Blocks UI thread during generation | Move expansion to Web Worker or use async/await with yielding | Templates used in high-frequency contexts (live typing) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Allowing arbitrary property access in templates (`{{user.__proto__}}`) | Prototype pollution, sandbox escape | Whitelist-only token matching - current regex `\{\{(\w+)\}\}` is safe |
| Storing API keys in template defaults | Keys exposed in presets, source control | Never allow macros to contain secrets - use dedicated secure storage |
| Executing user template code server-side | Remote code execution in Tauri backend | Always expand templates client-side in sandboxed context |
| Exposing internal object structures in error messages | Information disclosure aids exploit development | Sanitize errors before display: show macro token, not internal stack traces |
| No rate limiting on template expansion | Denial of service via complex templates | Set expansion timeout (e.g., 500ms max), kill runaway expansions |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual diff when resetting template to default | User doesn't know what changed, can't undo | Show side-by-side diff modal before reset, offer "undo reset" option |
| Hidden context requirements for macros | Template works in some modes but fails silently in others | Show context requirements in macro help tooltip: "Requires: mode=adventure" |
| No search/filter in macro palette | Overwhelming list of 50+ macros to scroll through | Add search box, categorize macros (Narrative, Context, Features, etc.) |
| Generic error messages ("Template invalid") | User doesn't know what to fix | Specific errors with line/column: "Line 5: Unknown macro {{genere}} - did you mean {{genre}}?" |
| No undo history in template editor | User accidentally deletes content, can't recover | Add local undo/redo (Ctrl+Z), or auto-save drafts every 30 seconds |
| Mobile editor forces landscape mode | Awkward typing on phones, reduces usable space | Support portrait mode with collapsible preview pane |
| No template examples or starter library | User faces blank editor, doesn't know where to start | Provide template gallery with examples: "RPG Adventure", "Mystery Novel", etc. |

## "Looks Done But Isn't" Checklist

- [ ] **Template validation:** Validates syntax but doesn't check context availability - verify with partial context scenarios
- [ ] **Mobile editor:** Works on desktop Chrome DevTools mobile emulation but fails on real iOS Safari - test on physical devices
- [ ] **Circular reference detection:** Catches direct cycles (A→A) but misses indirect cycles (A→B→C→A) - test with chains >2 deep
- [ ] **Preset export:** Exports JSON but doesn't validate on import - add schema validation and version migration tests
- [ ] **Error messages:** Shows errors in console but not in UI - verify all error paths surface in user-visible components
- [ ] **Macro help tooltips:** Shows description but not context requirements or example usage - add full help panel
- [ ] **Template preview:** Shows expanded text but uses mock data, not real story state - add "preview with current story" mode
- [ ] **Undo/redo:** Works for text changes but not for macro insertions or preset imports - test all editor actions

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Template expansion performance degradation | MEDIUM | 1. Profile with real templates to find bottlenecks. 2. Add memoization/caching layer. 3. Optimize variant matching with indexing. 4. Set performance budgets. |
| User creates circular macro references | LOW | 1. Add circular reference detection to engine. 2. Show error with cycle path. 3. Provide "break cycle" quick fix in UI. |
| Mobile keyboard obscures editor | MEDIUM | 1. Add visualViewport event listeners. 2. Adjust editor height dynamically. 3. Auto-scroll to cursor position. 4. Test on iOS Safari and Chrome Android. |
| Migration loses user customizations | HIGH | 1. Cannot recover lost data - must prevent with pre-migration export. 2. If already migrated: restore from app backup (if available). 3. Provide manual re-entry from migration changelog. |
| Preset import fails due to version mismatch | MEDIUM | 1. Add schema migration functions. 2. Show helpful error with upgrade instructions. 3. Provide manual editing guide for unsupported versions. |
| Silent template failures in production | LOW | 1. Add expansion error logging to UI. 2. Implement validation warnings in editor. 3. Add "health check" that tests all templates with sample data. |
| Security vulnerability in template expansion | HIGH | 1. Immediately disable user templates if exploit confirmed. 2. Audit all property access and execution paths. 3. Add sandbox tests for common exploits. 4. Release emergency patch. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Template sandbox escape | Phase 1: Engine Design | Security audit: attempt prototype pollution, property traversal, code injection |
| Silent template expansion failures | Phase 2: Validation & Error Handling | Test with missing context, undefined variables, verify errors surface in UI |
| Infinite recursion in nested macros | Phase 1: Engine Design | Create circular reference test cases, verify cycle detection and error messages |
| Mobile virtual keyboard obscures editor | Phase 4: Mobile Editor UX | Test on iPhone, Android phone, tablet with virtual keyboard shown |
| Migration data loss | Phase 5: Migration | Test migration with complex custom templates, verify export/import preserves data |
| Performance degradation | Phase 3: Performance Optimization | Benchmark expansion time, verify <50ms for typical templates, test with 50+ macros |
| Preset import format instability | Phase 6: Preset System | Export preset, modify schema, verify migration or clear error message |
| Inconsistent editor vs runtime errors | Phase 2: Validation & Error Handling | Create intentionally broken templates, verify same errors in editor preview and runtime |

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Engine Design (Phase 1) | Overengineering for "full Jinja compatibility" when only simple token replacement is needed | Start minimal: regex-based token matching only. Add control flow (if/for) only if users explicitly request it |
| Validation & Error Handling (Phase 2) | Building validation as a separate system instead of reusing expansion logic | Use `macroEngine.expand()` for both runtime and validation - same code, same errors |
| Performance Optimization (Phase 3) | Premature optimization before measuring actual bottlenecks | Profile with real templates first, then optimize proven bottlenecks. Don't guess. |
| Mobile Editor UX (Phase 4) | Designing for desktop then "making it responsive" | Design mobile-first with touch targets, virtual keyboard, and limited screen space as constraints |
| Migration (Phase 5) | Running migration automatically without user consent or backup | Require explicit user action to migrate, show preview of changes, offer export before migration |
| Preset System (Phase 6) | Designing preset format around current implementation instead of stable schema | Define preset schema independently of internal types, add versioning from day one |

## Sources

**Existing Codebase Analysis:**
- C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/macros.ts - Current MacroEngine implementation, recursion depth limiting, regex-based token matching
- C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/types.ts - PromptSettings, MacroOverride, PromptOverride type definitions

**Security Best Practices:**
- OWASP Template Injection Prevention (training data, MEDIUM confidence - not verified with 2026 sources due to WebSearch unavailable)
- JavaScript prototype pollution prevention patterns (training data, MEDIUM confidence)
- Jinja2 sandbox documentation (training data, MEDIUM confidence - assumes JS ports have similar risks)

**Mobile UX Patterns:**
- Visual Viewport API for virtual keyboard handling (MDN Web Docs, HIGH confidence - standard browser API)
- iOS Safari virtual keyboard behavior (training data, MEDIUM confidence - behavior may have changed in iOS 17+)

**Template Engine Performance:**
- Regex performance characteristics (training data, HIGH confidence - well-established CS principles)
- Memoization and caching strategies (training data, HIGH confidence)

**Migration Best Practices:**
- Schema versioning patterns (training data, MEDIUM confidence)
- Data migration strategies for desktop apps (training data, MEDIUM confidence)

**Confidence Assessment:**
Overall MEDIUM confidence. Security pitfalls and performance patterns are based on well-established best practices. Mobile-specific issues are informed by standard web APIs but may have platform-specific edge cases not verified without WebSearch. Migration pitfalls are specific to this project's dual-system architecture based on codebase analysis.

---
*Pitfalls research for: Aventuras Prompt Template System Rework*
*Researched: 2026-02-08*
