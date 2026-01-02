import type { ActivePanel, SidebarTab, UIState, EntryType } from '$lib/types';
import type { ActionChoice } from '$lib/services/ai/actionChoices';
import type { StyleReviewResult } from '$lib/services/ai/styleReviewer';
import type { EntryRetrievalResult, ActivationTracker } from '$lib/services/ai/entryRetrieval';
import { SimpleActivationTracker } from '$lib/services/ai/entryRetrieval';
import { database } from '$lib/services/database';

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

  // Error state for retry
  lastGenerationError = $state<GenerationError | null>(null);

  // RPG action choices (displayed after narration)
  actionChoices = $state<ActionChoice[]>([]);
  actionChoicesLoading = $state(false);
  pendingActionChoice = $state<string | null>(null);

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

  // Lorebook activation tracking for stickiness
  // Maps entry ID -> last activation position (story entry index)
  private activationData = $state<Record<string, number>>({});
  private currentStoryPosition = $state(0);

  // Retry callback - set by ActionInput
  private retryCallback: (() => Promise<void>) | null = null;

  setActivePanel(panel: ActivePanel) {
    this.activePanel = panel;
  }

  setSidebarTab(tab: SidebarTab) {
    this.sidebarTab = tab;
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
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

  // Action choices methods
  setActionChoices(choices: ActionChoice[], storyId?: string) {
    this.actionChoices = choices;
    // Persist to database if we have a story ID
    if (storyId && choices.length > 0) {
      const data: PersistedActionChoices = { storyId, choices };
      database.setSetting('action_choices', JSON.stringify(data)).catch(err => {
        console.warn('[UI] Failed to persist action choices:', err);
      });
    }
  }

  setActionChoicesLoading(loading: boolean) {
    this.actionChoicesLoading = loading;
  }

  clearActionChoices() {
    this.actionChoices = [];
    // Clear persisted choices
    database.setSetting('action_choices', '').catch(err => {
      console.warn('[UI] Failed to clear persisted action choices:', err);
    });
  }

  /**
   * Load persisted action choices for a story.
   * Called when a story is loaded.
   */
  async loadActionChoices(storyId: string) {
    try {
      const data = await database.getSetting('action_choices');
      if (data) {
        const parsed: PersistedActionChoices = JSON.parse(data);
        // Only restore if it's for the same story
        if (parsed.storyId === storyId && parsed.choices.length > 0) {
          this.actionChoices = parsed.choices;
          console.log('[UI] Restored action choices for story:', storyId);
        }
      }
    } catch (err) {
      console.warn('[UI] Failed to load persisted action choices:', err);
    }
  }

  setPendingActionChoice(text: string) {
    this.pendingActionChoice = text;
    this.actionChoices = [];
    // Clear persisted choices when one is selected
    database.setSetting('action_choices', '').catch(err => {
      console.warn('[UI] Failed to clear persisted action choices:', err);
    });
  }

  clearPendingActionChoice() {
    this.pendingActionChoice = null;
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

  // Reset lorebook manager state (when leaving panel or switching stories)
  resetLorebookManager() {
    this.selectedLorebookEntryId = null;
    this.lorebookEditMode = false;
    this.lorebookBulkSelection = new Set();
    this.lorebookSearchQuery = '';
    this.lorebookShowDetail = false;
  }

  // Activation tracking methods for lorebook stickiness

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
  updateActivationData(tracker: SimpleActivationTracker) {
    this.activationData = tracker.getActivationData();
    // Prune old activations (beyond max stickiness of 10 turns)
    tracker.pruneOldActivations(10);
    this.activationData = tracker.getActivationData();
  }

  /**
   * Clear activation data (e.g., when switching stories).
   */
  clearActivationData() {
    this.activationData = {};
    this.currentStoryPosition = 0;
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
}

export const ui = new UIStore();
