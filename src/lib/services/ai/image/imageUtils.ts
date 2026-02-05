/**
 * Image Generation Utilities
 *
 * Helper functions for image generation that work with the SDK-based system.
 * Provides backwards-compatible functions for components that need them.
 */

import { generateImage } from '$lib/services/ai/sdk/generate'
import { PROVIDERS } from '$lib/services/ai/sdk/providers/config'
import { database } from '$lib/services/database'
import { settings } from '$lib/stores/settings.svelte'
import { emitImageReady, emitImageAnalysisFailed } from '$lib/services/events'
import { createLogger } from '../core/config'

const log = createLogger('ImageUtils')

/**
 * Check if image generation is enabled and has valid configuration.
 * Returns true if a valid image-capable profile is selected.
 */
export function isImageGenerationEnabled(): boolean {
  const imageSettings = settings.systemServicesSettings.imageGeneration
  if (!imageSettings?.enabled) return false

  const profileId = imageSettings.profileId
  if (!profileId) return false

  const profile = settings.getProfile(profileId)
  if (!profile) return false

  const capabilities = PROVIDERS[profile.providerType].capabilities
  return capabilities?.imageGeneration ?? false
}

/**
 * Check if required credentials are configured for image generation.
 */
export function hasRequiredCredentials(): boolean {
  const imageSettings = settings.systemServicesSettings.imageGeneration
  const profileId = imageSettings?.profileId

  if (!profileId) return false

  const profile = settings.getProfile(profileId)
  if (!profile) return false

  // Check if provider supports image generation
  const capabilities = PROVIDERS[profile.providerType].capabilities
  if (!capabilities?.imageGeneration) return false

  // All profile-based providers have credentials if the profile exists
  // (API key is part of the profile)
  return !!profile.apiKey || profile.providerType === 'pollinations'
}

/**
 * Get display name for the currently configured image generation provider.
 */
export function getProviderDisplayName(): string {
  const imageSettings = settings.systemServicesSettings.imageGeneration
  const profileId = imageSettings?.profileId

  if (!profileId) return 'No provider'

  const profile = settings.getProfile(profileId)
  if (!profile) return 'Unknown'

  const names: Record<string, string> = {
    openai: 'OpenAI',
    nanogpt: 'NanoGPT',
    chutes: 'Chutes',
    pollinations: 'Pollinations.ai',
    google: 'Google',
    anthropic: 'Anthropic',
    openrouter: 'OpenRouter',
  }

  return names[profile.providerType] || profile.providerType
}

/**
 * Retry image generation for a failed/existing image using current settings.
 * This regenerates an image with the given prompt using the current profile configuration.
 */
export async function retryImageGeneration(imageId: string, prompt: string): Promise<void> {
  if (!isImageGenerationEnabled()) {
    log('Cannot retry - image generation not enabled')
    return
  }

  const image = await database.getEmbeddedImage(imageId)
  if (!image) {
    log('Cannot retry - image not found', { imageId })
    return
  }

  const imageSettings = settings.systemServicesSettings.imageGeneration
  const profileId = imageSettings.profileId

  if (!profileId) {
    log('Cannot retry - no profile configured')
    return
  }

  const model = imageSettings.model
  const size = imageSettings.size

  // Update image status to generating and save the new prompt
  await database.updateEmbeddedImage(imageId, {
    prompt,
    model,
    status: 'generating',
    errorMessage: undefined,
    width: size === '2048x2048' ? 2048 : size === '1024x1024' ? 1024 : 512,
    height: size === '2048x2048' ? 2048 : size === '1024x1024' ? 1024 : 512,
  })

  log('Retrying image generation', {
    imageId,
    profileId,
    model,
    size,
  })

  try {
    const result = await generateImage({
      profileId,
      model,
      prompt,
      size,
    })

    if (!result.base64) {
      throw new Error('No image data returned')
    }

    await database.updateEmbeddedImage(imageId, {
      imageData: result.base64,
      status: 'complete',
    })

    log('Image retry successful', { imageId })
    emitImageReady(imageId, image.entryId, true)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log('Image retry failed', { imageId, error: errorMessage })

    await database.updateEmbeddedImage(imageId, {
      status: 'failed',
      errorMessage,
    })

    emitImageReady(imageId, image.entryId, false)
    emitImageAnalysisFailed(image.entryId, errorMessage)
  }
}

/**
 * Generate a portrait image for a character.
 * Returns the base64 image data on success.
 */
export async function generatePortrait(
  prompt: string,
  options?: {
    profileId?: string
    model?: string
    size?: string
  },
): Promise<string> {
  const imageSettings = settings.systemServicesSettings.imageGeneration

  // Determine which profile/model to use
  const profileId = options?.profileId || imageSettings.portraitProfileId || imageSettings.profileId

  if (!profileId) {
    throw new Error('No image generation profile configured')
  }

  const model =
    options?.model ||
    (imageSettings.portraitMode ? imageSettings.portraitModel : imageSettings.model) ||
    imageSettings.model

  if (!model) {
    throw new Error('No image model configured')
  }

  const size = options?.size || '1024x1024'

  log('Generating portrait', {
    profileId,
    model,
    size,
    promptLength: prompt.length,
  })

  const result = await generateImage({
    profileId,
    model,
    prompt,
    size,
  })

  if (!result.base64) {
    throw new Error('No image data returned from provider')
  }

  return result.base64
}
