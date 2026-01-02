import type { OpenRouterProvider } from './openrouter';
import type { Character, Location, Item, StoryBeat } from '$lib/types';
import { settings, type ClassifierSettings } from '$lib/stores/settings.svelte';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[Classifier]', ...args);
  }
}

// Classification result types based on design document section 3.3.1
export interface ClassificationResult {
  // Entry updates
  entryUpdates: {
    // Updates to existing entries
    characterUpdates: CharacterUpdate[];
    locationUpdates: LocationUpdate[];
    itemUpdates: ItemUpdate[];

    // New entries discovered in the narrative
    newCharacters: NewCharacter[];
    newLocations: NewLocation[];
    newItems: NewItem[];
    newStoryBeats: NewStoryBeat[];
  };

  // Scene state
  scene: {
    currentLocationName: string | null;
    presentCharacterNames: string[];
    timeProgression: 'none' | 'minutes' | 'hours' | 'days';
  };
}

export interface CharacterUpdate {
  name: string;
  changes: {
    status?: 'active' | 'inactive' | 'deceased';
    relationship?: string;
    newTraits?: string[];
  };
}

export interface LocationUpdate {
  name: string;
  changes: {
    visited?: boolean;
    current?: boolean;
    descriptionAddition?: string;
  };
}

export interface ItemUpdate {
  name: string;
  changes: {
    quantity?: number;
    equipped?: boolean;
    location?: string; // 'inventory', 'dropped', 'given', etc.
  };
}

export interface NewCharacter {
  name: string;
  description: string;
  relationship: string | null;
  traits: string[];
}

export interface NewLocation {
  name: string;
  description: string;
  visited: boolean;
  current: boolean;
}

export interface NewItem {
  name: string;
  description: string;
  quantity: number;
  location: string;
}

export interface NewStoryBeat {
  title: string;
  description: string;
  type: 'milestone' | 'quest' | 'revelation' | 'event' | 'plot_point';
  status: 'pending' | 'active' | 'completed';
}

// Context for classification
export interface ClassificationContext {
  narrativeResponse: string;
  userAction: string;
  existingCharacters: Character[];
  existingLocations: Location[];
  existingItems: Item[];
  existingStoryBeats: StoryBeat[];
  genre: string | null;
  storyMode: 'adventure' | 'creative-writing';
}

export class ClassifierService {
  private provider: OpenRouterProvider;
  private settingsOverride?: Partial<ClassifierSettings>;

  constructor(provider: OpenRouterProvider, settingsOverride?: Partial<ClassifierSettings>) {
    this.provider = provider;
    this.settingsOverride = settingsOverride;
  }

  private get model(): string {
    return this.settingsOverride?.model ?? settings.systemServicesSettings.classifier.model;
  }

  private get temperature(): number {
    return this.settingsOverride?.temperature ?? settings.systemServicesSettings.classifier.temperature;
  }

  private get maxTokens(): number {
    return this.settingsOverride?.maxTokens ?? settings.systemServicesSettings.classifier.maxTokens;
  }

  private get systemPrompt(): string {
    return this.settingsOverride?.systemPrompt ?? settings.systemServicesSettings.classifier.systemPrompt;
  }

  async classify(context: ClassificationContext): Promise<ClassificationResult> {
    log('classify called', {
      model: this.model,
      temperature: this.temperature,
      reasoning: true,
      responseLength: context.narrativeResponse.length,
      existingCharacters: context.existingCharacters.length,
      existingLocations: context.existingLocations.length,
      existingItems: context.existingItems.length,
    });

    const prompt = this.buildClassificationPrompt(context);

    try {
      log('Sending classification request...');

      // Use reasoning with max_tokens for mimo models
      const isMimo = this.model.includes('mimo');

      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        extraBody: {
          reasoning: isMimo ? { max_tokens: 5000 } : { enabled: true },
        },
      });

      log('Classification response received', {
        contentLength: response.content.length,
        usage: response.usage
      });

      const result = this.parseClassificationResponse(response.content);
      log('Classification parsed successfully', {
        newCharacters: result.entryUpdates.newCharacters.length,
        newLocations: result.entryUpdates.newLocations.length,
        newItems: result.entryUpdates.newItems.length,
        newStoryBeats: result.entryUpdates.newStoryBeats.length,
        characterUpdates: result.entryUpdates.characterUpdates.length,
        locationUpdates: result.entryUpdates.locationUpdates.length,
        itemUpdates: result.entryUpdates.itemUpdates.length,
        currentLocation: result.scene.currentLocationName,
        presentCharacters: result.scene.presentCharacterNames,
      });

      return result;
    } catch (error) {
      log('Classification failed', error);
      // Return empty result on failure - don't break the main flow
      return this.getEmptyResult();
    }
  }

  private buildClassificationPrompt(context: ClassificationContext): string {
    const existingCharacterNames = context.existingCharacters.map(c => c.name);
    const existingLocationNames = context.existingLocations.map(l => l.name);
    const existingItemNames = context.existingItems.map(i => i.name);
    const isCreativeMode = context.storyMode === 'creative-writing';

    // Mode-specific terminology
    const inputLabel = isCreativeMode ? "The Author's Direction" : "The Player's Action";
    const sceneLocationDesc = isCreativeMode
      ? "The name of where the current scene takes place, or null if unchanged"
      : "The name of where the protagonist IS (not where they're going), or null if unchanged";
    const itemLocationOptions = isCreativeMode
      ? "with_character|scene|mentioned"
      : "inventory|dropped|given";
    const storyBeatTypes = isCreativeMode
      ? "plot_point|revelation|milestone|event"
      : "quest|revelation|milestone|event";

    return `Analyze this narrative passage and extract world state changes.

## Context
${context.genre ? `Genre: ${context.genre}` : ''}
Mode: ${isCreativeMode ? 'Creative Writing (author directing the story)' : 'Adventure (player as protagonist)'}
Already tracking: ${existingCharacterNames.length} characters, ${existingLocationNames.length} locations, ${existingItemNames.length} items

## ${inputLabel}
"${context.userAction}"

## The Narrative Response
"""
${context.narrativeResponse}
"""

## Already Known Entities (check before adding duplicates)
Characters: ${existingCharacterNames.length > 0 ? existingCharacterNames.join(', ') : '(none)'}
Locations: ${existingLocationNames.length > 0 ? existingLocationNames.join(', ') : '(none)'}
Items: ${existingItemNames.length > 0 ? existingItemNames.join(', ') : '(none)'}

## Your Task
1. Check if any EXISTING entities need updates (status change, new info learned, etc.)
2. Identify any NEW significant entities introduced (apply the extraction rules strictly)
3. Determine the current scene state

## Response Format (JSON only)
{
  "entryUpdates": {
    "characterUpdates": [],
    "locationUpdates": [],
    "itemUpdates": [],
    "newCharacters": [],
    "newLocations": [],
    "newItems": [],
    "newStoryBeats": []
  },
  "scene": {
    "currentLocationName": null,
    "presentCharacterNames": [],
    "timeProgression": "none"
  }
}

### Field Specifications

characterUpdates: [{"name": "ExistingName", "changes": {"status": "active|inactive|deceased", "relationship": "new relationship", "newTraits": ["trait"]}}]

locationUpdates: [{"name": "ExistingName", "changes": {"visited": true, "current": true, "descriptionAddition": "new detail learned"}}]

itemUpdates: [{"name": "ExistingName", "changes": {"quantity": 1, "equipped": true, "location": "${itemLocationOptions}"}}]

newCharacters: [{"name": "ProperName", "description": "one sentence", "relationship": "friend|enemy|ally|neutral|unknown", "traits": ["trait1"]}]

newLocations: [{"name": "ProperName", "description": "one sentence", "visited": true, "current": false}]

newItems: [{"name": "ItemName", "description": "one sentence", "quantity": 1, "location": "${isCreativeMode ? 'with_character' : 'inventory'}"}]

newStoryBeats: [{"title": "Short Title", "description": "what happened or was learned", "type": "${storyBeatTypes}", "status": "pending|active|completed"}]

scene.currentLocationName: ${sceneLocationDesc}
scene.presentCharacterNames: Names of characters physically present in the scene
scene.timeProgression: How much time passed - "none", "minutes", "hours", or "days"

Return valid JSON only. Empty arrays are fine - don't invent entities that aren't clearly in the text.`;
  }

  private parseClassificationResponse(content: string): ClassificationResult {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // Handle markdown code blocks
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    try {
      const parsed = JSON.parse(jsonStr);

      // Validate and normalize the structure
      return {
        entryUpdates: {
          characterUpdates: Array.isArray(parsed.entryUpdates?.characterUpdates)
            ? parsed.entryUpdates.characterUpdates : [],
          locationUpdates: Array.isArray(parsed.entryUpdates?.locationUpdates)
            ? parsed.entryUpdates.locationUpdates : [],
          itemUpdates: Array.isArray(parsed.entryUpdates?.itemUpdates)
            ? parsed.entryUpdates.itemUpdates : [],
          newCharacters: Array.isArray(parsed.entryUpdates?.newCharacters)
            ? parsed.entryUpdates.newCharacters : [],
          newLocations: Array.isArray(parsed.entryUpdates?.newLocations)
            ? parsed.entryUpdates.newLocations : [],
          newItems: Array.isArray(parsed.entryUpdates?.newItems)
            ? parsed.entryUpdates.newItems : [],
          newStoryBeats: Array.isArray(parsed.entryUpdates?.newStoryBeats)
            ? parsed.entryUpdates.newStoryBeats : [],
        },
        scene: {
          currentLocationName: parsed.scene?.currentLocationName ?? null,
          presentCharacterNames: Array.isArray(parsed.scene?.presentCharacterNames)
            ? parsed.scene.presentCharacterNames : [],
          timeProgression: parsed.scene?.timeProgression ?? 'none',
        },
      };
    } catch (e) {
      log('Failed to parse classification JSON', e, 'Content:', jsonStr.substring(0, 200));
      return this.getEmptyResult();
    }
  }

  private getEmptyResult(): ClassificationResult {
    return {
      entryUpdates: {
        characterUpdates: [],
        locationUpdates: [],
        itemUpdates: [],
        newCharacters: [],
        newLocations: [],
        newItems: [],
        newStoryBeats: [],
      },
      scene: {
        currentLocationName: null,
        presentCharacterNames: [],
        timeProgression: 'none',
      },
    };
  }
}
