# Codebase Concerns

**Analysis Date:** 2026-02-08

## Tech Debt

**Large Store Files with Mixed Responsibilities:**
- Issue: `story.svelte.ts` (2952 lines) and `settings.svelte.ts` (3325 lines) handle too many concerns
- Files: `src/lib/stores/story.svelte.ts`, `src/lib/stores/settings.svelte.ts`, `src/lib/stores/ui.svelte.ts` (1740 lines)
- Impact: Difficult to test, refactor, or debug; cognitive overload; potential for unintended side effects when modifying one concern
- Fix approach: Break into smaller, focused modules (BranchManager, LocationManager, ItemManager, etc. for story; APIProfileManager, ImageProfileManager for settings)

**Scattered Type Casting and Unknown Assertions:**
- Issue: Multiple uses of `as unknown as` pattern without proper validation, especially in importer services
- Files: `src/lib/services/promptExport.ts`, `src/lib/services/lorebookImporter.ts`, `src/lib/stores/settings.svelte.ts`
- Impact: Data type mismatches silently pass through, causing runtime errors when accessing properties; backwards compatibility issues with legacy data formats
- Fix approach: Implement proper type guards and validation schemas using zod or similar; add data migration tests

**Global DEBUG Flags Left in Production Code:**
- Issue: Multiple `DEBUG` boolean flags set to `true` in production code files (story.svelte.ts, characterVault.svelte.ts, scenarioVault.svelte.ts, lorebookVault.svelte.ts, ui.svelte.ts)
- Files: `src/lib/stores/story.svelte.ts` line 37, `src/lib/stores/characterVault.svelte.ts` line 13, `src/lib/stores/scenarioVault.svelte.ts` line 15, `src/lib/stores/ui.svelte.ts` - multiple locations with DEBUG logging
- Impact: Unnecessary console logs impact performance, increase bundle size with debug statements, leak implementation details
- Fix approach: Use centralized DEBUG configuration from `src/lib/services/ai/core/config.ts` instead of per-file flags; remove inline console.log calls

## Known Bugs

**Infinite Looping in Image Settings (RECENTLY FIXED):**
- Symptoms: UI becomes unresponsive when configuring image generation profiles
- Files: `src/lib/components/settings/tabs/images.svelte`
- Trigger: Recent commit `2bef623 fixed infinite looping` addressed this
- Current Status: Monitor for regression when modifying profile selection logic

**Missing Null Checks in Image Generation:**
- Issue: Image profile selection can return undefined but code assumes it exists
- Files: `src/lib/services/ai/image/InlineImageService.ts` lines 110, 137
- Trigger: When image profile is deleted while generation is in progress, or profile ID is stale
- Current Impact: May cause runtime errors when accessing `.model` on undefined profiles
- Workaround: Check image profile exists before accessing properties

## Security Considerations

**Unvalidated JSON Parsing from Database:**
- Risk: Database values are parsed without schema validation; malformed JSON could crash the app
- Files: `src/lib/services/database.ts` (mapStory, mapCharacter, mapLocation - lines 1800+); `src/lib/stores/settings.svelte.ts` (JSON.parse calls)
- Current mitigation: Try-catch blocks in some load paths, but not all
- Recommendations: Wrap all JSON.parse calls in try-catch; implement validation schemas for critical data structures

**Character Portrait URLs Not Validated:**
- Risk: Portrait URLs from imported character cards could be malicious or external
- Files: `src/lib/services/characterCardImporter.ts`, `src/lib/utils/image.ts`
- Current mitigation: normalizeImageDataUrl() function exists but doesn't validate against XSS
- Recommendations: Whitelist data URL schemes only; validate image dimensions before processing; add CSP headers for image sources

**API Keys/Credentials in Settings:**
- Risk: Settings store holds API profiles with credentials; potential for exposure if error logs leak data
- Files: `src/lib/stores/settings.svelte.ts`, `src/lib/services/ai/sdk/providers/config.ts`
- Current mitigation: Environment variables (.env) used for initial config
- Recommendations: Never log API keys; sanitize error messages before logging; use secure credential storage (Tauri secure storage)

## Performance Bottlenecks

**Unoptimized Story State Reloads:**
- Problem: `restoreFromRetryBackup()` in story.svelte.ts reloads ALL state from database (entries, characters, locations, items, beats) even when only some changed
- Files: `src/lib/stores/story.svelte.ts` lines 2526-2543
- Cause: Uses Promise.all to load everything; doesn't filter by changed entities
- Impact: Slow retry operations with large stories (hundreds of entries)
- Improvement path: Only reload entities that were modified; cache unchanged data in-memory

**N+1 Queries in Branch Operations:**
- Problem: `getBranchEntryCount()` and similar operations make sequential database queries in loops
- Files: `src/lib/stores/story.svelte.ts` lines 2427-2450 (getForkEntryPositions loop)
- Cause: Loop over lineage array, each iteration queries database
- Impact: Branch operations become exponentially slower with deep branch hierarchies
- Improvement path: Batch queries; pre-load all fork positions in single query

**Unindexed Database Queries:**
- Problem: Many queries filter by `storyId` and `branchId` without clear database indexes
- Files: `src/lib/services/database.ts` (all getters for characters, locations, items, beats)
- Cause: SQLite queries on large tables without proper indexes
- Impact: Slow queries in stories with many entries/entities; noticeable lag in world state operations
- Improvement path: Add database indexes on `(story_id)` and `(story_id, branch_id)` for all entity tables

**Inline Image Processing Not Rate-Limited:**
- Problem: `InlineImageService.processNarrativeForInlineImages()` processes all images sequentially without queuing or rate limiting
- Files: `src/lib/services/ai/image/InlineImageService.ts` lines 90-92
- Cause: Simple loop with no backpressure or concurrency control
- Impact: Can overwhelm image providers if narrative contains many <pic> tags; blocks other operations
- Improvement path: Implement job queue with configurable concurrency; add provider-specific rate limits

**Token Counting on Every State Change:**
- Problem: `ui.svelte.ts` has `tokenCountInterval` that recalculates tokens periodically
- Files: `src/lib/stores/ui.svelte.ts` lines 138, 402
- Cause: setInterval without proper cleanup; counts tokens for entire story on interval
- Impact: Continuous CPU usage during gameplay; not responsive to actual state changes
- Improvement path: Calculate tokens only when relevant state changes; use debouncing instead of interval

## Fragile Areas

**Retry/Restore State Management:**
- Files: `src/lib/stores/story.svelte.ts` (restoreFromRetryBackup, _isRetryInProgress), `src/lib/stores/ui.svelte.ts` (RetryBackup interface)
- Why fragile: Multiple overlapping backup formats (full state vs. entry-only), undefined behavior when restoring after profile changes, character visual descriptors have migration logic that must match
- Safe modification: Add comprehensive tests for retry scenarios; document exact state guarantees; version the backup format
- Test coverage: No unit tests exist for retry restoration; only manual testing possible

**Visual Descriptor Migration:**
- Files: `src/lib/services/database.ts` lines 32-98 (migrateVisualDescriptors)
- Why fragile: Converts from old string[] format to new object format; regex-based parsing is loose; may silently lose data
- Safe modification: Add test cases for all known old formats; log warnings when migration loses data; add version field to track which format data uses
- Test coverage: No tests; data corruption risk when importing old character cards

**Database Migration and Version Tracking:**
- Files: `src/lib/services/database.ts`
- Why fragile: No explicit migration system; schema changes rely on runtime checks; no version tracking
- Safe modification: Implement proper migration framework (like Drizzle or similar); test migrations on real databases; add schema versioning
- Test coverage: No migration tests; manual testing only

**Image Profile Selection Logic:**
- Files: `src/lib/components/settings/tabs/images.svelte` (recently fixed infinite loop), `src/lib/services/ai/image/InlineImageService.ts`
- Why fragile: Profile IDs must match between settings, database, and runtime; no validation that selected profile exists
- Safe modification: Add profile existence checks; emit validation errors before allowing profile selection; test profile deletion cascades
- Test coverage: No tests; only manual testing

## Scaling Limits

**Embedded Images Storage:**
- Current capacity: Stores base64-encoded images directly in database (EmbeddedImage records)
- Limit: Database size grows exponentially with image count; base64 encoding is 33% larger than binary; no cleanup of unused images
- Scaling path: Implement external blob storage (filesystem or S3); migrate existing base64 images; add image cleanup job

**Story Entries Without Pagination:**
- Current capacity: Loads ALL entries into memory when story is loaded
- Limit: Stories with 10,000+ entries become very slow; memory usage unbounded
- Scaling path: Implement virtual scrolling in UI; lazy-load entries from database; add pagination to queries

**Branch Hierarchy Depth:**
- Current capacity: Linear search through branch lineage; no depth limit
- Limit: Deep branches (50+ levels) become slow due to recursive lookups
- Scaling path: Cache branch lineage relationships; add depth limit to UI; optimize lineage building with memoization

## Dependencies at Risk

**AI SDK Provider Integration - Fragile Abstraction:**
- Risk: Multiple AI provider integrations (OpenRouter, OpenAI, NanoGPT, Chutes, Mistral, Groq, DeepSeek, Google, XAI) with inconsistent error handling
- Impact: Provider-specific errors aren't always caught; some providers timeout differently; API changes break silently
- Files: `src/lib/services/ai/sdk/providers/`
- Migration plan: Add comprehensive error handling per provider; add provider compatibility tests; version API contracts

**Image Generation Provider Timeout Handling:**
- Risk: Different timeouts per provider (5 minutes default) but some providers are faster/slower
- Impact: Unnecessary cancellations on slow providers or hanging on fast ones
- Files: `src/lib/services/ai/image/providers/fetchAdapter.ts` lines 36-41
- Migration plan: Per-provider timeout configuration; adaptive timeout based on historical data

**Tauri Interop Dependency on Specific Plugin Versions:**
- Risk: Multiple Tauri plugins (@tauri-apps/plugin-sql, @tauri-apps/plugin-updater, @tauri-apps/api/event)
- Impact: Version mismatches cause runtime errors; breaking changes in plugin updates not always caught
- Files: Dependencies throughout `src/lib/services/` and `src/lib/stores/`
- Migration plan: Lock plugin versions; test before updating; add compatibility layer for breaking changes

## Missing Critical Features

**No Error Recovery Mechanism:**
- Problem: Failed API calls don't have built-in retry logic with exponential backoff
- Blocks: Resilience to network blips; recovery from transient provider errors
- Files: `src/lib/services/ai/index.ts` and generation services
- Fix: Implement retry policy (exponential backoff, max retries); add circuit breaker for failing providers

**No Activity Logging for Debugging:**
- Problem: User actions aren't logged; hard to debug what caused a crash or data loss
- Blocks: Post-mortem analysis; user support troubleshooting; audit trails
- Files: Entire application - no audit log storage or retrieval
- Fix: Implement activity logger that persists to database; track user actions, AI responses, state changes

**No Schema Validation for External Data:**
- Problem: Imported character cards, lorebooks, and settings aren't validated against schemas
- Blocks: Early detection of import errors; graceful handling of malformed data
- Files: `src/lib/services/characterCardImporter.ts`, `src/lib/services/lorebookImporter.ts`
- Fix: Use zod schemas; validate before database insertion; report validation errors to user

## Test Coverage Gaps

**No Unit Tests for Core Store Logic:**
- What's not tested: Story state mutations, character/location/item management, branch operations
- Files: `src/lib/stores/story.svelte.ts` (2952 lines with zero test coverage)
- Risk: Regressions in basic CRUD operations undetected; refactoring breaks silently
- Priority: HIGH - Story store is critical path

**No Tests for Retry/Restore Functionality:**
- What's not tested: `restoreFromRetryBackup()`, entity cleanup, state integrity after restore
- Files: `src/lib/stores/story.svelte.ts` lines 2482-2589
- Risk: Data loss after retry; orphaned entities; state corruption undetected
- Priority: HIGH - User data at risk

**No Tests for Data Migration:**
- What's not tested: Visual descriptor migration, profile ID remapping, JSON parsing from database
- Files: `src/lib/services/database.ts`, migration code scattered throughout
- Risk: Silent data corruption on schema changes; backward compatibility breaks
- Priority: HIGH - Data integrity at risk

**No Tests for Image Generation Workflows:**
- What's not tested: Inline image generation, portrait fallback selection, image queue management
- Files: `src/lib/services/ai/image/` (entire directory)
- Risk: Image generation failures undetected; unexpected behavior with edge cases
- Priority: MEDIUM - Feature-specific, but user-visible

**No Tests for AI Provider Integration:**
- What's not tested: Provider selection, model validation, prompt template rendering
- Files: `src/lib/services/ai/sdk/providers/`, generation services
- Risk: Provider changes break silently; model mismatches cause runtime errors
- Priority: MEDIUM - Affects all narrative generation

**No Tests for Settings Persistence:**
- What's not tested: Settings save/load, profile management, preference migrations
- Files: `src/lib/stores/settings.svelte.ts` (3325 lines with zero test coverage)
- Risk: Settings lost on app restart; profile corruption; migration bugs undetected
- Priority: MEDIUM - User experience degraded

**No E2E Tests for Story Creation Workflow:**
- What's not tested: New story creation → character setup → first action → narrative generation
- Files: `src/lib/components/wizard/`, `src/routes/+page.svelte`
- Risk: Critical user workflows broken undetected; onboarding issues
- Priority: MEDIUM - Common user path

---

*Concerns audit: 2026-02-08*
