# Requirements: Aventuras Prompt System Rework

**Defined:** 2026-02-08
**Core Value:** Every {{ variable }} in every prompt template resolves correctly, predictably, through one pipeline — and users can create, edit, and share prompt presets without fighting the system.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Template Engine

- [x] **ENG-01**: Template engine uses LiquidJS with default configuration (no heavy customization)
- [x] **ENG-02**: All templates use Liquid syntax for variable substitution ({{ variable }})
- [x] **ENG-03**: Templates support Liquid conditionals ({% if %}, {% elsif %}, {% else %}, {% endif %})
- [x] **ENG-04**: Templates support Liquid filters as provided by LiquidJS out of the box
- [x] **ENG-05**: Template resolution happens in one pass against one unified context object
- [x] **ENG-06**: Three variable categories exist: system (auto-filled), runtime (service-injected), custom (user-defined)
- [x] **ENG-07**: All variables have a type: text, enum, number, or boolean
- [x] **ENG-08**: Template engine is sandboxed — no arbitrary code execution from user-editable templates
- [x] **ENG-09**: Unknown variables in templates produce clear error feedback (not silent failure)
- [x] **ENG-10**: Circular variable references are detected and reported with clear error messages

### Prompt Editor

- [ ] **EDT-01**: User can edit any prompt template through an in-app text editor
- [ ] **EDT-02**: Editor provides syntax highlighting for Liquid template syntax
- [ ] **EDT-03**: Editor has a bottom toolbar for inserting variables (categorized picker, mobile-friendly)
- [ ] **EDT-04**: Editor has a bottom toolbar for inserting variables (mobile-friendly) — *conditionals insertion removed per user decision: users type conditionals manually with syntax highlighting support*
- [ ] **EDT-05**: User can preview a template expanded with current/sample context
- [ ] **EDT-06**: Editor shows real-time validation feedback (syntax errors, unknown variables)
- [ ] **EDT-07**: User can save changes to a template
- [ ] **EDT-08**: User can discard unsaved changes to a template
- [ ] **EDT-09**: User can reset any template to its default content
- [ ] **EDT-10**: Editor shows which templates have been modified from defaults
- [ ] **EDT-11**: Editor supports undo/redo
- [ ] **EDT-12**: Editor is mobile-first — works on 768px breakpoint, no hover-dependent interactions

### Preset Pack System

- [x] **PKG-01**: A preset pack bundles all prompt templates and custom variable definitions
- [x] **PKG-02**: App ships with a default preset pack containing all current prompt templates
- [ ] **PKG-03**: User can create a new preset pack (copies defaults as starting point)
- [ ] **PKG-04**: User can export a preset pack as a file
- [ ] **PKG-05**: User can import a preset pack from a file
- [x] **PKG-06**: Imported presets are validated before applying
- [x] **PKG-07**: Preset export format is versioned for forward compatibility
- [ ] **PKG-08**: User can select which preset pack to use for a story in the creation wizard

### Vault Integration

- [ ] **VLT-01**: Vault has a Prompts tab alongside Characters, Lorebooks, and Scenarios
- [ ] **VLT-02**: Prompts tab shows cards for each preset pack
- [ ] **VLT-03**: Prompts tab has Import and New buttons in top right
- [ ] **VLT-04**: Clicking a preset card replaces the vault search area with the editor view (not a modal)
- [ ] **VLT-05**: Editor view has left panel: grouped template list + Variables tab
- [ ] **VLT-06**: Editor view has right panel: editor for selected template or variable manager
- [ ] **VLT-07**: Templates are grouped by function (Story Generation, Analysis, Memory, Wizard, Image, etc.)

### Custom Variables

- [x] **VAR-01**: User can define custom variables per preset pack
- [x] **VAR-02**: Custom variable definition includes: name, type (text/enum/number/boolean), default value or required flag
- [x] **VAR-03**: For enum type, user defines the available options
- [ ] **VAR-04**: Custom variables are managed through the Variables tab in the editor
- [ ] **VAR-05**: Wizard auto-discovers custom variables by scanning active preset's templates
- [ ] **VAR-06**: Wizard generates appropriate UI controls per variable type (text field, dropdown, toggle, number input)
- [ ] **VAR-07**: Custom variables are configured per-story in a wizard step
- [ ] **VAR-08**: Custom variable values are stored per-story and used in template resolution

### Service Pipeline

- [x] **SVC-01**: A ContextBuilder builds one unified context object from system state, runtime data, and custom variable values
- [x] **SVC-02**: Services provide runtime data to ContextBuilder (not directly to templates)
- [x] **SVC-03**: NarrativeService uses the new unified pipeline for prompt generation
- [x] **SVC-04**: SuggestionsService uses the new unified pipeline
- [x] **SVC-05**: ActionChoicesService uses the new unified pipeline
- [x] **SVC-06**: ClassifierService uses the new unified pipeline
- [x] **SVC-07**: MemoryService uses the new unified pipeline
- [x] **SVC-08**: All wizard services use the new unified pipeline
- [x] **SVC-09**: StyleReviewerService uses the new unified pipeline
- [x] **SVC-10**: LoreManagementService uses the new unified pipeline
- [x] **SVC-11**: Image prompt services use the new unified pipeline
- [x] **SVC-12**: Translation services use the new unified pipeline

### Legacy Cleanup

- [ ] **CLN-01**: Old MacroEngine class is deleted
- [ ] **CLN-02**: Old PromptService is deleted and replaced
- [ ] **CLN-03**: Old macro definitions directory is deleted
- [ ] **CLN-04**: Old placeholder definitions are deleted
- [ ] **CLN-05**: Old prompt editor UI components are deleted and replaced
- [ ] **CLN-06**: Old systemBuilder.ts is deleted and replaced
- [ ] **CLN-07**: Old template override system in settings is removed
- [ ] **CLN-08**: All existing prompt templates are rewritten in Liquid syntax

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Editor Enhancements

- **EDT-V2-01**: Live macro preview showing resolved values inline while editing
- **EDT-V2-02**: Visual diff showing changes from default when template is modified
- **EDT-V2-03**: Context-aware variable suggestions (only suggest variables valid for current template)
- **EDT-V2-04**: Template linting (unused variables, overly long templates)
- **EDT-V2-05**: Version history per template with restore

### Advanced Features

- **ADV-V2-01**: Template testing playground with mock context builder
- **ADV-V2-02**: Batch operations (reset category, bulk find/replace)
- **ADV-V2-03**: Template analytics (unused macros, never-applied templates)
- **ADV-V2-04**: Preset pack sharing/discovery (community presets)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Rich text editor for templates | AI expects plain text, formatting gets stripped |
| Drag-and-drop template builder | Templates are text-first, visual builder adds abstraction |
| AI-assisted template generation | Recursion problem (AI writing prompts for AI) |
| Real-time collaborative editing | Single-user desktop app, massive complexity |
| Template marketplace with ratings | Requires backend infrastructure, premature |
| Per-story template overrides | Preset packs serve this purpose, dual-override is confusing |
| Template scripting/code execution | Security nightmare, breaks portability |
| Backward compatibility with old overrides | Clean slate rework, old overrides wiped |
| Heavy LiquidJS customization | Use default library behavior, keep it simple |
| Template inheritance (extends/blocks) | Over-engineering for prompt use case |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Complete |
| ENG-02 | Phase 1 | Complete |
| ENG-03 | Phase 1 | Complete |
| ENG-04 | Phase 1 | Complete |
| ENG-05 | Phase 1 | Complete |
| ENG-06 | Phase 1 | Complete |
| ENG-07 | Phase 1 | Complete |
| ENG-08 | Phase 1 | Complete |
| ENG-09 | Phase 1 | Complete |
| ENG-10 | Phase 1 | Complete |
| EDT-01 | Phase 4 | Pending |
| EDT-02 | Phase 4 | Pending |
| EDT-03 | Phase 4 | Pending |
| EDT-04 | Phase 4 | Pending |
| EDT-05 | Phase 4 | Pending |
| EDT-06 | Phase 4 | Pending |
| EDT-07 | Phase 4 | Pending |
| EDT-08 | Phase 4 | Pending |
| EDT-09 | Phase 4 | Pending |
| EDT-10 | Phase 4 | Pending |
| EDT-11 | Phase 4 | Pending |
| EDT-12 | Phase 4 | Pending |
| PKG-01 | Phase 2 | Complete |
| PKG-02 | Phase 2 | Complete |
| PKG-03 | Phase 4 | Pending |
| PKG-04 | Phase 5 | Pending |
| PKG-05 | Phase 5 | Pending |
| PKG-06 | Phase 2 | Complete |
| PKG-07 | Phase 2 | Complete |
| PKG-08 | Phase 5 | Pending |
| VLT-01 | Phase 4 | Pending |
| VLT-02 | Phase 4 | Pending |
| VLT-03 | Phase 4 | Pending |
| VLT-04 | Phase 4 | Pending |
| VLT-05 | Phase 4 | Pending |
| VLT-06 | Phase 4 | Pending |
| VLT-07 | Phase 4 | Pending |
| VAR-01 | Phase 2 | Complete |
| VAR-02 | Phase 2 | Complete |
| VAR-03 | Phase 2 | Complete |
| VAR-04 | Phase 4 | Pending |
| VAR-05 | Phase 5 | Pending |
| VAR-06 | Phase 5 | Pending |
| VAR-07 | Phase 5 | Pending |
| VAR-08 | Phase 5 | Pending |
| SVC-01 | Phase 3 | Complete |
| SVC-02 | Phase 3 | Complete |
| SVC-03 | Phase 3 | Complete |
| SVC-04 | Phase 3 | Complete |
| SVC-05 | Phase 3 | Complete |
| SVC-06 | Phase 3 | Complete |
| SVC-07 | Phase 3 | Complete |
| SVC-08 | Phase 3 | Complete |
| SVC-09 | Phase 3 | Complete |
| SVC-10 | Phase 3 | Complete |
| SVC-11 | Phase 3 | Complete |
| SVC-12 | Phase 3 | Complete |
| CLN-01 | Phase 6 | Pending |
| CLN-02 | Phase 6 | Pending |
| CLN-03 | Phase 6 | Pending |
| CLN-04 | Phase 6 | Pending |
| CLN-05 | Phase 6 | Pending |
| CLN-06 | Phase 6 | Pending |
| CLN-07 | Phase 6 | Pending |
| CLN-08 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 65 total
- Mapped to phases: 65
- Unmapped: 0

---
*Requirements defined: 2026-02-08*
*Last updated: 2026-02-12 — EDT-04 revised per user decision (no conditional insertion tool)*
