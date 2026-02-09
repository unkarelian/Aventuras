# Roadmap: Aventuras Prompt System Rework

## Overview

Replace Aventuras' fragmented dual-engine prompt system (MacroEngine + placeholders) with a unified Jinja-like template system. Build from the foundation up: establish a safe template engine, create preset pack infrastructure for storage and management, migrate all services to a unified context pipeline, deliver a full-featured prompt editor in the Vault, add import/export and wizard integration, then clean up the legacy system. This rework touches template resolution, database schema, service architecture, vault UI, and wizard steps.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Template Engine Foundation** - Build and validate core template engine
- [x] **Phase 2: Preset Pack System & Database** - Create pack storage and management infrastructure
- [ ] **Phase 3: Context System & Service Integration** - Unify service prompt generation pipeline
- [ ] **Phase 4: Vault UI & Prompt Editor** - Build user-facing editor and vault integration
- [ ] **Phase 5: Import/Export & Variable Discovery** - Enable pack sharing and wizard configuration
- [ ] **Phase 6: Legacy System Cleanup** - Remove old MacroEngine and placeholder system

## Phase Details

### Phase 1: Template Engine Foundation
**Goal**: Template rendering works correctly, safely, and predictably through one pipeline
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, ENG-07, ENG-08, ENG-09, ENG-10
**Success Criteria** (what must be TRUE):
  1. Template engine resolves {{ variable }} syntax in one pass against a unified context object
  2. Templates support Liquid conditionals (if/elsif/else/endif) without errors
  3. Templates support Liquid filters provided by LiquidJS out of the box
  4. Unknown variables in templates produce clear error messages (not silent failure)
  5. Circular variable references are detected and reported with descriptive errors
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md -- Install LiquidJS, create types, engine wrapper, and variable registry
- [x] 01-02-PLAN.md -- Create template validator and public API barrel

### Phase 2: Preset Pack System & Database
**Goal**: Preset packs can be created, stored, loaded, and validated
**Depends on**: Phase 1
**Requirements**: PKG-01, PKG-02, PKG-06, PKG-07, VAR-01, VAR-02, VAR-03
**Success Criteria** (what must be TRUE):
  1. Preset pack bundles all prompt templates and custom variable definitions into a single unit
  2. App ships with a default preset pack containing all current prompt templates
  3. Preset packs are stored in SQLite database with versioned schema
  4. Custom variables can be defined per pack with name, type (text/enum/number/boolean), default value, and required flag
  5. For enum variables, available options are stored and loaded correctly
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- Define pack types and create SQLite migration with default pack seeding
- [x] 02-02-PLAN.md -- Extend DatabaseService with pack CRUD operations
- [x] 02-03-PLAN.md -- Build pack service layer, Zod validation, and public API barrel

### Phase 3: Context System & Service Integration
**Goal**: All services generate prompts through a unified pipeline
**Depends on**: Phase 2
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, SVC-06, SVC-07, SVC-08, SVC-09, SVC-10, SVC-11, SVC-12
**Success Criteria** (what must be TRUE):
  1. ContextBuilder builds one unified context object from system state, runtime data, and custom variables
  2. Services provide runtime data to ContextBuilder (not directly to templates)
  3. NarrativeService, SuggestionsService, ActionChoicesService all generate prompts through new unified pipeline
  4. ClassifierService, MemoryService, wizard services use new pipeline
  5. StyleReviewerService, LoreManagementService, image prompt services, translation services use new pipeline
**Plans**: 6 plans

Plans:
- [ ] 03-01-PLAN.md -- Create ContextBuilder core with types, runtime variable registry, and builder API
- [ ] 03-02-PLAN.md -- Convert all prompt templates from MacroEngine syntax to Liquid syntax
- [ ] 03-03-PLAN.md -- Migrate core generation services (Narrative, Suggestions, ActionChoices, Classifier)
- [ ] 03-04-PLAN.md -- Migrate support services (Memory, StyleReviewer, lorebook, retrieval)
- [ ] 03-05-PLAN.md -- Migrate wizard, translation, and image services
- [ ] 03-06-PLAN.md -- Delete old PromptService, MacroEngine, systemBuilder, and macro definitions

### Phase 4: Vault UI & Prompt Editor
**Goal**: Users can view, edit, create, and manage prompt preset packs
**Depends on**: Phase 3
**Requirements**: VLT-01, VLT-02, VLT-03, VLT-04, VLT-05, VLT-06, VLT-07, EDT-01, EDT-02, EDT-03, EDT-04, EDT-05, EDT-06, EDT-07, EDT-08, EDT-09, EDT-10, EDT-11, EDT-12, VAR-04, PKG-03
**Success Criteria** (what must be TRUE):
  1. Vault has a Prompts tab showing cards for each preset pack with Import and New buttons
  2. Clicking a preset card opens editor view with left panel (grouped template list + Variables tab) and right panel (editor)
  3. User can edit any template with syntax highlighting for Liquid syntax
  4. Editor has mobile-friendly bottom toolbar for inserting variables and conditionals
  5. User can preview templates with sample context, see real-time validation feedback, save/discard changes
  6. User can reset any template to default and see which templates are modified
  7. Editor supports undo/redo and works on 768px mobile breakpoint without hover-dependent interactions
  8. User can manage custom variables through Variables tab in editor
  9. User can create a new preset pack (copies defaults as starting point)
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD
- [ ] 04-04: TBD
- [ ] 04-05: TBD

### Phase 5: Import/Export & Variable Discovery
**Goal**: Users can share preset packs and configure custom variables in wizard
**Depends on**: Phase 4
**Requirements**: PKG-04, PKG-05, PKG-08, VAR-05, VAR-06, VAR-07, VAR-08
**Success Criteria** (what must be TRUE):
  1. User can export a preset pack as a file
  2. User can import a preset pack from a file with validation before applying
  3. User can select which preset pack to use in the story creation wizard
  4. Wizard auto-discovers custom variables by scanning active preset's templates
  5. Wizard generates appropriate UI controls per variable type (text field, dropdown, toggle, number input)
  6. User configures custom variables per-story in a wizard step
  7. Custom variable values are stored per-story and used in template resolution
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

### Phase 6: Legacy System Cleanup
**Goal**: Old prompt system is completely removed from codebase
**Depends on**: Phase 5
**Requirements**: CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, CLN-07, CLN-08
**Success Criteria** (what must be TRUE):
  1. Old MacroEngine class is deleted
  2. Old PromptService is deleted and replaced with new unified service
  3. Old macro definitions directory and placeholder definitions are deleted
  4. Old prompt editor UI components are deleted and replaced
  5. Old systemBuilder.ts is deleted and replaced
  6. Old template override system in settings is removed
  7. All existing prompt templates are rewritten in Liquid syntax and stored in new system
  8. No references to old macro or placeholder system remain in codebase
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Template Engine Foundation | 2/2 | Complete | 2026-02-08 |
| 2. Preset Pack System & Database | 3/3 | Complete | 2026-02-09 |
| 3. Context System & Service Integration | 0/6 | Planned | - |
| 4. Vault UI & Prompt Editor | 0/TBD | Not started | - |
| 5. Import/Export & Variable Discovery | 0/TBD | Not started | - |
| 6. Legacy System Cleanup | 0/TBD | Not started | - |
