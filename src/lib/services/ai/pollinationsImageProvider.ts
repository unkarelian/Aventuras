/**
 * Pollinations.ai Image Provider
 *
 * Implementation of ImageProvider for Pollinations.ai image generation API.
 * API Documentation: https://enter.pollinations.ai/api/docs
 *
 * Key differences from other providers:
 * - Uses GET request with prompt in URL path
 * - Returns raw binary image data directly (not JSON)
 * - Reference images via `image` query param (URL or data URL)
 */

import type {
    ImageProvider,
    ImageGenerationRequest,
    ImageGenerationResponse,
    ImageModelInfo,
} from './imageProvider';
import { ImageGenerationError } from './imageProvider';
import { dev } from '$app/environment';

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const POLLINATIONS_IMAGE_ENDPOINT = `${POLLINATIONS_BASE_URL}/image`;
const POLLINATIONS_MODELS_ENDPOINT = `${POLLINATIONS_BASE_URL}/image/models`;

// Default model
const DEFAULT_MODEL = 'zimage';

// Cache for models list (avoid repeated API calls)
let modelsCache: ImageModelInfo[] | null = null;
let modelsCacheTime = 0;
const MODELS_CACHE_TTL = 30 * 60 * 1000; // 5 minutes

export class PollinationsImageProvider implements ImageProvider {
    id = 'pollinations';
    name = 'Pollinations.ai';

    private apiKey: string;
    private debug: boolean;

    constructor(apiKey: string, debug = false) {
        this.apiKey = apiKey;
        this.debug = debug;
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
        const model = request.model || DEFAULT_MODEL;
        const hasReferenceImages = request.imageDataUrls && request.imageDataUrls.length > 0;

        if (this.debug) {
            console.log('[Pollinations] Generating image with request:', {
                model,
                size: request.size,
                promptLength: request.prompt.length,
                hasReferenceImages,
                referenceCount: request.imageDataUrls?.length ?? 0,
            });
        }

        try {
            // Build URL with query parameters
            const url = this.buildImageUrl(request.prompt, model, request.size, request.imageDataUrls);

            if (this.debug) {
                console.log('[Pollinations] Request URL:', url.substring(0, 200) + '...');
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: this.apiKey ? {
                    'Authorization': `Bearer ${this.apiKey}`,
                } : {},
            });

            if (!response.ok) {
                const errorData = await this.parseErrorResponse(response);
                throw new ImageGenerationError(
                    `Pollinations image generation failed: ${response.status} ${response.statusText} - ${errorData}`,
                    this.id,
                    response.status
                );
            }

            // Pollinations returns raw binary image data
            const arrayBuffer = await response.arrayBuffer();
            const base64 = this.arrayBufferToBase64(arrayBuffer);

            if (this.debug) {
                console.log('[Pollinations] Generation response:', {
                    model,
                    dataSize: arrayBuffer.byteLength,
                    contentType: response.headers.get('content-type'),
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
                `Pollinations request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                this.id,
                undefined,
                error
            );
        }
    }

    /**
     * Build the image generation URL with all parameters
     */
    private buildImageUrl(
        prompt: string,
        model: string,
        size?: string,
        referenceImageUrls?: string[]
    ): string {
        // Encode prompt for URL path and ensure specialized characters are handled
        const encodedPrompt = this.sanitizePrompt(prompt);
        const url = new URL(`${POLLINATIONS_IMAGE_ENDPOINT}/${encodedPrompt}`);

        // Add model
        url.searchParams.set('model', model);

        // Parse and add size
        if (size) {
            const [width, height] = this.parseSize(size);
            url.searchParams.set('width', width.toString());
            url.searchParams.set('height', height.toString());
        }

        // Add reference images if provided (comma-separated)
        if (referenceImageUrls && referenceImageUrls.length > 0) {
            // Pollinations accepts URLs or data URLs via the 'image' param
            const imageParam = referenceImageUrls.join(',');
            url.searchParams.set('image', imageParam);
        }

        // Add seed for reproducibility (random by default)
        url.searchParams.set('seed', '-1');

        // Note: API key is sent via Authorization header for security

        const urlString = url.toString();
        if (urlString.length > 2000 && this.debug) {
            console.warn(`[Pollinations] URL length (${urlString.length}) approaches browser limits. Consider shortening the prompt.`);
        }

        return urlString;
    }

    /**
     * Sanitize prompt for URL path usage.
     * Standard encodeURIComponent leaves some characters like '.' which can confuse
     * the API routing (treating it as a file extension).
     */
    private sanitizePrompt(prompt: string): string {
        // First do standard encoding
        let encoded = encodeURIComponent(prompt);

        // Manually encode characters that encodeURIComponent misses but might cause issues in path
        // . -> %2E (Crucial for trailing dots or dots interpreted as extensions)
        encoded = encoded.replace(/\./g, '%2E');

        return encoded;
    }

    /**
     * Parse size string to [width, height]
     */
    private parseSize(size: string): [number, number] {
        const match = size.match(/^(\d+)x(\d+)$/);
        if (match) {
            const width = Math.max(256, Math.min(2048, parseInt(match[1])));
            const height = Math.max(256, Math.min(2048, parseInt(match[2])));
            return [width, height];
        }
        return [1024, 1024];
    }

    /**
     * Parse error response from API
     */
    private async parseErrorResponse(response: Response): Promise<string> {
        try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const data = await response.json();
                // Pollinations error format: { error: { code, message, details } }
                if (data.error?.message) {
                    return data.error.message;
                }
                return JSON.stringify(data);
            }
            return await response.text();
        } catch {
            return 'Unknown error';
        }
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

    async listModels(): Promise<ImageModelInfo[]> {
        // Return cached models if still valid
        const now = Date.now();
        if (modelsCache && (now - modelsCacheTime) < MODELS_CACHE_TTL) {
            return modelsCache;
        }

        try {
            const headers: HeadersInit = {
                'Accept': 'application/json',
            };
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }

            const response = await fetch(POLLINATIONS_MODELS_ENDPOINT, { headers });

            if (!response.ok) {
                console.warn('[Pollinations] Failed to fetch models, using fallback');
                return this.getFallbackModels();
            }

            const data = await response.json();

            if (!Array.isArray(data) || data.length === 0) {
                console.warn('[Pollinations] No models found in response, using fallback');
                return this.getFallbackModels();
            }

            // Map API response to ImageModelInfo
            const models: ImageModelInfo[] = data.map((model: {
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

            // Update cache
            modelsCache = models;
            modelsCacheTime = now;

            return models;
        } catch (error) {
            console.warn('[Pollinations] Error fetching models:', error);
            return this.getFallbackModels();
        }
    }

    async validateCredentials(): Promise<boolean> {
        // Try to list models - if API key is invalid for paid features, this may still work
        // since models endpoint might be public
        try {
            const models = await this.listModels();
            return models.length > 0;
        } catch {
            return false;
        }
    }

    private getFallbackModels(): ImageModelInfo[] {
        return [
            {
                id: 'zimage',
                name: 'Z Image',
                description: 'Default fast image generation',
                supportsSizes: ['512x512', '1024x1024'],
                supportsImg2Img: false,
            },
            {
                id: 'flux',
                name: 'Flux',
                description: 'High quality image generation',
                supportsSizes: ['512x512', '1024x1024'],
                supportsImg2Img: false,
            },
            {
                id: 'turbo',
                name: 'SDXL Turbo',
                description: 'Single-step real-time generation',
                supportsSizes: ['512x512', '1024x1024'],
                supportsImg2Img: false,
            },
            {
                id: 'kontext',
                name: 'Flux Kontext',
                description: 'In-context editing & generation',
                supportsSizes: ['512x512', '1024x1024'],
                supportsImg2Img: true,
            },
            {
                id: 'gptimage',
                name: 'GPT Image',
                description: "OpenAI's image generation model",
                supportsSizes: ['512x512', '1024x1024'],
                supportsImg2Img: true,
            },
        ];
    }
}

/**
 * Create a Pollinations image provider instance.
 * @param apiKey - The Pollinations.ai API key
 * @param debug - Enable debug logging
 */
export function createPollinationsProvider(apiKey: string, debug = dev): ImageProvider {
    return new PollinationsImageProvider(apiKey, debug);
}
