// Core entity types for Aventura

export type StoryMode = 'adventure' | 'creative-writing';
export type POV = 'first' | 'second' | 'third';
export type Tense = 'past' | 'present';

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
}

export interface MemoryConfig {
  chapterThreshold: number;  // Messages before considering a chapter (default: 50)
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
}

export interface EntryMetadata {
  tokenCount?: number;
  model?: string;
  generationTime?: number;
  source?: string;
}

export interface Character {
  id: string;
  storyId: string;
  name: string;
  description: string | null;
  relationship: string | null;
  traits: string[];
  status: 'active' | 'inactive' | 'deceased';
  metadata: Record<string, unknown> | null;
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
}

export interface StoryBeat {
  id: string;
  storyId: string;
  title: string;
  description: string | null;
  type: 'milestone' | 'quest' | 'revelation' | 'event' | 'plot_point';
  status: 'pending' | 'active' | 'completed' | 'failed';
  triggeredAt: number | null;
  metadata: Record<string, unknown> | null;
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

  // Retrieval optimization metadata
  keywords: string[];
  characters: string[];   // Character names mentioned
  locations: string[];    // Location names mentioned
  plotThreads: string[];
  emotionalTone: string | null;

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
export type ActivePanel = 'story' | 'library' | 'settings' | 'templates' | 'lorebook';
export type SidebarTab = 'characters' | 'locations' | 'inventory' | 'quests';

export interface UIState {
  activePanel: ActivePanel;
  sidebarTab: SidebarTab;
  sidebarOpen: boolean;
  settingsModalOpen: boolean;
}

// API Settings
export interface APISettings {
  openrouterApiKey: string | null;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  enableThinking: boolean; // Enable extended thinking/reasoning for supported models
}

export type ThemeId = 'dark' | 'light' | 'retro-console';

export interface UISettings {
  theme: ThemeId;
  fontSize: 'small' | 'medium' | 'large';
  showWordCount: boolean;
  autoSave: boolean;
}
