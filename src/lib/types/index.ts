// Core entity types for Aventura

export type StoryMode = 'adventure' | 'creative-writing';
export type POV = 'first' | 'second' | 'third';
export type Tense = 'past' | 'present';

// Time tracking for story progression
export interface TimeTracker {
  years: number;
  days: number;
  hours: number;
  minutes: number;
}

export interface Story {
  id: string;
  title: string;
  description: string | null;
  genre: string | null;
  templateId: string | null;
  mode: StoryMode;
  createdAt: number;
  updatedAt: number;
  settings: StorySettings | null;
  memoryConfig: MemoryConfig | null;
  retryState: PersistentRetryState | null;
  styleReviewState: PersistentStyleReviewState | null;
  timeTracker: TimeTracker | null;
  currentBranchId: string | null;  // Active branch (null = main branch for legacy stories)
}

// Persistent retry state - lightweight version saved to database
export type ActionInputType = 'do' | 'say' | 'think' | 'story' | 'free';

export interface PersistentRetryState {
  timestamp: number;
  // The next entry position before user action was added (max position + 1)
  // On retry, delete entries from this position onward
  entryCountBeforeAction: number;
  // The user's input data
  userActionContent: string;
  rawInput: string;
  actionType: ActionInputType;
  wasRawActionChoice: boolean;
  // Entity IDs that existed before the action - on restore, delete any not in these lists
  characterIds: string[];
  locationIds: string[];
  itemIds: string[];
  storyBeatIds: string[];
  lorebookEntryIds: string[];
  embeddedImageIds?: string[];  // Added in v1.4.0 for image generation
  characterSnapshots?: PersistentCharacterSnapshot[]; // Added in v1.4.1 for retry state restoration
  // Story time snapshot captured before the user action (optional for backwards compatibility)
  timeTracker?: TimeTracker | null;
}

export interface PersistentCharacterSnapshot {
  id: string;
  traits: string[];
  status: 'active' | 'inactive' | 'deceased';
  relationship: string | null;
  visualDescriptors: string[];
  portrait: string | null;  // Data URL (data:image/...) or legacy base64
}

// Persistent style review state - saved per-story for style analysis tracking
export interface PersistentPhraseAnalysis {
  phrase: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high';
  alternatives: string[];
  contexts: string[];
}

export interface PersistentStyleReviewResult {
  phrases: PersistentPhraseAnalysis[];
  overallAssessment: string;
  reviewedEntryCount: number;
  timestamp: number;
}

export interface PersistentStyleReviewState {
  messagesSinceLastReview: number;
  lastReview: PersistentStyleReviewResult | null;
}

export interface MemoryConfig {
  tokenThreshold: number;    // Token count before triggering summarization (default: 24000)
  chapterBuffer: number;     // Recent messages protected from chapter end (default: 10)
  autoSummarize: boolean;    // Enable auto-summarization
  enableRetrieval: boolean;  // Enable memory retrieval
  maxChaptersPerRetrieval: number; // Max chapters to retrieve per query
}

export interface StorySettings {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string;
  pov?: POV;
  tense?: Tense;
  tone?: string;
  themes?: string[];
  visualProseMode?: boolean;  // Enable HTML/CSS visual output mode
  inlineImageMode?: boolean;  // Enable <pic> tag inline image generation
}

export interface StoryEntry {
  id: string;
  storyId: string;
  type: 'user_action' | 'narration' | 'system' | 'retry';
  content: string;
  parentId: string | null;
  position: number;
  createdAt: number;
  metadata: EntryMetadata | null;
  branchId: string | null;  // Branch this entry belongs to (null = main branch for legacy)
}

export interface EntryMetadata {
  tokenCount?: number;
  model?: string;
  generationTime?: number;
  source?: string;
  // Story time tracking - captures in-story time at entry creation and after classification
  timeStart?: TimeTracker;  // Story time when this entry began
  timeEnd?: TimeTracker;    // Story time after classification applied time progression
}

export interface Character {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  relationship: string | null;
  traits: string[];
  visualDescriptors: string[];  // Visual appearance details for image generation (hair, clothing, features)
  portrait: string | null;  // Data URL (data:image/...) for reference in image generation
  status: 'active' | 'inactive' | 'deceased';
  metadata: Record<string, unknown> | null;
  branchId: string | null;  // Branch this character belongs to (null = main/inherited)
}

export interface Location {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  visited: boolean;
  current: boolean;
  connections: string[];
  metadata: Record<string, unknown> | null;
  branchId: string | null;  // Branch this location belongs to (null = main/inherited)
}

export interface Item {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  quantity: number;
  equipped: boolean;
  location: string;
  metadata: Record<string, unknown> | null;
  branchId: string | null;  // Branch this item belongs to (null = main/inherited)
}

export interface StoryBeat {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  type: 'milestone' | 'quest' | 'revelation' | 'event' | 'plot_point';
  status: 'pending' | 'active' | 'completed' | 'failed';
  triggeredAt: number | null;
  resolvedAt?: number | null;
  metadata: Record<string, unknown> | null;
  branchId: string | null;  // Branch this beat belongs to (null = main/inherited)
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  systemPrompt: string;
  initialState: TemplateInitialState | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface TemplateInitialState {
  protagonist?: Partial<Character>;
  startingLocation?: Partial<Location>;
  initialItems?: Partial<Item>[];
  openingScene?: string;
}

// Chapter for memory system
export interface Chapter {
  id: string;
  storyId: string;
  number: number;
  title: string | null;

  // Boundaries
  startEntryId: string;
  endEntryId: string;
  entryCount: number;

  // Content
  summary: string;

  // Story time span covered by this chapter
  startTime: TimeTracker | null;
  endTime: TimeTracker | null;

  // Retrieval optimization metadata
  keywords: string[];
  characters: string[];   // Character names mentioned
  locations: string[];    // Location names mentioned
  plotThreads: string[];
  emotionalTone: string | null;

  branchId: string | null;  // Branch this chapter belongs to (null = main branch for legacy)

  createdAt: number;
}

// Checkpoint for save/restore functionality
export interface Checkpoint {
  id: string;
  storyId: string;
  name: string;

  // Snapshot boundaries
  lastEntryId: string;
  lastEntryPreview: string | null;
  entryCount: number;

  // Deep copy of state
  entriesSnapshot: StoryEntry[];
  charactersSnapshot: Character[];
  locationsSnapshot: Location[];
  itemsSnapshot: Item[];
  storyBeatsSnapshot: StoryBeat[];
  chaptersSnapshot: Chapter[];
  // Optional: undefined means "preserve current time" on restore (for backward compatibility)
  timeTrackerSnapshot?: TimeTracker | null;
  // Optional: undefined means "preserve current lorebook" on restore (for backward compatibility)
  lorebookEntriesSnapshot?: Entry[];

  createdAt: number;
}

// Branch for story branching/alternate timeline support
export interface Branch {
  id: string;
  storyId: string;
  name: string;
  parentBranchId: string | null;  // NULL for main branch
  forkEntryId: string;            // Entry where this branch diverges from parent
  checkpointId: string | null;    // Checkpoint for world state restoration
  createdAt: number;
}

// ===== Entry/Lorebook System (per design doc section 3.2) =====

export type EntryType = 'character' | 'location' | 'item' | 'faction' | 'concept' | 'event';
export type EntryInjectionMode = 'always' | 'keyword' | 'relevant' | 'never';
export type EntryCreator = 'user' | 'ai' | 'import';

/**
 * Entry - Unified lorebook and tracker system.
 * Combines static descriptions with dynamic state tracking.
 * Per design doc section 3.2.1
 */
export interface Entry {
  id: string;
  storyId: string;
  name: string;
  type: EntryType;

  // Static content
  description: string;
  hiddenInfo: string | null;     // Info protagonist doesn't know yet
  aliases: string[];

  // Dynamic state (type-specific)
  state: EntryState;

  // Mode-specific state (optional)
  adventureState: AdventureEntryState | null;
  creativeState: CreativeEntryState | null;

  // Injection rules
  injection: EntryInjection;

  // Metadata
  firstMentioned: string | null; // Entry ID where first mentioned
  lastMentioned: string | null;  // Entry ID where last mentioned
  mentionCount: number;
  createdBy: EntryCreator;
  createdAt: number;
  updatedAt: number;

  // Lore management settings
  loreManagementBlacklisted: boolean; // If true, hidden from AI lore management

  // Branch support
  branchId: string | null;  // Branch this entry belongs to (null = main/inherited)
}

export interface EntryInjection {
  mode: EntryInjectionMode;
  keywords: string[];
  priority: number;  // Higher = inject first
}

// Base entry state (common fields)
export interface BaseEntryState {
  type: EntryType;
}

// Character-specific state (per design doc section 3.2.2)
export interface CharacterEntryState extends BaseEntryState {
  type: 'character';
  isPresent: boolean;
  lastSeenLocation: string | null;
  currentDisposition: string | null;
  relationship: {
    level: number;              // -100 to 100
    status: string;
    history: RelationshipChange[];
  };
  knownFacts: string[];
  revealedSecrets: string[];
}

export interface RelationshipChange {
  description: string;
  entryId: string;
  timestamp: number;
}

// Location-specific state
export interface LocationEntryState extends BaseEntryState {
  type: 'location';
  isCurrentLocation: boolean;
  visitCount: number;
  changes: { description: string; entryId: string }[];
  presentCharacters: string[];  // Entry IDs
  presentItems: string[];       // Entry IDs
}

// Item-specific state
export interface ItemEntryState extends BaseEntryState {
  type: 'item';
  inInventory: boolean;
  currentLocation: string | null;  // Entry ID or 'inventory'
  condition: string | null;
  uses: { action: string; result: string; entryId: string }[];
}

// Faction-specific state
export interface FactionEntryState extends BaseEntryState {
  type: 'faction';
  playerStanding: number;       // -100 to 100
  status: 'allied' | 'neutral' | 'hostile' | 'unknown';
  knownMembers: string[];       // Entry IDs of known members
}

// Concept-specific state (lore concepts, magic systems, etc.)
export interface ConceptEntryState extends BaseEntryState {
  type: 'concept';
  revealed: boolean;
  comprehensionLevel: 'unknown' | 'basic' | 'intermediate' | 'advanced';
  relatedEntries: string[];     // Entry IDs
}

// Event-specific state
export interface EventEntryState extends BaseEntryState {
  type: 'event';
  occurred: boolean;
  occurredAt: number | null;
  witnesses: string[];          // Entry IDs
  consequences: string[];
}

export type EntryState =
  | CharacterEntryState
  | LocationEntryState
  | ItemEntryState
  | FactionEntryState
  | ConceptEntryState
  | EventEntryState;

// Adventure mode specific state
export interface AdventureEntryState {
  discovered: boolean;
  interactedWith: boolean;
  notes: string[];              // Player notes
}

// Creative writing mode specific state
export interface CreativeEntryState {
  arc: {
    want: string | null;        // External goal (for characters)
    need: string | null;        // Internal growth
    flaw: string | null;        // What holds them back
    currentState: string | null;
  } | null;
  thematicRole: string | null;
  symbolism: string | null;
}

// Entry preview for listings (lighter than full Entry)
export interface EntryPreview {
  id: string;
  name: string;
  type: EntryType;
  description: string;
  aliases: string[];
}

// ===== Lore Management System (per design doc section 3.4) =====

export type LoreChangeType = 'create' | 'update' | 'merge' | 'delete' | 'complete';

export interface LoreChange {
  type: LoreChangeType;
  entry?: Entry;
  previous?: Partial<Entry>;
  mergedFrom?: string[];
  summary?: string;
}

export interface LoreManagementResult {
  changes: LoreChange[];
  summary: string;
  sessionId: string;
}

// ===== Agentic Session Tracking =====

export interface AgenticSession {
  id: string;
  type: 'lore-management' | 'agentic-retrieval' | 'timeline-fill';
  storyId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt: number | null;
  messageCount: number;
  // Session is stored separately, not persisted to DB
}

// UI State types
export type ActivePanel = 'story' | 'library' | 'settings' | 'templates' | 'lorebook' | 'memory';
export type SidebarTab = 'characters' | 'locations' | 'inventory' | 'quests' | 'time' | 'branches';

export interface UIState {
  activePanel: ActivePanel;
  sidebarTab: SidebarTab;
  sidebarOpen: boolean;
  settingsModalOpen: boolean;
}

// API Profile for saving OpenAI-compatible endpoint configurations
export interface APIProfile {
  id: string;                 // UUID
  name: string;               // User-friendly name (e.g., "Local LLM", "OpenRouter")
  baseUrl: string;            // API base URL (e.g., "https://openrouter.ai/api/v1")
  apiKey: string;             // API key for this endpoint
  customModels: string[];     // Manually added models
  fetchedModels: string[];    // Auto-fetched from /models endpoint
  createdAt: number;          // Timestamp
}

// API Settings
export interface APISettings {
  // Legacy fields - kept for backwards compatibility during migration
  openaiApiURL: string;
  openaiApiKey: string | null;
  // Saved profiles
  profiles: APIProfile[];
  activeProfileId: string | null;  // ID of profile being edited in API tab (UI state only)
  // Main narrative generation settings
  mainNarrativeProfileId: string;  // Profile used for main story generation
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort: ReasoningEffort; // Reasoning effort for the main narrative model
  providerOnly: string[]; // Allowed providers for the main narrative model
  manualBody: string; // Manual request body JSON for the main narrative model
  enableThinking: boolean; // Legacy toggle for reasoning (backward compatibility)
}

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

export type ThemeId = 'dark' | 'light' | 'light-solarized' | 'retro-console' | 'fallen-down';

export type FontSource = 'default' | 'system' | 'google';

export interface UISettings {
  theme: ThemeId;
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: string;
  fontSource: FontSource;
  showWordCount: boolean;
  autoSave: boolean;
  spellcheckEnabled: boolean;
  debugMode: boolean;
}

export interface UpdateSettings {
  autoCheck: boolean;        // Check for updates on startup
  autoDownload: boolean;     // Automatically download updates
  checkInterval: number;     // Hours between update checks (0 = only on startup)
  lastChecked: number | null; // Timestamp of last check
}

// ===== Image Generation System =====

export type EmbeddedImageStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface EmbeddedImage {
  id: string;
  storyId: string;
  entryId: string;
  sourceText: string;      // Text matched in narrative (case-insensitive)
  prompt: string;          // Full generation prompt
  styleId: string;         // Image style template used
  model: string;           // Image model used
  imageData: string;       // Base64 encoded image
  width?: number;
  height?: number;
  status: EmbeddedImageStatus;
  errorMessage?: string;
  createdAt: number;
  generationMode?: 'analyzed' | 'inline';  // How image was triggered (analyzed = LLM scene analysis, inline = <pic> tag)
}

// ===== Inline Image Generation System =====

/**
 * Parsed <pic> tag from narrative content.
 * Used for inline image generation mode where AI embeds image tags directly in narrative.
 */
export interface InlineImageTag {
  /** Full original tag text (e.g., '<pic prompt="..." characters="..."></pic>') */
  originalTag: string;
  /** Start position in content */
  startIndex: number;
  /** End position in content */
  endIndex: number;
  /** Image generation prompt */
  prompt: string;
  /** Character names for portrait reference */
  characters: string[];
  /** Generated image ID (assigned during processing) */
  imageId?: string;
  /** Processing status */
  status: 'pending' | 'generating' | 'complete' | 'failed';
}

export type ImageSize = '512x512' | '1024x1024';

export interface ImageGenerationSettings {
  enabled: boolean;               // Toggle for image generation (default: false)
  profileId: string | null;       // API profile to use for image generation
  model: string;                  // Image model (default: 'z-image-turbo')
  styleId: string;                // Selected image style template
  size: ImageSize;                // Image size
  maxImagesPerMessage: number;    // Max images to generate per narrative (default: 2)
  autoGenerate: boolean;          // Generate automatically after narration

  // Prompt analysis model settings (for identifying imageable scenes)
  promptProfileId: string | null; // API profile for prompt analysis
  promptModel: string;
  promptTemperature: number;
  promptMaxTokens: number;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}
