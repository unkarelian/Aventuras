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
 * - Includes retry logic with exponential backoff
 */

import type {
	ImageProvider,
	ImageGenerationRequest,
	ImageGenerationResponse,
	ImageModelInfo,
} from './base';
import { ImageGenerationError } from './base';
import { createLogger } from '../../core/config';
import { POLLINATIONS_DEFAULT_MODEL_ID, POLLINATIONS_REFERENCE_MODEL_ID } from '../constants';

/**
 * Configuration for retry behavior
 */
interface RetryConfig {
	maxAttempts: number;      // Default: 3
	baseDelayMs: number;      // Default: 1000 (1 second)
	maxDelayMs: number;       // Default: 10000 (10 seconds)
	timeoutMs: number;        // Default: 30000 (30 seconds)
}

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';
const POLLINATIONS_IMAGE_ENDPOINT = `${POLLINATIONS_BASE_URL}/image`;
const POLLINATIONS_MODELS_ENDPOINT = `${POLLINATIONS_BASE_URL}/image/models`;

// Default model
const DEFAULT_MODEL = POLLINATIONS_DEFAULT_MODEL_ID;

export class PollinationsImageProvider implements ImageProvider {
	id = 'pollinations';
	name = 'Pollinations.ai';

	// Cache for models list (avoid repeated API calls across instances)
	private static modelsCache: ImageModelInfo[] | null = null;
	private static modelsCacheTime = 0;
	private static readonly MODELS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

	private apiKey: string;
	private debug: boolean;
	private retryConfig: RetryConfig;
	private log = createLogger('Pollinations');

	constructor(apiKey: string, debug = false) {
		this.apiKey = apiKey;
		this.debug = debug;
		this.retryConfig = {
			maxAttempts: 3,
			baseDelayMs: 1000,
			maxDelayMs: 10000,
			timeoutMs: 30000,
		};
	}

	async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
		const model = request.model || DEFAULT_MODEL;
		const hasReferenceImages = request.imageDataUrls && request.imageDataUrls.length > 0;

		this.log('Generating image with request:', {
			model,
			size: request.size,
			promptLength: request.prompt.length,
			hasReferenceImages,
			referenceCount: request.imageDataUrls?.length ?? 0,
		});

		// Retry loop with exponential backoff
		let lastError: unknown;

		for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
			try {
				if (attempt > 1) {
					this.log(`Retry attempt ${attempt}/${this.retryConfig.maxAttempts}`);
				}

				// Build URL with query parameters
				const url = this.buildImageUrl(request.prompt, model, request.size, request.imageDataUrls);

				this.log('Request URL:', url.substring(0, 200) + '...');

				// Use fetchWithTimeout instead of raw fetch
				const response = await this.fetchWithTimeout(url, {
					method: 'GET',
					headers: this.apiKey ? {
						'Authorization': `Bearer ${this.apiKey}`,
					} : {},
				}, this.retryConfig.timeoutMs);

				if (!response.ok) {
					const errorData = await this.parseErrorResponse(response);
					throw new ImageGenerationError(
						`${errorData} (Pollinations ${response.status})`,
						this.id,
						response.status
					);
				}

				// Pollinations returns raw binary image data
				const arrayBuffer = await response.arrayBuffer();
				const base64 = this.arrayBufferToBase64(arrayBuffer);

				this.log('Generation response:', {
					model,
					dataSize: arrayBuffer.byteLength,
					contentType: response.headers.get('content-type'),
					attempts: attempt,
				});

				return {
					images: [{
						b64_json: base64,
					}],
					model,
				};
			} catch (error) {
				lastError = error;

				// Don't retry on last attempt
				if (attempt === this.retryConfig.maxAttempts) {
					this.log('Max retries reached, failing');
					throw error instanceof Error ? error : new Error(String(error));
				}

				// Calculate delay and wait before retry
				const delay = this.calculateDelay(attempt);
				this.log(`Retrying after ${delay}ms delay...`);
				await this.sleep(delay);
			}
		}

		// Should never reach here, but TypeScript needs it
		throw new ImageGenerationError(
			'Image generation failed after all retries',
			this.id,
			undefined,
			lastError
		);
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
		if (urlString.length > 2000) {
			this.log(`URL length (${urlString.length}) approaches browser limits. Consider shortening the prompt.`);
		}

		return urlString;
	}

	/**
	 * Sanitize prompt for URL path usage.
	 * Standard encodeURIComponent leaves some characters like '.' which can confuse
	 * the API routing (treating it as a file extension).
	 */
	private sanitizePrompt(prompt: string): string {
		// Normalize whitespace: convert multiple spaces/newlines to single space
		// Remove trailing punctuation that can cause API routing issues
		const trimmedPrompt = prompt
			.replace(/\s+/g, ' ')  // Normalize multiple spaces/tabs/newlines to single space
			.replace(/[.,;!?]+$/, '')  // Remove trailing punctuation
			.trim();

		// Standard encoding, then manually encode characters that encodeURIComponent ignores 
		// but can cause issues in URL paths (like '.' which Pollinations treats as extension).
		return encodeURIComponent(trimmedPrompt).replace(/[!'()*.]/g, (c) => {
			return '%' + c.charCodeAt(0).toString(16).toUpperCase();
		});
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
	 * Parse error response from API with recursive JSON unwrapping
	 */
	private async parseErrorResponse(response: Response): Promise<string> {
		try {
			const contentType = response.headers.get('content-type') || '';
			if (contentType.includes('application/json')) {
				const data = await response.json();
				return this.extractErrorMessage(data);
			}
			return await response.text();
		} catch {
			return 'Unknown error';
		}
	}

	/**
	 * Recursively extract the most specific error message from nested JSON
	 */
	private extractErrorMessage(data: any, depth = 0): string {
		if (depth > 5 || !data) return typeof data === 'object' ? JSON.stringify(data) : String(data);

		if (typeof data === 'string') {
			try {
				return this.extractErrorMessage(JSON.parse(data), depth + 1);
			} catch {
				return data;
			}
		}

		if (typeof data === 'object') {
			const msg = data.error?.message || data.message || data.error;
			if (msg) return this.extractErrorMessage(msg, depth + 1);
		}

		return JSON.stringify(data);
	}

	/**
	 * Convert ArrayBuffer to base64 string
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		const CHUNK_SIZE = 0x8000; // 32k
		const chunks: string[] = [];
		for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
			chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)));
		}
		return btoa(chunks.join(''));
	}

	/**
	 * Calculate delay for exponential backoff
	 */
	private calculateDelay(attempt: number): number {
		const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt - 1);
		return Math.min(delay, this.retryConfig.maxDelayMs);
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Fetch with timeout
	 */
	private async fetchWithTimeout(
		url: string,
		options: RequestInit,
		timeoutMs: number
	): Promise<Response> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				...options,
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			return response;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new ImageGenerationError(
					'Request timeout',
					this.id,
					undefined,
					error
				);
			}
			throw error;
		}
	}

	async listModels(): Promise<ImageModelInfo[]> {
		// Return cached models if still valid
		const now = Date.now();
		if (PollinationsImageProvider.modelsCache && (now - PollinationsImageProvider.modelsCacheTime) < PollinationsImageProvider.MODELS_CACHE_TTL) {
			return PollinationsImageProvider.modelsCache;
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
				this.log('Failed to fetch models, using fallback');
				return this.getFallbackModels();
			}

			const data = await response.json();

			if (!Array.isArray(data) || data.length === 0) {
				this.log('No models found in response, using fallback');
				return this.getFallbackModels();
			}

			// Map API response to ImageModelInfo
			const models: ImageModelInfo[] = data.map((model: any) => ({
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
			PollinationsImageProvider.modelsCache = models;
			PollinationsImageProvider.modelsCacheTime = now;

			return models;
		} catch (error) {
			this.log('Error fetching models:', error);
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

	/**
	 * Clear the models cache to force a fresh fetch
	 */
	static clearModelsCache(): void {
		PollinationsImageProvider.modelsCache = null;
		PollinationsImageProvider.modelsCacheTime = 0;
	}

	private getFallbackModels(): ImageModelInfo[] {
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
				id: 'turbo',
				name: 'SDXL Turbo',
				description: 'Single-step real-time generation',
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
			{
				id: 'gptimage',
				name: 'GPT Image',
				description: "OpenAI's image generation model",
				supportsSizes: ['512x512', '1024x1024', '2048x2048'],
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
export function createPollinationsProvider(apiKey: string, debug = false): ImageProvider {
	return new PollinationsImageProvider(apiKey, debug);
}
