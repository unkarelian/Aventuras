/**
 * ExportCoordinationService - Gathers all story data in parallel for export.
 * Coordinates with the main exportService to provide complete story data.
 */

import { database } from '$lib/services/database';
import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  Chapter,
  Entry,
  Checkpoint,
  Branch,
  EmbeddedImage,
} from '$lib/types';

/** Complete story data for export */
export interface StoryExportData {
  entries: StoryEntry[];
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  lorebookEntries: Entry[];
  embeddedImages: EmbeddedImage[];
  checkpoints: Checkpoint[];
  branches: Branch[];
  chapters: Chapter[];
}

/**
 * Gather all story data in parallel for export.
 * @param storyId - The story ID to gather data for
 * @returns Complete story data ready for export
 */
export async function gatherStoryData(storyId: string): Promise<StoryExportData> {
  const [
    entries,
    characters,
    locations,
    items,
    storyBeats,
    lorebookEntries,
    embeddedImages,
    checkpoints,
    branches,
    chapters,
  ] = await Promise.all([
    database.getStoryEntries(storyId),
    database.getCharacters(storyId),
    database.getLocations(storyId),
    database.getItems(storyId),
    database.getStoryBeats(storyId),
    database.getEntries(storyId),
    database.getEmbeddedImagesForStory(storyId),
    database.getCheckpoints(storyId),
    database.getBranches(storyId),
    database.getChapters(storyId),
  ]);

  return {
    entries,
    characters,
    locations,
    items,
    storyBeats,
    lorebookEntries,
    embeddedImages,
    checkpoints,
    branches,
    chapters,
  };
}

export const exportCoordinationService = {
  gatherStoryData,
};
