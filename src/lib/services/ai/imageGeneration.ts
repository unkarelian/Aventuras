/**
 * Image Generation Service
 *
 * Coordinates the full image generation pipeline:
 * 1. Identify imageable scenes from narrative using ImagePromptService
 * 2. Create pending EmbeddedImage records
 * 3. Queue async image generation for each scene
 *
 * Runs in parallel with other post-narrative tasks (suggestions, action choices).
 */

import type { EmbeddedImage, Character } from '$lib/types';
import type { OpenAIProvider } from './openrouter';
import type { ImageProvider } from './imageProvider';
import { ImagePromptService, type ImagePromptContext, type ImageableScene } from './imagePrompt';
import { NanoGPTImageProvider } from './nanoGPTImageProvider';
import { ChutesImageProvider } from './chutesImageProvider';
import { database } from '$lib/services/database';
import { promptService } from '$lib/services/prompts';
import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import { emitImageQueued, emitImageReady, emitImageAnalysisStarted, emitImageAnalysisComplete } from '$lib/services/events';
import { normalizeImageDataUrl } from '$lib/utils/image';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[ImageGeneration]', ...args);
  }
}

export interface ImageGenerationContext {
  storyId: string;
  entryId: string;
  narrativeResponse: string;
  userAction: string;
  presentCharacters: Character[];
  currentLocation?: string;
  /** Full chat history for context (untruncated) */
  chatHistory?: string;
  /** Activated lorebook entries context */
  lorebookContext?: string;
}

export class ImageGenerationService {
  private promptService: ImagePromptService;
  private imageProvider: ImageProvider | null = null;
  private presetId: string;

  constructor(provider: OpenAIProvider, presetId: string) {
    this.presetId = presetId;
    const preset = settings.getPresetConfig(presetId);
    const promptSettings = {
      model: preset.model,
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      reasoningEffort: preset.reasoningEffort,
    };
    this.promptService = new ImagePromptService(provider, promptSettings);
  }

  /**
   * Check if image generation is enabled and configured
   */
  static isEnabled(): boolean {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings?.enabled) return false;

    // Check if we have the appropriate API key for the selected provider
    const provider = imageSettings.imageProvider ?? 'nanogpt';
    if (provider === 'chutes') {
      return !!imageSettings.chutesApiKey;
    }
    return !!imageSettings.nanoGptApiKey;
  }

  /**
   * Get the API key for the currently selected provider
   */
  private static getApiKey(): string {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const provider = imageSettings.imageProvider ?? 'nanogpt';
    if (provider === 'chutes') {
      return imageSettings.chutesApiKey;
    }
    return imageSettings.nanoGptApiKey;
  }

  /**
   * Create the appropriate image provider based on settings
   */
  private createImageProvider(): ImageProvider {
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const provider = imageSettings.imageProvider ?? 'nanogpt';
    const apiKey = ImageGenerationService.getApiKey();

    if (provider === 'chutes') {
      return new ChutesImageProvider(apiKey, DEBUG);
    }
    return new NanoGPTImageProvider(apiKey, DEBUG);
  }

  /**
   * Generate images for a narrative response.
   * This is the main entry point called after narrative generation completes.
   *
   * @returns Promise that resolves when all images are queued (not completed)
   */
  async generateForNarrative(context: ImageGenerationContext): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration;

    if (!imageSettings?.enabled) {
      log('Image generation disabled');
      return;
    }

    // Check if portrait mode is enabled
    const portraitMode = imageSettings.portraitMode ?? false;

    // Build list of character names that have portraits
    const charactersWithPortraits = context.presentCharacters
      .filter(c => c.portrait)
      .map(c => c.name);

    log('Starting image generation', {
      storyId: context.storyId,
      entryId: context.entryId,
      narrativeLength: context.narrativeResponse.length,
      presentCharacters: context.presentCharacters.length,
      portraitMode,
      charactersWithPortraits,
    });

    try {
      // Get the selected style template
      const stylePrompt = this.getStylePrompt(imageSettings.styleId);

      // Build character descriptors for the prompt service
      const characterDescriptors = context.presentCharacters
        .filter(c => c.visualDescriptors && c.visualDescriptors.length > 0)
        .map(c => ({
          name: c.name,
          visualDescriptors: c.visualDescriptors ?? [],
        }));

      // Get max images setting (0 = unlimited)
      const maxImages = imageSettings.maxImagesPerMessage ?? 3;

      // Build prompt context
      const promptContext: ImagePromptContext = {
        narrativeResponse: context.narrativeResponse,
        userAction: context.userAction,
        presentCharacters: characterDescriptors,
        currentLocation: context.currentLocation,
        stylePrompt,
        maxImages,
        chatHistory: context.chatHistory,
        lorebookContext: context.lorebookContext,
        charactersWithPortraits,
        portraitMode,
      };

      // Emit event: starting image analysis
      emitImageAnalysisStarted(context.entryId);

      // Identify imageable scenes
      const scenes = await this.promptService.identifyScenes(promptContext);

      log('Scenes identified', {
        count: scenes.length,
        types: scenes.map(s => s.sceneType),
        characters: scenes.map(s => s.characters),
      });

      // Limit to max images per message (0 = unlimited)
      const scenesToProcess = scenes.length === 0
        ? []
        : maxImages === 0
          ? scenes.sort((a, b) => b.priority - a.priority)
          : scenes.sort((a, b) => b.priority - a.priority).slice(0, maxImages);

      // Separate portrait generation scenes from regular scenes
      const portraitScenes = scenesToProcess.filter(s => s.generatePortrait && s.characters.length > 0);
      const regularScenes = scenesToProcess.filter(s => !s.generatePortrait);

      // Emit event: analysis complete
      emitImageAnalysisComplete(context.entryId, regularScenes.length, portraitScenes.length);

      if (scenesToProcess.length === 0) {
        log('No imageable scenes found');
        return;
      }

      log('Processing scenes', {
        total: scenes.length,
        selected: scenesToProcess.length,
        maxAllowed: maxImages,
      });

      log('Scene breakdown', {
        portraits: portraitScenes.length,
        regular: regularScenes.length,
      });

      // PHASE 1: Generate portraits first (synchronously) so they can be used immediately
      // This allows the LLM to request both a portrait AND a scene for the same character
      const updatedCharacters = [...context.presentCharacters];
      const updatedCharactersWithPortraits = [...charactersWithPortraits];

      for (const scene of portraitScenes) {
        const characterName = scene.characters[0];
        const result = await this.generateCharacterPortrait(
          context.storyId,
          characterName,
          scene.prompt,
          imageSettings,
          updatedCharacters
        );

        // Update our local tracking if portrait was generated
        if (result) {
          // Update the character in our local array
          const charIndex = updatedCharacters.findIndex(
            c => c.name.toLowerCase() === characterName.toLowerCase()
          );
          if (charIndex !== -1) {
            updatedCharacters[charIndex] = {
              ...updatedCharacters[charIndex],
              portrait: result.portraitDataUrl,
            };
            // Add to characters with portraits list
            if (!updatedCharactersWithPortraits.includes(updatedCharacters[charIndex].name)) {
              updatedCharactersWithPortraits.push(updatedCharacters[charIndex].name);
            }
          }
          log('Portrait ready for immediate use', { character: characterName });
        }
      }

      // PHASE 2: Generate regular scene images (can now use freshly generated portraits)
      for (const scene of regularScenes) {
        await this.queueImageGeneration(
          context.storyId,
          context.entryId,
          scene,
          imageSettings,
          updatedCharacters  // Use updated characters with new portraits
        );
      }

      log('All images queued');
    } catch (error) {
      log('Image generation failed', error);
      // Don't throw - image generation failure shouldn't break the main flow
    }
  }

  async generateBackgroundImage(
    prompt: string
  ): Promise<string | null> {
    try {
      const imageSettings = settings.systemServicesSettings.imageGeneration;

      // Get API key from settings
      const apiKey = ImageGenerationService.getApiKey();
      if (!apiKey) {
        throw new Error('No API key configured for image generation');
      }

      // Create provider if needed
      if (!this.imageProvider) {
        this.imageProvider = this.createImageProvider();
      }

      // Generate image
      const response = await this.imageProvider.generateImage({
        prompt,
        model: imageSettings.model || 'z-image-turbo',
        size: imageSettings.backgroundSize,
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      log('Background image generated successfully');

      return response.images[0].b64_json;
    } catch (error) {
      log('Background image generation failed', error);
      return null;
    }
  }

  /**
   * Get the style prompt for the selected style ID
   */
  private getStylePrompt(styleId: string): string {
    // Try to get from prompt service (user may have customized)
    try {
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };
      const customized = promptService.getPrompt(styleId, promptContext);
      if (customized) {
        return customized;
      }
    } catch {
      // Template not found, use fallback
    }

    // Fallback to default styles
    const defaultStyles: Record<string, string> = {
      'image-style-soft-anime': `Soft cel-shaded anime illustration. Muted pastel color palette with low saturation. Diffused ambient lighting, subtle linework blending into colors. Smooth gradients, slight bloom effect on highlights. Dreamy, airy atmosphere. Studio Ghibli-inspired. Soft shadows, watercolor texture hints in background.`,
      'image-style-semi-realistic': `Semi-realistic anime art with refined, detailed rendering. Realistic proportions with anime influence. Detailed hair strands, subtle skin tones, fabric folds. Naturalistic lighting with clear direction and soft falloff. Cinematic composition with depth of field. Rich, slightly desaturated colors with intentional color grading. Painterly quality with polished edges. Atmospheric and grounded mood.`,
      'image-style-photorealistic': `Photorealistic digital art. True-to-life rendering with natural lighting. Detailed textures, accurate proportions. Professional photography aesthetic. Cinematic depth of field. High dynamic range. Realistic materials and surfaces.`,
    };

    return defaultStyles[styleId] || defaultStyles['image-style-soft-anime'];
  }

  /**
   * Queue image generation for a single scene
   */
  private async queueImageGeneration(
    storyId: string,
    entryId: string,
    scene: ImageableScene,
    imageSettings: typeof settings.systemServicesSettings.imageGeneration,
    presentCharacters: Character[]
  ): Promise<void> {
    // Handle portrait generation for new characters
    const primaryCharacter = scene.characters[0];
    if (scene.generatePortrait && primaryCharacter) {
      log('Generating portrait for new character', { character: primaryCharacter });
      await this.generateCharacterPortrait(
        storyId,
        primaryCharacter,
        scene.prompt,
        imageSettings,
        presentCharacters
      );
      return;
    }

    const imageId = crypto.randomUUID();

    // Determine if we should use reference images
    let referenceImageUrls: string[] | undefined;
    let modelToUse = imageSettings.model;

    // If portrait mode is enabled and scene has characters, look for their portraits
    const sceneCharacters = scene.characters;

    if (imageSettings.portraitMode && sceneCharacters.length > 0) {
      // Collect portraits for all characters in the scene (up to 3)
      const portraitUrls: string[] = [];
      const charactersWithPortraits: string[] = [];
      const charactersWithoutPortraits: string[] = [];

      for (const charName of sceneCharacters.slice(0, 3)) {
        const character = presentCharacters.find(
          c => c.name.toLowerCase() === charName.toLowerCase()
        );

        const portraitUrl = normalizeImageDataUrl(character?.portrait);
        if (portraitUrl) {
          portraitUrls.push(portraitUrl);
          charactersWithPortraits.push(charName);
        } else {
          charactersWithoutPortraits.push(charName);
        }
      }

      if (charactersWithoutPortraits.length > 0) {
        // In portrait mode, skip scene if ANY character is missing a portrait
        log('Skipping scene - not all characters have portraits in portrait mode', {
          characters: sceneCharacters,
          withPortraits: charactersWithPortraits,
          missingPortraits: charactersWithoutPortraits,
        });
        return;
      }

      if (portraitUrls.length > 0) {
        // Use reference model and attach all portraits
        modelToUse = imageSettings.referenceModel || 'qwen-image';
        referenceImageUrls = portraitUrls;
        log('Using character portraits as reference', {
          characters: charactersWithPortraits,
          count: portraitUrls.length,
          model: modelToUse,
        });
      } else {
        // In portrait mode, skip scene images if no characters have portraits
        log('Skipping scene - no characters have portraits in portrait mode', {
          characters: sceneCharacters,
        });
        return;
      }
    }

    // Create pending record in database
    const embeddedImage: Omit<EmbeddedImage, 'createdAt'> = {
      id: imageId,
      storyId,
      entryId,
      sourceText: scene.sourceText,
      prompt: scene.prompt,
      styleId: imageSettings.styleId,
      model: modelToUse,
      imageData: '',
      width: imageSettings.size === '1024x1024' ? 1024 : 512,
      height: imageSettings.size === '1024x1024' ? 1024 : 512,
      status: 'pending',
    };

    await database.createEmbeddedImage(embeddedImage);
    log('Created pending image record', { imageId, sourceText: scene.sourceText, model: modelToUse });

    // Emit queued event
    emitImageQueued(imageId, entryId);

    // Start async generation (fire-and-forget)
    this.generateImage(imageId, scene.prompt, imageSettings, entryId, modelToUse, referenceImageUrls).catch(error => {
      log('Async image generation failed', { imageId, error });
    });
  }

  /**
   * Generate a portrait for a character and save it to their profile.
   * Returns the portrait data if successful, null otherwise.
   */
  private async generateCharacterPortrait(
    storyId: string,
    characterName: string,
    prompt: string,
    imageSettings: typeof settings.systemServicesSettings.imageGeneration,
    presentCharacters: Character[]
  ): Promise<{ characterId: string; portraitDataUrl: string } | null> {
    try {
      // Find the character
      const character = presentCharacters.find(
        c => c.name.toLowerCase() === characterName.toLowerCase()
      );

      if (!character) {
        log('Character not found for portrait generation', { characterName });
        return null;
      }

      if (character.portrait) {
        log('Character already has portrait, skipping', { characterName });
        return null;
      }

      // Get API key from settings
      const apiKey = ImageGenerationService.getApiKey();
      if (!apiKey) {
        throw new Error('No API key configured for portrait generation');
      }

      // Create provider if needed
      if (!this.imageProvider) {
        this.imageProvider = this.createImageProvider();
      }

      log('Generating portrait', { characterName, model: imageSettings.portraitModel, provider: imageSettings.imageProvider ?? 'nanogpt' });

      // Generate portrait using portrait model
      const response = await this.imageProvider.generateImage({
        prompt,
        model: imageSettings.portraitModel || 'z-image-turbo',
        size: '1024x1024',
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned for portrait');
      }

      const portraitDataUrl = `data:image/png;base64,${response.images[0].b64_json}`;

      // Update character with portrait in database
      await database.updateCharacter(character.id, {
        portrait: portraitDataUrl,
      });

      // Update the story store
      if (story.currentStory?.id === storyId) {
        story.characters = story.characters.map(c =>
          c.id === character.id ? { ...c, portrait: portraitDataUrl } : c
        );
      }

      log('Portrait generated and saved', { characterName, characterId: character.id });

      // Return the portrait data so caller can update local state
      return { characterId: character.id, portraitDataUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('Portrait generation failed', { characterName, error: errorMessage });
      return null;
    }
  }

  /**
   * Generate a single image (runs asynchronously)
   */
  private async generateImage(
    imageId: string,
    prompt: string,
    imageSettings: typeof settings.systemServicesSettings.imageGeneration,
    entryId: string,
    modelOverride?: string,
    referenceImageUrls?: string[]
  ): Promise<void> {
    try {
      // Update status to generating
      await database.updateEmbeddedImage(imageId, { status: 'generating' });

      // Get API key from settings
      const apiKey = ImageGenerationService.getApiKey();
      if (!apiKey) {
        throw new Error('No API key configured for image generation');
      }

      // Create provider if needed
      if (!this.imageProvider) {
        this.imageProvider = this.createImageProvider();
      }

      // Generate image
      const response = await this.imageProvider.generateImage({
        prompt,
        model: modelOverride || imageSettings.model,
        size: imageSettings.size,
        response_format: 'b64_json',
        imageDataUrls: referenceImageUrls,
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      // Update record with image data
      await database.updateEmbeddedImage(imageId, {
        imageData: response.images[0].b64_json,
        status: 'complete',
      });

      log('Image generated successfully', { imageId, hasReference: !!referenceImageUrls });

      // Emit ready event
      emitImageReady(imageId, entryId, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('Image generation failed', { imageId, error: errorMessage });

      // Update record with error
      await database.updateEmbeddedImage(imageId, {
        status: 'failed',
        errorMessage,
      });

      // Emit ready event (with failure)
      emitImageReady(imageId, entryId, false);
    }
  }
}
