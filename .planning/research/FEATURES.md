# Feature Landscape: Prompt Template Editing Systems

**Domain:** AI-powered interactive fiction - Prompt template management and editing
**Researched:** 2026-02-08
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users expect. Missing = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Basic Text Editor** | Core function - must edit templates | LOW | Monaco/CodeMirror or textarea with syntax highlighting |
| **Variable/Macro Insertion** | Users need to insert placeholders without memorizing syntax | LOW-MED | Dropdown/autocomplete for `{{macroName}}` insertion |
| **Template Preview/Test** | Users need to see resolved output before using | MED | Show expanded template with current/sample context |
| **Save/Discard Changes** | Standard editing workflow | LOW | Immediate or explicit save with dirty state tracking |
| **Reset to Default** | Users need escape hatch when customizations break | LOW | Per-template reset to builtin values |
| **Import/Export** | Users share/backup customizations, migrate between devices | MED | JSON/YAML format, entire preset or individual templates |
| **Validation Feedback** | Users need to know if syntax is broken | MED | Real-time or on-save validation with error messages |
| **Template Categories/Organization** | 20+ templates = overwhelming without grouping | LOW | Tab/accordion organization by story/service/wizard/image |
| **Variable Documentation** | Users need to know what `{{recentContent}}` means | LOW | Inline tooltips or reference panel showing available variables |
| **Undo/Redo** | Standard text editing expectation | LOW | Built into editor component (Monaco has this) |
| **Modified Indicator** | Users need to know what's customized vs default | LOW | Badge/icon showing modified state per template |
| **Multi-template Management** | Users need to manage all templates as a cohesive set | MED | Preset pack concept already exists in Aventuras |

### Differentiators (Competitive Advantage)

Features that set product apart. Not expected, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Live Macro Preview in Editor** | See macro values inline while editing (reduce context switching) | MED-HIGH | Monaco decorations or inline widgets showing resolved values |
| **Macro Variant Matrix Editor** | Complex macros (mode/POV/tense variants) are hard to edit as text | HIGH | Spreadsheet-like UI for editing all variants at once |
| **Visual Diff for Customizations** | Shows exactly what changed from default (builds user confidence) | MED | Side-by-side or inline diff view when modified |
| **Template Dependency Visualization** | Shows which macros reference other macros (nested expansion) | MED-HIGH | Graph or list view of macro relationships |
| **Context-Aware Variable Suggestions** | Only suggest variables valid for current template context | MED | Filter autocomplete by template category/purpose |
| **Template Testing Playground** | Sandbox for testing templates with mock contexts before applying | HIGH | Separate test view with context builder and live output |
| **Preset Pack Sharing/Discovery** | Community presets, curated collections, one-click install | HIGH | Requires backend/API or file-based sharing protocol |
| **Version History per Template** | See past versions, restore previous edits | MED-HIGH | Local history (like VS Code) or checkpoint system |
| **Template Analytics** | Show which macros are unused, which templates are never applied | MED | Static analysis of template usage in actual stories |
| **Collaborative Editing Hints** | Show examples from popular presets when editing | MED | "Popular variant for this macro" suggestions |
| **Mobile-Optimized Editor** | Most tools are desktop-only, mobile UX is rare | HIGH | Simplified editor for small screens, mobile gesture support |
| **Macro Hover Tooltips in Editor** | Hover `{{macro}}` to see resolved value and definition | MED | Monaco hover provider or custom tooltip logic |
| **Batch Operations** | Reset all in category, export subset, bulk find/replace | MED | Power user feature for managing many templates |
| **Template Linting** | Suggest improvements (unused macros, overly long templates, etc.) | MED-HIGH | Static analysis rules, non-blocking warnings |
| **Autocomplete for Jinja-like Syntax** | If using Jinja syntax (conditionals, loops), autocomplete tags | HIGH | Requires Jinja parser integration, significant scope |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Rich Text Editor for Templates** | "WYSIWYG is easier than markdown/plain text" | AI expects plain text, formatting gets stripped, users confused when preview differs from output | Use plain text with syntax highlighting and clear preview |
| **Drag-and-Drop Template Builder** | "Visual flow editor like n8n/Zapier would be easier" | Templates are text-first, visual builder adds abstraction layer, harder to debug, limited by builder capabilities | Provide good autocomplete and preview instead |
| **AI-Assisted Template Generation** | "Let AI write my prompts for me" | Recursion problem (using AI to prompt AI), unpredictable quality, users don't understand output, hard to debug when broken | Provide examples, presets, and documentation instead |
| **Real-Time Collaborative Editing** | "Multiple users editing same preset simultaneously" | Adds massive complexity (conflict resolution, sync, auth), niche use case (most users solo), sync already exists for push/pull | Use existing network sync for sharing finished presets |
| **Template Marketplace with Ratings** | "Like a plugin store for prompts" | Requires moderation, quality control, backend infrastructure, discoverability problems, versioning nightmare | File-based sharing (GitHub, Discord, forums) with manual curation |
| **Infinite Undo History** | "Never lose any change ever" | Storage bloat, memory issues, complexity for little gain | Limit to reasonable history (20-50 states) or use checkpoints |
| **Per-Story Template Overrides** | "Different templates for each story" | Preset packs already serve this purpose, per-story adds confusing dual-override system (global vs story) | Use preset packs per story, switch packs in wizard |
| **Template Scripting/Code Execution** | "Let me write JS in templates for dynamic logic" | Security nightmare, debugging hell, breaks portability, users shoot themselves in foot | Use macro system with predefined logic, add new builtin macros if needed |

## Feature Dependencies

```
Basic Text Editor
    └──requires──> Save/Discard Changes
                       └──requires──> Modified Indicator

Variable/Macro Insertion
    └──requires──> Variable Documentation
    └──enhances──> Autocomplete for Jinja-like Syntax (if implemented)

Template Preview/Test
    └──requires──> Validation Feedback (to prevent broken previews)
    └──enhances──> Live Macro Preview in Editor

Import/Export
    └──requires──> Multi-template Management (preset packs)

Macro Variant Matrix Editor
    └──requires──> Basic Text Editor
    └──requires──> Variable/Macro Insertion

Template Testing Playground
    └──requires──> Template Preview/Test
    └──requires──> Validation Feedback

Preset Pack Sharing/Discovery
    └──requires──> Import/Export
    └──requires──> Validation Feedback (to prevent sharing broken presets)

Mobile-Optimized Editor
    └──requires──> Basic Text Editor
    └──conflicts──> Complex features (Monaco, split views, large UIs)

Live Macro Preview in Editor
    └──requires──> Template Preview/Test (same expansion logic)
    └──conflicts──> Mobile-Optimized Editor (too complex for small screens)

Version History per Template
    └──requires──> Save/Discard Changes (tracks saves)
    └──enhances──> Reset to Default (restore any version, not just default)

Template Linting
    └──requires──> Validation Feedback (shares error display)
    └──requires──> Template Analytics (for unused macro detection)
```

### Dependency Notes

- **Basic Text Editor is the foundation:** Everything builds on this. Mobile requires simplified version.
- **Preview/Test enables advanced features:** Live preview, testing playground, and validation all share macro expansion logic.
- **Import/Export blocks sharing features:** Can't do preset sharing or discovery without solid import/export.
- **Macro Variant Matrix Editor is independent:** Can be built separately from other features, provides alternative to text editing for complex macros.
- **Mobile optimization conflicts with desktop-first features:** Live preview, Monaco editor, split views, and complex UIs don't translate to mobile. Must choose simplified mobile path or skip mobile editing.

## MVP Recommendation

### Launch With (v1)

Minimum viable editor — what's needed to replace fragmented macro system.

- [x] **Basic Text Editor** — Plain textarea or Monaco with syntax highlighting for `{{macros}}`
- [x] **Variable/Macro Insertion** — Dropdown or button menu to insert `{{macroName}}` tokens
- [x] **Variable Documentation** — Tooltip or sidebar showing what each variable means
- [x] **Template Categories/Organization** — Tab-based navigation (story/service/wizard/image)
- [x] **Save/Discard Changes** — Immediate save with dirty state tracking
- [x] **Modified Indicator** — Badge showing which templates are customized
- [x] **Reset to Default** — Per-template reset button
- [x] **Validation Feedback** — Basic syntax validation (matching braces, unknown macros)
- [x] **Template Preview/Test** — Button to expand template with current story context
- [x] **Import/Export** — Export all presets to JSON, import from JSON
- [x] **Multi-template Management** — Preset pack concept (already exists, needs UI for selection)
- [x] **Undo/Redo** — Built into editor component

**Rationale:** These features enable users to edit templates confidently without breaking their stories. Preview and validation prevent mistakes. Import/export enables sharing and backup. This is feature parity with existing system + unified editor.

### Add After Validation (v1.x)

Features to add once core is working and users provide feedback.

- [ ] **Macro Hover Tooltips in Editor** — Trigger: Users request easier way to see macro values while editing
- [ ] **Visual Diff for Customizations** — Trigger: Users can't remember what they changed
- [ ] **Context-Aware Variable Suggestions** — Trigger: Users insert wrong variables in wrong templates
- [ ] **Batch Operations** — Trigger: Power users request bulk reset/export for specific categories
- [ ] **Template Linting** — Trigger: Common mistakes emerge (unused macros, overly long templates)
- [ ] **Version History per Template** — Trigger: Users request "undo my changes from yesterday"

**Rationale:** These are polish features that improve UX but aren't critical for launch. Add based on observed user pain points rather than speculation.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Live Macro Preview in Editor** — Why defer: High complexity, unclear value without user validation
- [ ] **Macro Variant Matrix Editor** — Why defer: Complex UI, only benefits users with many custom complex macros
- [ ] **Template Testing Playground** — Why defer: Nice-to-have, preview feature is usually sufficient
- [ ] **Template Dependency Visualization** — Why defer: Only useful for power users with deeply nested macros
- [ ] **Preset Pack Sharing/Discovery** — Why defer: Requires ecosystem/community, premature without user base
- [ ] **Template Analytics** — Why defer: Low priority, manual inspection is sufficient for now
- [ ] **Collaborative Editing Hints** — Why defer: Requires preset database and analysis infrastructure
- [ ] **Mobile-Optimized Editor** — Why defer: Desktop-first, mobile editing is rare use case, read-only mobile is fine
- [ ] **Autocomplete for Jinja-like Syntax** — Why defer: Only relevant if Jinja-like conditionals/loops are added to macro system

**Rationale:** These are speculative features. Build only if users specifically request them. Focus on core editor quality first.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Basic Text Editor | HIGH | LOW | P1 |
| Variable/Macro Insertion | HIGH | LOW | P1 |
| Variable Documentation | HIGH | LOW | P1 |
| Template Preview/Test | HIGH | MEDIUM | P1 |
| Validation Feedback | HIGH | MEDIUM | P1 |
| Save/Discard Changes | HIGH | LOW | P1 |
| Modified Indicator | MEDIUM | LOW | P1 |
| Reset to Default | HIGH | LOW | P1 |
| Template Categories/Organization | HIGH | LOW | P1 |
| Import/Export | HIGH | MEDIUM | P1 |
| Multi-template Management | HIGH | MEDIUM | P1 |
| Undo/Redo | MEDIUM | LOW | P1 |
| Macro Hover Tooltips | MEDIUM | MEDIUM | P2 |
| Visual Diff for Customizations | MEDIUM | MEDIUM | P2 |
| Context-Aware Variable Suggestions | MEDIUM | MEDIUM | P2 |
| Batch Operations | LOW | MEDIUM | P2 |
| Template Linting | MEDIUM | MEDIUM-HIGH | P2 |
| Version History per Template | LOW | MEDIUM-HIGH | P2 |
| Live Macro Preview in Editor | MEDIUM | HIGH | P3 |
| Macro Variant Matrix Editor | LOW | HIGH | P3 |
| Template Testing Playground | LOW | HIGH | P3 |
| Template Dependency Visualization | LOW | MEDIUM-HIGH | P3 |
| Preset Pack Sharing/Discovery | LOW | HIGH | P3 |
| Template Analytics | LOW | MEDIUM | P3 |
| Collaborative Editing Hints | LOW | MEDIUM-HIGH | P3 |
| Mobile-Optimized Editor | LOW | HIGH | P3 |
| Autocomplete for Jinja-like Syntax | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch — core editor functionality
- P2: Should have, add when possible — improves UX based on user feedback
- P3: Nice to have, future consideration — speculative or niche features

## Competitor Feature Analysis

Based on training data knowledge of SillyTavern, KoboldAI, NovelAI, and text-generation-webui.

| Feature | SillyTavern | KoboldAI | NovelAI | text-gen-webui | Aventuras Approach |
|---------|-------------|----------|---------|----------------|-------------------|
| **Template Editor** | Plain textarea, basic | HTML form fields | Not user-editable | Jinja2 templates in files | Monaco/textarea with syntax highlighting |
| **Macro/Variable System** | `{{char}}`, `{{user}}`, etc. | Limited placeholders | N/A (fixed prompts) | Jinja2 full syntax | `{{macro}}` with builtin + custom |
| **Macro Preview** | None (blind editing) | None | N/A | None (file-based) | Template preview with context |
| **Variant Management** | Manual text duplication | N/A | N/A | Jinja2 conditionals | Builtin complex macros with variant editor |
| **Preset Import/Export** | JSON character cards | JSON presets | Scenario files (proprietary) | Manual file copying | JSON preset packs |
| **Validation** | None (breaks silently) | None | N/A | Python errors at runtime | Real-time syntax validation |
| **Documentation** | External wiki, tooltips | Minimal | Official docs (not in-app) | README files | In-app variable reference |
| **Mobile Support** | Basic mobile web UI | Desktop-only | Mobile app (limited editing) | Desktop-only | Mobile-first design (but editing TBD) |
| **Community Sharing** | Discord, Reddit, GitHub | Community boards | Official content (paid) | GitHub repos | File-based sharing initially |
| **Template Testing** | None (test in actual chat) | None | N/A (no user templates) | None (restart server) | In-app preview with test context |
| **Macro Autocomplete** | None | None | N/A | VSCode if editing files | Dropdown insertion menu |
| **Visual Diff** | None | None | N/A | Git if using version control | Planned for v1.x |
| **Undo/Redo** | Browser default | Browser default | N/A | Editor default | Built into Monaco or textarea |

**Key Insights:**

1. **SillyTavern is the gold standard for macro systems** — Simple `{{placeholder}}` syntax, extensive builtin macros, but editing UX is poor (plain textareas, no preview, no validation).

2. **KoboldAI has minimal customization** — Focus is on model selection, not prompt engineering. Limited template editing.

3. **NovelAI doesn't expose templates** — Prompts are internal, users configure via UI options. Not directly comparable.

4. **text-generation-webui uses Jinja2** — Powerful but requires file editing, no in-app UI. Power users only.

5. **None have good preview/validation** — Users edit blind, test by running actual generation, very slow feedback loop.

6. **Aventuras can differentiate with UX** — Real-time validation, in-app preview, visual diff, and mobile-first design are all unique in this space.

7. **Community sharing is ad-hoc everywhere** — Discord, Reddit, GitHub. No built-in marketplace exists. File-based sharing is standard.

8. **Macro autocomplete is rare** — Most tools require memorizing syntax or consulting external docs. Dropdown insertion is a quick win.

## Feature Implementation Notes

### Mobile-First Constraint

Aventuras is mobile-first (Tauri + Android). This impacts editor design:

- **Monaco Editor:** Desktop-class, may be sluggish on mobile. Consider fallback to plain textarea with autocomplete.
- **Split Views:** Side-by-side diff/preview is desktop-only. Use modal or bottom sheet on mobile.
- **Complex UIs:** Macro variant matrix, dependency graphs, testing playground — likely desktop-only or skip entirely.
- **Touch Gestures:** Swipe to navigate templates, long-press for context menu, tap to insert macro.
- **Simplified Mobile Mode:** Consider read-only templates on mobile, edit on desktop via network sync.

**Recommendation:** Build desktop editor first (easier), then adapt for mobile. Determine if mobile editing is critical or if read-only + network sync is sufficient.

### Preset Pack Architecture

Aventuras already has the concept of "preset packs" (wizard context mentioned). Extend this to templates:

- **Preset Pack = Bundle of Templates + Custom Variable Definitions**
- **Selected per story in wizard**
- **Stored in Vault tab** (existing UI location)
- **Import/Export as single JSON file**
- **Builtin preset packs** ship with app (Default, SillyTavern-like, NovelAI-like, etc.)
- **User-created preset packs** saved locally, shareable via file

This aligns with existing architecture and avoids per-story template overrides (anti-feature).

### Variable Autocomplete UX Patterns

Based on common editor patterns:

1. **Dropdown Menu:** Button that opens menu of available macros, click to insert. Simple, mobile-friendly.
2. **Trigger Character:** Type `{{` and autocomplete suggests macros. Fast for desktop power users, awkward on mobile.
3. **Slash Commands:** Type `/` to open command palette with macro insertion. Discord/Slack-like UX.
4. **Dedicated Panel:** Sidebar with draggable macro chips, drag-and-drop into editor. Visual but requires mouse/touch precision.

**Recommendation:** Dropdown menu for MVP (simple, universal). Add trigger character autocomplete for desktop in v1.x.

### Template Validation Approaches

1. **Syntax Validation:** Check for malformed `{{macros}}` (unmatched braces, invalid characters). Real-time or on-save.
2. **Semantic Validation:** Check for unknown macros, macros used in wrong context (e.g., story-only macro in wizard template). On-save or on-demand.
3. **Runtime Validation:** Expand template with test context, catch errors during expansion. On-demand (preview button).

**Recommendation:** Syntax (real-time) + semantic (on-save) + runtime (on-demand preview). Layered validation catches errors early.

### Import/Export Format

**Preset Pack JSON Structure:**

```json
{
  "id": "user-preset-123",
  "name": "My Custom Preset",
  "description": "Optimized for mystery stories with detailed descriptions",
  "version": "1.0.0",
  "createdAt": "2026-02-08T12:00:00Z",
  "author": "Username",
  "customMacros": [
    {
      "id": "customGreeting",
      "name": "Custom Greeting",
      "token": "customGreeting",
      "type": "simple",
      "defaultValue": "Greetings, traveler!",
      "description": "Opening greeting for NPCs"
    }
  ],
  "templateOverrides": [
    {
      "templateId": "adventure",
      "content": "Modified adventure template content with {{customGreeting}}..."
    }
  ],
  "macroOverrides": [
    {
      "macroId": "styleInstruction",
      "variantOverrides": [
        {
          "key": { "mode": "adventure", "pov": "second" },
          "content": "Custom style instructions..."
        }
      ]
    }
  ]
}
```

**Compatibility:**
- **Import from SillyTavern character cards:** Extract character description, scenario, example messages → convert to Aventuras lorebook + wizard context. Templates stay Aventuras-specific.
- **Export to generic JSON:** Allows users to version control presets in Git, share on forums.

**Recommendation:** Start with Aventuras-specific JSON. Add SillyTavern import as v1.x feature (already some import logic exists based on README).

## Sources

**Confidence Level:** MEDIUM — Based on training data knowledge and Aventuras codebase analysis. Web tools were unavailable, so competitor feature details are from training data (potentially outdated). Core feature categorization and prioritization are informed by general prompt engineering tool patterns.

### Codebase Analysis (HIGH confidence)
- `C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/macros.ts` — Existing macro engine with simple/complex macro types, variant resolution, override system
- `C:/Users/Admin/Projects/Aventuras/src/lib/services/prompts/types.ts` — Type definitions for macros, templates, context, overrides
- `C:/Users/Admin/Projects/Aventuras/src/lib/components/settings/tabs/prompts.svelte` — Existing prompt editing UI (partial implementation visible)
- `C:/Users/Admin/Projects/Aventuras/README.md` — Mobile-first design (Tauri + Android), SillyTavern import support mentioned

### Training Data (MEDIUM confidence, potentially outdated)
- SillyTavern macro system (`{{char}}`, `{{user}}`, etc.) — Text-based substitution, community preset sharing via Discord/GitHub
- KoboldAI prompt customization — HTML form-based, limited macro support
- NovelAI — Internal prompt system, not user-editable
- text-generation-webui — Jinja2 templates, file-based editing, no in-app UI
- General prompt engineering tool patterns (PromptBase, LangChain Hub, etc.) — Import/export, preview, validation, sharing

### Gaps Identified
- **Specific competitor feature updates (2025-2026):** Web tools unavailable, may have new features not reflected in training data
- **Mobile template editor UX patterns:** Limited prior art, most AI tools are desktop-only
- **Jinja-like template syntax in Aventuras:** Unclear if conditional/loop syntax is planned or just `{{macro}}` substitution
- **Preset pack UI location/workflow:** Mentioned in context but not fully detailed in codebase

**Recommendation:** Validate competitor feature matrix with manual testing of SillyTavern, KoboldAI, and text-generation-webui before finalizing roadmap.

---

*Feature research for: Prompt Template Editing Systems (Aventuras AI Interactive Fiction)*
*Researched: 2026-02-08*
*Research Mode: Ecosystem — Feature landscape for existing domain*
