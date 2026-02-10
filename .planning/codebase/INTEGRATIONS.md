# External Integrations

**Analysis Date:** 2026-02-08

## APIs & External Services

**LLM Text Generation Providers:**
- OpenAI (GPT-4o, GPT-4, GPT-3.5-turbo, etc.)
  - SDK/Client: `@ai-sdk/openai`
  - Auth: API key required (user-configured)
  - Uses: Narrative generation, classification, memory, suggestions

- Anthropic (Claude models - Opus, Sonnet, Haiku, etc.)
  - SDK/Client: `@ai-sdk/anthropic`
  - Auth: API key required
  - Uses: Reasoning-based generation with native thinking support

- Google Gemini (Gemini 3, 2.5 models)
  - SDK/Client: `@ai-sdk/google`
  - Auth: API key required
  - Uses: Text generation, some image generation

- DeepSeek (DeepSeek-V3, DeepSeek-Reasoner)
  - SDK/Client: `@ai-sdk/deepseek`
  - Auth: API key required
  - Uses: Cost-effective reasoning models

- Mistral (Mistral Large, Small, Codestral)
  - SDK/Client: `@ai-sdk/mistral`
  - Auth: API key required
  - Uses: European AI provider option

- Groq (Llama 3.3, Mixtral)
  - SDK/Client: `@ai-sdk/groq`
  - Auth: API key required
  - Uses: Ultra-fast inference for open models

- xAI Grok (Grok-3, Grok-2)
  - SDK/Client: `@ai-sdk/xai`
  - Auth: API key required
  - Uses: Latest reasoning models

- OpenRouter (Aggregator: 100+ models)
  - SDK/Client: `@openrouter/ai-sdk-provider`
  - Auth: API key required
  - Uses: Access to multiple providers via single API
  - Base URL: https://openrouter.ai/api/v1
  - Headers: HTTP-Referer, X-Title

- NanoGPT (Subscription-based with reasoning)
  - SDK/Client: @openai-compatible (via registry)
  - Auth: API key required
  - Base URL: https://nano-gpt.com/api/v1
  - Uses: Reasoning models, text + image generation

- Zhipu AI (GLM models, Chinese provider)
  - SDK/Client: `zhipu-ai-provider`
  - Auth: API key required
  - Base URL: https://open.bigmodel.cn/api/paas/v4
  - Uses: GLM models

- Chutes AI (Text and image generation)
  - SDK/Client: `@chutes-ai/ai-sdk-provider`
  - Auth: API key required
  - Base URL: https://api.chutes.ai
  - Uses: Alternative image + text generation

- Pollinations (Free text and image generation)
  - SDK/Client: `ai-sdk-pollinations`
  - Auth: Optional API key (free tier available)
  - Base URL: https://text.pollinations.ai/openai
  - Uses: Free generation option

**Local LLM Providers:**
- Ollama (Local models)
  - SDK/Client: `ollama-ai-provider`
  - Auth: Not required
  - Base URL: http://localhost:11434
  - Uses: Local inference

- LM Studio (Local models)
  - SDK/Client: @ai-sdk/openai (compatible)
  - Auth: Not required
  - Base URL: http://localhost:1234/v1
  - Uses: Local inference via LM Studio

- llama.cpp (Local models)
  - SDK/Client: @ai-sdk/openai (compatible)
  - Auth: Not required
  - Base URL: http://localhost:8080/v1
  - Uses: Local inference via llama.cpp

- NVIDIA NIM (NVIDIA hosted inference)
  - SDK/Client: @ai-sdk/openai (compatible)
  - Auth: API key required
  - Base URL: https://integrate.api.nvidia.com/v1
  - Uses: NVIDIA's hosted model endpoints

**Image Generation Providers:**
- OpenAI DALL-E (3, 2)
  - Model: dall-e-3, dall-e-2
  - Provider file: `src/lib/services/ai/image/providers/openai.ts`
  - Auth: API key required

- Google Imagen
  - Model: imagen-3.0-generate-002
  - Provider file: `src/lib/services/ai/image/providers/google.ts`
  - Auth: API key required

- NanoGPT Image
  - Models: z-image-turbo, qwen-image
  - Provider file: `src/lib/services/ai/image/providers/nanogpt.ts`
  - Auth: API key required

- Chutes Image
  - Models: z-image-turbo, qwen-image-edit-2511
  - Provider file: `src/lib/services/ai/image/providers/chutes.ts`
  - Auth: API key required

- Pollinations (Free image)
  - Model: flux, kontext
  - Provider file: `src/lib/services/ai/image/providers/pollinations.ts`
  - Auth: Optional API key

- Zhipu Image (CogView)
  - Models: cogview-3-plus, cogview-3
  - Provider file: `src/lib/services/ai/image/providers/zhipu.ts`
  - Auth: API key required

- ComfyUI (Local image generation)
  - Status: Not yet implemented (placeholder in registry)

## Data Storage

**Databases:**
- SQLite (Local desktop database)
  - Plugin: `@tauri-apps/plugin-sql`
  - Database file: `aventura.db` (managed by Tauri)
  - Migrations: 24 versioned migrations in `src-tauri/migrations/`
  - Tables: stories, chapters, entries, characters, locations, items, lore, vaults, images, branches, translations, tags

**File Storage:**
- Local filesystem only (via Tauri FileSystem plugin)
  - Plugin: `@tauri-apps/plugin-fs`
  - Embedded images stored as base64 in database or local files
  - QR codes generated as PNG

**Caching:**
- In-memory model cache (15-minute TTL) in `src/lib/services/ai/image/providers/registry.ts`
- No external caching service (Redis, Memcached)

## Authentication & Identity

**Auth Provider:**
- Custom implementation (no OAuth/OIDC)
- API keys stored in user settings/profiles
- Each LLM provider requires separate API key
- Sync server uses custom token-based authentication

**Implementation approach:**
- `src/lib/services/ai/sdk/providers/registry.ts` - Provider factory with API key injection
- `src/lib/stores/settings.svelte` - Settings store for API profiles and image profiles
- Tauri native storage for persisting user configuration

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Rollbar, etc.)

**Logs:**
- In-app debug console with `createLogger()` in `src/lib/services/ai/core/config.ts`
- Tauri devtools plugin (development only) via `tauri-plugin-devtools`
- Sync server errors logged to stderr

## CI/CD & Deployment

**Hosting:**
- Cross-platform desktop application (Windows, macOS, Linux)
- GitHub Releases for binary distribution

**CI Pipeline:**
- None detected (no GitHub Actions, GitLab CI, etc. in config files)

**Auto-Update:**
- Tauri updater plugin configured
- Endpoint: https://github.com/unkarelian/Aventuras/releases/latest/download/latest.json
- Public key: Base64-encoded minisign public key

## Environment Configuration

**Required env vars:**
- None required for runtime (all API keys configured via UI)
- Development: `TAURI_DEV_HOST` - Override dev server host (optional)

**Secrets location:**
- No .env file usage
- API keys stored in SQLite database via settings store
- No hardcoded secrets in codebase

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Sync server HTTP API: `POST /sync` endpoint for story synchronization
  - Supports: ListStories, PullStory, PushStory actions
  - Body limit: 100MB for large stories with embedded images
  - Server: Axum-based HTTP server running on random local port
  - Location: `src-tauri/src/sync/server.rs`

## HTTP/Network Integration

**HTTP Client:**
- Tauri HTTP plugin (`@tauri-apps/plugin-http`)
  - Provides fetch-compatible API with Tauri security sandbox
  - Used in `src/lib/services/ai/sdk/providers/fetch.ts`
  - Custom fetch wrapper with timeout support (180s default)

- Reqwest (Rust backend)
  - Used in Tauri sync server for HTTP handling
  - Features: JSON, rustls-tls

**Network Access:**
- All external API calls go through Tauri's HTTP plugin
- QR code generation for local network sync
- Automatic local IP detection for sync server

## API Security Features

**CORS/Headers:**
- OpenRouter headers: HTTP-Referer, X-Title set in `src/lib/services/ai/sdk/providers/registry.ts`
- Tauri security sandbox prevents unauthorized network access
- All external requests go through Tauri plugin layer

**Rate Limiting:**
- Provider-specific rate limits respected (user responsibility)
- Timeout: 180 seconds default for AI generation requests

---

*Integration audit: 2026-02-08*
