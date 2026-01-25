/**
 * Image Provider Interface
 *
 * Modular interface for image generation providers.
 * Currently supports NanoGPT, designed to be extensible for other providers.
 */

export interface ImageGenerationRequest {
  prompt: string;
  model: string;
  n?: number;
  size?: string;
  response_format?: 'b64_json' | 'url';
  imageDataUrls?: string[];  // Reference images for image-to-image generation (e.g., character portraits)
}

export interface ImageGenerationResponse {
  images: GeneratedImage[];
  model: string;
  cost?: number;
  remainingBalance?: number;
}

export interface GeneratedImage {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

export interface ImageModelInfo {
  id: string;
  name: string;
  description?: string;
  supportsSizes: string[];
  supportsImg2Img: boolean;
  /** Cost per generated image in pollen */
  costPerImage?: number;
  /** Cost per text token in prompt */
  costPerTextToken?: number;
  /** Cost per image token (for reference images) */
  costPerImageToken?: number;
  /** Input modalities supported by this model (e.g., ["text", "image"]) */
  inputModalities?: string[];
  /** Output modalities supported by this model (e.g., ["image"] or ["video"]) */
  outputModalities?: string[];
}

/**
 * Interface for image generation providers.
 * Implementations should handle authentication and API communication.
 */
export interface ImageProvider {
  /** Unique identifier for this provider */
  id: string;

  /** Display name for this provider */
  name: string;

  /**
   * Generate an image from a text prompt.
   * @param request - The generation request parameters
   * @returns Promise resolving to the generated image(s)
   */
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse>;

  /**
   * List available image models from this provider.
   * @returns Promise resolving to array of available models
   */
  listModels(): Promise<ImageModelInfo[]>;

  /**
   * Validate that the API key/credentials are working.
   * @returns Promise resolving to true if valid
   */
  validateCredentials?(): Promise<boolean>;
}

/**
 * Error thrown when image generation fails.
 */
export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}
