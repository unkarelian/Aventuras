/**
 * Chutes Image Provider
 *
 * Implementation of ImageProvider for Chutes AI image generation API.
 * Supports dynamic model selection - any model available on Chutes can be used.
 *
 * Endpoint pattern: https://chutes-{model-name}.chutes.ai/generate
 *
 * Known models:
 * - z-image-turbo: Fast image generation (no reference support)
 * - qwen-image-edit-2511: Image editing with reference images (requires at least 1 reference)
 *
 * All endpoints return raw image data (PNG/JPEG), not JSON.
 */

import type {
  ImageProvider,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageModelInfo,
} from './imageProvider';
import { ImageGenerationError } from './imageProvider';

// Default model for generation
const DEFAULT_MODEL = 'z-image-turbo';

// Models that require reference images
const MODELS_REQUIRING_REFERENCES = ['qwen-image-edit-2511'];

// Models that support reference images (but don't require them)
const MODELS_SUPPORTING_REFERENCES = ['qwen-image-edit-2511'];

export class ChutesImageProvider implements ImageProvider {
  id = 'chutes';
  name = 'Chutes';

  private apiKey: string;
  private debug: boolean;

  constructor(apiKey: string, debug = false) {
    this.apiKey = apiKey;
    this.debug = debug;
  }

  /**
   * Build the endpoint URL for a given model
   */
  private getEndpointUrl(model: string): string {
    return `https://chutes-${model}.chutes.ai/generate`;
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const model = request.model || DEFAULT_MODEL;
    const hasReferenceImages = request.imageDataUrls && request.imageDataUrls.length > 0;

    if (this.debug) {
      console.log('[Chutes] Generating image with request:', {
        model,
        size: request.size,
        n: request.n,
        promptLength: request.prompt.length,
        hasReferenceImages,
        endpoint: this.getEndpointUrl(model),
      });
    }

    // Check if model requires reference images
    if (MODELS_REQUIRING_REFERENCES.includes(model) && !hasReferenceImages) {
      throw new ImageGenerationError(
        `Model ${model} requires at least 1 reference image`,
        this.id
      );
    }

try {
      const response = await this.makeRequest(model, request, hasReferenceImages ?? false);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ImageGenerationError(
          `Chutes image generation failed: ${response.status} ${response.statusText} - ${errorText}`,
          this.id,
          response.status
        );
      }

      // All endpoints return raw image data (binary), convert to base64
      const arrayBuffer = await response.arrayBuffer();
      const base64 = this.arrayBufferToBase64(arrayBuffer);

      if (this.debug) {
        console.log('[Chutes] Generation response:', {
          model,
          dataSize: arrayBuffer.byteLength,
        });
      }

      return {
        images: [{
          b64_json: base64,
        }],
        model,
      };
    } catch (error) {
      if (error instanceof ImageGenerationError) {
        throw error;
      }
      throw new ImageGenerationError(
        `Chutes request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.id,
        undefined,
        error
      );
    }
  }

  /**
   * Make the API request with appropriate parameters for the model
   */
  private async makeRequest(
    model: string,
    request: ImageGenerationRequest,
    hasReferenceImages: boolean
  ): Promise<Response> {
    const [width, height] = this.parseSize(request.size);
    const endpoint = this.getEndpointUrl(model);

    // Build request body based on model type
    let body: Record<string, unknown>;

    if (MODELS_SUPPORTING_REFERENCES.includes(model) && hasReferenceImages) {
      // Models that support/require reference images (e.g., qwen-image-edit-2511)
      body = this.buildReferenceModelBody(request, width, height);
    } else {
      // Standard generation models (e.g., z-image-turbo)
      body = this.buildStandardModelBody(request, width, height);
    }

    if (this.debug) {
      console.log('[Chutes] Request body:', {
        endpoint,
        bodyKeys: Object.keys(body),
        hasImages: 'image_b64s' in body,
      });
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  }

  /**
   * Build request body for models that support reference images
   */
  private buildReferenceModelBody(
    request: ImageGenerationRequest,
    width: number,
    height: number
  ): Record<string, unknown> {
    // Convert reference images to base64 strings (strip data URL prefix if present)
    const image_b64s = (request.imageDataUrls || []).map(url => {
      const match = url.match(/^data:image\/[^;]+;base64,(.+)$/);
      return match ? match[1] : url;
    });

    return {
      prompt: request.prompt,
      image_b64s,
      width,
      height,
      seed: null,
      true_cfg_scale: 4,
      negative_prompt: '',
      num_inference_steps: 40,
    };
  }

  /**
   * Build request body for standard generation models
   */
  private buildStandardModelBody(
    request: ImageGenerationRequest,
    width: number,
    height: number
  ): Record<string, unknown> {
    // Truncate prompt to max 1200 characters (common limit)
    const prompt = request.prompt.slice(0, 1200);

    return {
      prompt,
      width,
      height,
      seed: null,
      // Common parameters that most models accept
      num_inference_steps: 9,
    };
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Parse size string to width/height numbers
   * Ensures values are within reasonable API limits
   */
  private parseSize(size?: string): [number, number] {
    if (!size) return [1024, 1024];

    const match = size.match(/^(\d+)x(\d+)$/);
    if (match) {
      const width = Math.max(128, Math.min(2048, parseInt(match[1])));
      const height = Math.max(128, Math.min(2048, parseInt(match[2])));
      return [width, height];
    }
    return [1024, 1024];
  }

  async listModels(): Promise<ImageModelInfo[]> {
    // Return known models - users can enter any model name manually
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
        description: 'Image editing with reference images (requires at least 1 reference)',
        supportsSizes: ['512x512', '1024x1024', '2048x2048'],
        supportsImg2Img: true,
      },
    ];
  }

  async validateCredentials(): Promise<boolean> {
    // Can't easily validate without making a real request
    // Just check that we have an API key
    return !!this.apiKey;
  }
}

/**
 * Create a Chutes image provider instance.
 * @param apiKey - The Chutes API key
 * @param debug - Enable debug logging
 */
export function createChutesProvider(apiKey: string, debug = false): ImageProvider {
  return new ChutesImageProvider(apiKey, debug);
}
