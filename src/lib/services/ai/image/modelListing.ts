/**
 * Image Model Listing Service
 *
 * Fetches available image models from providers.
 * This is separated from image generation to allow browsing available models
 * without needing to select a specific profile.
 */

import type { ProviderType } from '$lib/types';
import { createLogger } from '../core/config';
import { POLLINATIONS_DEFAULT_MODEL_ID, POLLINATIONS_REFERENCE_MODEL_ID } from './constants';

const log = createLogger('ImageModels');

/**
 * Information about an available image model.
 */
export interface ImageModelInfo {
  id: string;
  name: string;
  description?: string;
  supportsSizes: string[];
  supportsImg2Img: boolean;
  costPerImage?: number;
  costPerTextToken?: number;
  costPerImageToken?: number;
  inputModalities?: string[];
  outputModalities?: string[];
}

// ============================================================================
// Model Cache
// ============================================================================

interface ModelCache {
  models: ImageModelInfo[];
  timestamp: number;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const modelCaches = new Map<string, ModelCache>();

function getCacheKey(providerType: ProviderType, apiKey?: string): string {
  // Include API key hash in cache key since different keys may see different models
  const keyHash = apiKey ? apiKey.slice(-8) : 'nokey';
  return `${providerType}:${keyHash}`;
}

function getCached(providerType: ProviderType, apiKey?: string): ImageModelInfo[] | null {
  const key = getCacheKey(providerType, apiKey);
  const cached = modelCaches.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.models;
  }
  return null;
}

function setCache(providerType: ProviderType, apiKey: string | undefined, models: ImageModelInfo[]): void {
  const key = getCacheKey(providerType, apiKey);
  modelCaches.set(key, { models, timestamp: Date.now() });
}

/**
 * Clear the model cache for a specific provider.
 */
export function clearModelsCache(providerType: ProviderType): void {
  // Clear all cache entries for this provider
  for (const key of modelCaches.keys()) {
    if (key.startsWith(`${providerType}:`)) {
      modelCaches.delete(key);
    }
  }
}

// ============================================================================
// Model Listing Functions
// ============================================================================

/**
 * List available image models for a provider.
 *
 * @param providerType - The provider type
 * @param apiKey - Optional API key (some providers require it)
 * @returns Array of available image models
 */
export async function listImageModels(
  providerType: ProviderType,
  apiKey?: string
): Promise<ImageModelInfo[]> {
  // Check cache first
  const cached = getCached(providerType, apiKey);
  if (cached) {
    return cached;
  }

  try {
    let models: ImageModelInfo[];

    switch (providerType) {
      case 'nanogpt':
        models = await listNanoGPTModels();
        break;
      case 'chutes':
        models = await listChutesModels(apiKey);
        break;
      case 'pollinations':
        models = await listPollinationsModels(apiKey);
        break;
      case 'openai':
        models = getOpenAIModels();
        break;
      case 'google':
        models = getGoogleModels();
        break;
      default:
        models = [];
    }

    setCache(providerType, apiKey, models);
    return models;
  } catch (error) {
    log('Error listing models for', providerType, error);
    return getFallbackModels(providerType);
  }
}

// ============================================================================
// Provider-Specific Implementations
// ============================================================================

const NANOGPT_MODELS_ENDPOINT = 'https://nano-gpt.com/api/models';

async function listNanoGPTModels(): Promise<ImageModelInfo[]> {
  try {
    const response = await fetch(NANOGPT_MODELS_ENDPOINT);
    if (!response.ok) {
      return getFallbackModels('nanogpt');
    }

    const data = await response.json();
    const imageModels = data?.models?.image || {};
    const modelEntries = Object.values(imageModels) as Array<{
      name?: string;
      model?: string;
      description?: string;
      cost?: Record<string, number>;
      resolutions?: Array<{ value: string; comment?: string }>;
      tags?: string[];
    }>;

    if (modelEntries.length === 0) {
      return getFallbackModels('nanogpt');
    }

    return modelEntries.map((model) => {
      const supportsSizes = model.resolutions?.map(r =>
        r.value.replace('*', 'x')
      ) || ['512x512', '1024x1024'];

      const supportsImg2Img = model.tags?.includes('image-to-image') ||
                              model.tags?.includes('image-edit') || false;

      let costPerImage: number | undefined;
      if (model.cost && typeof model.cost === 'object') {
        const costs = Object.values(model.cost).filter(c => typeof c === 'number');
        if (costs.length > 0) {
          costPerImage = costs.reduce((sum, c) => sum + c, 0) / costs.length;
        }
      }

      return {
        id: model.model || model.name || '',
        name: model.name || model.model || '',
        description: model.description,
        supportsSizes,
        supportsImg2Img,
        costPerImage,
      };
    });
  } catch {
    return getFallbackModels('nanogpt');
  }
}

const CHUTES_API_ENDPOINT = 'https://api.chutes.ai/chutes/?include_public=true&limit=200';

async function listChutesModels(apiKey?: string): Promise<ImageModelInfo[]> {
  try {
    const headers: HeadersInit = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(CHUTES_API_ENDPOINT, { headers });
    if (!response.ok) {
      return getFallbackModels('chutes');
    }

    const data = await response.json();
    const items = data.items || [];

    const imageModels = items.filter((item: {
      standard_template?: string | null;
      name?: string;
    }) => {
      if (item.standard_template === 'diffusion') return true;
      if (item.standard_template === null) {
        const name = item.name?.toLowerCase() || '';
        return name.includes('image') || name.includes('z-image');
      }
      return false;
    });

    if (imageModels.length === 0) {
      return getFallbackModels('chutes');
    }

    const models: ImageModelInfo[] = imageModels.map((item: {
      name: string;
      tagline?: string;
    }) => {
      const name = item.name;
      const nameLower = name.toLowerCase();
      const supportsImg2Img = nameLower.includes('edit') ||
                              (nameLower.includes('qwen-image') && !nameLower.includes('turbo'));

      return {
        id: name,
        name: formatChutesModelName(name),
        description: item.tagline || undefined,
        supportsSizes: ['576x576', '1024x1024', '2048x2048'],
        supportsImg2Img,
      };
    });

    models.sort((a, b) => {
      const aLower = a.id.toLowerCase();
      const bLower = b.id.toLowerCase();
      if (aLower === 'z-image-turbo') return -1;
      if (bLower === 'z-image-turbo') return 1;
      if (aLower.includes('qwen') && !bLower.includes('qwen')) return -1;
      if (bLower.includes('qwen') && !aLower.includes('qwen')) return 1;
      return a.name.localeCompare(b.name);
    });

    return models;
  } catch {
    return getFallbackModels('chutes');
  }
}

function formatChutesModelName(name: string): string {
  if (name === 'z-image-turbo') return 'Z Image Turbo';
  if (name.toLowerCase().includes('qwen-image-edit')) return 'Qwen Image Edit';
  if (name === 'qwen-image') return 'Qwen Image';
  return name
    .split(/[-_/]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const POLLINATIONS_MODELS_ENDPOINT = 'https://gen.pollinations.ai/image/models';

async function listPollinationsModels(apiKey?: string): Promise<ImageModelInfo[]> {
  try {
    const headers: HeadersInit = { 'Accept': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(POLLINATIONS_MODELS_ENDPOINT, { headers });
    if (!response.ok) {
      return getFallbackModels('pollinations');
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      return getFallbackModels('pollinations');
    }

    return data.map((model: {
      name: string;
      description?: string;
      input_modalities?: string[];
      output_modalities?: string[];
      pricing?: {
        completionImageTokens?: number;
        promptTextTokens?: number;
        promptImageTokens?: number;
      };
    }) => ({
      id: model.name,
      name: model.name,
      description: model.description,
      supportsSizes: ['512x512', '1024x1024', '2048x2048'],
      supportsImg2Img: model.input_modalities?.includes('image') ?? false,
      costPerImage: model.pricing?.completionImageTokens,
      costPerTextToken: model.pricing?.promptTextTokens,
      costPerImageToken: model.pricing?.promptImageTokens,
      inputModalities: model.input_modalities,
      outputModalities: model.output_modalities,
    }));
  } catch {
    return getFallbackModels('pollinations');
  }
}

function getOpenAIModels(): ImageModelInfo[] {
  return [
    {
      id: 'dall-e-3',
      name: 'DALL-E 3',
      description: 'High quality image generation',
      supportsSizes: ['1024x1024', '1024x1792', '1792x1024'],
      supportsImg2Img: false,
    },
    {
      id: 'dall-e-2',
      name: 'DALL-E 2',
      description: 'Image generation with editing support',
      supportsSizes: ['256x256', '512x512', '1024x1024'],
      supportsImg2Img: true,
    },
    {
      id: 'gpt-image-1',
      name: 'GPT Image 1',
      description: 'GPT-powered image generation',
      supportsSizes: ['1024x1024', '1024x1792', '1792x1024'],
      supportsImg2Img: true,
    },
  ];
}

function getGoogleModels(): ImageModelInfo[] {
  return [
    {
      id: 'imagen-3.0-generate-002',
      name: 'Imagen 3',
      description: 'Google\'s latest image generation model',
      supportsSizes: ['512x512', '1024x1024'],
      supportsImg2Img: false,
    },
    {
      id: 'imagen-4.0-generate-001',
      name: 'Imagen 4',
      description: 'Next-gen image generation',
      supportsSizes: ['512x512', '1024x1024'],
      supportsImg2Img: false,
    },
  ];
}

// ============================================================================
// Fallback Models
// ============================================================================

function getFallbackModels(providerType: ProviderType): ImageModelInfo[] {
  switch (providerType) {
    case 'nanogpt':
      return [
        {
          id: 'z-image-turbo',
          name: 'Image Turbo',
          description: 'Fast, efficient image generation',
          supportsSizes: ['512x512', '1024x1024'],
          supportsImg2Img: false,
        },
        {
          id: 'flux-kontext',
          name: 'Flux Kontext',
          description: 'Context-aware image generation',
          supportsSizes: ['512x512', '1024x1024'],
          supportsImg2Img: true,
        },
      ];

    case 'chutes':
      return [
        {
          id: 'z-image-turbo',
          name: 'Z Image Turbo',
          description: 'Fast, efficient image generation',
          supportsSizes: ['576x576', '1024x1024', '2048x2048'],
          supportsImg2Img: false,
        },
        {
          id: 'qwen-image-edit-2511',
          name: 'Qwen Image Edit',
          description: 'Image editing with reference images',
          supportsSizes: ['512x512', '1024x1024', '2048x2048'],
          supportsImg2Img: true,
        },
      ];

    case 'pollinations':
      return [
        {
          id: POLLINATIONS_DEFAULT_MODEL_ID,
          name: 'Z Image',
          description: 'Default fast image generation',
          supportsSizes: ['512x512', '1024x1024', '2048x2048'],
          supportsImg2Img: false,
        },
        {
          id: 'flux',
          name: 'Flux',
          description: 'High quality image generation',
          supportsSizes: ['512x512', '1024x1024', '2048x2048'],
          supportsImg2Img: false,
        },
        {
          id: POLLINATIONS_REFERENCE_MODEL_ID,
          name: 'Flux Kontext',
          description: 'In-context editing & generation',
          supportsSizes: ['512x512', '1024x1024', '2048x2048'],
          supportsImg2Img: true,
        },
      ];

    case 'openai':
      return getOpenAIModels();

    case 'google':
      return getGoogleModels();

    default:
      return [];
  }
}
