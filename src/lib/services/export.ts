import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { database } from './database';
import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Entry } from '$lib/types';

export interface AventuraExport {
  version: string;
  exportedAt: number;
  story: Story;
  entries: StoryEntry[];
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  lorebookEntries?: Entry[]; // Added in v1.1.0
}

class ExportService {
  private readonly VERSION = '1.1.0';

  // Export to Aventura format (.avt - JSON)
  async exportToAventura(
    story: Story,
    entries: StoryEntry[],
    characters: Character[],
    locations: Location[],
    items: Item[],
    storyBeats: StoryBeat[],
    lorebookEntries: Entry[] = []
  ): Promise<boolean> {
    const exportData: AventuraExport = {
      version: this.VERSION,
      exportedAt: Date.now(),
      story,
      entries,
      characters,
      locations,
      items,
      storyBeats,
      lorebookEntries,
    };

    const filePath = await save({
      defaultPath: `${this.sanitizeFilename(story.title)}.avt`,
      filters: [
        { name: 'Aventura Story', extensions: ['avt'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });

    if (!filePath) return false;

    await writeTextFile(filePath, JSON.stringify(exportData, null, 2));
    return true;
  }

  // Export to Markdown
  async exportToMarkdown(
    story: Story,
    entries: StoryEntry[],
    characters: Character[],
    locations: Location[],
    includeWorldState: boolean = false
  ): Promise<boolean> {
    let markdown = `# ${story.title}\n\n`;

    if (story.description) {
      markdown += `*${story.description}*\n\n`;
    }

    if (story.genre) {
      markdown += `**Genre:** ${story.genre}\n\n`;
    }

    markdown += `---\n\n`;

    // Add story entries
    for (const entry of entries) {
      if (entry.type === 'user_action') {
        markdown += `> **You:** ${entry.content}\n\n`;
      } else if (entry.type === 'narration') {
        markdown += `${entry.content}\n\n`;
      } else if (entry.type === 'system') {
        markdown += `*[System: ${entry.content}]*\n\n`;
      }
    }

    // Optionally include world state
    if (includeWorldState) {
      markdown += `---\n\n## World State\n\n`;

      if (characters.length > 0) {
        markdown += `### Characters\n\n`;
        for (const char of characters) {
          markdown += `- **${char.name}**`;
          if (char.relationship) markdown += ` (${char.relationship})`;
          if (char.description) markdown += `: ${char.description}`;
          markdown += `\n`;
        }
        markdown += `\n`;
      }

      if (locations.length > 0) {
        markdown += `### Locations\n\n`;
        for (const loc of locations) {
          markdown += `- **${loc.name}**`;
          if (loc.current) markdown += ` [Current]`;
          if (loc.visited) markdown += ` [Visited]`;
          if (loc.description) markdown += `: ${loc.description}`;
          markdown += `\n`;
        }
        markdown += `\n`;
      }
    }

    // Add export metadata
    markdown += `---\n\n`;
    markdown += `*Exported from Aventura on ${new Date().toLocaleDateString()}*\n`;

    const filePath = await save({
      defaultPath: `${this.sanitizeFilename(story.title)}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (!filePath) return false;

    await writeTextFile(filePath, markdown);
    return true;
  }

  // Export to plain text
  async exportToText(story: Story, entries: StoryEntry[]): Promise<boolean> {
    let text = `${story.title}\n${'='.repeat(story.title.length)}\n\n`;

    if (story.description) {
      text += `${story.description}\n\n`;
    }

    text += `---\n\n`;

    for (const entry of entries) {
      if (entry.type === 'user_action') {
        text += `> ${entry.content}\n\n`;
      } else if (entry.type === 'narration') {
        text += `${entry.content}\n\n`;
      }
    }

    const filePath = await save({
      defaultPath: `${this.sanitizeFilename(story.title)}.txt`,
      filters: [
        { name: 'Text', extensions: ['txt'] },
      ],
    });

    if (!filePath) return false;

    await writeTextFile(filePath, text);
    return true;
  }

  // Import from Aventura format (.avt) - uses native file dialog (desktop)
  async importFromAventura(): Promise<{ success: boolean; storyId?: string; error?: string }> {
    const filePath = await open({
      filters: [
        { name: 'Aventura Story', extensions: ['avt'] },
        { name: 'JSON', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }, // Fallback for Android compatibility
      ],
    });

    if (!filePath || typeof filePath !== 'string') {
      return { success: false };
    }

    try {
      const content = await readTextFile(filePath);
      return this.importFromContent(content);
    } catch (error) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import file',
      };
    }
  }

  // Import from file content string (for HTML file input / mobile compatibility)
  // Set skipImportedSuffix to true for sync operations to keep the original title
  async importFromContent(content: string, skipImportedSuffix: boolean = false): Promise<{ success: boolean; storyId?: string; error?: string }> {
    try {
      let data: AventuraExport;
      try {
        data = JSON.parse(content);
      } catch {
        return { success: false, error: 'Invalid file: Not a valid JSON file. Please select an Aventura story file (.avt or .json).' };
      }

      // Validate the import data
      if (!data.version || !data.story || !data.entries) {
        return { success: false, error: 'Invalid file format: This does not appear to be an Aventura story file. Missing required fields (version, story, or entries).' };
      }

      if (data.entries.length === 0) {
        return { success: false, error: 'Invalid story file: The file contains no story entries.' };
      }

      // Generate new IDs to avoid conflicts
      const oldToNewId = new Map<string, string>();

      // Create new story ID
      const newStoryId = crypto.randomUUID();
      oldToNewId.set(data.story.id, newStoryId);

      // Create the story with a modified title to indicate it was imported (unless skipped for sync)
      const importedStory: Omit<Story, 'createdAt' | 'updatedAt'> = {
        id: newStoryId,
        title: skipImportedSuffix ? data.story.title : `${data.story.title} (Imported)`,
        description: data.story.description,
        genre: data.story.genre,
        templateId: data.story.templateId,
        mode: data.story.mode || 'adventure',
        settings: data.story.settings,
        memoryConfig: data.story.memoryConfig || null,
        retryState: null, // Clear retry state on import
      };

      await database.createStory(importedStory);

      // Import entries
      for (const entry of data.entries) {
        const newEntryId = crypto.randomUUID();
        oldToNewId.set(entry.id, newEntryId);

        await database.addStoryEntry({
          id: newEntryId,
          storyId: newStoryId,
          type: entry.type,
          content: entry.content,
          parentId: entry.parentId ? oldToNewId.get(entry.parentId) ?? null : null,
          position: entry.position,
          metadata: entry.metadata,
        });
      }

      // Import characters
      if (data.characters) {
        for (const char of data.characters) {
          const newCharId = crypto.randomUUID();
          oldToNewId.set(char.id, newCharId);

          await database.addCharacter({
            id: newCharId,
            storyId: newStoryId,
            name: char.name,
            description: char.description,
            relationship: char.relationship,
            traits: char.traits,
            status: char.status,
            metadata: char.metadata,
          });
        }
      }

      // Import locations
      if (data.locations) {
        for (const loc of data.locations) {
          const newLocId = crypto.randomUUID();
          oldToNewId.set(loc.id, newLocId);

          await database.addLocation({
            id: newLocId,
            storyId: newStoryId,
            name: loc.name,
            description: loc.description,
            visited: loc.visited,
            current: loc.current,
            connections: loc.connections.map(c => oldToNewId.get(c) ?? c),
            metadata: loc.metadata,
          });
        }
      }

      // Import items
      if (data.items) {
        for (const item of data.items) {
          const newItemId = crypto.randomUUID();
          oldToNewId.set(item.id, newItemId);

          await database.addItem({
            id: newItemId,
            storyId: newStoryId,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            equipped: item.equipped,
            location: item.location,
            metadata: item.metadata,
          });
        }
      }

      // Import story beats
      if (data.storyBeats) {
        for (const beat of data.storyBeats) {
          const newBeatId = crypto.randomUUID();
          oldToNewId.set(beat.id, newBeatId);

          await database.addStoryBeat({
            id: newBeatId,
            storyId: newStoryId,
            title: beat.title,
            description: beat.description,
            type: beat.type,
            status: beat.status,
            triggeredAt: beat.triggeredAt,
            resolvedAt: beat.resolvedAt ?? null,
            metadata: beat.metadata,
          });
        }
      }

      // Import lorebook entries (added in v1.1.0)
      if (data.lorebookEntries) {
        for (const entry of data.lorebookEntries) {
          const newEntryId = crypto.randomUUID();
          oldToNewId.set(entry.id, newEntryId);

          await database.addEntry({
            id: newEntryId,
            storyId: newStoryId,
            name: entry.name,
            type: entry.type,
            description: entry.description,
            hiddenInfo: entry.hiddenInfo,
            aliases: entry.aliases || [],
            state: entry.state,
            adventureState: entry.adventureState,
            creativeState: entry.creativeState,
            injection: entry.injection,
            firstMentioned: entry.firstMentioned ? (oldToNewId.get(entry.firstMentioned) ?? entry.firstMentioned) : null,
            lastMentioned: entry.lastMentioned ? (oldToNewId.get(entry.lastMentioned) ?? entry.lastMentioned) : null,
            mentionCount: entry.mentionCount || 0,
            createdBy: entry.createdBy || 'import',
            createdAt: entry.createdAt || Date.now(),
            updatedAt: Date.now(),
            loreManagementBlacklisted: entry.loreManagementBlacklisted || false,
          });
        }
      }

      return { success: true, storyId: newStoryId };
    } catch (error) {
      console.error('Import failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import file',
      };
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 100);
  }
}

export const exportService = new ExportService();
