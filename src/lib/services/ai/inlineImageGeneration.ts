/**
 * Inline Image Generation Service
 *
 * Processes narrative content for <pic> tags and generates images inline.
 * This is an alternative to the LLM-based scene analysis approach used by ImageGenerationService.
 * 
 * When inline image mode is enabled:
 * 1. AI outputs <pic prompt="..." characters="..."></pic> tags in its narrative
 * 2. This service detects those tags and triggers image generation
 * 3. Images are stored as EmbeddedImage records with generationMode='inline'
 * 4. The rendering layer replaces <pic> tags with actual images
 */

import type { Character, EmbeddedImage } from '$lib/types';
import type { ImageProvider } from './imageProvider';
import { NanoGPTImageProvider } from './nanoGPTImageProvider';
import { ChutesImageProvider } from './chutesImageProvider';
import { database } from '$lib/services/database';
import { promptService } from '$lib/services/prompts';
import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import { emitImageQueued, emitImageReady } from '$lib/services/events';
import { normalizeImageDataUrl } from '$lib/utils/image';
import { extractPicTags, type ParsedPicTag } from '$lib/utils/inlineImageParser';

const DEBUG = false;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[InlineImageGen]', ...args);
  }
}

export interface InlineImageContext {
  storyId: string;
  entryId: string;
  narrativeContent: string;
  presentCharacters: Character[];
}

export class InlineImageGenerationService {
  private imageProvider: ImageProvider | null = null;

  /**
   * Check if inline image generation is enabled and configured
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
    const apiKey = InlineImageGenerationService.getApiKey();

    if (provider === 'chutes') {
      return new ChutesImageProvider(apiKey, DEBUG);
    }
    return new NanoGPTImageProvider(apiKey, DEBUG);
  }

  /**
   * Process narrative content for <pic> tags and generate images.
   * This is the main entry point called after narrative generation completes
   * when inline image mode is enabled.
   */
  async processNarrativeForInlineImages(context: InlineImageContext): Promise<void> {
    const imageSettings = settings.systemServicesSettings.imageGeneration;

    if (!imageSettings?.enabled) {
      log('Image generation disabled');
      return;
    }

    // Extract all <pic> tags from the narrative
    const picTags = extractPicTags(context.narrativeContent);

    if (picTags.length === 0) {
      log('No <pic> tags found in narrative');
      return;
    }

    log('Found <pic> tags', {
      count: picTags.length,
      tags: picTags.map(t => ({
        prompt: t.prompt.slice(0, 50) + '...',
        characters: t.characters,
      })),
    });

    // Apply max images limit
    const maxImages = imageSettings.maxImagesPerMessage ?? 3;
    const tagsToProcess = maxImages === 0 ? picTags : picTags.slice(0, maxImages);

    if (tagsToProcess.length < picTags.length) {
      log('Limiting to max images', {
        found: picTags.length,
        processing: tagsToProcess.length,
        maxAllowed: maxImages,
      });
    }

    // Process each tag
    for (const tag of tagsToProcess) {
      await this.generateImageForTag(context, tag, imageSettings);
    }

    log('All inline images queued', { count: tagsToProcess.length });
  }

  /**
   * Generate image for a single <pic> tag
   */
  private async generateImageForTag(
    context: InlineImageContext,
    tag: ParsedPicTag,
    imageSettings: typeof settings.systemServicesSettings.imageGeneration
  ): Promise<void> {
    const imageId = crypto.randomUUID();

    // Determine if we should use reference images (portraits)
    let referenceImageUrls: string[] | undefined;
    let modelToUse = imageSettings.model;

    // If portrait mode is enabled and tag specifies characters, look for their portraits
    if (imageSettings.portraitMode && tag.characters.length > 0) {
      const portraitUrls: string[] = [];
      const charactersWithPortraits: string[] = [];
      const charactersWithoutPortraits: string[] = [];

      for (const charName of tag.characters.slice(0, 3)) {
        const character = context.presentCharacters.find(
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

      if (portraitUrls.length > 0) {
        // Use reference model and attach portraits
        modelToUse = imageSettings.referenceModel || 'qwen-image';
        referenceImageUrls = portraitUrls;
        log('Using character portraits as reference', {
          characters: charactersWithPortraits,
          count: portraitUrls.length,
          model: modelToUse,
        });
      }

      // Note: Unlike the analyzed mode, we don't skip images if characters are missing portraits
      // The user explicitly requested an image by having the AI generate a <pic> tag
      if (charactersWithoutPortraits.length > 0) {
        log('Some characters missing portraits', {
          missing: charactersWithoutPortraits,
          proceeding: 'yes - user explicitly requested via <pic> tag',
        });
      }
    }

    // Build full prompt with style
    const stylePrompt = this.getStylePrompt(imageSettings.styleId);
    const fullPrompt = `${tag.prompt}. ${stylePrompt}`;

    // Create pending record in database
    // Store the original tag as sourceText so we can match it during rendering
    const embeddedImage: Omit<EmbeddedImage, 'createdAt'> = {
      id: imageId,
      storyId: context.storyId,
      entryId: context.entryId,
      sourceText: tag.originalTag,  // Store original tag for matching
      prompt: fullPrompt,
      styleId: imageSettings.styleId,
      model: modelToUse,
      imageData: '',
      width: imageSettings.size === '1024x1024' ? 1024 : 512,
      height: imageSettings.size === '1024x1024' ? 1024 : 512,
      status: 'pending',
      generationMode: 'inline',
    };

    await database.createEmbeddedImage(embeddedImage);
    log('Created pending inline image record', {
      imageId,
      prompt: tag.prompt.slice(0, 50) + '...',
      model: modelToUse,
    });

    // Emit queued event
    emitImageQueued(imageId, context.entryId);

    // Start async generation (fire-and-forget)
    this.generateImage(
      imageId,
      fullPrompt,
      imageSettings,
      context.entryId,
      modelToUse,
      referenceImageUrls
    ).catch(error => {
      log('Async inline image generation failed', { imageId, error });
    });
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
      const apiKey = InlineImageGenerationService.getApiKey();
      if (!apiKey) {
        throw new Error('No API key configured for image generation');
      }

      // Create provider if needed
      if (!this.imageProvider) {
        this.imageProvider = this.createImageProvider();
      }

      log('Generating inline image', {
        imageId,
        model: modelOverride || imageSettings.model,
        hasReference: !!referenceImageUrls,
      });

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

      log('Inline image generated successfully', {
        imageId,
        hasReference: !!referenceImageUrls,
      });

      // Emit ready event
      emitImageReady(imageId, entryId, true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log('Inline image generation failed', { imageId, error: errorMessage });

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

// Export singleton instance
export const inlineImageService = new InlineImageGenerationService();
