import Database from '@tauri-apps/plugin-sql';
import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  Template,
  Chapter,
  Checkpoint,
  Branch,
  MemoryConfig,
  Entry,
  EntryType,
  EntryState,
  EntryPreview,
  PersistentRetryState,
  PersistentStyleReviewState,
  TimeTracker,
  EmbeddedImage,
  EmbeddedImageStatus,
} from '$lib/types';

class DatabaseService {
  private db: Database | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await Database.load('sqlite:aventura.db');
  }

  private async getDb(): Promise<Database> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const db = await this.getDb();
    const result = await db.select<{ value: string }[]>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return result.length > 0 ? result[0].value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }

  // Story operations
  async getAllStories(): Promise<Story[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM stories ORDER BY updated_at DESC'
    );
    return results.map(this.mapStory);
  }

  async getStory(id: string): Promise<Story | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM stories WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapStory(results[0]) : null;
  }

  async createStory(story: Omit<Story, 'createdAt' | 'updatedAt'>): Promise<Story> {
    const db = await this.getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO stories (
        id,
        title,
        description,
        genre,
        template_id,
        mode,
        created_at,
        updated_at,
        settings,
        memory_config,
        retry_state,
        style_review_state,
        time_tracker
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        story.id,
        story.title,
        story.description,
        story.genre,
        story.templateId,
        story.mode || 'adventure',
        now,
        now,
        story.settings ? JSON.stringify(story.settings) : null,
        story.memoryConfig ? JSON.stringify(story.memoryConfig) : null,
        story.retryState ? JSON.stringify(story.retryState) : null,
        story.styleReviewState ? JSON.stringify(story.styleReviewState) : null,
        story.timeTracker ? JSON.stringify(story.timeTracker) : null,
      ]
    );
    return { ...story, createdAt: now, updatedAt: now };
  }

  async updateStory(id: string, updates: Partial<Story>): Promise<void> {
    const db = await this.getDb();
    const now = Date.now();
    const setClauses: string[] = ['updated_at = ?'];
    const values: any[] = [now];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }
    if (updates.genre !== undefined) {
      setClauses.push('genre = ?');
      values.push(updates.genre);
    }
    if (updates.mode !== undefined) {
      setClauses.push('mode = ?');
      values.push(updates.mode);
    }
    if (updates.settings !== undefined) {
      setClauses.push('settings = ?');
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.memoryConfig !== undefined) {
      setClauses.push('memory_config = ?');
      values.push(updates.memoryConfig ? JSON.stringify(updates.memoryConfig) : null);
    }
    if (updates.retryState !== undefined) {
      setClauses.push('retry_state = ?');
      values.push(updates.retryState ? JSON.stringify(updates.retryState) : null);
    }
    if (updates.styleReviewState !== undefined) {
      setClauses.push('style_review_state = ?');
      values.push(updates.styleReviewState ? JSON.stringify(updates.styleReviewState) : null);
    }
    if (updates.timeTracker !== undefined) {
      setClauses.push('time_tracker = ?');
      values.push(updates.timeTracker ? JSON.stringify(updates.timeTracker) : null);
    }

    values.push(id);
    await db.execute(
      `UPDATE stories SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Save retry state for a story.
   */
  async saveRetryState(storyId: string, retryState: PersistentRetryState): Promise<void> {
    const db = await this.getDb();
    console.log('[Database] Saving retry state', {
      storyId,
      hasCharacterSnapshots: !!retryState.characterSnapshots,
      characterSnapshotsCount: retryState.characterSnapshots?.length ?? 0,
      characterSnapshots: retryState.characterSnapshots?.map(s => ({
        id: s.id,
        visualDescriptors: s.visualDescriptors,
        traits: s.traits,
      })),
    });
    await db.execute(
      'UPDATE stories SET retry_state = ? WHERE id = ?',
      [JSON.stringify(retryState), storyId]
    );
  }

  /**
   * Clear retry state for a story.
   */
  async clearRetryState(storyId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET retry_state = NULL WHERE id = ?',
      [storyId]
    );
  }

  /**
   * Save style review state for a story.
   */
  async saveStyleReviewState(storyId: string, styleReviewState: PersistentStyleReviewState): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET style_review_state = ? WHERE id = ?',
      [JSON.stringify(styleReviewState), storyId]
    );
  }

  /**
   * Clear style review state for a story.
   */
  async clearStyleReviewState(storyId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET style_review_state = NULL WHERE id = ?',
      [storyId]
    );
  }

  /**
   * Save time tracker for a story.
   */
  async saveTimeTracker(storyId: string, timeTracker: TimeTracker): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET time_tracker = ? WHERE id = ?',
      [JSON.stringify(timeTracker), storyId]
    );
  }

  /**
   * Clear time tracker for a story.
   */
  async clearTimeTracker(storyId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET time_tracker = NULL WHERE id = ?',
      [storyId]
    );
  }

  async deleteStory(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM stories WHERE id = ?', [id]);
  }

  // Story entries operations
  async getStoryEntries(storyId: string, options?: { limit?: number; offset?: number }): Promise<StoryEntry[]> {
    const db = await this.getDb();
    let query = 'SELECT * FROM story_entries WHERE story_id = ? ORDER BY position ASC';
    const params: any[] = [storyId];

    if (options?.limit !== undefined) {
      query += ' LIMIT ?';
      params.push(options.limit);
      if (options?.offset !== undefined) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
    }

    const results = await db.select<any[]>(query, params);
    return results.map(this.mapStoryEntry);
  }

  /**
   * Get story entries filtered by branch.
   * @param storyId - The story ID
   * @param branchId - The branch ID (null for main branch entries)
   * @param maxPosition - Optional max position (inclusive) for inherited entries
   */
  async getStoryEntriesForBranch(
    storyId: string,
    branchId: string | null,
    maxPosition?: number
  ): Promise<StoryEntry[]> {
    const db = await this.getDb();

    let query: string;
    let params: any[];

    if (branchId === null) {
      // Main branch: entries with null branch_id
      if (maxPosition !== undefined) {
        // Limit to entries up to a certain position (for inherited entries)
        query = 'SELECT * FROM story_entries WHERE story_id = ? AND branch_id IS NULL AND position <= ? ORDER BY position ASC';
        params = [storyId, maxPosition];
      } else {
        query = 'SELECT * FROM story_entries WHERE story_id = ? AND branch_id IS NULL ORDER BY position ASC';
        params = [storyId];
      }
    } else {
      // Specific branch
      if (maxPosition !== undefined) {
        query = 'SELECT * FROM story_entries WHERE story_id = ? AND branch_id = ? AND position <= ? ORDER BY position ASC';
        params = [storyId, branchId, maxPosition];
      } else {
        query = 'SELECT * FROM story_entries WHERE story_id = ? AND branch_id = ? ORDER BY position ASC';
        params = [storyId, branchId];
      }
    }

    const results = await db.select<any[]>(query, params);
    return results.map(this.mapStoryEntry);
  }

  async getStoryEntry(id: string): Promise<StoryEntry | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM story_entries WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapStoryEntry(results[0]) : null;
  }

  /**
   * Get the count of story entries without loading them all.
   * Useful for UI display and pagination calculations.
   */
  async getStoryEntryCount(storyId: string): Promise<number> {
    const db = await this.getDb();
    const result = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM story_entries WHERE story_id = ?',
      [storyId]
    );
    return result[0]?.count ?? 0;
  }

  /**
   * Get the most recent story entries (for UI rendering).
   * More efficient than loading all entries for large stories.
   */
  async getRecentStoryEntries(storyId: string, count: number): Promise<StoryEntry[]> {
    const db = await this.getDb();
    // Get the last N entries by position
    const results = await db.select<any[]>(
      `SELECT * FROM story_entries WHERE story_id = ?
       ORDER BY position DESC LIMIT ?`,
      [storyId, count]
    );
    // Reverse to get correct chronological order
    return results.map(this.mapStoryEntry).reverse();
  }

  async addStoryEntry(entry: Omit<StoryEntry, 'createdAt'>): Promise<StoryEntry> {
    const db = await this.getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO story_entries (id, story_id, type, content, parent_id, position, created_at, metadata, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.storyId,
        entry.type,
        entry.content,
        entry.parentId,
        entry.position,
        now,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.branchId || null,
      ]
    );
    return { ...entry, createdAt: now };
  }

  async getNextEntryPosition(storyId: string, branchId?: string | null): Promise<number> {
    const db = await this.getDb();

    if (branchId === undefined || branchId === null) {
      // Main branch: max position of null branch_id entries
      const result = await db.select<{ maxPos: number | null }[]>(
        'SELECT MAX(position) as maxPos FROM story_entries WHERE story_id = ? AND branch_id IS NULL',
        [storyId]
      );
      return (result[0]?.maxPos ?? -1) + 1;
    } else {
      // Non-main branch: max position of branch-specific entries
      const result = await db.select<{ maxPos: number | null }[]>(
        'SELECT MAX(position) as maxPos FROM story_entries WHERE story_id = ? AND branch_id = ?',
        [storyId, branchId]
      );

      if (result[0]?.maxPos !== null) {
        return result[0].maxPos + 1;
      }

      // No branch-specific entries yet - get the fork position from branch record
      const branchResult = await db.select<{ fork_entry_id: string }[]>(
        'SELECT fork_entry_id FROM branches WHERE id = ?',
        [branchId]
      );

      if (branchResult.length > 0) {
        const forkEntryResult = await db.select<{ position: number }[]>(
          'SELECT position FROM story_entries WHERE id = ?',
          [branchResult[0].fork_entry_id]
        );
        if (forkEntryResult.length > 0) {
          // Start branch entries right after the fork point
          return forkEntryResult[0].position + 1;
        }
        // Fork entry was deleted - this indicates database corruption
        console.error(`[DatabaseService] Branch ${branchId} references missing fork entry: ${branchResult[0].fork_entry_id}`);
        throw new Error(`Branch fork entry not found. The branch may be corrupted.`);
      }

      // Branch record not found
      console.error(`[DatabaseService] Branch not found: ${branchId}`);
      throw new Error(`Branch not found: ${branchId}`);
    }
  }

  async updateStoryEntry(id: string, updates: Partial<StoryEntry>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.content !== undefined) {
      setClauses.push('content = ?');
      values.push(updates.content);
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      values.push(updates.type);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(updates.metadata ? JSON.stringify(updates.metadata) : null);
    }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(
      `UPDATE story_entries SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  async deleteStoryEntry(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM story_entries WHERE id = ?', [id]);
  }

  // Character operations
  async getCharacters(storyId: string): Promise<Character[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM characters WHERE story_id = ?',
      [storyId]
    );
    return results.map(this.mapCharacter);
  }

  /**
   * Get characters filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getCharactersForBranch(storyId: string, branchId: string | null): Promise<Character[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM characters WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM characters WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapCharacter);
  }

  async addCharacter(character: Character): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO characters (id, story_id, name, description, relationship, traits, visual_descriptors, portrait, status, metadata, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        character.id,
        character.storyId,
        character.name,
        character.description,
        character.relationship,
        JSON.stringify(character.traits),
        JSON.stringify(character.visualDescriptors || []),
        character.portrait || null,
        character.status,
        character.metadata ? JSON.stringify(character.metadata) : null,
        character.branchId || null,
      ]
    );
  }

  async updateCharacter(id: string, updates: Partial<Character>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
    if (updates.relationship !== undefined) { setClauses.push('relationship = ?'); values.push(updates.relationship); }
    if (updates.traits !== undefined) { setClauses.push('traits = ?'); values.push(JSON.stringify(updates.traits)); }
    if (updates.visualDescriptors !== undefined) { setClauses.push('visual_descriptors = ?'); values.push(JSON.stringify(updates.visualDescriptors)); }
    if (updates.portrait !== undefined) { setClauses.push('portrait = ?'); values.push(updates.portrait); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.metadata !== undefined) { setClauses.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE characters SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteCharacter(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM characters WHERE id = ?', [id]);
  }

  // Location operations
  async getLocations(storyId: string): Promise<Location[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM locations WHERE story_id = ?',
      [storyId]
    );
    return results.map(this.mapLocation);
  }

  /**
   * Get locations filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getLocationsForBranch(storyId: string, branchId: string | null): Promise<Location[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM locations WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM locations WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapLocation);
  }

  async addLocation(location: Location): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO locations (id, story_id, name, description, visited, current, connections, metadata, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        location.id,
        location.storyId,
        location.name,
        location.description,
        location.visited ? 1 : 0,
        location.current ? 1 : 0,
        JSON.stringify(location.connections),
        location.metadata ? JSON.stringify(location.metadata) : null,
        location.branchId || null,
      ]
    );
  }

  async setCurrentLocation(storyId: string, locationId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('UPDATE locations SET current = 0 WHERE story_id = ?', [storyId]);
    await db.execute('UPDATE locations SET current = 1, visited = 1 WHERE id = ?', [locationId]);
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
    if (updates.visited !== undefined) { setClauses.push('visited = ?'); values.push(updates.visited ? 1 : 0); }
    if (updates.current !== undefined) { setClauses.push('current = ?'); values.push(updates.current ? 1 : 0); }
    if (updates.connections !== undefined) { setClauses.push('connections = ?'); values.push(JSON.stringify(updates.connections)); }
    if (updates.metadata !== undefined) { setClauses.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE locations SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteLocation(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM locations WHERE id = ?', [id]);
  }

  // Item operations
  async getItems(storyId: string): Promise<Item[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM items WHERE story_id = ?',
      [storyId]
    );
    return results.map(this.mapItem);
  }

  /**
   * Get items filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getItemsForBranch(storyId: string, branchId: string | null): Promise<Item[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM items WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM items WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapItem);
  }

  async addItem(item: Item): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO items (id, story_id, name, description, quantity, equipped, location, metadata, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.storyId,
        item.name,
        item.description,
        item.quantity,
        item.equipped ? 1 : 0,
        item.location,
        item.metadata ? JSON.stringify(item.metadata) : null,
        item.branchId || null,
      ]
    );
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
    if (updates.quantity !== undefined) { setClauses.push('quantity = ?'); values.push(updates.quantity); }
    if (updates.equipped !== undefined) { setClauses.push('equipped = ?'); values.push(updates.equipped ? 1 : 0); }
    if (updates.location !== undefined) { setClauses.push('location = ?'); values.push(updates.location); }
    if (updates.metadata !== undefined) { setClauses.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteItem(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM items WHERE id = ?', [id]);
  }

  async updateStoryBeat(id: string, updates: Partial<StoryBeat>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
    if (updates.type !== undefined) { setClauses.push('type = ?'); values.push(updates.type); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.triggeredAt !== undefined) { setClauses.push('triggered_at = ?'); values.push(updates.triggeredAt); }
    if (updates.resolvedAt !== undefined) { setClauses.push('resolved_at = ?'); values.push(updates.resolvedAt); }
    if (updates.metadata !== undefined) { setClauses.push('metadata = ?'); values.push(JSON.stringify(updates.metadata)); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE story_beats SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  // Story beats operations
  async getStoryBeats(storyId: string): Promise<StoryBeat[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM story_beats WHERE story_id = ?',
      [storyId]
    );
    return results.map(this.mapStoryBeat);
  }

  /**
   * Get story beats filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getStoryBeatsForBranch(storyId: string, branchId: string | null): Promise<StoryBeat[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM story_beats WHERE story_id = ? AND branch_id IS NULL'
        : 'SELECT * FROM story_beats WHERE story_id = ? AND branch_id = ?',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapStoryBeat);
  }

  async addStoryBeat(beat: StoryBeat): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO story_beats (id, story_id, title, description, type, status, triggered_at, resolved_at, metadata, branch_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        beat.id,
        beat.storyId,
        beat.title,
        beat.description,
        beat.type,
        beat.status,
        beat.triggeredAt,
        beat.resolvedAt ?? null,
        beat.metadata ? JSON.stringify(beat.metadata) : null,
        beat.branchId || null,
      ]
    );
  }

  async deleteStoryBeat(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM story_beats WHERE id = ?', [id]);
  }

  // Template operations
  async getTemplates(): Promise<Template[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>('SELECT * FROM templates ORDER BY is_builtin DESC, name ASC');
    return results.map(this.mapTemplate);
  }

  async addTemplate(template: Template): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO templates (id, name, description, genre, system_prompt, initial_state, is_builtin, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        template.id,
        template.name,
        template.description,
        template.genre,
        template.systemPrompt,
        template.initialState ? JSON.stringify(template.initialState) : null,
        template.isBuiltin ? 1 : 0,
        template.createdAt,
      ]
    );
  }

  // Chapter operations
  async getChapters(storyId: string): Promise<Chapter[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM chapters WHERE story_id = ? ORDER BY number ASC',
      [storyId]
    );
    return results.map(this.mapChapter);
  }

  /**
   * Get chapters filtered by branch.
   * @param storyId - The story ID
   * @param branchId - The branch ID (null for main branch chapters)
   */
  async getChaptersForBranch(storyId: string, branchId: string | null): Promise<Chapter[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM chapters WHERE story_id = ? AND branch_id IS NULL ORDER BY number ASC'
        : 'SELECT * FROM chapters WHERE story_id = ? AND branch_id = ? ORDER BY number ASC',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapChapter);
  }

  async getChapter(id: string): Promise<Chapter | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM chapters WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapChapter(results[0]) : null;
  }

  async getNextChapterNumber(storyId: string): Promise<number> {
    const db = await this.getDb();
    const result = await db.select<{ maxNum: number | null }[]>(
      'SELECT MAX(number) as maxNum FROM chapters WHERE story_id = ?',
      [storyId]
    );
    return (result[0]?.maxNum ?? 0) + 1;
  }

  async addChapter(chapter: Chapter): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO chapters (
        id, story_id, number, title, start_entry_id, end_entry_id, entry_count,
        summary, start_time, end_time, keywords, characters, locations, plot_threads, emotional_tone,
        branch_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        chapter.storyId,
        chapter.number,
        chapter.title,
        chapter.startEntryId,
        chapter.endEntryId,
        chapter.entryCount,
        chapter.summary,
        chapter.startTime ? JSON.stringify(chapter.startTime) : null,
        chapter.endTime ? JSON.stringify(chapter.endTime) : null,
        JSON.stringify(chapter.keywords),
        JSON.stringify(chapter.characters),
        JSON.stringify(chapter.locations),
        JSON.stringify(chapter.plotThreads),
        chapter.emotionalTone,
        chapter.branchId || null,
        chapter.createdAt,
      ]
    );
  }

  async updateChapter(id: string, updates: Partial<Chapter>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) { setClauses.push('title = ?'); values.push(updates.title); }
    if (updates.summary !== undefined) { setClauses.push('summary = ?'); values.push(updates.summary); }
    if (updates.startTime !== undefined) { setClauses.push('start_time = ?'); values.push(updates.startTime ? JSON.stringify(updates.startTime) : null); }
    if (updates.endTime !== undefined) { setClauses.push('end_time = ?'); values.push(updates.endTime ? JSON.stringify(updates.endTime) : null); }
    if (updates.keywords !== undefined) { setClauses.push('keywords = ?'); values.push(JSON.stringify(updates.keywords)); }
    if (updates.characters !== undefined) { setClauses.push('characters = ?'); values.push(JSON.stringify(updates.characters)); }
    if (updates.locations !== undefined) { setClauses.push('locations = ?'); values.push(JSON.stringify(updates.locations)); }
    if (updates.plotThreads !== undefined) { setClauses.push('plot_threads = ?'); values.push(JSON.stringify(updates.plotThreads)); }
    if (updates.emotionalTone !== undefined) { setClauses.push('emotional_tone = ?'); values.push(updates.emotionalTone); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE chapters SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteChapter(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM chapters WHERE id = ?', [id]);
  }

  // Checkpoint operations
  async getCheckpoints(storyId: string): Promise<Checkpoint[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM checkpoints WHERE story_id = ? ORDER BY created_at DESC',
      [storyId]
    );
    return results.map(this.mapCheckpoint);
  }

  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM checkpoints WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapCheckpoint(results[0]) : null;
  }

  async createCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO checkpoints (
        id, story_id, name, last_entry_id, last_entry_preview, entry_count,
        entries_snapshot, characters_snapshot, locations_snapshot,
        items_snapshot, story_beats_snapshot, chapters_snapshot, time_tracker_snapshot,
        lorebook_entries_snapshot, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        checkpoint.id,
        checkpoint.storyId,
        checkpoint.name,
        checkpoint.lastEntryId,
        checkpoint.lastEntryPreview,
        checkpoint.entryCount,
        JSON.stringify(checkpoint.entriesSnapshot),
        JSON.stringify(checkpoint.charactersSnapshot),
        JSON.stringify(checkpoint.locationsSnapshot),
        JSON.stringify(checkpoint.itemsSnapshot),
        JSON.stringify(checkpoint.storyBeatsSnapshot),
        JSON.stringify(checkpoint.chaptersSnapshot),
        checkpoint.timeTrackerSnapshot ? JSON.stringify(checkpoint.timeTrackerSnapshot) : null,
        checkpoint.lorebookEntriesSnapshot ? JSON.stringify(checkpoint.lorebookEntriesSnapshot) : null,
        checkpoint.createdAt,
      ]
    );
  }

  async deleteCheckpoint(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM checkpoints WHERE id = ?', [id]);
  }

  /**
   * @deprecated This method is no longer used. Checkpoint restoration has been
   * replaced with branching to prevent data loss issues. Use createBranchFromCheckpoint
   * in the story store instead.
   */
  async restoreCheckpoint(checkpoint: Checkpoint, branchId: string | null): Promise<void> {
    const db = await this.getDb();
    const storyId = checkpoint.storyId;

    const branchClause = branchId === null ? 'branch_id IS NULL' : 'branch_id = ?';
    const branchParams = branchId === null ? [] : [branchId];

    // Delete current state
    await db.execute(
      `DELETE FROM story_entries WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    await db.execute(
      `DELETE FROM characters WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    await db.execute(
      `DELETE FROM locations WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    await db.execute(
      `DELETE FROM items WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    await db.execute(
      `DELETE FROM story_beats WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    await db.execute(
      `DELETE FROM chapters WHERE story_id = ? AND ${branchClause}`,
      [storyId, ...branchParams]
    );
    // Also delete lorebook entries if we have a snapshot to restore
    if (checkpoint.lorebookEntriesSnapshot !== undefined) {
      await db.execute(
        `DELETE FROM entries WHERE story_id = ? AND ${branchClause}`,
        [storyId, ...branchParams]
      );
    }

    const matchesBranch = (entryBranchId: string | null | undefined) =>
      (entryBranchId ?? null) === branchId;

    // Restore entries
    for (const entry of checkpoint.entriesSnapshot.filter(e => matchesBranch(e.branchId))) {
      await this.addStoryEntry(entry);
    }

    // Restore characters
    for (const character of checkpoint.charactersSnapshot.filter(c => matchesBranch(c.branchId))) {
      await this.addCharacter(character);
    }

    // Restore locations
    for (const location of checkpoint.locationsSnapshot.filter(l => matchesBranch(l.branchId))) {
      await this.addLocation(location);
    }

    // Restore items
    for (const item of checkpoint.itemsSnapshot.filter(i => matchesBranch(i.branchId))) {
      await this.addItem(item);
    }

    // Restore story beats
    for (const beat of checkpoint.storyBeatsSnapshot.filter(b => matchesBranch(b.branchId))) {
      await this.addStoryBeat(beat);
    }

    // Restore chapters
    for (const chapter of checkpoint.chaptersSnapshot.filter(ch => matchesBranch(ch.branchId))) {
      await this.addChapter(chapter);
    }

    // Restore lorebook entries (if snapshot exists - for backwards compatibility)
    if (checkpoint.lorebookEntriesSnapshot) {
      for (const entry of checkpoint.lorebookEntriesSnapshot.filter(e => matchesBranch(e.branchId))) {
        await this.addEntry(entry);
      }
    }
  }

  /**
   * Restore story state from a retry backup.
   * Similar to restoreCheckpoint but designed for the "retry last message" feature.
   * Does NOT touch chapters (those are more permanent).
   */
  async restoreRetryBackup(
    storyId: string,
    entries: StoryEntry[],
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
    lorebookEntries: Entry[],
    embeddedImages: EmbeddedImage[] = []
  ): Promise<void> {
    const db = await this.getDb();

    // Delete current state (except chapters which are more permanent)
    // Note: embedded_images will be cascade-deleted when story_entries are deleted
    await db.execute('DELETE FROM story_entries WHERE story_id = ?', [storyId]);
    await db.execute('DELETE FROM characters WHERE story_id = ?', [storyId]);
    await db.execute('DELETE FROM locations WHERE story_id = ?', [storyId]);
    await db.execute('DELETE FROM items WHERE story_id = ?', [storyId]);
    await db.execute('DELETE FROM story_beats WHERE story_id = ?', [storyId]);
    await db.execute('DELETE FROM entries WHERE story_id = ?', [storyId]);

    // Restore entries
    for (const entry of entries) {
      await this.addStoryEntry(entry);
    }

    // Restore characters
    for (const character of characters) {
      await this.addCharacter(character);
    }

    // Restore locations
    for (const location of locations) {
      await this.addLocation(location);
    }

    // Restore items
    for (const item of items) {
      await this.addItem(item);
    }

    // Restore story beats
    for (const beat of storyBeats) {
      await this.addStoryBeat(beat);
    }

    // Restore lorebook entries
    for (const entry of lorebookEntries) {
      await this.addEntry(entry);
    }

    // Restore embedded images
    for (const image of embeddedImages) {
      await this.createEmbeddedImage({
        id: image.id,
        storyId: image.storyId,
        entryId: image.entryId,
        sourceText: image.sourceText,
        prompt: image.prompt,
        styleId: image.styleId,
        model: image.model,
        imageData: image.imageData,
        width: image.width,
        height: image.height,
        status: image.status,
        errorMessage: image.errorMessage,
      });
    }
  }

  // ===== Branch Operations (for story branching/alternate timelines) =====

  async getBranches(storyId: string): Promise<Branch[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM branches WHERE story_id = ? ORDER BY created_at ASC',
      [storyId]
    );
    return results.map(this.mapBranch);
  }

  async getBranch(id: string): Promise<Branch | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM branches WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapBranch(results[0]) : null;
  }

  async addBranch(branch: Branch): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO branches (id, story_id, name, parent_branch_id, fork_entry_id, checkpoint_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        branch.id,
        branch.storyId,
        branch.name,
        branch.parentBranchId ?? null,
        branch.forkEntryId,
        branch.checkpointId ?? null,
        branch.createdAt,
      ]
    );
  }

  async updateBranch(id: string, updates: Partial<Pick<Branch, 'name' | 'checkpointId'>>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.checkpointId !== undefined) {
      setClauses.push('checkpoint_id = ?');
      values.push(updates.checkpointId ?? null);
    }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE branches SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteBranch(id: string): Promise<void> {
    const db = await this.getDb();
    // Delete story entries belonging to this branch
    await db.execute('DELETE FROM story_entries WHERE branch_id = ?', [id]);
    // Delete chapters belonging to this branch
    await db.execute('DELETE FROM chapters WHERE branch_id = ?', [id]);
    // Delete world state items belonging to this branch
    await db.execute('DELETE FROM characters WHERE branch_id = ?', [id]);
    await db.execute('DELETE FROM locations WHERE branch_id = ?', [id]);
    await db.execute('DELETE FROM items WHERE branch_id = ?', [id]);
    await db.execute('DELETE FROM story_beats WHERE branch_id = ?', [id]);
    await db.execute('DELETE FROM entries WHERE branch_id = ?', [id]);
    // Delete the branch itself
    await db.execute('DELETE FROM branches WHERE id = ?', [id]);
  }

  async setStoryCurrentBranch(storyId: string, branchId: string | null): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      'UPDATE stories SET current_branch_id = ?, updated_at = ? WHERE id = ?',
      [branchId, Date.now(), storyId]
    );
  }

  private mapBranch(row: any): Branch {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      parentBranchId: row.parent_branch_id || null,
      forkEntryId: row.fork_entry_id,
      checkpointId: row.checkpoint_id || null,
      createdAt: row.created_at,
    };
  }

  // ===== Entry/Lorebook Operations (per design doc section 3.2) =====

  async getEntries(storyId: string): Promise<Entry[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM entries WHERE story_id = ? ORDER BY created_at ASC',
      [storyId]
    );
    return results.map(this.mapEntry);
  }

  /**
   * Get lorebook entries filtered by branch.
   * Each branch has its own complete copy of world state, so we only return exact matches.
   */
  async getEntriesForBranch(storyId: string, branchId: string | null): Promise<Entry[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      branchId === null
        ? 'SELECT * FROM entries WHERE story_id = ? AND branch_id IS NULL ORDER BY created_at ASC'
        : 'SELECT * FROM entries WHERE story_id = ? AND branch_id = ? ORDER BY created_at ASC',
      branchId === null ? [storyId] : [storyId, branchId]
    );
    return results.map(this.mapEntry);
  }

  async getEntriesByType(storyId: string, type: EntryType): Promise<Entry[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM entries WHERE story_id = ? AND type = ? ORDER BY created_at ASC',
      [storyId, type]
    );
    return results.map(this.mapEntry);
  }

  async getEntryPreviews(storyId: string): Promise<EntryPreview[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT id, name, type, description, aliases FROM entries WHERE story_id = ? ORDER BY name ASC',
      [storyId]
    );
    return results.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description || '',
      aliases: row.aliases ? JSON.parse(row.aliases) : [],
    }));
  }

  async getEntry(id: string): Promise<Entry | null> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM entries WHERE id = ?',
      [id]
    );
    return results.length > 0 ? this.mapEntry(results[0]) : null;
  }

  async addEntry(entry: Entry): Promise<void> {
    const db = await this.getDb();
    await db.execute(
      `INSERT INTO entries (
        id, story_id, name, type, description, hidden_info, aliases,
        state, adventure_state, creative_state, injection,
        first_mentioned, last_mentioned, mention_count, created_by,
        created_at, updated_at, lore_management_blacklisted, branch_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.storyId,
        entry.name,
        entry.type,
        entry.description,
        entry.hiddenInfo,
        JSON.stringify(entry.aliases),
        JSON.stringify(entry.state),
        entry.adventureState ? JSON.stringify(entry.adventureState) : null,
        entry.creativeState ? JSON.stringify(entry.creativeState) : null,
        JSON.stringify(entry.injection),
        entry.firstMentioned,
        entry.lastMentioned,
        entry.mentionCount,
        entry.createdBy,
        entry.createdAt,
        entry.updatedAt,
        entry.loreManagementBlacklisted ? 1 : 0,
        entry.branchId || null,
      ]
    );
  }

  async updateEntry(id: string, updates: Partial<Entry>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = ['updated_at = ?'];
    const values: any[] = [Date.now()];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      values.push(updates.name);
    }
    if (updates.type !== undefined) {
      setClauses.push('type = ?');
      values.push(updates.type);
    }
    if (updates.description !== undefined) {
      setClauses.push('description = ?');
      values.push(updates.description);
    }
    if (updates.hiddenInfo !== undefined) {
      setClauses.push('hidden_info = ?');
      values.push(updates.hiddenInfo);
    }
    if (updates.aliases !== undefined) {
      setClauses.push('aliases = ?');
      values.push(JSON.stringify(updates.aliases));
    }
    if (updates.state !== undefined) {
      setClauses.push('state = ?');
      values.push(JSON.stringify(updates.state));
    }
    if (updates.adventureState !== undefined) {
      setClauses.push('adventure_state = ?');
      values.push(updates.adventureState ? JSON.stringify(updates.adventureState) : null);
    }
    if (updates.creativeState !== undefined) {
      setClauses.push('creative_state = ?');
      values.push(updates.creativeState ? JSON.stringify(updates.creativeState) : null);
    }
    if (updates.injection !== undefined) {
      setClauses.push('injection = ?');
      values.push(JSON.stringify(updates.injection));
    }
    if (updates.firstMentioned !== undefined) {
      setClauses.push('first_mentioned = ?');
      values.push(updates.firstMentioned);
    }
    if (updates.lastMentioned !== undefined) {
      setClauses.push('last_mentioned = ?');
      values.push(updates.lastMentioned);
    }
    if (updates.mentionCount !== undefined) {
      setClauses.push('mention_count = ?');
      values.push(updates.mentionCount);
    }
    if (updates.loreManagementBlacklisted !== undefined) {
      setClauses.push('lore_management_blacklisted = ?');
      values.push(updates.loreManagementBlacklisted ? 1 : 0);
    }

    values.push(id);
    await db.execute(
      `UPDATE entries SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  async deleteEntry(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM entries WHERE id = ?', [id]);
  }

  async mergeEntries(entryIds: string[], mergedEntry: Entry): Promise<void> {
    const db = await this.getDb();

    // Delete old entries
    for (const id of entryIds) {
      await this.deleteEntry(id);
    }

    // Add merged entry
    await this.addEntry(mergedEntry);
  }

  async searchEntries(storyId: string, query: string): Promise<Entry[]> {
    const db = await this.getDb();
    const searchPattern = `%${query}%`;
    const results = await db.select<any[]>(
      `SELECT * FROM entries WHERE story_id = ? AND (
        name LIKE ? OR description LIKE ? OR aliases LIKE ?
      ) ORDER BY name ASC`,
      [storyId, searchPattern, searchPattern, searchPattern]
    );
    return results.map(this.mapEntry);
  }

  // ===== Embedded Image Operations =====

  async getEmbeddedImagesForEntry(entryId: string): Promise<EmbeddedImage[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM embedded_images WHERE entry_id = ? ORDER BY created_at ASC',
      [entryId]
    );
    return results.map(this.mapEmbeddedImage);
  }

  async getEmbeddedImagesForStory(storyId: string): Promise<EmbeddedImage[]> {
    const db = await this.getDb();
    const results = await db.select<any[]>(
      'SELECT * FROM embedded_images WHERE story_id = ? ORDER BY created_at ASC',
      [storyId]
    );
    return results.map(this.mapEmbeddedImage);
  }

async createEmbeddedImage(image: Omit<EmbeddedImage, 'createdAt'>): Promise<EmbeddedImage> {
    const db = await this.getDb();
    const now = Date.now();
    await db.execute(
      `INSERT INTO embedded_images (
        id, story_id, entry_id, source_text, prompt, style_id, model,
        image_data, width, height, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        image.id,
        image.storyId,
        image.entryId,
        image.sourceText,
        image.prompt,
        image.styleId,
        image.model,
        image.imageData,
        image.width ?? null,
        image.height ?? null,
        image.status,
        image.errorMessage ?? null,
        now,
      ]
    );
    return { ...image, createdAt: now };
  }

  async updateEmbeddedImage(id: string, updates: Partial<EmbeddedImage>): Promise<void> {
    const db = await this.getDb();
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.imageData !== undefined) { setClauses.push('image_data = ?'); values.push(updates.imageData); }
    if (updates.width !== undefined) { setClauses.push('width = ?'); values.push(updates.width); }
    if (updates.height !== undefined) { setClauses.push('height = ?'); values.push(updates.height); }
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.errorMessage !== undefined) { setClauses.push('error_message = ?'); values.push(updates.errorMessage); }

    if (setClauses.length === 0) return;
    values.push(id);
    await db.execute(`UPDATE embedded_images SET ${setClauses.join(', ')} WHERE id = ?`, values);
  }

  async deleteEmbeddedImage(id: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM embedded_images WHERE id = ?', [id]);
  }

  async deleteEmbeddedImagesForEntry(entryId: string): Promise<void> {
    const db = await this.getDb();
    await db.execute('DELETE FROM embedded_images WHERE entry_id = ?', [entryId]);
  }

  /**
   * Clean up orphaned embedded_images that reference non-existent story_entries.
   * This can happen if data was created before foreign key constraints were enforced.
   * Returns the number of orphaned records deleted.
   */
  async cleanupOrphanedEmbeddedImages(): Promise<number> {
    const db = await this.getDb();
    // Find and delete embedded_images where the referenced entry_id doesn't exist
    const result = await db.execute(
      `DELETE FROM embedded_images
       WHERE entry_id NOT IN (SELECT id FROM story_entries)`
    );
    const deleted = result.rowsAffected ?? 0;
    if (deleted > 0) {
      console.log(`[Database] Cleaned up ${deleted} orphaned embedded_images`);
    }
    return deleted;
  }

private mapEmbeddedImage(row: any): EmbeddedImage {
    const sourceText = row.source_text;
    // Detect inline images by checking if sourceText is a <pic> tag
    const isInline = sourceText && sourceText.trim().startsWith('<pic ');
    
    return {
      id: row.id,
      storyId: row.story_id,
      entryId: row.entry_id,
      sourceText: sourceText,
      prompt: row.prompt,
      styleId: row.style_id,
      model: row.model,
      imageData: row.image_data,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      status: row.status as EmbeddedImageStatus,
      errorMessage: row.error_message ?? undefined,
      generationMode: isInline ? 'inline' : 'analyzed',
      createdAt: row.created_at,
    };
  }

  // Mapping functions
  private mapStory(row: any): Story {
    const retryState = row.retry_state ? JSON.parse(row.retry_state) : null;
    if (retryState) {
      console.log('[Database] Loading story with retry state', {
        storyId: row.id,
        hasCharacterSnapshots: !!retryState.characterSnapshots,
        characterSnapshotsCount: retryState.characterSnapshots?.length ?? 0,
        characterSnapshots: retryState.characterSnapshots?.map((s: any) => ({
          id: s.id,
          visualDescriptors: s.visualDescriptors,
          traits: s.traits,
        })),
      });
    }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      genre: row.genre,
      templateId: row.template_id,
      mode: row.mode || 'adventure',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings ? JSON.parse(row.settings) : null,
      memoryConfig: row.memory_config ? JSON.parse(row.memory_config) : null,
      retryState,
      styleReviewState: row.style_review_state ? JSON.parse(row.style_review_state) : null,
      timeTracker: row.time_tracker ? JSON.parse(row.time_tracker) : null,
      currentBranchId: row.current_branch_id || null,
    };
  }

  private mapStoryEntry(row: any): StoryEntry {
    return {
      id: row.id,
      storyId: row.story_id,
      type: row.type,
      content: row.content,
      parentId: row.parent_id,
      position: row.position,
      createdAt: row.created_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
    };
  }

  private mapCharacter(row: any): Character {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      relationship: row.relationship,
      traits: row.traits ? JSON.parse(row.traits) : [],
      visualDescriptors: row.visual_descriptors ? JSON.parse(row.visual_descriptors) : [],
      portrait: row.portrait || null,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
    };
  }

  private mapLocation(row: any): Location {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      visited: row.visited === 1,
      current: row.current === 1,
      connections: row.connections ? JSON.parse(row.connections) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
    };
  }

  private mapItem(row: any): Item {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      description: row.description,
      quantity: row.quantity,
      equipped: row.equipped === 1,
      location: row.location,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
    };
  }

  private mapStoryBeat(row: any): StoryBeat {
    return {
      id: row.id,
      storyId: row.story_id,
      title: row.title,
      description: row.description,
      type: row.type,
      status: row.status,
      triggeredAt: row.triggered_at,
      resolvedAt: row.resolved_at ?? null,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      branchId: row.branch_id || null,
    };
  }

  private mapTemplate(row: any): Template {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      genre: row.genre,
      systemPrompt: row.system_prompt,
      initialState: row.initial_state ? JSON.parse(row.initial_state) : null,
      isBuiltin: row.is_builtin === 1,
      createdAt: row.created_at,
    };
  }

  private mapChapter(row: any): Chapter {
    return {
      id: row.id,
      storyId: row.story_id,
      number: row.number,
      title: row.title,
      startEntryId: row.start_entry_id,
      endEntryId: row.end_entry_id,
      entryCount: row.entry_count,
      summary: row.summary,
      startTime: row.start_time ? JSON.parse(row.start_time) : null,
      endTime: row.end_time ? JSON.parse(row.end_time) : null,
      keywords: row.keywords ? JSON.parse(row.keywords) : [],
      characters: row.characters ? JSON.parse(row.characters) : [],
      locations: row.locations ? JSON.parse(row.locations) : [],
      plotThreads: row.plot_threads ? JSON.parse(row.plot_threads) : [],
      emotionalTone: row.emotional_tone,
      branchId: row.branch_id || null,
      createdAt: row.created_at,
    };
  }

  private mapCheckpoint(row: any): Checkpoint {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      lastEntryId: row.last_entry_id,
      lastEntryPreview: row.last_entry_preview,
      entryCount: row.entry_count,
      entriesSnapshot: row.entries_snapshot ? JSON.parse(row.entries_snapshot) : [],
      charactersSnapshot: row.characters_snapshot ? JSON.parse(row.characters_snapshot) : [],
      locationsSnapshot: row.locations_snapshot ? JSON.parse(row.locations_snapshot) : [],
      itemsSnapshot: row.items_snapshot ? JSON.parse(row.items_snapshot) : [],
      storyBeatsSnapshot: row.story_beats_snapshot ? JSON.parse(row.story_beats_snapshot) : [],
      chaptersSnapshot: row.chapters_snapshot ? JSON.parse(row.chapters_snapshot) : [],
      // Use null when missing - old checkpoints without time tracking should reset time to null on restore
      timeTrackerSnapshot: row.time_tracker_snapshot ? JSON.parse(row.time_tracker_snapshot) : null,
      // undefined if column doesn't exist (old checkpoints) - preserve current lorebook on restore
      lorebookEntriesSnapshot: row.lorebook_entries_snapshot ? JSON.parse(row.lorebook_entries_snapshot) : undefined,
      createdAt: row.created_at,
    };
  }

  private mapEntry(row: any): Entry {
    return {
      id: row.id,
      storyId: row.story_id,
      name: row.name,
      type: row.type,
      description: row.description || '',
      hiddenInfo: row.hidden_info,
      aliases: row.aliases ? JSON.parse(row.aliases) : [],
      state: row.state ? JSON.parse(row.state) : { type: row.type },
      adventureState: row.adventure_state ? JSON.parse(row.adventure_state) : null,
      creativeState: row.creative_state ? JSON.parse(row.creative_state) : null,
      injection: row.injection ? JSON.parse(row.injection) : { mode: 'keyword', keywords: [], priority: 0 },
      firstMentioned: row.first_mentioned,
      lastMentioned: row.last_mentioned,
      mentionCount: row.mention_count ?? 0,
      createdBy: row.created_by || 'user',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      loreManagementBlacklisted: row.lore_management_blacklisted === 1,
      branchId: row.branch_id || null,
    };
  }
}

export const database = new DatabaseService();
