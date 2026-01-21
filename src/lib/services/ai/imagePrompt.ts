/**
 * Image Prompt Service
 *
 * Analyzes narrative text to identify visually striking moments for image generation.
 * Returns structured data including image prompts and source text for embedding.
 */

import { promptService } from '../prompts';
import type { OpenAIProvider } from './openrouter';
import type { Character } from '$lib/types';
import { buildExtraBody } from './requestOverrides';
import { settings } from '$lib/stores/settings.svelte';
import { tryParseJsonWithHealing } from './jsonHealing';

/**
 * Represents a scene identified as suitable for image generation.
 */
export interface ImageableScene {
  /** The detailed prompt for image generation */
  prompt: string;
  /** Verbatim quote from narrative (for text matching) */
  sourceText: string;
  /** Type of scene */
  sceneType: 'action' | 'item' | 'character' | 'environment';
  /** Priority 1-10, higher = more important */
  priority: number;
  /** Character names depicted in this scene (up to 3). First character is primary. Empty array for environment-only scenes. */
  characters: string[];
  /** If true, generate a portrait for the first character (portrait mode only) */
  generatePortrait: boolean;
}

/**
 * Context needed to analyze narrative for imageable scenes.
 */
export interface ImagePromptContext {
  /** The narrative text to analyze (English original) */
  narrativeResponse: string;
  /** The user action that triggered this narrative */
  userAction: string;
  /** Characters present in the scene with their visual descriptors */
  presentCharacters: Array<{
    name: string;
    visualDescriptors: string[];
  }>;
  /** Current location name */
  currentLocation?: string;
  /** The image style prompt to include */
  stylePrompt: string;
  /** Maximum number of images (0 = unlimited) */
  maxImages: number;
  /** Full chat history for comprehensive context */
  chatHistory?: string;
  /** Activated lorebook entries for world context */
  lorebookContext?: string;
  /** Names of characters that have portrait images available */
  charactersWithPortraits: string[];
  /** Whether to use portrait reference mode (simplified prompts for characters with portraits) */
  portraitMode: boolean;
  /** Translated narrative text - use this for sourceText extraction when available */
  translatedNarrative?: string;
  /** Target language for translation (e.g., "Spanish", "Japanese") */
  translationLanguage?: string;
}

/**
 * Service settings for image prompt generation.
 */
export interface ImagePromptSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
}

const DEFAULT_SETTINGS: ImagePromptSettings = {
  model: 'deepseek/deepseek-v3.2',
  temperature: 0.3,
  maxTokens: 2048,
  reasoningEffort: 'off',
};

/**
 * Service that identifies imageable scenes in narrative text.
 */
export class ImagePromptService {
  private provider: OpenAIProvider;
  private settings: ImagePromptSettings;
  private debug: boolean;

  constructor(
    provider: OpenAIProvider,
    settings: Partial<ImagePromptSettings> = {},
    debug = false
  ) {
    this.provider = provider;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.debug = debug;
  }

  /**
   * Analyze narrative text to identify visually striking moments.
   * @param context - The context for analysis
   * @returns Array of imageable scenes, sorted by priority (highest first)
   */
  async identifyScenes(context: ImagePromptContext): Promise<ImageableScene[]> {
    if (this.debug) {
      console.log('[ImagePrompt] Analyzing narrative for imageable scenes', {
        portraitMode: context.portraitMode,
        charactersWithPortraits: context.charactersWithPortraits,
      });
    }

    // Build character descriptors string
    const characterDescriptors = this.buildCharacterDescriptors(context.presentCharacters);

    // Build list of characters with portraits for the prompt
    const charactersWithPortraitsStr = context.charactersWithPortraits.length > 0
      ? context.charactersWithPortraits.join(', ')
      : 'None';

    const promptContext = {
      mode: 'adventure' as const,
      pov: 'second' as const,
      tense: 'present' as const,
      protagonistName: '',
    };

    // Select template based on portrait mode
    const templateId = context.portraitMode
      ? 'image-prompt-analysis-reference'
      : 'image-prompt-analysis';

    // Build the system prompt with style and character info
    const systemPrompt = promptService.renderPrompt(templateId, promptContext, {
      imageStylePrompt: context.stylePrompt,
      characterDescriptors: characterDescriptors || 'No character visual descriptors available.',
      charactersWithPortraits: charactersWithPortraitsStr,
      maxImages: context.maxImages === 0 ? '0 (unlimited)' : String(context.maxImages),
    });

    // Build the translated narrative block (only if translation is provided)
    let translatedNarrativeBlock = '';
    if (context.translatedNarrative && context.translationLanguage) {
      translatedNarrativeBlock = `## Display Narrative (${context.translationLanguage} - copy sourceText from THIS version)
${context.translatedNarrative}`;
    }

    // Build the user prompt with full context
    const userPrompt = promptService.renderUserPrompt(templateId, promptContext, {
      narrativeResponse: context.narrativeResponse,
      userAction: context.userAction,
      chatHistory: context.chatHistory || '',
      lorebookContext: context.lorebookContext || '',
      translatedNarrativeBlock,
    });

    try {
      const imageSettings = settings.systemServicesSettings.imageGeneration;
      const extraBody = buildExtraBody({
        manualMode: settings.advancedRequestSettings.manualMode,
        manualBody: imageSettings.manualBody,
        reasoningEffort: this.settings.reasoningEffort ?? 'off',
        providerOnly: imageSettings.providerOnly,
      });

      const response = await this.provider.generateResponse({
        model: this.settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens,
        extraBody,
      });

      const scenes = this.parseResponse(response.content);

      if (this.debug) {
        console.log(`[ImagePrompt] Found ${scenes.length} imageable scenes`);
      }

      // Sort by priority (highest first)
      return scenes.sort((a, b) => b.priority - a.priority);
    } catch (error) {
      console.error('[ImagePrompt] Failed to analyze narrative:', error);
      return [];
    }
  }

  /**
   * Build character descriptors string for the prompt.
   */
  private buildCharacterDescriptors(
    characters: Array<{ name: string; visualDescriptors: string[] }>
  ): string {
    if (!characters || characters.length === 0) {
      return '';
    }

    const descriptorLines = characters
      .filter(c => c.visualDescriptors && c.visualDescriptors.length > 0)
      .map(c => `- ${c.name}: ${c.visualDescriptors.join(', ')}`);

    if (descriptorLines.length === 0) {
      return '';
    }

    return descriptorLines.join('\n');
  }

  /**
   * Parse the AI response into structured imageable scenes.
   */
  private parseResponse(content: string): ImageableScene[] {
    const parsed = tryParseJsonWithHealing<unknown[]>(content);
    if (!parsed || !Array.isArray(parsed)) {
      if (this.debug) {
        console.log('[ImagePrompt] Failed to parse response as array');
      }
      return [];
    }

    // Validate and filter the parsed data
    return parsed
      .filter(item => this.isValidScene(item))
      .map(item => ({
        prompt: String((item as any).prompt),
        sourceText: String((item as any).sourceText),
        sceneType: this.normalizeSceneType((item as any).sceneType),
        priority: Math.min(10, Math.max(1, Number((item as any).priority) || 5)),
        characters: this.normalizeCharacters((item as any).characters),
        generatePortrait: Boolean((item as any).generatePortrait),
      }));
  }

  /**
   * Normalize characters array field - returns array of character names (max 3).
   */
  private normalizeCharacters(characters: unknown): string[] {
    if (!Array.isArray(characters)) {
      return [];
    }

    return characters
      .filter((c): c is string => typeof c === 'string')
      .map(c => c.trim())
      .filter(c => {
        const lower = c.toLowerCase();
        return c.length > 0 && lower !== 'none' && lower !== 'null';
      })
      .slice(0, 3); // Max 3 characters
  }

  /**
   * Validate that a parsed item has required fields.
   */
  private isValidScene(item: unknown): item is Record<string, unknown> {
    if (typeof item !== 'object' || item === null) {
      return false;
    }

    const obj = item as Record<string, unknown>;
    return (
      typeof obj.prompt === 'string' &&
      obj.prompt.length > 0 &&
      typeof obj.sourceText === 'string' &&
      obj.sourceText.length >= 3 // At least 3 characters
    );
  }

  /**
   * Normalize scene type to valid enum value.
   */
  private normalizeSceneType(type: unknown): ImageableScene['sceneType'] {
    const normalized = String(type).toLowerCase();
    if (['action', 'item', 'character', 'environment'].includes(normalized)) {
      return normalized as ImageableScene['sceneType'];
    }
    return 'action'; // Default
  }
}

/**
 * Create an ImagePromptService instance.
 */
export function createImagePromptService(
  provider: OpenAIProvider,
  settings?: Partial<ImagePromptSettings>,
  debug?: boolean
): ImagePromptService {
  return new ImagePromptService(provider, settings, debug);
}
