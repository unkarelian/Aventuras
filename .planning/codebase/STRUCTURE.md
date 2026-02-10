# Codebase Structure

**Analysis Date:** 2026-02-08

## Directory Layout

```
Aventuras/
├── src/                           # Application source
│   ├── lib/                       # SvelteKit library (bundled code)
│   │   ├── components/            # UI components (Svelte)
│   │   ├── constants/             # Application constants
│   │   ├── hooks/                 # Custom Svelte hooks
│   │   ├── services/              # Business logic and AI services
│   │   ├── stores/                # Reactive state stores (Svelte 5 runes)
│   │   ├── types/                 # TypeScript type definitions
│   │   └── utils/                 # Utility functions
│   ├── routes/                    # SvelteKit route pages (filesystem routing)
│   └── app.css                    # Global styles
├── themes/                        # Tailwind CSS theme configuration
├── scripts/                       # Build and utility scripts
├── src-tauri/                     # Tauri desktop application config
├── package.json                   # NPM dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── svelte.config.js               # SvelteKit configuration
└── vite.config.ts                 # Vite build configuration
```

## Directory Purposes

**src/lib/components/:**
- Purpose: All Svelte UI components organized by feature domain
- Contains: `.svelte` component files with embedded scripts and styles
- Key subdirectories:
  - `layout/` - Main app layout (AppShell, Header, Sidebar, ProfileWarningBanner)
  - `story/` - Story viewing and input (StoryView, StoryEntry, StreamingEntry, ActionInput, ActionChoices)
  - `memory/` - Memory management UI (MemoryView, ChapterCard, ResummarizeModal, ManualChapterModal)
  - `lorebook/` - Lorebook management (LorebookView, LorebookEntryForm, LorebookImportModal, LorebookExportModal)
  - `settings/` - Configuration panels (ModelSelector, AdvancedSettings, AgentProfiles, ImageModelSelect, tabs/)
  - `ui/` - Reusable UI component library (Button, Input, Modal, Dialog, etc. - bits-ui wrapper)
  - `wizard/` - Multi-step creation wizard (character, setting, narrative, image)
  - `vault/` - Asset library browser (CharacterVault, LorebookVault, ScenarioVault)
  - `world/` - World state entity UI (Character, Location, Item editors)
  - `branch/` - Story branching UI (BranchPanel)
  - `debug/` - Developer debugging tools (DebugLogView, LorebookDebugPanel)
  - `prompts/` - Prompt and macro editing (PromptEditor, MacroEditor, PlaceholderInfo)
  - `discovery/` - Discovery mode UI (DiscoveryCard, DiscoveryModal)
  - `sync/` - Sync modal for data exports
  - `tags/` - Tag management
  - `intro/` - Onboarding (WelcomeScreen)

**src/lib/services/:**
- Purpose: All business logic, AI operations, and data persistence
- Contains: TypeScript modules (`.ts` files only, no components)
- Key structure:
  - `ai/` - AI generation services (core intelligence of the app)
    - `core/` - Core abstractions (factory, config, types, request overrides)
    - `generation/` - AI services: NarrativeService, ClassifierService, MemoryService, etc.
    - `image/` - Image generation (InlineImageService, BackgroundImageService, providers)
    - `lorebook/` - Lorebook-specific AI (LoreManagementService, InteractiveLorebookService)
    - `retrieval/` - Context retrieval (EntryRetrievalService, AgenticRetrievalService, TimelineFillService)
    - `sdk/` - Vercel AI SDK wrapper and middleware
      - `providers/` - Provider implementations (OpenAI, Anthropic, OpenRouter, local, etc.)
      - `schemas/` - Zod schemas for structured outputs
      - `middleware/` - Response processing (JSON extraction, logging, patching)
      - `agents/` - Agentic AI behaviors
      - `tools/` - Tool definitions for AI use
    - `prompts/` - System prompt building and macro expansion
    - `utils/` - Helper services (TranslationService, etc.)
    - `wizard/` - Scenario/character generation wizard AI services
  - `database.ts` - SQLite database layer (2599 lines, handles all persistence)
  - `events.ts` - Event bus for inter-module communication
  - `export.ts` - Story export to Markdown/Word/ePub
  - `characterCardImporter.ts` - Character card import (.png format)
  - `lorebookImporter.ts` - Lorebook import from various formats
  - `lorebookExporter.ts` - Lorebook export
  - `imageExport.ts` - Image export utilities
  - `promptExport.ts` - Prompt export/import
  - `grammar.ts` - Grammar checking service (Harper.js)
  - `tokenizer.ts` - Token counting (GPT tokenizer)
  - `sync.ts` - Data synchronization
  - `templates.ts` - Story template management
  - `updater.ts` - App update checking (Tauri)
  - `discovery/` - Fandom data discovery
  - `export/` - Export format handlers
  - `fandom/` - Fandom API integration
  - `generation/` - Character/setting generation (via AI wizard)
  - `image/` - Image utilities (non-AI: image parsing, manipulation)
  - `lorebook/` - Lorebook utilities
  - `prompts/` - Prompt system and definitions

**src/lib/stores/:**
- Purpose: Reactive state stores using Svelte 5 runes
- Contains: `.svelte.ts` files only (special Svelte files)
- Key files:
  - `story.svelte.ts` - Story content and world state (entries, characters, locations, items, branches, memory chapters)
  - `settings.svelte.ts` - User settings and configurations (API profiles, generation presets, UI preferences)
  - `ui.svelte.ts` - UI state (sidebar visibility, active modals, selected tabs)
  - `tags.svelte.ts` - Story tags management
  - `characterVault.svelte.ts` - Character library/vault
  - `lorebookVault.svelte.ts` - Lorebook library/vault
  - `scenarioVault.svelte.ts` - Scenario library/vault
  - `wizard/` - Multi-step wizard state
    - `wizard.svelte.ts` - Main wizard controller
    - `characterStore.svelte.ts` - Character creation state
    - `imageStore.svelte.ts` - Image generation state
    - `narrativeStore.svelte.ts` - Narrative/story creation state
    - `settingStore.svelte.ts` - Setting/world creation state

**src/lib/types/:**
- Purpose: Shared TypeScript type definitions
- Contains: `.ts` files with type-only exports
- Key files:
  - `index.ts` - Core entity types (Story, StoryEntry, Character, Location, Item, Chapter, Branch, MemoryConfig, etc.)
  - `sync.ts` - Sync operation types

**src/lib/utils/:**
- Purpose: Utility functions and helpers
- Contains: `.ts` files with pure functions
- Files:
  - `async.ts` - Async/promise utilities
  - `cn.ts` - Class name merging (clsx wrapper)
  - `cssScope.ts` - CSS scoping utilities
  - `fontDetection.ts` - Font availability detection
  - `htmlSanitize.ts` - HTML sanitization
  - `htmlStreaming.ts` - HTML streaming utilities for response parsing
  - `image.ts` - Image utilities (resizing, format conversion)
  - `inlineImageParser.ts` - Parse inline image references from text
  - `markdown.ts` - Markdown parsing and rendering
  - `swipe.ts` - Mobile swipe gesture detection
  - `visualDescriptors.ts` - Character appearance descriptor handling

**src/lib/constants/:**
- Purpose: Hardcoded configuration values
- Files:
  - `layout.ts` - UI layout constants (MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, etc.)
  - `timeout.ts` - Timeout values for LLM operations

**src/lib/hooks/:**
- Purpose: Custom Svelte hooks (reactive utilities)
- Files:
  - `is-mobile.svelte.ts` - Media query hook for responsive breakpoint (768px)

**src/routes/:**
- Purpose: SvelteKit filesystem-based routing
- Files:
  - `+layout.svelte` - Root layout (CSS import, Toast component)
  - `+layout.ts` - Root layout server load
  - `+page.svelte` - Home page (main app initialization and routing)
  - `debug/+page.svelte` - Debug utilities page (optional development route)

**themes/:**
- Purpose: Tailwind CSS color themes
- Contains: Theme definitions (light/dark mode colors)

**scripts/:**
- Purpose: Build and development scripts
- Files:
  - `release.js` - Release/version bump script

**src-tauri/:**
- Purpose: Tauri desktop application configuration
- Contains: Tauri-specific config, icons, build settings

## Key File Locations

**Entry Points:**
- `src/routes/+page.svelte` - Application root (initialization, provider setup check, first-run)
- `src/routes/+layout.svelte` - Layout wrapper (CSS, toasts)
- `src/lib/components/layout/AppShell.svelte` - Main app container after initialization

**Configuration:**
- `src/lib/services/database.ts` - Database schema and initialization
- `src/lib/stores/settings.svelte.ts` - Application settings state
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript compiler options
- `tailwind.config.ts` - Tailwind CSS color/spacing configuration
- `svelte.config.js` - SvelteKit adapter and preprocessor config
- `vite.config.ts` - Build tool configuration

**Core Logic:**
- `src/lib/services/ai/generation/NarrativeService.ts` - Story generation (core narrative AI)
- `src/lib/services/ai/generation/ClassifierService.ts` - World state extraction from narrative
- `src/lib/services/ai/generation/MemoryService.ts` - Automatic chapter summarization
- `src/lib/services/ai/retrieval/EntryRetrievalService.ts` - Retrieve relevant context for generation
- `src/lib/services/ai/generation/ContextBuilder.ts` - Assemble world state context blocks
- `src/lib/stores/story.svelte.ts` - Story state management and caching
- `src/lib/stores/settings.svelte.ts` - Settings state and persistence

**UI/Components:**
- `src/lib/components/story/StoryView.svelte` - Main story reading/writing view (virtualized rendering)
- `src/lib/components/story/ActionInput.svelte` - User action input box
- `src/lib/components/story/StreamingEntry.svelte` - Real-time narrative streaming display
- `src/lib/components/layout/Sidebar.svelte` - Story navigation sidebar
- `src/lib/components/layout/Header.svelte` - App header with controls
- `src/lib/components/settings/SettingsModal.svelte` - Configuration UI

**Testing:**
- Not detected (no test files found in codebase)

## Naming Conventions

**Files:**
- Components: `PascalCase.svelte` (e.g., `StoryView.svelte`, `AppShell.svelte`)
- Services: `PascalCase.ts` (e.g., `NarrativeService.ts`, `ClassifierService.ts`)
- Stores: `camelCase.svelte.ts` (e.g., `story.svelte.ts`, `settings.svelte.ts`)
- Utilities: `camelCase.ts` (e.g., `htmlSanitize.ts`, `imageUtils.ts`)
- Constants: `camelCase.ts` (e.g., `layout.ts`)
- Types: `index.ts` in types/ directory (e.g., `src/lib/types/index.ts`)

**Directories:**
- Feature modules: `kebab-case` (e.g., `story/`, `lorebook/`, `settings/`)
- Utility directories: `kebab-case` (e.g., `ui/`, `world/`, `debug/`)

**Functions/Classes:**
- Classes: `PascalCase` (e.g., `NarrativeService`, `ContextBuilder`)
- Functions: `camelCase` (e.g., `streamNarrative()`, `buildSystemPrompt()`)
- React hooks/Svelte stores: `camelCase` (e.g., `createIsMobile()`, `story`)
- Event emitters: `camelCase` (e.g., `emitStoryLoaded()`, `emitNarrativeResponse()`)

**Types/Interfaces:**
- Interfaces: `PascalCase` (e.g., `Story`, `StoryEntry`, `APISettings`)
- Type aliases: `PascalCase` (e.g., `StoryMode`, `POV`, `ActionInputType`)
- Event types: `PascalCaseEvent` (e.g., `UserInputEvent`, `NarrativeResponseEvent`)

## Where to Add New Code

**New Feature (Story-related):**
- Primary code: `src/lib/services/ai/generation/NewFeatureService.ts`
- UI components: `src/lib/components/story/NewFeature.svelte`
- State: Add new reactive store `src/lib/stores/newFeature.svelte.ts`
- Types: Add to `src/lib/types/index.ts`
- Tests: Not currently used (no test directory)

**New Component/Module:**
- Implementation: `src/lib/components/{feature}/{ComponentName}.svelte`
- Barrel export: `src/lib/components/{feature}/index.ts` (if multiple related components)

**New AI Service:**
- Implementation: `src/lib/services/ai/{domain}/{ServiceName}Service.ts`
- Schema (if structured output): `src/lib/services/ai/sdk/schemas/{name}.ts`
- Register in factory: `src/lib/services/ai/core/factory.ts`

**New Utility Function:**
- Shared helpers: `src/lib/utils/{functionName}.ts`
- Domain-specific: `src/lib/services/{domain}/{fileName}.ts`

**New Provider (LLM/Image):**
- LLM provider: `src/lib/services/ai/sdk/providers/{providerName}.ts`
- Image provider: `src/lib/services/ai/image/providers/{providerName}.ts`
- Register in config: `src/lib/services/ai/sdk/providers/config.ts` or `src/lib/services/ai/image/providers/registry.ts`

**New Route/Page:**
- Route file: `src/routes/{pathName}/+page.svelte`
- Layout: `src/routes/{pathName}/+layout.svelte`
- Server load: `src/routes/{pathName}/+page.ts` or `+layout.ts`

## Special Directories

**node_modules/:**
- Purpose: NPM dependencies (not committed)
- Generated: Yes (via `npm install`)
- Committed: No

**.svelte-kit/:**
- Purpose: SvelteKit generated files and build cache
- Generated: Yes (via build process)
- Committed: No

**build/:**
- Purpose: Production build output
- Generated: Yes (via `npm run build`)
- Committed: No

**.tauri/:**
- Purpose: Tauri build artifacts and cache
- Generated: Yes (via Tauri CLI)
- Committed: No

**themes/:**
- Purpose: Tailwind CSS theme files (manually maintained)
- Generated: No
- Committed: Yes
