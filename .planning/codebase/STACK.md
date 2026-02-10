# Technology Stack

**Analysis Date:** 2026-02-08

## Languages

**Primary:**
- TypeScript ~5.6.2 - Frontend and backend application logic
- JavaScript (ES Module) - Vite configuration and scripts
- Rust 2021 edition - Tauri backend and native runtime

**Secondary:**
- SQL - SQLite database queries (embedded in Rust migrations)

## Runtime

**Environment:**
- Tauri 2 - Desktop application framework (Rust + WebView)
- Node.js 25.2.1+ - Development and build environment
- WebKit (via Tauri) - Browser engine for UI rendering

**Package Manager:**
- npm - Node.js package manager
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- SvelteKit 2.9.0 - Frontend framework with static site adapter
- Svelte 5.0.0 - Component framework
- Vite 6.0.3 - Build tool and dev server
- Tauri 2 - Desktop runtime with plugins

**UI/Styling:**
- Tailwind CSS 4.1.18 - Utility-first CSS framework
- Tailwind Merge 3.4.0 - Merge Tailwind class conflicts
- Tailwind Variants 0.2.1 - Component style composition
- Lucide Svelte 0.468.0 - Icon library

**UI Components:**
- Bits UI 1.8.0 - Unstyled, accessible component library
- Vaul Svelte 1.0.0-next.7 - Sheet/drawer component
- SVG QR Code 2.3.8 - QR code generation

**Testing:**
- No testing framework detected in package.json (no Jest, Vitest, Playwright, Cypress)

**Build/Dev:**
- @tailwindcss/vite 4.1.18 - Tailwind CSS integration with Vite
- @sveltejs/adapter-static 3.0.6 - Static site generation for SvelteKit
- @sveltejs/vite-plugin-svelte 5.0.0 - Svelte compiler integration
- Prettier 3.8.1 - Code formatter with plugins (Svelte, Tailwind)
- ESLint 9.39.2 - Linter with TypeScript/Svelte support
- Lefthook 2.1.0 - Git hooks for commit standards

## Key Dependencies

**Critical:**
- ai 6.0.67 - Vercel AI SDK for LLM integrations
- @ai-sdk/anthropic 3.0.35 - Anthropic Claude provider
- @ai-sdk/openai 3.0.25 - OpenAI GPT provider
- @ai-sdk/google 3.0.20 - Google Gemini provider
- @ai-sdk/deepseek 2.0.17 - DeepSeek reasoning models
- @ai-sdk/groq 3.0.21 - Groq fast inference
- @ai-sdk/mistral 3.0.18 - Mistral models
- @ai-sdk/xai 3.0.46 - xAI Grok models
- @ai-sdk/openai-compatible 2.0.26 - Custom OpenAI-compatible endpoints
- @openrouter/ai-sdk-provider 2.1.1 - OpenRouter aggregated models
- @chutes-ai/ai-sdk-provider 0.1.2 - Chutes API
- ollama-ai-provider 1.2.0 - Local Ollama support
- zhipu-ai-provider 0.2.2 - Zhipu AI (GLM models)
- ai-sdk-pollinations 0.0.1 - Pollinations free API

**Infrastructure:**
- @tauri-apps/api 2 - Tauri core API bindings
- @tauri-apps/plugin-sql 2 - SQLite database plugin
- @tauri-apps/plugin-fs 2 - Filesystem access plugin
- @tauri-apps/plugin-http 2.5.4 - HTTP client with Tauri security
- @tauri-apps/plugin-dialog 2 - Native file/folder dialogs
- @tauri-apps/plugin-opener 2 - Open files/URLs with OS
- @tauri-apps/plugin-updater 2.9.0 - App update mechanism
- @tauri-apps/plugin-process 2.3.1 - Process management
- @tauri-apps/cli 2 - Tauri development CLI

**Utilities:**
- gpt-tokenizer 3.4.0 - Token counting for OpenAI models
- harper.js 1.2.0 - Grammar checking library
- marked 17.0.1 - Markdown parsing
- jszip 3.10.1 - ZIP file creation/extraction
- jsonrepair 3.13.2 - JSON repair/correction
- clsx 2.1.1 - Class name composition
- uuid 1 (v4 feature) - UUID generation
- qrcode 0.14 - QR code generation
- image 0.25 - Image manipulation (PNG support)
- base64 0.22 - Base64 encoding/decoding
- local-ip-address 0.6 - Get local network IP

**Tauri Rust Backend:**
- axum 0.8 - Web server framework for sync feature
- tokio 1 (rt-multi-thread, net, sync, macros) - Async runtime
- serde 1 + serde_json - Serialization
- reqwest 0.12 - HTTP client (rustls-tls, no default features)
- tauri-plugin-devtools 2.0.0 - Development tools (debug only)

## Configuration

**Environment:**
- Development-only `import.meta.env.DEV` flag in `src/lib/services/ai/core/config.ts`
- No `.env` files required for frontend (no sensitive config)
- API keys managed through user-facing settings UI, not environment variables
- Tauri development port: 1420 (vite dev server)

**Build:**
- `vite.config.js` - Vite + SvelteKit + Tailwind configuration
- `svelte.config.js` - SvelteKit static adapter configuration
- `tsconfig.json` - TypeScript compiler configuration with strict mode
- `tailwind.config.ts` - Tailwind CSS configuration
- `.prettierrc` - Prettier formatter config (100 char line width, trailing commas, no semicolons)
- `eslint.config.js` - ESLint rules (TypeScript, Svelte, unused imports)
- `.tauri/src/tauri.conf.json` - Tauri app metadata, build, bundling
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/migrations/*.sql` - Database schema (24 migrations)

**Tauri Bundling:**
- Windows: `.exe` and installer
- macOS: `.dmg`
- Linux: AppImage with multimedia framework bundled
- Auto-updater enabled via GitHub releases

## Platform Requirements

**Development:**
- Node.js 25.2.1+ (no specific lower bound in .nvmrc)
- Rust toolchain (2021 edition, required for Tauri)
- Tauri CLI (`@tauri-apps/cli@2`)
- npm for dependency management

**Production:**
- Tauri desktop application (cross-platform: Windows, macOS, Linux)
- SQLite database (included with tauri-plugin-sql)
- 100MB+ available for application bundle
- Minimum window size: 800x600 pixels

---

*Stack analysis: 2026-02-08*
