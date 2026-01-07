import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, Checkpoint, MemoryConfig, StoryMode, StorySettings, Entry } from '$lib/types';
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

  // Story library
  allStories = $state<Story[]>([]);

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
    if (mode === 'creative-writing') {
      return 'third';
    }
    if (!stored || stored === 'second') {
      return 'first';
    }
    return stored;
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
    return this.entries.reduce((count, entry) => {
      return count + entry.content.split(/\s+/).filter(Boolean).length;
    }, 0);
  }

  get memoryConfig(): MemoryConfig {
    return this.currentStory?.memoryConfig || DEFAULT_MEMORY_CONFIG;
  }

  get storyMode(): StoryMode {
    return this.currentStory?.mode || 'adventure';
  }

  get lastChapterEndIndex(): number {
    if (this.chapters.length === 0) return 0;

    // Sort chapters by number to ensure we get the actual last chapter
    const sortedChapters = [...this.chapters].sort((a, b) => a.number - b.number);
    const lastChapter = sortedChapters[sortedChapters.length - 1];

    const endEntry = this.entries.find(e => e.id === lastChapter.endEntryId);
    if (endEntry) {
      return this.entries.indexOf(endEntry) + 1;
    }

    // Fallback: if endEntryId references a deleted entry, estimate based on entry counts
    // This prevents all entries from being treated as visible
    log('Warning: Chapter endEntryId not found, using fallback calculation', {
      chapterId: lastChapter.id,
      chapterNumber: lastChapter.number,
      endEntryId: lastChapter.endEntryId,
    });

    // Sum up all chapter entry counts as a fallback estimate
    const totalChapterEntries = sortedChapters.reduce((sum, ch) => sum + ch.entryCount, 0);
    return Math.min(totalChapterEntries, this.entries.length);
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
   */
  isEntrySummarized(entryId: string): boolean {
    const entryIndex = this.entries.findIndex(e => e.id === entryId);
    if (entryIndex === -1) return false;
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

    this.currentStory = story;

    // Load all related data in parallel
    const [entries, characters, locations, items, storyBeats, chapters, checkpoints, lorebookEntries] = await Promise.all([
      database.getStoryEntries(storyId),
      database.getCharacters(storyId),
      database.getLocations(storyId),
      database.getItems(storyId),
      database.getStoryBeats(storyId),
      database.getChapters(storyId),
      database.getCheckpoints(storyId),
      database.getEntries(storyId),
    ]);

    this.entries = entries;
    this.characters = characters;
    this.locations = locations;
    this.items = items;
    this.storyBeats = storyBeats;
    this.chapters = chapters;
    this.checkpoints = checkpoints;
    this.lorebookEntries = lorebookEntries;

    log('Story loaded', {
      id: storyId,
      mode: story.mode,
      entries: entries.length,
      lorebookEntries: lorebookEntries.length,
      chapters: chapters.length,
      checkpoints: checkpoints.length,
    });

    // Load persisted activation data for this story (stickiness tracking)
    await ui.loadActivationData(storyId);

    // Set current story ID for retry backup tracking
    ui.setCurrentRetryStoryId(storyId);

    // Load retry state from DB if we don't have an in-memory backup for this story
    if (story.retryState) {
      ui.loadRetryBackupFromPersistent(storyId, story.retryState);
    }

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
          };
          await database.addItem(item);
        }
      }

      // Add opening scene as first narration entry
      if (state.openingScene) {
        const tokenCount = countTokens(state.openingScene);
        await database.addStoryEntry({
          id: crypto.randomUUID(),
          storyId: storyData.id,
          type: 'narration',
          content: state.openingScene,
          parentId: null,
          position: 0,
          metadata: { source: 'template', tokenCount },
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

    const position = await database.getNextEntryPosition(this.currentStory.id);
    const entry = await database.addStoryEntry({
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      type,
      content,
      parentId: null,
      position,
      metadata: { ...metadata, tokenCount },
    });

    this.entries = [...this.entries, entry];

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});

    return entry;
  }

  // Update a story entry
  async updateEntry(entryId: string, content: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Recalculate token count when content changes
    const tokenCount = countTokens(content);
    const existingEntry = this.entries.find(e => e.id === entryId);
    const updatedMetadata = { ...existingEntry?.metadata, tokenCount };

    await database.updateStoryEntry(entryId, { content, metadata: updatedMetadata });
    this.entries = this.entries.map(e =>
      e.id === entryId ? { ...e, content, metadata: updatedMetadata } : e
    );

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  // Delete a story entry
  async deleteEntry(entryId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.deleteStoryEntry(entryId);
    this.entries = this.entries.filter(e => e.id !== entryId);

    // Update story's updatedAt
    await database.updateStory(this.currentStory.id, {});
  }

  /**
   * Delete all entries from a given position onward.
   * Used for entry-only retry restore (persistent retry).
   */
  async deleteEntriesFromPosition(position: number): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    // Find entries to delete (position >= the given position)
    const entriesToDelete = this.entries.filter(e => e.position >= position);

    log('Deleting entries from position', {
      position,
      entriesToDelete: entriesToDelete.length,
      totalEntries: this.entries.length,
    });

    // Delete from database
    for (const entry of entriesToDelete) {
      await database.deleteStoryEntry(entry.id);
    }

    // Update in-memory state
    this.entries = this.entries.filter(e => e.position < position);

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
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const characterIdsSet = new Set(savedIds.characterIds);
    const locationIdsSet = new Set(savedIds.locationIds);
    const itemIdsSet = new Set(savedIds.itemIds);
    const storyBeatIdsSet = new Set(savedIds.storyBeatIds);
    const lorebookEntryIdsSet = new Set(savedIds.lorebookEntryIds);

    // Find entities to delete (not in saved lists)
    const charactersToDelete = this.characters.filter(c => !characterIdsSet.has(c.id));
    const locationsToDelete = this.locations.filter(l => !locationIdsSet.has(l.id));
    const itemsToDelete = this.items.filter(i => !itemIdsSet.has(i.id));
    const storyBeatsToDelete = this.storyBeats.filter(sb => !storyBeatIdsSet.has(sb.id));
    const lorebookEntriesToDelete = this.lorebookEntries.filter(le => !lorebookEntryIdsSet.has(le.id));

    log('Deleting entities created after backup', {
      characters: charactersToDelete.length,
      locations: locationsToDelete.length,
      items: itemsToDelete.length,
      storyBeats: storyBeatsToDelete.length,
      lorebookEntries: lorebookEntriesToDelete.length,
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
   */
  async addLorebookEntry(entryData: Omit<Entry, 'id' | 'storyId' | 'createdAt' | 'updatedAt'>): Promise<Entry> {
    if (!this.currentStory) throw new Error('No story loaded');

    const now = Date.now();
    const entry: Entry = {
      ...entryData,
      id: crypto.randomUUID(),
      storyId: this.currentStory.id,
      createdAt: now,
      updatedAt: now,
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
        if (update.changes.relationship) changes.relationship = update.changes.relationship;
        if (update.changes.newTraits?.length) {
          changes.traits = [...existing.traits, ...update.changes.newTraits];
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
          status: 'active',
          metadata: { source: 'classifier' },
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
        };
        await database.addStoryBeat(beat);
        this.storyBeats = [...this.storyBeats, beat];
      }
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

    // Clear current retry story ID (backups are kept per-story)
    ui.setCurrentRetryStoryId(null);
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
    log('Chapter added:', chapter.number, chapter.title);

    // Emit event
    emitChapterCreated(chapter.id, chapter.number, chapter.title);
  }

  // Get the next chapter number from the database (handles deletions correctly)
  async getNextChapterNumber(): Promise<number> {
    if (!this.currentStory) throw new Error('No story loaded');
    return await database.getNextChapterNumber(this.currentStory.id);
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
  getChapterEntries(chapter: Chapter): StoryEntry[] {
    const startIdx = this.entries.findIndex(e => e.id === chapter.startEntryId);
    const endIdx = this.entries.findIndex(e => e.id === chapter.endEntryId);
    if (startIdx === -1 || endIdx === -1) return [];
    return this.entries.slice(startIdx, endIdx + 1);
  }

  // Delete a chapter
  async deleteChapter(chapterId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    await database.deleteChapter(chapterId);
    this.chapters = this.chapters.filter(ch => ch.id !== chapterId);
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

    // Get previous chapters for context
    const previousChapters = [...this.chapters].sort((a, b) => a.number - b.number);

    // Import aiService dynamically to avoid circular dependency
    const { aiService } = await import('$lib/services/ai');

    // Generate summary with previous chapters as context
    const chapterData = await aiService.summarizeChapter(chapterEntries, previousChapters);

    // Get the next chapter number
    const chapterNumber = await this.getNextChapterNumber();

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
      keywords: chapterData.keywords,
      characters: chapterData.characters,
      locations: chapterData.locations,
      plotThreads: chapterData.plotThreads,
      emotionalTone: chapterData.emotionalTone,
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
      createdAt: Date.now(),
    };

    await database.createCheckpoint(checkpoint);
    this.checkpoints = [checkpoint, ...this.checkpoints];
    log('Checkpoint created:', name);

    // Emit event
    eventBus.emit<CheckpointCreatedEvent>({ type: 'CheckpointCreated', checkpointId: checkpoint.id, name });

    return checkpoint;
  }

  // Restore from a checkpoint
  async restoreCheckpoint(checkpointId: string): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) throw new Error('Checkpoint not found');

    log('Restoring checkpoint:', checkpoint.name);

    // Restore to database
    await database.restoreCheckpoint(checkpoint);

    // Update local state
    this.entries = [...checkpoint.entriesSnapshot];
    this.characters = [...checkpoint.charactersSnapshot];
    this.locations = [...checkpoint.locationsSnapshot];
    this.items = [...checkpoint.itemsSnapshot];
    this.storyBeats = [...checkpoint.storyBeatsSnapshot];
    // Sort chapters by number to ensure correct ordering
    this.chapters = [...checkpoint.chaptersSnapshot].sort((a, b) => a.number - b.number);

    log('Checkpoint restored');

    // Emit event
    eventBus.emit<CheckpointRestoredEvent>({ type: 'CheckpointRestored', checkpointId });
  }

  // Delete a checkpoint
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await database.deleteCheckpoint(checkpointId);
    this.checkpoints = this.checkpoints.filter(cp => cp.id !== checkpointId);
    log('Checkpoint deleted:', checkpointId);
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
  }): Promise<void> {
    if (!this.currentStory) throw new Error('No story loaded');

    log('Restoring from retry backup...', {
      entriesCount: backup.entries.length,
      currentEntriesCount: this.entries.length,
    });

    // Restore to database
    await database.restoreRetryBackup(
      this.currentStory.id,
      backup.entries,
      backup.characters,
      backup.locations,
      backup.items,
      backup.storyBeats,
      backup.lorebookEntries
    );

    // Update local state
    this.entries = [...backup.entries];
    this.characters = [...backup.characters];
    this.locations = [...backup.locations];
    this.items = [...backup.items];
    this.storyBeats = [...backup.storyBeats];
    this.lorebookEntries = [...backup.lorebookEntries];

    log('Retry backup restored', {
      entries: this.entries.length,
      characters: this.characters.length,
      locations: this.locations.length,
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
    settings: { pov: 'first' | 'second' | 'third'; tense: 'past' | 'present' };
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
      },
      memoryConfig: DEFAULT_MEMORY_CONFIG,
      retryState: null,
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
      };
      await database.addCharacter(character);
      log('Added supporting character:', character.name);
    }

    // Add opening scene as first narration entry
    if (data.openingScene) {
      const tokenCount = countTokens(data.openingScene);
      await database.addStoryEntry({
        id: crypto.randomUUID(),
        storyId,
        type: 'narration',
        content: data.openingScene,
        parentId: null,
        position: 0,
        metadata: { source: 'wizard', tokenCount },
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
