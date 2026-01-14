import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, Checkpoint, Branch, MemoryConfig, StoryMode, StorySettings, Entry, TimeTracker, EmbeddedImage, PersistentCharacterSnapshot } from '$lib/types';
import { database } from '$lib/services/database';
import { BUILTIN_TEMPLATES } from '$lib/services/templates';
import { ui } from './ui.svelte';
import type { ClassificationResult } from '$lib/services/ai/classifier';
import { DEFAULT_MEMORY_CONFIG } from '$lib/services/ai/memory';
import { convertToEntries, type ImportedEntry } from '$lib/services/lorebookImporter';
import { countTokens } from '$lib/services/tokenizer';
import {
  eventBus,
  emitStoryLoaded,
  emitModeChanged,
  emitStateUpdated,
  emitChapterCreated,
  type CheckpointCreatedEvent,
  type CheckpointRestoredEvent,
  type StoryCreatedEvent,
  type SaveCompleteEvent,
} from '$lib/services/events';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[StoryStore]', ...args);
  }
}

// Story Store using Svelte 5 runes
class StoryStore {
  // Current active story
  currentStory = $state<Story | null>(null);
  entries = $state<StoryEntry[]>([]);

  // Lorebook entries (per design doc section 3.2)
  lorebookEntries = $state<Entry[]>([]);

  // World state for current story
  characters = $state<Character[]>([]);
  locations = $state<Location[]>([]);
  items = $state<Item[]>([]);
  storyBeats = $state<StoryBeat[]>([]);

  // Memory system
  chapters = $state<Chapter[]>([]);
  checkpoints = $state<Checkpoint[]>([]);

  // Branching system
  branches = $state<Branch[]>([]);

  // Story library
  allStories = $state<Story[]>([]);

  // Performance caches - avoid O(n) recalculations on every access
  private _cachedWordCount: number = 0;
  private _wordCountDirty: boolean = true;
  private _cachedLastChapterEndIndex: number = 0;
  private _lastChapterEndIndexDirty: boolean = true;
  private _lastChaptersLength: number = 0;
  private _lastEntriesLength: number = 0;

  // Entry ID to index map for O(1) lookups
  private _entryIdToIndex: Map<string, number> = new Map();

  // Derived states
  get currentLocation(): Location | undefined {
    return this.locations.find(l => l.current);
  }

  get activeCharacters(): Character[] {
    return this.characters.filter(c => c.status === 'active');
  }

  get protagonist(): Character | undefined {
    return this.characters.find(c => c.relationship === 'self');
  }

  get pov(): 'first' | 'second' | 'third' {
    const mode = this.currentStory?.mode ?? 'adventure';
    const stored = this.currentStory?.settings?.pov ?? null;
    // For creative-writing mode, respect the user's stored POV choice
    // (wizard allows selecting first, second, or third person)
    if (stored) {
      return stored;
    }
    // Default based on mode
    if (mode === 'creative-writing') {
      return 'third';
    }
    return 'first';
  }

  get tense(): 'past' | 'present' {
    const mode = this.currentStory?.mode ?? 'adventure';
    const stored = this.currentStory?.settings?.tense ?? null;
    if (mode === 'creative-writing') {
      return 'past';
    }
    return stored ?? 'present';
  }

  get inventoryItems(): Item[] {
    return this.items.filter(i => i.location === 'inventory');
  }

  get equippedItems(): Item[] {
    return this.items.filter(i => i.equipped);
  }

  get pendingQuests(): StoryBeat[] {
    return this.storyBeats.filter(b => b.status === 'pending' || b.status === 'active');
  }

  get wordCount(): number {
    // Use cached value if available, recalculate only when dirty
    if (this._wordCountDirty) {
      this._cachedWordCount = this.entries.reduce((count, entry) => {
        return count + entry.content.split(/\s+/).filter(Boolean).length;
      }, 0);
      this._wordCountDirty = false;
    }
    return this._cachedWordCount;
  }

  /**
   * Invalidate word count cache - call when entries are added/removed/modified
   */
  private invalidateWordCountCache(): void {
    this._wordCountDirty = true;
  }

  get memoryConfig(): MemoryConfig {
    return this.currentStory?.memoryConfig || DEFAULT_MEMORY_CONFIG;
  }

  get storyMode(): StoryMode {
    return this.currentStory?.mode || 'adventure';
  }

  get timeTracker(): TimeTracker {
    return this.currentStory?.timeTracker || { years: 0, days: 0, hours: 0, minutes: 0 };
  }

  /**
   * Get chapters filtered by current branch and its lineage.
   * Includes main branch chapters plus any ancestor/current branch chapters.
   */
  get currentBranchChapters(): Chapter[] {
    const currentBranchId = this.currentStory?.currentBranchId ?? null;

    // If on main branch, only return chapters with null branchId
    if (currentBranchId === null) {
      return this.chapters.filter(ch => ch.branchId === null);
    }

    const lineage = this.buildBranchLineage(currentBranchId);
    if (lineage.length === 0) {
      return this.chapters.filter(ch => ch.branchId === null);
    }

    const lineageIds = new Set(lineage.map(branch => branch.id));
    return this.chapters.filter(ch => ch.branchId === null || lineageIds.has(ch.branchId));
  }

  get lastChapterEndIndex(): number {
    // Use branch-filtered chapters for this computation
    const branchChapters = this.currentBranchChapters;
    if (branchChapters.length === 0) return 0;

    // Check if cache is valid - invalidate if chapters or entries changed
    const chaptersChanged = this.chapters.length !== this._lastChaptersLength;
    const entriesChanged = this.entries.length !== this._lastEntriesLength;

    if (chaptersChanged || entriesChanged || this._lastChapterEndIndexDirty) {
      this._lastChaptersLength = this.chapters.length;
      this._lastEntriesLength = this.entries.length;
      this._cachedLastChapterEndIndex = this._computeLastChapterEndIndex();
      this._lastChapterEndIndexDirty = false;
    }

    return this._cachedLastChapterEndIndex;
  }

  /**
   * Rebuild the entry ID to index map for O(1) lookups.
   * Called when entries array changes significantly.
   */
  private rebuildEntryIdIndex(): void {
    this._entryIdToIndex.clear();
    for (let i = 0; i < this.entries.length; i++) {
      this._entryIdToIndex.set(this.entries[i].id, i);
    }
  }

  /**
   * Compute lastChapterEndIndex - internal implementation.
   * Uses branch-filtered chapters for correct branch awareness.
   */
  private _computeLastChapterEndIndex(): number {
    // Use branch-filtered chapters
    const branchChapters = this.currentBranchChapters;
    if (branchChapters.length === 0) return 0;

    // Rebuild index map if needed
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex();
    }

    // Sort chapters by number to ensure we get the actual last chapter for this branch
    const sortedChapters = [...branchChapters].sort((a, b) => a.number - b.number);
    const lastChapter = sortedChapters[sortedChapters.length - 1];

    // Use O(1) map lookup instead of O(n) find + indexOf
    const endIndex = this._entryIdToIndex.get(lastChapter.endEntryId);
    if (endIndex !== undefined) {
      return endIndex + 1;
    }

    // Fallback: if endEntryId references a deleted entry, estimate based on entry counts
    log('Warning: Chapter endEntryId not found, using fallback calculation', {
      chapterId: lastChapter.id,
      chapterNumber: lastChapter.number,
      endEntryId: lastChapter.endEntryId,
    });

    // Sum up all branch chapter entry counts as a fallback estimate
    const totalChapterEntries = sortedChapters.reduce((sum, ch) => sum + ch.entryCount, 0);
    return Math.min(totalChapterEntries, this.entries.length);
  }

  /**
   * Invalidate lastChapterEndIndex cache - call when chapters change
   */
  private invalidateChapterCache(): void {
    this._lastChapterEndIndexDirty = true;
    this._entryIdToIndex.clear(); // Force rebuild on next access
  }

  get messagesSinceLastChapter(): number {
    return this.entries.length - this.lastChapterEndIndex;
  }

  /**
   * Calculate token count since last chapter.
   * Uses stored token count (accurate) or calculates via tokenizer for legacy entries.
   */
  get tokensSinceLastChapter(): number {
    const visibleEntries = this.entries.slice(this.lastChapterEndIndex);
    return visibleEntries.reduce((total, entry) => {
      // Use stored token count if available
      if (entry.metadata?.tokenCount) {
        return total + entry.metadata.tokenCount;
      }
      // Fallback for legacy entries without stored token count
      return total + countTokens(entry.content);
    }, 0);
  }

  /**
   * Get token count for entries outside the buffer (eligible for summarization).
   * Returns 0 if no entries exist outside the buffer.
   */
  get tokensOutsideBuffer(): number {
    const bufferSize = this.memoryConfig.chapterBuffer;
    const visibleEntries = this.entries.slice(this.lastChapterEndIndex);

    // If all visible entries are within the buffer, nothing to summarize
    if (visibleEntries.length <= bufferSize) {
      return 0;
    }

    // Count tokens for entries outside the buffer
    // Note: slice(0, -0) returns [] in JavaScript, so we need to handle bufferSize === 0 specially
    const entriesOutsideBuffer = bufferSize === 0
      ? visibleEntries
      : visibleEntries.slice(0, -bufferSize);
    return entriesOutsideBuffer.reduce((total, entry) => {
      if (entry.metadata?.tokenCount) {
        return total + entry.metadata.tokenCount;
      }
      // Fallback for legacy entries without stored token count
      return total + countTokens(entry.content);
    }, 0);
  }

  /**
   * Get entries that are NOT part of any chapter (visible in context).
   * These are entries after the last chapter's endEntryId.
   * Per design doc section 3.1.2: summarized entries should be excluded from context.
   */
  get visibleEntries(): StoryEntry[] {
    if (this.chapters.length === 0) {
      // No chapters yet, all entries are visible
      return this.entries;
    }
    // Return only entries after the last chapter
    return this.entries.slice(this.lastChapterEndIndex);
  }

  /**
   * Check if a specific entry has been summarized into a chapter.
   * Uses O(1) map lookup for performance.
   */
  isEntrySummarized(entryId: string): boolean {
    // Ensure index map is up to date
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex();
    }
    const entryIndex = this._entryIdToIndex.get(entryId);
    if (entryIndex === undefined) return false;
    return entryIndex < this.lastChapterEndIndex;
  }

  /**
   * Validate chapter integrity and repair issues.
   * Called after loading a story to ensure chapter data is consistent.
   * Returns true if repairs were made.
   */
  private async validateChapterIntegrity(): Promise<boolean> {
    if (this.chapters.length === 0) return false;

    let repairsMade = false;
    const entryIdSet = new Set(this.entries.map(e => e.id));
    const chaptersToDelete: string[] = [];

    // Sort chapters by number for proper validation
    const sortedChapters = [...this.chapters].sort((a, b) => a.number - b.number);

    for (const chapter of sortedChapters) {
      const hasValidStart = entryIdSet.has(chapter.startEntryId);
      const hasValidEnd = entryIdSet.has(chapter.endEntryId);

      if (!hasValidStart || !hasValidEnd) {
        log('Chapter has invalid entry references, marking for deletion', {
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          hasValidStart,
          hasValidEnd,
          startEntryId: chapter.startEntryId,
          endEntryId: chapter.endEntryId,
        });
        chaptersToDelete.push(chapter.id);
        repairsMade = true;
      }
    }

    // Delete invalid chapters from database and local state
    for (const chapterId of chaptersToDelete) {
      try {
        await database.deleteChapter(chapterId);
        log('Deleted invalid chapter:', chapterId);
      } catch (error) {
        log('Failed to delete invalid chapter:', chapterId, error);
      }
    }

    if (chaptersToDelete.length > 0) {
      this.chapters = this.chapters.filter(ch => !chaptersToDelete.includes(ch.id));
      // Invalidate chapter cache after deletions
      this.invalidateChapterCache();
    }

    // Ensure chapters are sorted by number
    this.chapters = [...this.chapters].sort((a, b) => a.number - b.number);

    if (repairsMade) {
      log('Chapter integrity validation complete', {
        deletedChapters: chaptersToDelete.length,
        remainingChapters: this.chapters.length,
      });
    }

    return repairsMade;
  }

  // Load all stories for library view
  async loadAllStories(): Promise<void> {
    this.allStories = await database.getAllStories();
  }

  // Load a specific story with all its data
  async loadStory(storyId: string): Promise<void> {
    const story = await database.getStory(storyId);
    if (!story) {
      throw new Error(`Story not found: ${storyId}`);
    }

    // Clean up any orphaned embedded_images before loading
    // (fixes FK constraint issues from older data)
    await database.cleanupOrphanedEmbeddedImages();

    this.currentStory = story;

    // Load branch-independent data first
    const [characters, locations, items, storyBeats, checkpoints, lorebookEntries, branches] = await Promise.all([
      database.getCharacters(storyId),
      database.getLocations(storyId),
      database.getItems(storyId),
      database.getStoryBeats(storyId),
      database.getCheckpoints(storyId),
      database.getEntries(storyId),
      database.getBranches(storyId),
    ]);

    this.characters = characters;
    this.locations = locations;
    this.items = items;
    this.storyBeats = storyBeats;
    this.checkpoints = checkpoints;
    this.lorebookEntries = lorebookEntries;
    this.branches = branches;

    // Load entries and chapters based on current branch
    await this.reloadEntriesForCurrentBranch();

    // Reset all caches after loading
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    log('Story loaded', {
      id: storyId,
      mode: story.mode,
      entries: this.entries.length,
      lorebookEntries: lorebookEntries.length,
      chapters: this.chapters.length,
      checkpoints: checkpoints.length,
      branches: branches.length,
      currentBranchId: story.currentBranchId,
    });

    // Load persisted activation data for this story (stickiness tracking)
    await ui.loadActivationData(storyId);

    // Set current story ID for retry backup tracking
    ui.setCurrentRetryStoryId(storyId);

    // Load retry state from DB if we don't have an in-memory backup for this story
    if (story.retryState) {
      ui.loadRetryBackupFromPersistent(storyId, story.retryState);
    }

    // Load style review state from DB
    ui.loadStyleReviewState(storyId, story.styleReviewState);

    // Validate and repair chapter integrity (handles orphaned references)
    await this.validateChapterIntegrity();

    // Load persisted action choices for adventure mode
    if (story.mode === 'adventure') {
      await ui.loadActionChoices(storyId);
    }

    // Load persisted suggestions for creative-writing mode
    if (story.mode === 'creative-writing') {
      await ui.loadSuggestions(storyId);
    }

    // Set mobile-friendly defaults (close sidebar, etc.)
    ui.setMobileDefaults();

    // Emit event
    emitStoryLoaded(storyId, story.mode);
  }

  // Create a new story
  async createStory(
    title: string,
    templateId?: string,
    genre?: string,
    mode: StoryMode = 'adventure'
  ): Promise<Story> {
    const storyData = await database.createStory({
      id: crypto.randomUUID(),
      title,
      description: null,
      genre: genre ?? null,
      templateId: templateId ?? null,
      mode,
      settings: null,
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
    });

    this.allStories = [storyData, ...this.allStories];

    // Emit event
    eventBus.emit<StoryCreatedEvent>({ type: 'StoryCreated', storyId: storyData.id, mode });

    return storyData;
  }

  // Create a new story from a template with initialization
  async createStoryFromTemplate(
    title: string,
    templateId: string,
    genre?: string,
    mode: StoryMode = 'adventure',
    settings?: StorySettings
  ): Promise<Story> {
    const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);

    // Create the base story
    const storyData = await database.createStory({
      id: crypto.randomUUID(),
      title,
      description: template?.description ?? null,
      genre: genre ?? null,
      templateId,
      mode,
      settings: settings ?? null,
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
    });

    this.allStories = [storyData, ...this.allStories];

    // Initialize with template data if available
    if (template?.initialState) {
      const state = template.initialState;

      // Add protagonist as a character if defined
      if (state.protagonist) {
        const protagonist: Character = {
          id: crypto.randomUUID(),
          storyId: storyData.id,
          name: state.protagonist.name ?? 'Protagonist',
          description: state.protagonist.description ?? null,
          relationship: 'self',
          traits: state.protagonist.traits ?? [],
          status: 'active',
          metadata: null,
          visualDescriptors: [],
          portrait: null,
          branchId: null, // New stories start on main branch
        };
        await database.addCharacter(protagonist);
      }

      // Add starting location if defined
      if (state.startingLocation) {
        const location: Location = {
          id: crypto.randomUUID(),
          storyId: storyData.id,
          name: state.startingLocation.name ?? 'Starting Location',
          description: state.startingLocation.description ?? null,
          visited: true,
          current: true,
          connections: [],
          metadata: null,
          branchId: null, // New stories start on main branch
        };
        await database.addLocation(location);
      }

      // Add initial items if defined
      if (state.initialItems) {
        for (const itemData of state.initialItems) {
          const item: Item = {
            id: crypto.randomUUID(),
            storyId: storyData.id,
            name: itemData.name ?? 'Item',
            description: itemData.description ?? null,
            quantity: itemData.quantity ?? 1,
            equipped: false,
            location: 'inventory',
            metadata: null,
            branchId: null, // New stories start on main branch
          };
          await database.addItem(item);
        }
      }

      // Add opening scene as first narration entry
      if (state.openingScene) {
        const tokenCount = countTokens(state.openingScene);
        const baseTime = storyData.timeTracker ?? { years: 0, days: 0, hours: 0, minutes: 0 };
        await database.addStoryEntry({
          id: crypto.randomUUID(),
          storyId: storyData.id,
          type: 'narration',
          content: state.openingScene,
          parentId: null,
          position: 0,
          metadata: { source: 'template', tokenCount, timeStart: { ...baseTime }, timeEnd: { ...baseTime } },
          branchId: null,
        });
      }
    }

    // Emit event
    eventBus.emit<StoryCreatedEvent>({ type: 'StoryCreated', storyId: storyData.id, mode });

    return storyData;
  }

  // Add a new story entry
  async addEntry(type: StoryEntry['type'], content: string, metadata?: StoryEntry['metadata']): Promise<StoryEntry> {
    if (!this.currentStory) {
      throw new Error('No story loaded');
    }

    // Count tokens for accurate auto-summarize threshold detection
    const tokenCount = countTokens(content);

    // Capture current story time as timeStart for this entry
    // timeEnd defaults to timeStart; for narration entries, timeEnd is updated after classification
    const timeStart = this.currentStory.timeTracker
      ? { ...this.currentStory.timeTracker }
      : { years: 0, days: 0, hours: 0, minutes: 0 };
    const timeEnd = { ...timeStart };

    const position = await database.getNextEntryPosition(this.currentStory.id, this.currentStory.currentBranchId);
    const entry = await database.addStoryEntry({
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      type,
      content,
      parentId: null,
      position,
      metadata: { ...metadata, tokenCount, timeStart, timeEnd },
      branchId: this.currentStory.currentBranchId,
    });

    this.entries = [...this.entries, entry];

    // Invalidate caches
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});

    return entry;
  }

  // Update a story entry
  async updateEntry(entryId: string, content: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existingEntry = this.entries.find(e => e.id === entryId);
    if (!existingEntry) throw new Error('Entry not found');

    // Prevent modifying inherited entries on a branch
    // An entry is inherited if its branchId doesn't match the current branch
    const currentBranchId = this.currentStory.currentBranchId;
    if ((existingEntry.branchId ?? null) !== currentBranchId) {
      throw new Error(
        'Cannot edit inherited entries. This entry belongs to ' +
        (existingEntry.branchId === null ? 'the main branch' : 'a parent branch') +
        '. Create new content on this branch instead.'
      );
    }

    // Recalculate token count when content changes
    const tokenCount = countTokens(content);
    const updatedMetadata = { ...existingEntry.metadata, tokenCount };

    await database.updateStoryEntry(entryId, { content, metadata: updatedMetadata });
    this.entries = this.entries.map(e =>
      e.id === entryId ? { ...e, content, metadata: updatedMetadata } : e
    );

    // Invalidate word count cache (content changed)
    this.invalidateWordCountCache();

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  // Delete a story entry
  async deleteEntry(entryId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existingEntry = this.entries.find(e => e.id === entryId);
    if (!existingEntry) throw new Error('Entry not found');

    // Prevent deleting inherited entries on a branch
    // An entry is inherited if its branchId doesn't match the current branch
    const currentBranchId = this.currentStory.currentBranchId;
    if ((existingEntry.branchId ?? null) !== currentBranchId) {
      throw new Error(
        'Cannot delete inherited entries. This entry belongs to ' +
        (existingEntry.branchId === null ? 'the main branch' : 'a parent branch') +
        '. You can only delete entries created on the current branch.'
      );
    }

    // Check if this entry is a fork point for any branch
    const branchUsingEntry = this.branches.find(b => b.forkEntryId === entryId);
    if (branchUsingEntry) {
      throw new Error(
        `Cannot delete this entry because it is the fork point for branch "${branchUsingEntry.name}". ` +
        `Delete the branch first if you want to remove this entry.`
      );
    }

    await database.deleteStoryEntry(entryId);
    this.entries = this.entries.filter(e => e.id !== entryId);

    // Invalidate caches
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  /**
   * Update an entry's timeEnd metadata after classification applies time progression.
   * Called after applyClassificationResult to record the story time after the entry's events.
   */
  async updateEntryTimeEnd(entryId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const entry = this.entries.find(e => e.id === entryId);
    if (!entry) {
      log('updateEntryTimeEnd: Entry not found', entryId);
      return;
    }

    // Capture current story time as timeEnd
    const timeEnd = this.currentStory.timeTracker
      ? { ...this.currentStory.timeTracker }
      : { years: 0, days: 0, hours: 0, minutes: 0 };

    const updatedMetadata = { ...entry.metadata, timeEnd };

    await database.updateStoryEntry(entryId, { metadata: updatedMetadata });
    this.entries = this.entries.map(e =>
      e.id === entryId ? { ...e, metadata: updatedMetadata } : e
    );

    log('Entry timeEnd updated', { entryId, timeEnd });
  }

  /**
   * Delete all entries from a given position onward.
   * Used for entry-only retry restore (persistent retry).
   */
  async deleteEntriesFromPosition(position: number): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Find entries to delete (position >= the given position)
    const entriesToDelete = this.entries.filter(e => e.position >= position);
    const entryIdsToDelete = new Set(entriesToDelete.map(e => e.id));

    log('Deleting entries from position', {
      position,
      entriesToDelete: entriesToDelete.length,
      totalEntries: this.entries.length,
    });

    // Find chapters that reference any of the entries being deleted
    // (chapters have foreign keys to start_entry_id and end_entry_id)
    const chaptersToDelete = this.chapters.filter(ch =>
      entryIdsToDelete.has(ch.startEntryId) || entryIdsToDelete.has(ch.endEntryId)
    );

    if (chaptersToDelete.length > 0) {
      log('Deleting chapters that reference entries being deleted', {
        chaptersToDelete: chaptersToDelete.length,
        chapterNumbers: chaptersToDelete.map(ch => ch.number),
      });

      // Delete chapters first (to satisfy foreign key constraints)
      for (const chapter of chaptersToDelete) {
        await database.deleteChapter(chapter.id);
      }
      this.chapters = this.chapters.filter(ch => !chaptersToDelete.some(d => d.id === ch.id));
    }

    // Delete embedded images for entries being deleted
    // (explicit deletion to ensure cleanup even if CASCADE isn't working)
    for (const entry of entriesToDelete) {
      await database.deleteEmbeddedImagesForEntry(entry.id);
    }

    // Now delete entries from database
    for (const entry of entriesToDelete) {
      await database.deleteStoryEntry(entry.id);
    }

    // Update in-memory state
    this.entries = this.entries.filter(e => e.position < position);

    // Invalidate caches
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  /**
   * Delete entities that were created after the backup.
   * Used for persistent retry restore to remove AI-extracted entities.
   * Compares current entity IDs against the saved ID lists and deletes any not in the lists.
   */
  async deleteEntitiesCreatedAfterBackup(savedIds: {
    characterIds: string[];
    locationIds: string[];
    itemIds: string[];
    storyBeatIds: string[];
    lorebookEntryIds: string[];
    embeddedImageIds?: string[];
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const characterIdsSet = new Set(savedIds.characterIds);
    const locationIdsSet = new Set(savedIds.locationIds);
    const itemIdsSet = new Set(savedIds.itemIds);
    const storyBeatIdsSet = new Set(savedIds.storyBeatIds);
    const lorebookEntryIdsSet = new Set(savedIds.lorebookEntryIds);
    const embeddedImageIdsSet = new Set(savedIds.embeddedImageIds ?? []);

    // Find entities to delete (not in saved lists)
    const charactersToDelete = this.characters.filter(c => !characterIdsSet.has(c.id));
    const locationsToDelete = this.locations.filter(l => !locationIdsSet.has(l.id));
    const itemsToDelete = this.items.filter(i => !itemIdsSet.has(i.id));
    const storyBeatsToDelete = this.storyBeats.filter(sb => !storyBeatIdsSet.has(sb.id));
    const lorebookEntriesToDelete = this.lorebookEntries.filter(le => !lorebookEntryIdsSet.has(le.id));

    // Embedded images are not in memory - fetch from database to find ones to delete
    // Note: Many embedded images may already be deleted via CASCADE when entries are deleted
    const currentEmbeddedImages = await database.getEmbeddedImagesForStory(this.currentStory.id);
    const embeddedImagesToDelete = savedIds.embeddedImageIds
      ? currentEmbeddedImages.filter(ei => !embeddedImageIdsSet.has(ei.id))
      : [];

    log('Deleting entities created after backup', {
      characters: charactersToDelete.length,
      locations: locationsToDelete.length,
      items: itemsToDelete.length,
      storyBeats: storyBeatsToDelete.length,
      lorebookEntries: lorebookEntriesToDelete.length,
      embeddedImages: embeddedImagesToDelete.length,
    });

    // Delete from database
    for (const character of charactersToDelete) {
      await database.deleteCharacter(character.id);
    }
    for (const location of locationsToDelete) {
      await database.deleteLocation(location.id);
    }
    for (const item of itemsToDelete) {
      await database.deleteItem(item.id);
    }
    for (const storyBeat of storyBeatsToDelete) {
      await database.deleteStoryBeat(storyBeat.id);
    }
    for (const lorebookEntry of lorebookEntriesToDelete) {
      await database.deleteEntry(lorebookEntry.id);
    }
    for (const embeddedImage of embeddedImagesToDelete) {
      await database.deleteEmbeddedImage(embeddedImage.id);
    }

    // Update in-memory state
    this.characters = this.characters.filter(c => characterIdsSet.has(c.id));
    this.locations = this.locations.filter(l => locationIdsSet.has(l.id));
    this.items = this.items.filter(i => itemIdsSet.has(i.id));
    this.storyBeats = this.storyBeats.filter(sb => storyBeatIdsSet.has(sb.id));
    this.lorebookEntries = this.lorebookEntries.filter(le => lorebookEntryIdsSet.has(le.id));

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  // Add a character
  async addCharacter(name: string, description?: string, relationship?: string): Promise<Character> {
    if (!this.currentStory) throw new Error('No story loaded');

    const character: Character = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      relationship: relationship ?? null,
      traits: [],
      status: 'active',
      metadata: null,
      visualDescriptors: [],
      portrait: null,
      branchId: this.currentStory.currentBranchId,
    };

    await database.addCharacter(character);
    this.characters = [...this.characters, character];
    return character;
  }

  // Update an existing character (except protagonist swap)
  async updateCharacter(id: string, updates: Partial<Character>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.characters.find(c => c.id === id);
    if (!existing) throw new Error('Character not found');

    if (updates.relationship !== undefined) {
      if (updates.relationship === 'self' && existing.relationship !== 'self') {
        throw new Error('Use setProtagonist to assign a protagonist');
      }
      if (existing.relationship === 'self' && updates.relationship !== 'self') {
        throw new Error('Swap protagonists before changing the current one');
      }
    }

    await database.updateCharacter(id, updates);
    this.characters = this.characters.map(c =>
      c.id === id ? { ...c, ...updates } : c
    );
  }

  // Delete a character (protagonist cannot be deleted)
  async deleteCharacter(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.characters.find(c => c.id === id);
    if (!existing) throw new Error('Character not found');
    if (existing.relationship === 'self') {
      throw new Error('Swap protagonists before deleting the current one');
    }

    await database.deleteCharacter(id);
    this.characters = this.characters.filter(c => c.id !== id);
  }

  // Add a location
  async addLocation(name: string, description?: string, makeCurrent = false): Promise<Location> {
    if (!this.currentStory) throw new Error('No story loaded');

    const location: Location = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      visited: makeCurrent,
      current: makeCurrent,
      connections: [],
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    };

    await database.addLocation(location);

    if (makeCurrent) {
      // Update other locations to not be current
      this.locations = this.locations.map(l => ({ ...l, current: false }));
    }

    this.locations = [...this.locations, location];
    return location;
  }

  // Update a location's details
  async updateLocation(id: string, updates: Partial<Location>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.locations.find(l => l.id === id);
    if (!existing) throw new Error('Location not found');

    if (updates.current === true) {
      await database.setCurrentLocation(this.currentStory.id, id);
      this.locations = this.locations.map(l => ({
        ...l,
        current: l.id === id,
        visited: l.id === id ? true : l.visited,
      }));
    } else {
      await database.updateLocation(id, updates);
      this.locations = this.locations.map(l =>
        l.id === id ? { ...l, ...updates } : l
      );
    }
  }

  // Set current location
  async setCurrentLocation(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.setCurrentLocation(this.currentStory.id, locationId);
    this.locations = this.locations.map(l => ({
      ...l,
      current: l.id === locationId,
      visited: l.id === locationId ? true : l.visited,
    }));
  }

  // Toggle location visited status
  async toggleLocationVisited(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const location = this.locations.find(l => l.id === locationId);
    if (!location) throw new Error('Location not found');

    const newVisited = !location.visited;
    await database.updateLocation(locationId, { visited: newVisited });
    this.locations = this.locations.map(l =>
      l.id === locationId ? { ...l, visited: newVisited } : l
    );
    log('Location visited toggled:', location.name, newVisited);
  }

  // Delete a location
  async deleteLocation(locationId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const location = this.locations.find(l => l.id === locationId);
    if (!location) throw new Error('Location not found');

    await database.deleteLocation(locationId);
    this.locations = this.locations.filter(l => l.id !== locationId);
    log('Location deleted:', location.name);
  }

  // Add an item to inventory
  async addItem(name: string, description?: string, quantity = 1): Promise<Item> {
    if (!this.currentStory) throw new Error('No story loaded');

    const item: Item = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      description: description ?? null,
      quantity,
      equipped: false,
      location: 'inventory',
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    };

    await database.addItem(item);
    this.items = [...this.items, item];
    return item;
  }

  // Update an existing item
  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.items.find(i => i.id === id);
    if (!existing) throw new Error('Item not found');

    await database.updateItem(id, updates);
    this.items = this.items.map(i =>
      i.id === id ? { ...i, ...updates } : i
    );
  }

  // Delete an item
  async deleteItem(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.items.find(i => i.id === id);
    if (!existing) throw new Error('Item not found');

    await database.deleteItem(id);
    this.items = this.items.filter(i => i.id !== id);
  }

  // Add a story beat
  async addStoryBeat(title: string, type: StoryBeat['type'], description?: string): Promise<StoryBeat> {
    if (!this.currentStory) throw new Error('No story loaded');

    const beat: StoryBeat = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      title,
      description: description ?? null,
      type,
      status: 'pending',
      triggeredAt: null,
      resolvedAt: null,
      metadata: null,
      branchId: this.currentStory.currentBranchId,
    };

    await database.addStoryBeat(beat);
    this.storyBeats = [...this.storyBeats, beat];
    return beat;
  }

  // Update a story beat
  async updateStoryBeat(id: string, updates: Partial<StoryBeat>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.storyBeats.find(b => b.id === id);
    if (!existing) throw new Error('Story beat not found');

    const resolvedUpdates: Partial<StoryBeat> = { ...updates };
    if (updates.status) {
      if (updates.status === 'completed' || updates.status === 'failed') {
        if (updates.resolvedAt === undefined) {
          resolvedUpdates.resolvedAt = Date.now();
        }
      } else if (updates.resolvedAt === undefined) {
        resolvedUpdates.resolvedAt = null;
      }
    }

    await database.updateStoryBeat(id, resolvedUpdates);
    this.storyBeats = this.storyBeats.map(b =>
      b.id === id ? { ...b, ...resolvedUpdates } : b
    );
  }

  // Delete a story beat
  async deleteStoryBeat(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const existing = this.storyBeats.find(b => b.id === id);
    if (!existing) throw new Error('Story beat not found');

    await database.deleteStoryBeat(id);
    this.storyBeats = this.storyBeats.filter(b => b.id !== id);
  }

  // Swap the protagonist to another character, updating the old label
  async setProtagonist(newCharacterId: string, previousRelationshipLabel?: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const currentProtagonist = this.characters.find(c => c.relationship === 'self') ?? null;
    const newProtagonist = this.characters.find(c => c.id === newCharacterId);
    if (!newProtagonist) throw new Error('Character not found');

    if (currentProtagonist?.id === newCharacterId) return;

    let label: string | null = null;
    if (currentProtagonist) {
      label = previousRelationshipLabel?.trim() ?? null;
      if (!label || label.toLowerCase() === 'self') {
        throw new Error('Provide a relationship label for the previous protagonist');
      }
      await database.updateCharacter(currentProtagonist.id, { relationship: label });
    }

    await database.updateCharacter(newCharacterId, { relationship: 'self' });

    this.characters = this.characters.map(c => {
      if (currentProtagonist && c.id === currentProtagonist.id) {
        return { ...c, relationship: label! };
      }
      if (c.id === newCharacterId) {
        return { ...c, relationship: 'self' };
      }
      return c;
    });

    const promptOverride = this.currentStory.settings?.systemPromptOverride;
    const protagonistToken = '{{protagonistName}}';
    if (promptOverride && currentProtagonist?.name) {
      let updatedPrompt = promptOverride;
      if (!promptOverride.includes(protagonistToken)) {
        const safeName = currentProtagonist.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        updatedPrompt = promptOverride.replace(new RegExp(safeName, 'g'), protagonistToken);
      }
      if (updatedPrompt !== promptOverride) {
        const newSettings = { ...this.currentStory.settings, systemPromptOverride: updatedPrompt };
        await database.updateStory(this.currentStory.id, { settings: newSettings });
        this.currentStory = { ...this.currentStory, settings: newSettings };
      }
    }
  }

  // ===== Lorebook Entry CRUD Methods =====

  /**
   * Add a new lorebook entry.
   * @param entryData - Entry data. branchId is optional and defaults to current branch.
   */
  async addLorebookEntry(entryData: Omit<Entry, 'id' | 'storyId' | 'createdAt' | 'updatedAt' | 'branchId'> & { branchId?: string | null }): Promise<Entry> {
    if (!this.currentStory) throw new Error('No story loaded');

    const now = Date.now();
    const entry: Entry = {
      ...entryData,
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      createdAt: now,
      updatedAt: now,
      // Use provided branchId or default to current branch
      branchId: entryData.branchId ?? this.currentStory.currentBranchId,
    };

    await database.addEntry(entry);
    this.lorebookEntries = [...this.lorebookEntries, entry];
    log('Lorebook entry added:', entry.name);
    return entry;
  }

  /**
   * Update a lorebook entry.
   */
  async updateLorebookEntry(id: string, updates: Partial<Entry>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const updatesWithTimestamp = {
      ...updates,
      updatedAt: Date.now(),
    };

    await database.updateEntry(id, updatesWithTimestamp);
    this.lorebookEntries = this.lorebookEntries.map(e =>
      e.id === id ? { ...e, ...updatesWithTimestamp } : e
    );
    log('Lorebook entry updated:', id);
  }

  /**
   * Delete a lorebook entry.
   */
  async deleteLorebookEntry(id: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.deleteEntry(id);
    this.lorebookEntries = this.lorebookEntries.filter(e => e.id !== id);
    log('Lorebook entry deleted:', id);
  }

  /**
   * Delete multiple lorebook entries (bulk operation).
   */
  async deleteLorebookEntries(ids: string[]): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Delete all entries in parallel
    await Promise.all(ids.map(id => database.deleteEntry(id)));
    this.lorebookEntries = this.lorebookEntries.filter(e => !ids.includes(e.id));
    log('Lorebook entries deleted:', ids.length);
  }

  /**
   * Get a single lorebook entry by ID.
   */
  getLorebookEntry(id: string): Entry | undefined {
    return this.lorebookEntries.find(e => e.id === id);
  }

  /**
   * Apply classification results to update world state.
   * This is Phase 4 of the processing pipeline per design doc.
   */
  async applyClassificationResult(result: ClassificationResult): Promise<void> {
    if (!this.currentStory) {
      log('applyClassificationResult: No story loaded, skipping');
      return;
    }

    log('applyClassificationResult called', {
      characterUpdates: result.entryUpdates.characterUpdates.length,
      locationUpdates: result.entryUpdates.locationUpdates.length,
      itemUpdates: result.entryUpdates.itemUpdates.length,
      storyBeatUpdates: result.entryUpdates.storyBeatUpdates.length,
      newCharacters: result.entryUpdates.newCharacters.length,
      newLocations: result.entryUpdates.newLocations.length,
      newItems: result.entryUpdates.newItems.length,
      newStoryBeats: result.entryUpdates.newStoryBeats.length,
      scene: result.scene,
    });

    const storyId = this.currentStory.id;

    // Apply character updates
    for (const update of result.entryUpdates.characterUpdates) {
      const existing = this.characters.find(c =>
        c.name.toLowerCase() === update.name.toLowerCase()
      );
      if (existing) {
        log('Updating character:', update.name, update.changes);
        const changes: Partial<Character> = {};
        if (update.changes.status) changes.status = update.changes.status;
        if (update.changes.relationship) {
          if (existing.relationship === 'self') {
            // Preserve protagonist relationship; only set via explicit swap.
          } else if (update.changes.relationship !== 'self') {
            changes.relationship = update.changes.relationship;
          }
        }
        if (update.changes.newTraits?.length || update.changes.removeTraits?.length) {
          let traits = [...existing.traits];
          if (update.changes.removeTraits?.length) {
            const toRemove = new Set(update.changes.removeTraits.map(t => t.toLowerCase()));
            traits = traits.filter(t => !toRemove.has(t.toLowerCase()));
          }
          if (update.changes.newTraits?.length) {
            traits = [...traits, ...update.changes.newTraits];
          }
          const traitMap = new Map(traits.map(t => [t.toLowerCase(), t]));
          changes.traits = Array.from(traitMap.values());
        }
        // Handle visual descriptor updates for image generation
        // replaceVisualDescriptors takes priority - it's a complete replacement
        if (update.changes.replaceVisualDescriptors?.length) {
          changes.visualDescriptors = update.changes.replaceVisualDescriptors;
        } else if (update.changes.addVisualDescriptors?.length || update.changes.removeVisualDescriptors?.length) {
          let visualDescriptors = [...(existing.visualDescriptors || [])];
          if (update.changes.removeVisualDescriptors?.length) {
            const toRemove = new Set(update.changes.removeVisualDescriptors.map(d => d.toLowerCase()));
            visualDescriptors = visualDescriptors.filter(d => !toRemove.has(d.toLowerCase()));
          }
          if (update.changes.addVisualDescriptors?.length) {
            // Add only descriptors that don't already exist (case-insensitive)
            const existingLower = new Set(visualDescriptors.map(d => d.toLowerCase()));
            for (const desc of update.changes.addVisualDescriptors) {
              if (!existingLower.has(desc.toLowerCase())) {
                visualDescriptors.push(desc);
              }
            }
          }
          changes.visualDescriptors = visualDescriptors;
        }
        await database.updateCharacter(existing.id, changes);
        this.characters = this.characters.map(c =>
          c.id === existing.id ? { ...c, ...changes } : c
        );
      }
    }

    // Apply location updates
    for (const update of result.entryUpdates.locationUpdates) {
      const existing = this.locations.find(l =>
        l.name.toLowerCase() === update.name.toLowerCase()
      );
      if (existing) {
        log('Updating location:', update.name, update.changes);
        const changes: Partial<Location> = {};
        if (update.changes.visited !== undefined) changes.visited = update.changes.visited;
        if (update.changes.descriptionAddition) {
          const addition = update.changes.descriptionAddition.trim();
          if (addition) {
            changes.description = existing.description
              ? `${existing.description} ${addition}`
              : addition;
          }
        }

        if (update.changes.current === true) {
          changes.visited = true;
          await database.setCurrentLocation(storyId, existing.id);
          if (Object.keys(changes).length > 0) {
            await database.updateLocation(existing.id, changes);
          }
          this.locations = this.locations.map(l => {
            if (l.id === existing.id) {
              return { ...l, ...changes, current: true, visited: true };
            }
            return { ...l, current: false };
          });
          continue;
        }

        if (update.changes.current === false) changes.current = false;
        if (Object.keys(changes).length === 0) continue;
        await database.updateLocation(existing.id, changes);
        this.locations = this.locations.map(l =>
          l.id === existing.id ? { ...l, ...changes } : l
        );
      }
    }

    // Apply item updates
    for (const update of result.entryUpdates.itemUpdates) {
      const existing = this.items.find(i =>
        i.name.toLowerCase() === update.name.toLowerCase()
      );
      if (existing) {
        log('Updating item:', update.name, update.changes);
        const changes: Partial<Item> = {};
        if (update.changes.quantity !== undefined) changes.quantity = update.changes.quantity;
        if (update.changes.equipped !== undefined) changes.equipped = update.changes.equipped;
        if (update.changes.location) changes.location = update.changes.location;
        await database.updateItem(existing.id, changes);
        this.items = this.items.map(i =>
          i.id === existing.id ? { ...i, ...changes } : i
        );
      }
    }

    // Apply story beat updates (mark as completed/failed)
    for (const update of result.entryUpdates.storyBeatUpdates) {
      const existing = this.storyBeats.find(b =>
        b.title.toLowerCase() === update.title.toLowerCase()
      );
      if (existing) {
        log('Updating story beat:', update.title, update.changes);
        const changes: Partial<StoryBeat> = {};
        if (update.changes.status) {
          changes.status = update.changes.status;
          // Set resolvedAt timestamp when completing or failing
          if (update.changes.status === 'completed' || update.changes.status === 'failed') {
            changes.resolvedAt = Date.now();
          }
        }
        if (update.changes.description) changes.description = update.changes.description;
        await database.updateStoryBeat(existing.id, changes);
        this.storyBeats = this.storyBeats.map(b =>
          b.id === existing.id ? { ...b, ...changes } : b
        );
      }
    }

    // Add new characters (check for duplicates)
    for (const newChar of result.entryUpdates.newCharacters) {
      const exists = this.characters.some(c =>
        c.name.toLowerCase() === newChar.name.toLowerCase()
      );
      if (!exists) {
        log('Adding new character:', newChar.name);
        const character: Character = {
          id: crypto.randomUUID(),
          storyId,
          name: newChar.name,
          description: newChar.description,
          relationship: newChar.relationship,
          traits: newChar.traits,
          visualDescriptors: newChar.visualDescriptors || [],
          status: 'active',
          metadata: { source: 'classifier' },
          portrait: null,
          branchId: this.currentStory?.currentBranchId ?? null,
        };
        await database.addCharacter(character);
        this.characters = [...this.characters, character];
      }
    }

    // Add new locations (check for duplicates)
    for (const newLoc of result.entryUpdates.newLocations) {
      const exists = this.locations.some(l =>
        l.name.toLowerCase() === newLoc.name.toLowerCase()
      );
      if (!exists) {
        log('Adding new location:', newLoc.name);
        // If this is the current location, unset others first
        if (newLoc.current) {
          this.locations = this.locations.map(l => ({ ...l, current: false }));
          for (const l of this.locations) {
            await database.updateLocation(l.id, { current: false });
          }
        }
        const location: Location = {
          id: crypto.randomUUID(),
          storyId,
          name: newLoc.name,
          description: newLoc.description,
          visited: newLoc.visited,
          current: newLoc.current,
          connections: [],
          metadata: { source: 'classifier' },
          branchId: this.currentStory?.currentBranchId ?? null,
        };
        await database.addLocation(location);
        this.locations = [...this.locations, location];
      }
    }

    // Handle scene.currentLocationName - update current location if specified
    if (result.scene.currentLocationName) {
      const locationName = result.scene.currentLocationName.toLowerCase();
      const currentLoc = this.locations.find(l =>
        l.name.toLowerCase() === locationName
      );
      if (currentLoc && !currentLoc.current) {
        log('Setting current location from scene:', currentLoc.name);
        await database.setCurrentLocation(storyId, currentLoc.id);
        this.locations = this.locations.map(l => ({
          ...l,
          current: l.id === currentLoc.id,
          visited: l.id === currentLoc.id ? true : l.visited,
        }));
      }
    }

    // Add new items (check for duplicates)
    for (const newItem of result.entryUpdates.newItems) {
      const exists = this.items.some(i =>
        i.name.toLowerCase() === newItem.name.toLowerCase()
      );
      if (!exists) {
        log('Adding new item:', newItem.name);
        const item: Item = {
          id: crypto.randomUUID(),
          storyId,
          name: newItem.name,
          description: newItem.description,
          quantity: newItem.quantity,
          equipped: false,
          location: newItem.location || 'inventory',
          metadata: { source: 'classifier' },
          branchId: this.currentStory?.currentBranchId ?? null,
        };
        await database.addItem(item);
        this.items = [...this.items, item];
      }
    }

    // Add new story beats (check for duplicates by title)
    for (const newBeat of result.entryUpdates.newStoryBeats) {
      const exists = this.storyBeats.some(b =>
        b.title.toLowerCase() === newBeat.title.toLowerCase()
      );
      if (!exists) {
        log('Adding new story beat:', newBeat.title);
        const beat: StoryBeat = {
          id: crypto.randomUUID(),
          storyId,
          title: newBeat.title,
          description: newBeat.description,
          type: newBeat.type,
          status: newBeat.status,
          triggeredAt: Date.now(),
          metadata: { source: 'classifier' },
          branchId: this.currentStory?.currentBranchId ?? null,
        };
        await database.addStoryBeat(beat);
        this.storyBeats = [...this.storyBeats, beat];
      }
    }

    // Apply time progression from scene data
    if (result.scene.timeProgression && result.scene.timeProgression !== 'none') {
      await this.applyTimeProgression(result.scene.timeProgression);
    }

    log('applyClassificationResult complete', {
      characters: this.characters.length,
      locations: this.locations.length,
      items: this.items.length,
      storyBeats: this.storyBeats.length,
    });

    // Emit state updated event if there were any changes
    const hasChanges =
      result.entryUpdates.newCharacters.length > 0 ||
      result.entryUpdates.newLocations.length > 0 ||
      result.entryUpdates.newItems.length > 0 ||
      result.entryUpdates.newStoryBeats.length > 0 ||
      result.entryUpdates.characterUpdates.length > 0 ||
      result.entryUpdates.locationUpdates.length > 0 ||
      result.entryUpdates.itemUpdates.length > 0 ||
      result.entryUpdates.storyBeatUpdates.length > 0;

    if (hasChanges) {
      emitStateUpdated({
        characters: result.entryUpdates.newCharacters.length + result.entryUpdates.characterUpdates.length,
        locations: result.entryUpdates.newLocations.length + result.entryUpdates.locationUpdates.length,
        items: result.entryUpdates.newItems.length + result.entryUpdates.itemUpdates.length,
        storyBeats: result.entryUpdates.newStoryBeats.length + result.entryUpdates.storyBeatUpdates.length,
      });
    }
  }

  // Clear current story (when switching or closing)
  clearCurrentStory(): void {
    this.currentStory = null;
    this.entries = [];
    this.lorebookEntries = [];
    this.characters = [];
    this.locations = [];
    this.items = [];
    this.storyBeats = [];
    this.chapters = [];
    this.checkpoints = [];

    // Reset all caches
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    // Clear current retry story ID (backups are kept per-story)
    ui.setCurrentRetryStoryId(null);

    // Clear style review state (will be loaded fresh for next story)
    ui.clearStyleReviewState();
  }

  // Update story mode
  async setStoryMode(mode: StoryMode): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.updateStory(this.currentStory.id, { mode });
    this.currentStory = { ...this.currentStory, mode };
    log('Story mode updated:', mode);

    // Emit event
    emitModeChanged(mode);
  }

  // Update memory configuration
  async setMemoryConfig(config: MemoryConfig): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.updateStory(this.currentStory.id, { memoryConfig: config });
    this.currentStory = { ...this.currentStory, memoryConfig: config };
    log('Memory config updated:', config);
  }

  // Add a chapter
  async addChapter(chapter: Chapter): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.addChapter(chapter);
    this.chapters = [...this.chapters, chapter];

    // Invalidate chapter cache
    this.invalidateChapterCache();

    log('Chapter added:', chapter.number, chapter.title);

    // Emit event
    emitChapterCreated(chapter.id, chapter.number, chapter.title);
  }

  // Get the next chapter number from the database (handles deletions correctly)
  async getNextChapterNumber(): Promise<number> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Use branch-filtered chapters to determine next chapter number
    // this.chapters is already filtered to current branch view (inherited + branch-specific)
    if (this.chapters.length === 0) {
      return 1;
    }

    // Find the maximum chapter number in the current branch view
    const maxNumber = Math.max(...this.chapters.map(ch => ch.number));
    return maxNumber + 1;
  }

  // Update a chapter's summary
  async updateChapterSummary(chapterId: string, summary: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.updateChapter(chapterId, { summary });
    this.chapters = this.chapters.map(ch =>
      ch.id === chapterId ? { ...ch, summary } : ch
    );
    log('Chapter summary updated:', chapterId);
  }

  // Update a chapter with multiple fields
  async updateChapter(chapterId: string, updates: Partial<Chapter>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.updateChapter(chapterId, updates);
    this.chapters = this.chapters.map(ch =>
      ch.id === chapterId ? { ...ch, ...updates } : ch
    );
    log('Chapter updated:', chapterId, updates);
  }

  // Get entries for a specific chapter
  // Uses O(1) map lookups for performance
  getChapterEntries(chapter: Chapter): StoryEntry[] {
    // Ensure index map is up to date
    if (this._entryIdToIndex.size !== this.entries.length) {
      this.rebuildEntryIdIndex();
    }
    const startIdx = this._entryIdToIndex.get(chapter.startEntryId);
    const endIdx = this._entryIdToIndex.get(chapter.endEntryId);
    if (startIdx === undefined || endIdx === undefined) return [];
    return this.entries.slice(startIdx, endIdx + 1);
  }

  // Delete a chapter
  async deleteChapter(chapterId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.deleteChapter(chapterId);
    this.chapters = this.chapters.filter(ch => ch.id !== chapterId);

    // Invalidate chapter cache
    this.invalidateChapterCache();

    log('Chapter deleted:', chapterId);
  }

  // Update memory configuration (partial updates)
  async updateMemoryConfig(updates: Partial<MemoryConfig>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

const newConfig = { ...this.memoryConfig, ...updates };
    await database.updateStory(this.currentStory.id, { memoryConfig: newConfig });
    this.currentStory = { ...this.currentStory, memoryConfig: newConfig };
    log('Memory config updated via updateMemoryConfig:', updates);
  }

  // Update story settings (partial updates)
  async updateStorySettings(updates: Partial<StorySettings>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const newSettings = { ...(this.currentStory.settings ?? {}), ...updates };
    await database.updateStory(this.currentStory.id, { settings: newSettings });
    this.currentStory = { ...this.currentStory, settings: newSettings };
    log('Story settings updated via updateStorySettings:', updates);
  }

  /**
   * Normalize time values, converting overflow/underflow between units.
   * Handles both positive overflow (60 min → 1 hour) and negative underflow (borrowing).
   * 60 minutes → 1 hour, 24 hours → 1 day, 365 days → 1 year
   */
  private normalizeTime(time: TimeTracker): TimeTracker {
    let { years, days, hours, minutes } = time;

    // Handle negative minutes by borrowing from hours
    while (minutes < 0 && hours > 0) {
      hours -= 1;
      minutes += 60;
    }

    // Handle negative hours by borrowing from days
    while (hours < 0 && days > 0) {
      days -= 1;
      hours += 24;
    }

    // Handle negative days by borrowing from years
    while (days < 0 && years > 0) {
      years -= 1;
      days += 365;
    }

    // Clamp any remaining negatives to 0 (can't have negative time)
    years = Math.max(0, years);
    days = Math.max(0, days);
    hours = Math.max(0, hours);
    minutes = Math.max(0, minutes);

    // Normalize overflow: minutes to hours
    if (minutes >= 60) {
      hours += Math.floor(minutes / 60);
      minutes = minutes % 60;
    }

    // Normalize overflow: hours to days
    if (hours >= 24) {
      days += Math.floor(hours / 24);
      hours = hours % 24;
    }

    // Normalize overflow: days to years
    if (days >= 365) {
      years += Math.floor(days / 365);
      days = days % 365;
    }

    return { years, days, hours, minutes };
  }

  // Set time tracker directly
  async setTimeTracker(time: TimeTracker): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const normalized = this.normalizeTime(time);
    await database.saveTimeTracker(this.currentStory.id, normalized);
    this.currentStory = { ...this.currentStory, timeTracker: normalized };
    log('Time tracker set:', normalized);
  }

  // Update time tracker with partial values (adds to current time)
  async addTime(updates: Partial<TimeTracker>): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const current = this.timeTracker;
    const newTime: TimeTracker = {
      years: current.years + (updates.years ?? 0),
      days: current.days + (updates.days ?? 0),
      hours: current.hours + (updates.hours ?? 0),
      minutes: current.minutes + (updates.minutes ?? 0),
    };

    const normalized = this.normalizeTime(newTime);
    await database.saveTimeTracker(this.currentStory.id, normalized);
    this.currentStory = { ...this.currentStory, timeTracker: normalized };
    log('Time added:', updates, '→', normalized);
  }

  /**
   * Apply time progression from classifier result.
   * Adds a default amount based on the progression type.
   */
  async applyTimeProgression(progression: 'none' | 'minutes' | 'hours' | 'days'): Promise<void> {
    if (progression === 'none') return;

    // Default increments for each progression type
    const increments: Record<string, Partial<TimeTracker>> = {
      minutes: { minutes: 15 },  // ~15 minutes for minor actions
      hours: { hours: 2 },       // ~2 hours for moderate time passage
      days: { days: 1 },         // 1 day for significant time jumps
    };

    const increment = increments[progression];
    if (increment) {
      await this.addTime(increment);
    }
  }

  /**
   * Restore or clear the story time tracker from a snapshot.
   * Undefined means "skip", null means "clear".
   */
  async restoreTimeTrackerSnapshot(snapshot: TimeTracker | null | undefined): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');
    if (snapshot === undefined) return;

    if (snapshot === null) {
      await database.clearTimeTracker(this.currentStory.id);
      this.currentStory = { ...this.currentStory, timeTracker: null };
      log('Time tracker cleared from snapshot');
      return;
    }

    const normalized = this.normalizeTime(snapshot);
    await database.saveTimeTracker(this.currentStory.id, normalized);
    this.currentStory = { ...this.currentStory, timeTracker: normalized };
    log('Time tracker restored from snapshot:', normalized);
  }

  // Create a manual chapter at a specific entry index
  async createManualChapter(endEntryIndex: number): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Find the start index (after the last chapter or beginning)
    const startIndex = this.lastChapterEndIndex;

    // Validate the end index
    if (endEntryIndex <= startIndex || endEntryIndex > this.entries.length) {
      throw new Error('Invalid entry index for chapter creation');
    }

    // Get the entries for this chapter
    const chapterEntries = this.entries.slice(startIndex, endEntryIndex);
    if (chapterEntries.length === 0) {
      throw new Error('No entries to create chapter from');
    }

    // Get previous chapters for context (branch-filtered)
    const previousChapters = [...this.currentBranchChapters].sort((a, b) => a.number - b.number);

    // Import aiService dynamically to avoid circular dependency
    const { aiService } = await import('$lib/services/ai');

    // Generate summary with previous chapters as context
    const chapterData = await aiService.summarizeChapter(chapterEntries, previousChapters, this.currentStory?.mode ?? 'adventure', this.pov, this.tense);

    // Get the next chapter number
    const chapterNumber = await this.getNextChapterNumber();

    // Extract time range from entries' metadata
    const firstEntry = chapterEntries[0];
    const lastEntry = chapterEntries[chapterEntries.length - 1];
    const startTime = firstEntry.metadata?.timeStart ?? null;
    const endTime = lastEntry.metadata?.timeEnd ?? null;

    // Create the chapter
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      number: chapterNumber,
      title: chapterData.title,
      startEntryId: chapterEntries[0].id,
      endEntryId: chapterEntries[chapterEntries.length - 1].id,
      entryCount: chapterEntries.length,
      summary: chapterData.summary,
      startTime,
      endTime,
      keywords: chapterData.keywords,
      characters: chapterData.characters,
      locations: chapterData.locations,
      plotThreads: chapterData.plotThreads,
      emotionalTone: chapterData.emotionalTone,
      branchId: this.currentStory.currentBranchId,
      createdAt: Date.now(),
    };

    await this.addChapter(chapter);
    log('Manual chapter created:', chapter.number, chapter.title);
  }

  // Create a checkpoint (snapshot of current state)
  async createCheckpoint(name: string): Promise<Checkpoint> {
    if (!this.currentStory) throw new Error('No story loaded');

    const lastEntry = this.entries[this.entries.length - 1];
    if (!lastEntry) throw new Error('No entries to checkpoint');

    const checkpoint: Checkpoint = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      lastEntryId: lastEntry.id,
      lastEntryPreview: lastEntry.content.substring(0, 100),
      entryCount: this.entries.length,
      entriesSnapshot: [...this.entries],
      charactersSnapshot: [...this.characters],
      locationsSnapshot: [...this.locations],
      itemsSnapshot: [...this.items],
      storyBeatsSnapshot: [...this.storyBeats],
      chaptersSnapshot: [...this.chapters],
      timeTrackerSnapshot: this.currentStory.timeTracker ? { ...this.currentStory.timeTracker } : null,
      lorebookEntriesSnapshot: [...this.lorebookEntries],
      createdAt: Date.now(),
    };

    await database.createCheckpoint(checkpoint);
    this.checkpoints = [checkpoint, ...this.checkpoints];
    log('Checkpoint created:', name);

    // Emit event
    eventBus.emit<CheckpointCreatedEvent>({ type: 'CheckpointCreated', checkpointId: checkpoint.id, name });

    return checkpoint;
  }

  /**
   * @deprecated Checkpoint restoration is no longer supported.
   * Use createBranchFromCheckpoint() instead to explore alternate timelines.
   * This prevents data loss issues when restoring across branches.
   */
  async restoreCheckpoint(_checkpointId: string): Promise<void> {
    throw new Error(
      'Checkpoint restoration is no longer supported. ' +
      'To explore alternate paths, create a new branch from a checkpoint instead.'
    );
  }

  // Delete a checkpoint
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await database.deleteCheckpoint(checkpointId);
    this.checkpoints = this.checkpoints.filter(cp => cp.id !== checkpointId);
    log('Checkpoint deleted:', checkpointId);
  }

  // ===== Branch Management =====

  /**
   * Get the current branch, or null if on the main branch (for legacy stories)
   */
  get currentBranch(): Branch | null {
    if (!this.currentStory?.currentBranchId) return null;
    return this.branches.find(b => b.id === this.currentStory!.currentBranchId) ?? null;
  }

  /**
   * Create a new branch from an existing checkpoint.
   * Only entries with checkpoints can be branched from.
   */
  async createBranchFromCheckpoint(name: string, forkEntryId: string, checkpointId: string): Promise<Branch> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Verify the checkpoint exists in memory
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error('Checkpoint not found in memory');
    }

    // Verify the checkpoint matches the fork entry
    if (checkpoint.lastEntryId !== forkEntryId) {
      throw new Error('Checkpoint does not match fork entry');
    }

    // Verify all foreign key references exist in the database
    const dbCheckpoint = await database.getCheckpoint(checkpointId);
    if (!dbCheckpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found in database`);
    }

    const dbEntry = await database.getStoryEntry(forkEntryId);
    if (!dbEntry) {
      throw new Error(`Fork entry ${forkEntryId} not found in database`);
    }

    const dbStory = await database.getStory(this.currentStory.id);
    if (!dbStory) {
      throw new Error(`Story ${this.currentStory.id} not found in database`);
    }

    // Determine parent branch (current branch, or null for main)
    // IMPORTANT: Ensure it's explicitly null, not undefined
    const parentBranchId = this.currentStory.currentBranchId ?? null;

    // If there's a parent branch, verify it exists
    if (parentBranchId !== null) {
      const dbParentBranch = await database.getBranch(parentBranchId);
      if (!dbParentBranch) {
        throw new Error(`Parent branch ${parentBranchId} not found in database`);
      }
    }

    // Create the branch
    const branch: Branch = {
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      name,
      parentBranchId,
      forkEntryId,
      checkpointId,
      createdAt: Date.now(),
    };

    await database.addBranch(branch);
    this.branches = [...this.branches, branch];

    // Copy world state from checkpoint into database with the new branch_id
    // This ensures the branch has its own copy of the world state at the fork point
    log('Copying world state from checkpoint to branch:', branch.name);

    // Copy characters
    for (const char of checkpoint.charactersSnapshot) {
      const branchChar: Character = { ...char, id: crypto.randomUUID(), branchId: branch.id };
      await database.addCharacter(branchChar);
    }

    // Copy locations - need to remap connection IDs to new location IDs
    const locationIdMap = new Map<string, string>(); // old ID -> new ID
    for (const loc of checkpoint.locationsSnapshot) {
      const newId = crypto.randomUUID();
      locationIdMap.set(loc.id, newId);
    }
    for (const loc of checkpoint.locationsSnapshot) {
      const newId = locationIdMap.get(loc.id)!;
      const branchLoc: Location = {
        ...loc,
        id: newId,
        branchId: branch.id,
        // Remap connections to use new location IDs
        connections: loc.connections.map(connId => locationIdMap.get(connId) ?? connId),
      };
      await database.addLocation(branchLoc);
    }

    // Copy items (remap location IDs to the new branch's locations)
    for (const item of checkpoint.itemsSnapshot) {
      const remappedLocation = item.location === 'inventory'
        ? 'inventory'
        : (locationIdMap.get(item.location) ?? item.location);
      const branchItem: Item = {
        ...item,
        id: crypto.randomUUID(),
        branchId: branch.id,
        location: remappedLocation,
      };
      await database.addItem(branchItem);
    }

    // Copy story beats
    for (const beat of checkpoint.storyBeatsSnapshot) {
      const branchBeat: StoryBeat = { ...beat, id: crypto.randomUUID(), branchId: branch.id };
      await database.addStoryBeat(branchBeat);
    }

    // Copy lorebook entries (if snapshot exists)
    if (checkpoint.lorebookEntriesSnapshot) {
      for (const entry of checkpoint.lorebookEntriesSnapshot) {
        const branchEntry: Entry = { ...entry, id: crypto.randomUUID(), branchId: branch.id };
        await database.addEntry(branchEntry);
      }
    }

    // Switch to the new branch (skip restore since we just populated the world state)
    await this.switchBranch(branch.id, true);

    // Reload the world state from database to get the copied items into memory
    await this.reloadEntriesForCurrentBranch();

    // Restore time tracker from checkpoint
    if (checkpoint.timeTrackerSnapshot) {
      this.currentStory = { ...this.currentStory!, timeTracker: { ...checkpoint.timeTrackerSnapshot } };
      await database.updateStory(this.currentStory!.id, { timeTracker: checkpoint.timeTrackerSnapshot });
      log('Time tracker restored from checkpoint:', checkpoint.timeTrackerSnapshot);
    }

    log('Branch created:', name, 'from checkpoint:', checkpointId, {
      characters: checkpoint.charactersSnapshot.length,
      locations: checkpoint.locationsSnapshot.length,
      items: checkpoint.itemsSnapshot.length,
      storyBeats: checkpoint.storyBeatsSnapshot.length,
      lorebookEntries: checkpoint.lorebookEntriesSnapshot?.length ?? 0,
    });
    return branch;
  }

  private buildBranchLineage(branchId: string): Branch[] {
    const lineage: Branch[] = [];
    let current: Branch | null = this.branches.find(b => b.id === branchId) ?? null;
    const visited = new Set<string>();

    while (current) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      lineage.unshift(current);
      const parentId = current.parentBranchId;
      if (!parentId) break;
      current = this.branches.find(b => b.id === parentId) ?? null;
    }

    return lineage;
  }

  private async getForkEntryPositions(lineage: Branch[]): Promise<Map<string, number | null>> {
    const entries = await Promise.all(
      lineage.map(branch => database.getStoryEntry(branch.forkEntryId))
    );
    const positions = new Map<string, number | null>();
    entries.forEach((entry, index) => {
      positions.set(lineage[index].id, entry?.position ?? null);
    });
    return positions;
  }

  private getCheckpointBranchId(checkpoint: Checkpoint): string | null {
    const lastEntry = checkpoint.entriesSnapshot.find(e => e.id === checkpoint.lastEntryId);
    return (lastEntry?.branchId ?? null);
  }

  /**
   * Switch to a different branch.
   * This reloads entries from the database filtered by the target branch.
   * NO data is deleted - branches coexist in the database with different branch_ids.
   * @param branchId - The branch to switch to (null for main branch)
   * @param skipReload - If true, skip reloading entries (used when creating new branch from current state)
   */
  async switchBranch(branchId: string | null, skipReload: boolean = false): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Validate branch exists (if not null)
    if (branchId !== null) {
      const branch = this.branches.find(b => b.id === branchId);
      if (!branch) throw new Error('Branch not found');
    }

    // Update story's current branch in database
    await database.setStoryCurrentBranch(this.currentStory.id, branchId);
    this.currentStory = { ...this.currentStory, currentBranchId: branchId };

    // Reload entries from database if not skipping
    // When creating a new branch, we skip because we're already at the correct state
    if (!skipReload) {
      await this.reloadEntriesForCurrentBranch();
    }

    // Invalidate caches
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    log('Switched to branch:', branchId ?? 'main');
  }

  /**
   * Reload entries and world state from database for the current branch.
   * World state is now persisted per-branch in the database via branch_id columns.
   * - For main branch: loads only items with null branch_id
   * - For other branches: loads inherited items (null branch_id) + branch-specific items
   */
  private async reloadEntriesForCurrentBranch(): Promise<void> {
    if (!this.currentStory) return;

    const branchId = this.currentStory.currentBranchId;

    if (branchId === null) {
      // Main branch: load all data with null branch_id
      const [entries, chapters, characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
        database.getStoryEntriesForBranch(this.currentStory.id, null),
        database.getChaptersForBranch(this.currentStory.id, null),
        database.getCharactersForBranch(this.currentStory.id, null),
        database.getLocationsForBranch(this.currentStory.id, null),
        database.getItemsForBranch(this.currentStory.id, null),
        database.getStoryBeatsForBranch(this.currentStory.id, null),
        database.getEntriesForBranch(this.currentStory.id, null),
      ]);

      this.entries = entries;
      this.chapters = chapters;
      this.characters = characters;
      this.locations = locations;
      this.items = items;
      this.storyBeats = storyBeats;
      this.lorebookEntries = lorebookEntries;
    } else {
      // Non-main branch: load entries across branch lineage (main -> ancestors -> current)
      const lineage = this.buildBranchLineage(branchId);
      if (lineage.length === 0) return;

      const forkPositions = await this.getForkEntryPositions(lineage);
      const rootForkPosition = forkPositions.get(lineage[0].id);

      const inheritedEntries = await database.getStoryEntriesForBranch(
        this.currentStory.id,
        null,
        rootForkPosition ?? undefined
      );

      const branchEntries: StoryEntry[] = [];
      for (let i = 0; i < lineage.length; i++) {
        const branch = lineage[i];
        const childForkPosition = i < lineage.length - 1
          ? forkPositions.get(lineage[i + 1].id)
          : undefined;
        const entries = await database.getStoryEntriesForBranch(
          this.currentStory.id,
          branch.id,
          childForkPosition ?? undefined
        );
        branchEntries.push(...entries);
      }

      this.entries = [...inheritedEntries, ...branchEntries].sort((a, b) => a.position - b.position);

      const entryPositions = new Map<string, number>();
      for (const entry of this.entries) {
        entryPositions.set(entry.id, entry.position);
      }

      const chapters: Chapter[] = [];
      const mainChapters = await database.getChaptersForBranch(this.currentStory.id, null);
      if (rootForkPosition === null || rootForkPosition === undefined) {
        chapters.push(...mainChapters);
      } else {
        chapters.push(
          ...mainChapters.filter(ch => {
            const endPosition = entryPositions.get(ch.endEntryId);
            return endPosition !== undefined && endPosition <= rootForkPosition;
          })
        );
      }

      for (let i = 0; i < lineage.length; i++) {
        const branch = lineage[i];
        const childForkPosition = i < lineage.length - 1
          ? forkPositions.get(lineage[i + 1].id)
          : undefined;
        const branchChapters = await database.getChaptersForBranch(this.currentStory.id, branch.id);
        if (childForkPosition === null || childForkPosition === undefined) {
          chapters.push(...branchChapters);
        } else {
          chapters.push(
            ...branchChapters.filter(ch => {
              const endPosition = entryPositions.get(ch.endEntryId);
              return endPosition !== undefined && endPosition <= childForkPosition;
            })
          );
        }
      }

      this.chapters = chapters.sort((a, b) => a.number - b.number);

      // Load world state from database (branch-specific snapshots)
      // World state is persisted per-branch via branch_id columns
      const [characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
        database.getCharactersForBranch(this.currentStory.id, branchId),
        database.getLocationsForBranch(this.currentStory.id, branchId),
        database.getItemsForBranch(this.currentStory.id, branchId),
        database.getStoryBeatsForBranch(this.currentStory.id, branchId),
        database.getEntriesForBranch(this.currentStory.id, branchId),
      ]);

      this.characters = characters;
      this.locations = locations;
      this.items = items;
      this.storyBeats = storyBeats;
      this.lorebookEntries = lorebookEntries;

      // Get the current branch name from lineage for logging
      const currentBranch = lineage[lineage.length - 1];
      log('Loaded world state for branch:', currentBranch?.name ?? branchId, {
        characters: characters.length,
        locations: locations.length,
        items: items.length,
        storyBeats: storyBeats.length,
        lorebookEntries: lorebookEntries.length,
      });
    }

    // Restore time tracker from the last entry's metadata
    await this.restoreTimeFromLastEntry();
  }

  /**
   * Restore time tracker from the last entry's timeEnd metadata.
   * Called after loading entries for a branch to ensure time consistency.
   */
  private async restoreTimeFromLastEntry(): Promise<void> {
    if (!this.currentStory || this.entries.length === 0) return;

    const lastEntry = this.entries[this.entries.length - 1];
    const timeEnd = lastEntry.metadata?.timeEnd;

    if (timeEnd && typeof timeEnd === 'object') {
      const newTime = timeEnd as TimeTracker;
      // Only update if different to avoid unnecessary DB writes
      const current = this.currentStory.timeTracker;
      if (!current ||
          current.years !== newTime.years ||
          current.days !== newTime.days ||
          current.hours !== newTime.hours ||
          current.minutes !== newTime.minutes) {
        this.currentStory = { ...this.currentStory, timeTracker: newTime };
        await database.updateStory(this.currentStory.id, { timeTracker: newTime });
        log('Time tracker restored from last entry:', newTime);
      }
    }
  }

  /**
   * Rename a branch.
   */
  async renameBranch(branchId: string, newName: string): Promise<void> {
    await database.updateBranch(branchId, { name: newName });
    this.branches = this.branches.map(b =>
      b.id === branchId ? { ...b, name: newName } : b
    );
    log('Branch renamed:', branchId, 'to', newName);
  }

  /**
   * Delete a branch.
   * Cannot delete the main branch (null), the current branch, or branches with children.
   */
  async deleteBranch(branchId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Cannot delete current branch
    if (this.currentStory.currentBranchId === branchId) {
      throw new Error('Cannot delete the current branch');
    }

    // Cannot delete branches that have child branches
    const childBranches = this.branches.filter(b => b.parentBranchId === branchId);
    if (childBranches.length > 0) {
      const childNames = childBranches.map(b => `"${b.name}"`).join(', ');
      throw new Error(
        `Cannot delete this branch because it has child branches: ${childNames}. ` +
        `Delete the child branches first.`
      );
    }

    // Delete associated checkpoints first
    const checkpointsToDelete = this.checkpoints.filter(
      checkpoint => this.getCheckpointBranchId(checkpoint) === branchId
    );
    await Promise.all(checkpointsToDelete.map(cp => database.deleteCheckpoint(cp.id)));
    this.checkpoints = this.checkpoints.filter(
      checkpoint => this.getCheckpointBranchId(checkpoint) !== branchId
    );

    // Delete the branch from database
    await database.deleteBranch(branchId);

    // Update in-memory state: remove deleted branch
    // Note: We already checked that there are no child branches, so no reparenting needed
    this.branches = this.branches.filter(b => b.id !== branchId);

    log('Branch deleted:', branchId);
  }

  /**
   * Get the total entry count for a branch including inherited history.
   */
  async getBranchEntryCount(branchId: string | null): Promise<number> {
    if (!this.currentStory) return 0;

    if (branchId === null) {
      const entries = await database.getStoryEntriesForBranch(this.currentStory.id, null);
      return entries.length;
    }

    const lineage = this.buildBranchLineage(branchId);
    if (lineage.length === 0) return 0;

    const forkPositions = await this.getForkEntryPositions(lineage);
    const rootForkPosition = forkPositions.get(lineage[0].id);

    let count = 0;
    const mainEntries = await database.getStoryEntriesForBranch(
      this.currentStory.id,
      null,
      rootForkPosition ?? undefined
    );
    count += mainEntries.length;

    for (let i = 0; i < lineage.length; i++) {
      const branch = lineage[i];
      const childForkPosition = i < lineage.length - 1
        ? forkPositions.get(lineage[i + 1].id)
        : undefined;
      const entries = await database.getStoryEntriesForBranch(
        this.currentStory.id,
        branch.id,
        childForkPosition ?? undefined
      );
      count += entries.length;
    }

    return count;
  }

  /**
   * Get the branch tree structure for UI display.
   * Returns branches organized by parent-child relationships.
   */
  getBranchTree(): { branch: Branch | null; children: Branch[] }[] {
    // Build tree starting from root (null parent = main branch children)
    const rootBranches = this.branches.filter(b => b.parentBranchId === null);
    const tree: { branch: Branch | null; children: Branch[] }[] = [];

    // Main branch (implicit)
    tree.push({
      branch: null, // null represents main branch
      children: rootBranches,
    });

    // Add all branches with their children
    for (const branch of this.branches) {
      const children = this.branches.filter(b => b.parentBranchId === branch.id);
      tree.push({ branch, children });
    }

    return tree;
  }

  /**
   * Restore story state from a retry backup.
   * Used by the "retry last message" feature to restore state before a user action
   * and allow regeneration.
   */
  async restoreFromRetryBackup(backup: {
    entries: StoryEntry[];
    characters: Character[];
    locations: Location[];
    items: Item[];
    storyBeats: StoryBeat[];
    lorebookEntries: Entry[];
    embeddedImages: EmbeddedImage[];
    timeTracker?: TimeTracker | null;
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Debug: Log character visual descriptors before restore
    const currentCharDescriptors = this.characters.map(c => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    const backupCharDescriptors = backup.characters.map(c => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    log('RESTORE DEBUG - Before restore:', {
      currentCharDescriptors,
      backupCharDescriptors,
    });

    log('Restoring from retry backup...', {
      entriesCount: backup.entries.length,
      currentEntriesCount: this.entries.length,
      embeddedImagesCount: backup.embeddedImages.length,
    });

    // Restore to database
    await database.restoreRetryBackup(
      this.currentStory.id,
      backup.entries,
      backup.characters,
      backup.locations,
      backup.items,
      backup.storyBeats,
      backup.lorebookEntries,
      backup.embeddedImages
    );

    // Reload from database to ensure a clean, fully restored state
    const [entries, characters, locations, items, storyBeats, lorebookEntries] = await Promise.all([
      database.getStoryEntries(this.currentStory.id),
      database.getCharacters(this.currentStory.id),
      database.getLocations(this.currentStory.id),
      database.getItems(this.currentStory.id),
      database.getStoryBeats(this.currentStory.id),
      database.getEntries(this.currentStory.id),
    ]);

    // Debug: Log what we got back from database
    const dbCharDescriptors = characters.map(c => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    log('RESTORE DEBUG - After DB reload:', {
      dbCharDescriptors,
    });

    // Update local state
    this.entries = entries;
    this.characters = characters;
    this.locations = locations;
    this.items = items;
    this.storyBeats = storyBeats;
    this.lorebookEntries = lorebookEntries;

    // Invalidate caches after state restore
    this.invalidateWordCountCache();
    this.invalidateChapterCache();

    // Debug: Verify memory state matches
    const finalCharDescriptors = this.characters.map(c => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    log('RESTORE DEBUG - Final state:', {
      finalCharDescriptors,
    });

    // Restore time tracker if provided (null clears)
    await this.restoreTimeTrackerSnapshot(backup.timeTracker);

    log('Retry backup restored', {
      entries: this.entries.length,
      characters: this.characters.length,
      locations: this.locations.length,
      embeddedImages: backup.embeddedImages.length,
    });
  }

  /**
   * Restore character state fields from persistent retry snapshots.
   * Used for retry restores that don't have full state snapshots.
   */
  async restoreCharacterSnapshots(snapshots?: PersistentCharacterSnapshot[]): Promise<void> {
    log('restoreCharacterSnapshots called', {
      hasCurrentStory: !!this.currentStory,
      snapshotsCount: snapshots?.length ?? 0,
      snapshots: snapshots?.map(s => ({ id: s.id, visualDescriptors: s.visualDescriptors })),
      currentCharacters: this.characters.map(c => ({ id: c.id, name: c.name, visualDescriptors: c.visualDescriptors })),
    });

    if (!this.currentStory || !snapshots || snapshots.length === 0) {
      log('restoreCharacterSnapshots: early return - no story or no snapshots');
      return;
    }

    const snapshotById = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
    const updates: Array<{ id: string; updates: Partial<Character> }> = [];

    for (const character of this.characters) {
      const snapshot = snapshotById.get(character.id);
      if (!snapshot) continue;

      let relationship = snapshot.relationship ?? character.relationship;
      if (character.relationship === 'self' && relationship !== 'self') {
        relationship = 'self';
      }

      updates.push({
        id: character.id,
        updates: {
          traits: snapshot.traits ?? [],
          status: snapshot.status ?? character.status,
          relationship,
          visualDescriptors: snapshot.visualDescriptors ?? [],
          portrait: snapshot.portrait,
        },
      });
    }

    for (const update of updates) {
      await database.updateCharacter(update.id, update.updates);
    }

    this.characters = this.characters.map(character => {
      const snapshot = snapshotById.get(character.id);
      if (!snapshot) return character;

      let relationship = snapshot.relationship ?? character.relationship;
      if (character.relationship === 'self' && relationship !== 'self') {
        relationship = 'self';
      }

      return {
        ...character,
        traits: snapshot.traits ?? character.traits,
        status: snapshot.status ?? character.status,
        relationship,
        visualDescriptors: snapshot.visualDescriptors ?? character.visualDescriptors,
        portrait: snapshot.portrait ?? character.portrait,
      };
    });

    log('restoreCharacterSnapshots complete', {
      updatedCount: updates.length,
      finalCharacters: this.characters.map(c => ({ id: c.id, name: c.name, visualDescriptors: c.visualDescriptors })),
    });
  }

  // Delete a story
  async deleteStory(storyId: string): Promise<void> {
    await database.deleteStory(storyId);
    this.allStories = this.allStories.filter(s => s.id !== storyId);

    if (this.currentStory?.id === storyId) {
      this.clearCurrentStory();
    }
  }

  /**
   * Create a new story from wizard data.
   * This handles the full initialization from the setup wizard including
   * dynamically generated settings, protagonist, characters, and opening scene.
   */
async createStoryFromWizard(data: {
    title: string;
    genre: string;
    mode: StoryMode;
    settings: { pov: 'first' | 'second' | 'third'; tense: 'past' | 'present'; visualProseMode?: boolean; inlineImageMode?: boolean };
    protagonist: Partial<Character>;
    startingLocation: Partial<Location>;
    initialItems: Partial<Item>[];
    openingScene: string;
    systemPrompt: string;
    characters: Partial<Character>[];
    importedEntries?: ImportedEntry[];
  }): Promise<Story> {
log('createStoryFromWizard called', {
      title: data.title,
      genre: data.genre,
      mode: data.mode,
      pov: data.settings.pov,
      visualProseMode: data.settings.visualProseMode,
      inlineImageMode: data.settings.inlineImageMode,
    });

    // Create the base story with custom system prompt stored in settings
    const storyData = await database.createStory({
      id: crypto.randomUUID(),
      title: data.title,
      description: null,
      genre: data.genre,
      templateId: 'wizard-generated',
      mode: data.mode,
settings: {
        pov: data.settings.pov,
        tense: data.settings.tense,
        systemPromptOverride: data.systemPrompt,
        visualProseMode: data.settings.visualProseMode,
        inlineImageMode: data.settings.inlineImageMode,
      },
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
      styleReviewState: null,
      timeTracker: null,
      currentBranchId: null,
    });

    this.allStories = [storyData, ...this.allStories];
    const storyId = storyData.id;

    // Add protagonist
    if (data.protagonist.name) {
      const protagonist: Character = {
        id: crypto.randomUUID(),
        storyId,
        name: data.protagonist.name,
        description: data.protagonist.description ?? null,
        relationship: 'self',
        traits: data.protagonist.traits ?? [],
        status: 'active',
        metadata: { source: 'wizard' },
        visualDescriptors: data.protagonist.visualDescriptors ?? [],
        portrait: data.protagonist.portrait ?? null,
        branchId: null, // New stories start on main branch
      };
      await database.addCharacter(protagonist);
      log('Added protagonist:', protagonist.name);
    }

    // Add starting location
    if (data.startingLocation.name) {
      const location: Location = {
        id: crypto.randomUUID(),
        storyId,
        name: data.startingLocation.name,
        description: data.startingLocation.description ?? null,
        visited: true,
        current: true,
        connections: [],
        metadata: { source: 'wizard' },
        branchId: null, // New stories start on main branch
      };
      await database.addLocation(location);
      log('Added starting location:', location.name);
    }

    // Add initial items
    for (const itemData of data.initialItems) {
      if (!itemData.name) continue;
      const item: Item = {
        id: crypto.randomUUID(),
        storyId,
        name: itemData.name,
        description: itemData.description ?? null,
        quantity: itemData.quantity ?? 1,
        equipped: itemData.equipped ?? false,
        location: itemData.location ?? 'inventory',
        metadata: { source: 'wizard' },
        branchId: null, // New stories start on main branch
      };
      await database.addItem(item);
    }

    // Add supporting characters
    for (const charData of data.characters) {
      if (!charData.name) continue;
      const character: Character = {
        id: crypto.randomUUID(),
        storyId,
        name: charData.name,
        description: charData.description ?? null,
        relationship: charData.relationship ?? null,
        traits: charData.traits ?? [],
        status: 'active',
        metadata: { source: 'wizard' },
        visualDescriptors: charData.visualDescriptors ?? [],
        portrait: charData.portrait ?? null,
        branchId: null, // New stories start on main branch
      };
      await database.addCharacter(character);
      log('Added supporting character:', character.name);
    }

    // Add opening scene as first narration entry
    if (data.openingScene) {
      const tokenCount = countTokens(data.openingScene);
      const baseTime = storyData.timeTracker ?? { years: 0, days: 0, hours: 0, minutes: 0 };
      await database.addStoryEntry({
        id: crypto.randomUUID(),
        storyId,
        type: 'narration',
        content: data.openingScene,
        parentId: null,
        position: 0,
        metadata: { source: 'wizard', tokenCount, timeStart: { ...baseTime }, timeEnd: { ...baseTime } },
        branchId: null,
      });
      log('Added opening scene');
    }

    // Add imported lorebook entries
    if (data.importedEntries && data.importedEntries.length > 0) {
      const entries = convertToEntries(data.importedEntries, 'import');
      for (const entryData of entries) {
        const entry: Entry = {
          ...entryData,
          id: crypto.randomUUID(),
          storyId,
        };
        await database.addEntry(entry);
      }
      log('Added imported entries:', data.importedEntries.length);
    }

    // Emit event
    eventBus.emit<StoryCreatedEvent>({ type: 'StoryCreated', storyId, mode: data.mode });

    log('Story created from wizard:', storyId);
    return storyData;
  }
}

export const story = new StoryStore();
