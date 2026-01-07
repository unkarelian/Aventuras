import type { ActivePanel, SidebarTab, UIState, EntryType, StoryEntry, Character, Location, Item, StoryBeat, Entry, ActionInputType } from '$lib/types';
import type { ActionChoice } from '$lib/services/ai/actionChoices';
import type { StorySuggestion } from '$lib/services/ai/suggestions';
import type { StyleReviewResult } from '$lib/services/ai/styleReviewer';
import type { EntryRetrievalResult, ActivationTracker } from '$lib/services/ai/entryRetrieval';
import type { SyncMode } from '$lib/types/sync';
import { SimpleActivationTracker } from '$lib/services/ai/entryRetrieval';
import { database } from '$lib/services/database';
import { SvelteMap } from 'svelte/reactivity';

// Debug log entry for request/response logging
export interface DebugLogEntry {
  id: string;
  timestamp: number;
  type: 'request' | 'response';
  serviceName: string;
  data: Record<string, unknown>;
  duration?: number; // For responses, time taken in ms
  error?: string; // For error responses
}

// Backup for retry functionality - captures state before each user message
export interface RetryBackup {
  storyId: string;
  timestamp: number;
  // State snapshots (captured BEFORE user action is added)
  // These may be empty if loaded from persistent storage (entry-only restore)
  entries: StoryEntry[];
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  lorebookEntries: Entry[];
  // The user's input to re-trigger
  userActionContent: string;
  rawInput: string;
  actionType: ActionInputType;
  wasRawActionChoice: boolean;
  // Lorebook activation tracking data (for stickiness preservation)
  activationData: Record<string, number>;
  storyPosition: number;
  // Next entry position at time of backup - used for entry-only restore
  entryCountBeforeAction: number;
  // Flag indicating if this has full state snapshots (in-memory) or just entry data (from DB)
  hasFullState: boolean;
  // Flag indicating if entity ID snapshots are present for safe cleanup
  hasEntityIds: boolean;
  // Entity IDs for persistent restore - delete any entities not in these lists
  characterIds: string[];
  locationIds: string[];
  itemIds: string[];
  storyBeatIds: string[];
  lorebookEntryIds: string[];
}

// Error state for retry functionality
export interface GenerationError {
  message: string;
  errorEntryId: string;
  userActionEntryId: string;
  timestamp: number;
}

// Persisted action choices structure
interface PersistedActionChoices {
  storyId: string;
  choices: ActionChoice[];
}

// Persisted suggestions structure
interface PersistedSuggestions {
  storyId: string;
  suggestions: StorySuggestion[];
}

// Persisted activation data structure (for lorebook stickiness)
interface PersistedActivationData {
  storyId: string;
  activationData: Record<string, number>;
  storyPosition: number;
}

// UI State using Svelte 5 runes
class UIStore {
  activePanel = $state<ActivePanel>('story');
  sidebarTab = $state<SidebarTab>('characters');
  sidebarOpen = $state(true);
  settingsModalOpen = $state(false);
  isGenerating = $state(false);

  // Streaming state
  streamingContent = $state('');
  isStreaming = $state(false);

  // Scroll break state - persists until user sends a new message
  userScrolledUp = $state(false);

  // Error state for retry
  lastGenerationError = $state<GenerationError | null>(null);

  // Retry backups - per-story backups for "retry last message" feature
  // Stored by storyId so they persist across story switches within a session
  private retryBackups = new SvelteMap<string, RetryBackup>();
  private currentRetryStoryId = $state<string | null>(null);
  retryStateWrite = Promise.resolve();

  // Computed getter for current story's retry backup
  get retryBackup(): RetryBackup | null {
    if (!this.currentRetryStoryId) return null;
    return this.retryBackups.get(this.currentRetryStoryId) ?? null;
  }

  /**
   * Set the current story ID for retry backup tracking.
   * Called when switching stories to ensure the correct backup is returned.
   */
  setCurrentRetryStoryId(storyId: string | null) {
    this.currentRetryStoryId = storyId;
  }

  // RPG action choices (displayed after narration)
  actionChoices = $state<ActionChoice[]>([]);
  actionChoicesLoading = $state(false);
  pendingActionChoice = $state<string | null>(null);

  // Creative writing suggestions (displayed after narration)
  suggestions = $state<StorySuggestion[]>([]);
  suggestionsLoading = $state(false);

  // Style reviewer state
  messagesSinceLastStyleReview = $state(0);
  lastStyleReview = $state<StyleReviewResult | null>(null);
  styleReviewLoading = $state(false);

  // Lorebook debug state
  lastLorebookRetrieval = $state<EntryRetrievalResult | null>(null);
  lorebookDebugOpen = $state(false);

  // Lorebook manager state
  selectedLorebookEntryId = $state<string | null>(null);
  lorebookEditMode = $state(false);
  lorebookBulkSelection = $state<Set<string>>(new Set());
  lorebookSearchQuery = $state('');
  lorebookTypeFilter = $state<EntryType | 'all'>('all');
  lorebookSortBy = $state<'name' | 'type' | 'updated'>('name');
  lorebookImportModalOpen = $state(false);
  lorebookExportModalOpen = $state(false);
  // Mobile: track if we're viewing detail (for stacked navigation)
  lorebookShowDetail = $state(false);

  // Memory panel state
  memoryEditingChapterId = $state<string | null>(null);
  memoryExpandedChapterId = $state<string | null>(null);
  memorySettingsOpen = $state(false);
  manualChapterModalOpen = $state(false);
  resummarizeModalOpen = $state(false);
  resummarizeChapterId = $state<string | null>(null);
  memoryLoading = $state(false);

  // Sync modal state
  syncModalOpen = $state(false);
  syncMode = $state<SyncMode>('select');

  // Lore management mode state
  // When active, the AI is reviewing/updating the lorebook - user editing is locked
  loreManagementActive = $state(false);
  loreManagementProgress = $state('');
  loreManagementChanges = $state<number>(0);

  // Debug mode state - session-only request/response logging
  debugLogs = $state<DebugLogEntry[]>([]);
  debugModalOpen = $state(false);
  private debugLogIdCounter = 0;

  // Lorebook activation tracking for stickiness
  // Maps entry ID -> last activation position (story entry index)
  private activationData = $state<Record<string, number>>({});
  private currentStoryPosition = $state(0);

  // Retry callback - set by ActionInput
  private retryCallback: (() => Promise<void>) | null = null;

  // Retry last message callback - set by ActionInput for edit-and-retry feature
  private retryLastMessageCallback: (() => Promise<void>) | null = null;

  setActivePanel(panel: ActivePanel) {
    this.activePanel = panel;
  }

  setSidebarTab(tab: SidebarTab) {
    this.sidebarTab = tab;
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /**
   * Set mobile-friendly defaults when opening a story.
   * Closes sidebar and other expanded elements on mobile to reduce clutter.
   */
  setMobileDefaults() {
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      this.sidebarOpen = false;
    }
  }

  openSettings() {
    this.settingsModalOpen = true;
  }

  closeSettings() {
    this.settingsModalOpen = false;
  }

  setGenerating(value: boolean) {
    this.isGenerating = value;
  }

  // Streaming methods
  startStreaming() {
    this.isStreaming = true;
    this.streamingContent = '';
  }

  appendStreamContent(content: string) {
    this.streamingContent += content;
  }

  endStreaming() {
    this.isStreaming = false;
    this.streamingContent = '';
  }

  // Scroll break methods - user scrolled away during generation
  setScrollBreak(value: boolean) {
    this.userScrolledUp = value;
  }

  resetScrollBreak() {
    this.userScrolledUp = false;
  }

  getStreamingContent(): string {
    return this.streamingContent;
  }

  // Error handling methods
  setGenerationError(error: GenerationError) {
    this.lastGenerationError = error;
  }

  clearGenerationError() {
    this.lastGenerationError = null;
  }

  // Retry backup methods

  /**
   * Create a backup of the current story state before a user message.
   * This captures the state BEFORE the user action is added, so we can restore to this point.
   * Also captures lorebook activation data for stickiness preservation.
   * Persists a lightweight version to the database for cross-session retry.
   */
  createRetryBackup(
    storyId: string,
    entries: StoryEntry[],
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
    lorebookEntries: Entry[],
    userActionContent: string,
    rawInput: string,
    actionType: ActionInputType,
    wasRawActionChoice: boolean
  ) {
    const timestamp = Date.now();
    const nextEntryPosition = entries.reduce((max, entry) => Math.max(max, entry.position ?? -1), -1) + 1;

    // Extract entity IDs for persistent restore
    const characterIds = characters.map(c => c.id);
    const locationIds = locations.map(l => l.id);
    const itemIds = items.map(i => i.id);
    const storyBeatIds = storyBeats.map(sb => sb.id);
    const lorebookEntryIds = lorebookEntries.map(le => le.id);

    // Create new backup and store by story ID
    const backup: RetryBackup = {
      storyId,
      timestamp,
      // Deep copy arrays to avoid mutation issues
      entries: [...entries],
      characters: [...characters],
      locations: [...locations],
      items: [...items],
      storyBeats: [...storyBeats],
      lorebookEntries: [...lorebookEntries],
      userActionContent,
      rawInput,
      actionType,
      wasRawActionChoice,
      // Capture activation data for lorebook stickiness preservation
      activationData: { ...this.activationData },
      storyPosition: this.currentStoryPosition,
      // New fields for persistent retry
      entryCountBeforeAction: nextEntryPosition,
      hasFullState: true,
      hasEntityIds: true,
      // Entity IDs for persistent restore
      characterIds,
      locationIds,
      itemIds,
      storyBeatIds,
      lorebookEntryIds,
    };
    this.retryBackups.set(storyId, backup);
    this.currentRetryStoryId = storyId;

    // Persist lightweight version to database (includes entity IDs for full restore)
    this.queueRetryStateWrite(
      () => database.saveRetryState(storyId, {
        timestamp,
        entryCountBeforeAction: nextEntryPosition,
        userActionContent,
        rawInput,
        actionType,
        wasRawActionChoice,
        characterIds,
        locationIds,
        itemIds,
        storyBeatIds,
        lorebookEntryIds,
      }),
      'persist'
    );

    console.log('[UI] Retry backup created', {
      storyId,
      entriesCount: entries.length,
      userAction: userActionContent.substring(0, 50),
      activationEntries: Object.keys(this.activationData).length,
    });
  }

  /**
   * Clear the retry backup for a story.
   * @param clearFromDb - If true, also clears from database (use for explicit dismissal/use).
   * @param storyId - Optional story ID. If not provided, clears the current story's backup.
   */
  clearRetryBackup(clearFromDb: boolean = false, storyId?: string) {
    const targetStoryId = storyId ?? this.currentRetryStoryId;

    if (targetStoryId) {
      this.retryBackups.delete(targetStoryId);

      // Only clear from database if explicitly requested (user dismissed or used retry)
      if (clearFromDb) {
        this.queueRetryStateWrite(
          () => database.clearRetryState(targetStoryId),
          'clear'
        );
      }
    }

    console.log('[UI] Retry backup cleared', { clearFromDb, storyId: targetStoryId });
  }

  private queueRetryStateWrite(task: () => Promise<void>, label: string) {
    this.retryStateWrite = this.retryStateWrite
      .catch(() => {})
      .then(task)
      .catch(err => {
        console.warn(`[UI] Failed to ${label} retry state:`, err);
      });
  }

  /**
   * Load retry backup from persistent state (called when a story is loaded).
   * Creates a partial RetryBackup with hasFullState=false for entity-aware restore.
   * Only loads if there isn't already an in-memory backup for this story.
   */
  loadRetryBackupFromPersistent(storyId: string, retryState: {
    timestamp: number;
    entryCountBeforeAction: number;
    userActionContent: string;
    rawInput: string;
    actionType: ActionInputType;
    wasRawActionChoice: boolean;
    characterIds?: string[];
    locationIds?: string[];
    itemIds?: string[];
    storyBeatIds?: string[];
    lorebookEntryIds?: string[];
  }) {
    // Skip if we already have an in-memory backup for this story (it's more complete)
    if (this.retryBackups.has(storyId)) {
      console.log('[UI] Skipping persistent retry state load - in-memory backup exists', { storyId });
      return;
    }

    // Validate required fields exist
    if (
      typeof retryState.timestamp !== 'number' ||
      typeof retryState.entryCountBeforeAction !== 'number' ||
      typeof retryState.userActionContent !== 'string' ||
      typeof retryState.rawInput !== 'string' ||
      typeof retryState.actionType !== 'string' ||
      typeof retryState.wasRawActionChoice !== 'boolean'
    ) {
      console.warn('[UI] Invalid persistent retry state, skipping load', { storyId, retryState });
      return;
    }

    const hasEntityIds = Array.isArray(retryState.characterIds)
      && Array.isArray(retryState.locationIds)
      && Array.isArray(retryState.itemIds)
      && Array.isArray(retryState.storyBeatIds)
      && Array.isArray(retryState.lorebookEntryIds);

    const backup: RetryBackup = {
      storyId,
      timestamp: retryState.timestamp,
      // Empty state arrays - will use ID-based restore
      entries: [],
      characters: [],
      locations: [],
      items: [],
      storyBeats: [],
      lorebookEntries: [],
      // User input data
      userActionContent: retryState.userActionContent,
      rawInput: retryState.rawInput,
      actionType: retryState.actionType,
      wasRawActionChoice: retryState.wasRawActionChoice,
      // Empty activation data
      activationData: {},
      storyPosition: 0,
      // Persistent retry fields
      entryCountBeforeAction: retryState.entryCountBeforeAction,
      hasFullState: false, // Indicates ID-based restore
      hasEntityIds,
      // Entity IDs for restore - delete any entities not in these lists
      characterIds: retryState.characterIds ?? [],
      locationIds: retryState.locationIds ?? [],
      itemIds: retryState.itemIds ?? [],
      storyBeatIds: retryState.storyBeatIds ?? [],
      lorebookEntryIds: retryState.lorebookEntryIds ?? [],
    };
    this.retryBackups.set(storyId, backup);
    console.log('[UI] Retry backup loaded from persistent state', {
      storyId,
      entryCountBeforeAction: retryState.entryCountBeforeAction,
      userAction: retryState.userActionContent.substring(0, 50),
      entityIds: {
        characters: backup.characterIds.length,
        locations: backup.locationIds.length,
        items: backup.itemIds.length,
        storyBeats: backup.storyBeatIds.length,
        lorebookEntries: backup.lorebookEntryIds.length,
      },
    });
  }

  /**
   * Check if we have a valid retry backup for the current story.
   */
  hasRetryBackup(storyId: string): boolean {
    return this.retryBackup !== null && this.retryBackup.storyId === storyId;
  }

  /**
   * Restore activation data from a backup.
   * Called during "retry last message" to preserve lorebook stickiness state.
   */
  restoreActivationData(activationData: Record<string, number>, storyPosition: number) {
    this.activationData = { ...activationData };
    this.currentStoryPosition = storyPosition;
    console.log('[UI] Activation data restored from backup', {
      entriesCount: Object.keys(activationData).length,
      storyPosition,
    });
  }

  /**
   * Update the user action content in the retry backup.
   * Used when editing the last user message to retry with new content.
   */
  updateRetryBackupContent(newContent: string) {
    const backup = this.retryBackup;
    if (backup && this.currentRetryStoryId) {
      const updatedBackup: RetryBackup = {
        ...backup,
        userActionContent: newContent,
        rawInput: newContent,
      };
      this.retryBackups.set(this.currentRetryStoryId, updatedBackup);

      // Also persist the updated content to the database
      const storyId = this.currentRetryStoryId;
      this.queueRetryStateWrite(
        () => database.saveRetryState(storyId, {
          timestamp: backup.timestamp,
          entryCountBeforeAction: backup.entryCountBeforeAction,
          userActionContent: newContent,
          rawInput: newContent,
          actionType: backup.actionType,
          wasRawActionChoice: backup.wasRawActionChoice,
          characterIds: backup.characterIds,
          locationIds: backup.locationIds,
          itemIds: backup.itemIds,
          storyBeatIds: backup.storyBeatIds,
          lorebookEntryIds: backup.lorebookEntryIds,
        }),
        'update'
      );

      console.log('[UI] Retry backup content updated', {
        newContent: newContent.substring(0, 50),
      });
    }
  }

  // Action choices methods
  private getActionChoicesKey(storyId: string): string {
    return `action_choices:${storyId}`;
  }

  setActionChoices(choices: ActionChoice[], storyId?: string) {
    this.actionChoices = choices;
    // Persist to database if we have a story ID
    if (storyId && choices.length > 0) {
      const data: PersistedActionChoices = { storyId, choices };
      database.setSetting(this.getActionChoicesKey(storyId), JSON.stringify(data)).catch(err => {
        console.warn('[UI] Failed to persist action choices:', err);
      });
    }
  }

  setActionChoicesLoading(loading: boolean) {
    this.actionChoicesLoading = loading;
  }

  clearActionChoices(storyId?: string) {
    this.actionChoices = [];
    // Clear persisted choices
    if (storyId) {
      database.setSetting(this.getActionChoicesKey(storyId), '').catch(err => {
        console.warn('[UI] Failed to clear persisted action choices:', err);
      });
    } else {
      database.setSetting('action_choices', '').catch(err => {
        console.warn('[UI] Failed to clear persisted action choices:', err);
      });
    }
  }

  /**
   * Load persisted action choices for a story.
   * Called when a story is loaded.
   */
  async loadActionChoices(storyId: string) {
    try {
      // Reset in-memory choices when switching stories
      this.actionChoices = [];
      const data = await database.getSetting(this.getActionChoicesKey(storyId));
      if (data) {
        const parsed: PersistedActionChoices = JSON.parse(data);
        // Only restore if it's for the same story
        if (parsed.storyId === storyId && parsed.choices.length > 0) {
          this.actionChoices = parsed.choices;
          console.log('[UI] Restored action choices for story:', storyId);
          return;
        }
      }

      const legacyData = await database.getSetting('action_choices');
      if (legacyData) {
        const parsed: PersistedActionChoices = JSON.parse(legacyData);
        if (parsed.storyId === storyId && parsed.choices.length > 0) {
          this.actionChoices = parsed.choices;
          database.setSetting(this.getActionChoicesKey(storyId), legacyData).catch(err => {
            console.warn('[UI] Failed to migrate legacy action choices:', err);
          });
          console.log('[UI] Restored legacy action choices for story:', storyId);
        }
      }
    } catch (err) {
      console.warn('[UI] Failed to load persisted action choices:', err);
    }
  }

  setPendingActionChoice(text: string, storyId?: string) {
    this.pendingActionChoice = text;
    this.actionChoices = [];
    // Clear persisted choices when one is selected
    if (storyId) {
      database.setSetting(this.getActionChoicesKey(storyId), '').catch(err => {
        console.warn('[UI] Failed to clear persisted action choices:', err);
      });
    } else {
      database.setSetting('action_choices', '').catch(err => {
        console.warn('[UI] Failed to clear persisted action choices:', err);
      });
    }
  }

  clearPendingActionChoice() {
    this.pendingActionChoice = null;
  }

  // Suggestions methods (creative writing mode)
  private getSuggestionsKey(storyId: string): string {
    return `story_suggestions:${storyId}`;
  }

  setSuggestions(suggestions: StorySuggestion[], storyId?: string) {
    this.suggestions = suggestions;
    // Persist to database if we have a story ID
    if (storyId && suggestions.length > 0) {
      const data: PersistedSuggestions = { storyId, suggestions };
      database.setSetting(this.getSuggestionsKey(storyId), JSON.stringify(data)).catch(err => {
        console.warn('[UI] Failed to persist suggestions:', err);
      });
    }
  }

  setSuggestionsLoading(loading: boolean) {
    this.suggestionsLoading = loading;
  }

  clearSuggestions(storyId?: string) {
    this.suggestions = [];
    // Clear persisted suggestions
    if (storyId) {
      database.setSetting(this.getSuggestionsKey(storyId), '').catch(err => {
        console.warn('[UI] Failed to clear persisted suggestions:', err);
      });
    } else {
      database.setSetting('story_suggestions', '').catch(err => {
        console.warn('[UI] Failed to clear persisted suggestions:', err);
      });
    }
  }

  /**
   * Load persisted suggestions for a story.
   * Called when a story is loaded.
   */
  async loadSuggestions(storyId: string) {
    try {
      // Reset in-memory suggestions when switching stories
      this.suggestions = [];
      const data = await database.getSetting(this.getSuggestionsKey(storyId));
      if (data) {
        const parsed: PersistedSuggestions = JSON.parse(data);
        // Only restore if it's for the same story
        if (parsed.storyId === storyId && parsed.suggestions.length > 0) {
          this.suggestions = parsed.suggestions;
          console.log('[UI] Restored suggestions for story:', storyId);
          return;
        }
      }

      const legacyData = await database.getSetting('story_suggestions');
      if (legacyData) {
        const parsed: PersistedSuggestions = JSON.parse(legacyData);
        if (parsed.storyId === storyId && parsed.suggestions.length > 0) {
          this.suggestions = parsed.suggestions;
          database.setSetting(this.getSuggestionsKey(storyId), legacyData).catch(err => {
            console.warn('[UI] Failed to migrate legacy suggestions:', err);
          });
          console.log('[UI] Restored legacy suggestions for story:', storyId);
        }
      }
    } catch (err) {
      console.warn('[UI] Failed to load persisted suggestions:', err);
    }
  }

  // Retry callback management
  setRetryCallback(callback: (() => Promise<void>) | null) {
    this.retryCallback = callback;
  }

  async triggerRetry() {
    console.log('[UI] triggerRetry called', { hasCallback: !!this.retryCallback });
    if (this.retryCallback) {
      await this.retryCallback();
      console.log('[UI] retryCallback completed');
    } else {
      console.log('[UI] No retry callback registered!');
    }
  }

  // Retry last message callback management (for edit-and-retry feature)
  setRetryLastMessageCallback(callback: (() => Promise<void>) | null) {
    this.retryLastMessageCallback = callback;
  }

  async triggerRetryLastMessage() {
    console.log('[UI] triggerRetryLastMessage called', { hasCallback: !!this.retryLastMessageCallback });
    if (this.retryLastMessageCallback) {
      await this.retryLastMessageCallback();
      console.log('[UI] retryLastMessageCallback completed');
    } else {
      console.log('[UI] No retry last message callback registered!');
    }
  }

  // Style reviewer methods
  incrementStyleReviewCounter() {
    this.messagesSinceLastStyleReview++;
  }

  resetStyleReviewCounter() {
    this.messagesSinceLastStyleReview = 0;
  }

  setStyleReview(result: StyleReviewResult) {
    this.lastStyleReview = result;
    this.messagesSinceLastStyleReview = 0;
  }

  clearStyleReview() {
    this.lastStyleReview = null;
  }

  setStyleReviewLoading(loading: boolean) {
    this.styleReviewLoading = loading;
  }

  // Lorebook debug methods
  setLastLorebookRetrieval(result: EntryRetrievalResult | null) {
    this.lastLorebookRetrieval = result;
  }

  openLorebookDebug() {
    this.lorebookDebugOpen = true;
  }

  closeLorebookDebug() {
    this.lorebookDebugOpen = false;
  }

  toggleLorebookDebug() {
    this.lorebookDebugOpen = !this.lorebookDebugOpen;
  }

  // Lorebook manager methods
  selectLorebookEntry(id: string | null) {
    this.selectedLorebookEntryId = id;
    this.lorebookEditMode = false;
    if (id) {
      this.lorebookShowDetail = true;
    }
  }

  setLorebookEditMode(editing: boolean) {
    this.lorebookEditMode = editing;
  }

  toggleBulkSelection(id: string) {
    const newSet = new Set(this.lorebookBulkSelection);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    this.lorebookBulkSelection = newSet;
  }

  selectAllForBulk(ids: string[]) {
    this.lorebookBulkSelection = new Set(ids);
  }

  clearBulkSelection() {
    this.lorebookBulkSelection = new Set();
  }

  setLorebookSearchQuery(query: string) {
    this.lorebookSearchQuery = query;
  }

  setLorebookTypeFilter(filter: EntryType | 'all') {
    this.lorebookTypeFilter = filter;
  }

  setLorebookSortBy(sort: 'name' | 'type' | 'updated') {
    this.lorebookSortBy = sort;
  }

  openLorebookImport() {
    this.lorebookImportModalOpen = true;
  }

  closeLorebookImport() {
    this.lorebookImportModalOpen = false;
  }

  openLorebookExport() {
    this.lorebookExportModalOpen = true;
  }

  closeLorebookExport() {
    this.lorebookExportModalOpen = false;
  }

  // Mobile navigation for lorebook
  showLorebookDetail() {
    this.lorebookShowDetail = true;
  }

  hideLorebookDetail() {
    this.lorebookShowDetail = false;
    this.selectedLorebookEntryId = null;
    this.lorebookEditMode = false;
  }

  // Lore management mode methods
  startLoreManagement() {
    this.loreManagementActive = true;
    this.loreManagementProgress = 'Analyzing story content...';
    this.loreManagementChanges = 0;
    // Close any open modals/edit modes since user can't edit during lore management
    this.lorebookEditMode = false;
    this.lorebookImportModalOpen = false;
    this.lorebookExportModalOpen = false;
  }

  updateLoreManagementProgress(message: string, changesCount?: number) {
    this.loreManagementProgress = message;
    if (changesCount !== undefined) {
      this.loreManagementChanges = changesCount;
    }
  }

  finishLoreManagement() {
    this.loreManagementActive = false;
    this.loreManagementProgress = '';
  }

  // Reset lorebook manager state (when leaving panel or switching stories)
  resetLorebookManager() {
    this.selectedLorebookEntryId = null;
    this.lorebookEditMode = false;
    this.lorebookBulkSelection = new Set();
    this.lorebookSearchQuery = '';
    this.lorebookShowDetail = false;
  }

  // Memory panel methods
  setMemoryEditingChapter(id: string | null) {
    this.memoryEditingChapterId = id;
  }

  toggleChapterExpanded(id: string) {
    this.memoryExpandedChapterId = this.memoryExpandedChapterId === id ? null : id;
  }

  toggleMemorySettings() {
    this.memorySettingsOpen = !this.memorySettingsOpen;
  }

  openManualChapterModal() {
    this.manualChapterModalOpen = true;
  }

  closeManualChapterModal() {
    this.manualChapterModalOpen = false;
  }

  openResummarizeModal(chapterId: string) {
    this.resummarizeChapterId = chapterId;
    this.resummarizeModalOpen = true;
  }

  closeResummarizeModal() {
    this.resummarizeModalOpen = false;
    this.resummarizeChapterId = null;
  }

  setMemoryLoading(loading: boolean) {
    this.memoryLoading = loading;
  }

  resetMemoryPanel() {
    this.memoryEditingChapterId = null;
    this.memoryExpandedChapterId = null;
    this.memorySettingsOpen = false;
    this.manualChapterModalOpen = false;
    this.resummarizeModalOpen = false;
    this.resummarizeChapterId = null;
    this.memoryLoading = false;
  }

  // Sync modal methods
  openSyncModal() {
    this.syncModalOpen = true;
    this.syncMode = 'select';
  }

  closeSyncModal() {
    this.syncModalOpen = false;
    this.syncMode = 'select';
  }

  setSyncMode(mode: SyncMode) {
    this.syncMode = mode;
  }

  // Activation tracking methods for lorebook stickiness

  // Track the current story ID for activation persistence
  private currentActivationStoryId: string | null = null;

  /**
   * Create an activation tracker for the current story position.
   * The tracker maintains references to our state so activations are persisted.
   */
  getActivationTracker(storyPosition: number): ActivationTracker {
    this.currentStoryPosition = storyPosition;
    const tracker = new SimpleActivationTracker(storyPosition);
    tracker.loadActivationData(this.activationData);
    return tracker;
  }

  /**
   * Update activation data after retrieval completes.
   * Called with the tracker that was modified during retrieval.
   */
  updateActivationData(tracker: SimpleActivationTracker, storyId?: string) {
    this.activationData = tracker.getActivationData();
    // Prune old activations (beyond max stickiness of 10 turns)
    tracker.pruneOldActivations(10);
    this.activationData = tracker.getActivationData();

    // Persist to database
    const targetStoryId = storyId || this.currentActivationStoryId;
    if (targetStoryId) {
      this.saveActivationData(targetStoryId);
    }
  }

  /**
   * Clear activation data (e.g., when switching stories).
   */
  clearActivationData() {
    this.activationData = {};
    this.currentStoryPosition = 0;
    this.currentActivationStoryId = null;
  }

  /**
   * Save activation data to the database for persistence.
   */
  saveActivationData(storyId: string) {
    this.currentActivationStoryId = storyId;
    const data: PersistedActivationData = {
      storyId,
      activationData: { ...this.activationData },
      storyPosition: this.currentStoryPosition,
    };
    database.setSetting('lorebook_activation', JSON.stringify(data)).catch(err => {
      console.warn('[UI] Failed to persist activation data:', err);
    });
  }

  /**
   * Load activation data from the database for a story.
   * Called when a story is loaded.
   */
  async loadActivationData(storyId: string) {
    try {
      const data = await database.getSetting('lorebook_activation');
      if (data) {
        const parsed: PersistedActivationData = JSON.parse(data);
        // Only restore if it's for the same story
        if (parsed.storyId === storyId) {
          this.activationData = parsed.activationData;
          this.currentStoryPosition = parsed.storyPosition;
          this.currentActivationStoryId = storyId;
          console.log('[UI] Restored activation data for story:', storyId, {
            entriesCount: Object.keys(parsed.activationData).length,
            storyPosition: parsed.storyPosition,
          });
          return;
        }
      }
      // No matching data found, start fresh
      this.activationData = {};
      this.currentStoryPosition = 0;
      this.currentActivationStoryId = storyId;
    } catch (err) {
      console.warn('[UI] Failed to load persisted activation data:', err);
      this.activationData = {};
      this.currentStoryPosition = 0;
      this.currentActivationStoryId = storyId;
    }
  }

  /**
   * Get current activation data for debugging.
   */
  getActivationDebugInfo(): { data: Record<string, number>; position: number } {
    return {
      data: { ...this.activationData },
      position: this.currentStoryPosition,
    };
  }

  // Debug log methods

  /**
   * Add a request log entry. Returns the entry ID for pairing with response.
   */
  addDebugRequest(serviceName: string, data: Record<string, unknown>): string {
    const id = `debug-${++this.debugLogIdCounter}-${Date.now()}`;
    const entry: DebugLogEntry = {
      id,
      timestamp: Date.now(),
      type: 'request',
      serviceName,
      data,
    };
    this.debugLogs = [...this.debugLogs, entry];
    // Keep only last 100 entries to prevent memory issues
    if (this.debugLogs.length > 100) {
      this.debugLogs = this.debugLogs.slice(-100);
    }
    return id;
  }

  /**
   * Add a response log entry paired with a request.
   */
  addDebugResponse(
    requestId: string,
    serviceName: string,
    data: Record<string, unknown>,
    startTime: number,
    error?: string
  ) {
    const entry: DebugLogEntry = {
      id: `${requestId}-response`,
      timestamp: Date.now(),
      type: 'response',
      serviceName,
      data,
      duration: Date.now() - startTime,
      error,
    };
    this.debugLogs = [...this.debugLogs, entry];
    // Keep only last 100 entries to prevent memory issues
    if (this.debugLogs.length > 100) {
      this.debugLogs = this.debugLogs.slice(-100);
    }
  }

  /**
   * Clear all debug logs (session clear).
   */
  clearDebugLogs() {
    this.debugLogs = [];
  }

  /**
   * Open the debug log modal.
   */
  openDebugModal() {
    this.debugModalOpen = true;
  }

  /**
   * Close the debug log modal.
   */
  closeDebugModal() {
    this.debugModalOpen = false;
  }

  /**
   * Toggle the debug log modal.
   */
  toggleDebugModal() {
    this.debugModalOpen = !this.debugModalOpen;
  }
}

export const ui = new UIStore();
