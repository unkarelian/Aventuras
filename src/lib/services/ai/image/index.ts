/**
 * AI Image Module
 *
 * Image generation services using SDK-based providers.
 * - InlineImageService: Inline image generation during narrative
 * - modelListing: List available models from providers
 * - imageUtils: Helper functions for image generation
 */

// Main inline image service
export {
  InlineImageGenerationService,
  inlineImageService,
  type InlineImageContext,
} from './InlineImageService';

// Inline image tracker for streaming
export { InlineImageTracker } from './InlineImageTracker';

// Image analysis service (analyzed/agent mode)
export {
  ImageAnalysisService,
  type ImageAnalysisContext,
} from './ImageAnalysisService';

// Model listing utilities
export {
  listImageModels,
  clearModelsCache,
  type ImageModelInfo,
} from './modelListing';

// Image generation utilities
export {
  isImageGenerationEnabled,
  hasRequiredCredentials,
  getProviderDisplayName,
  retryImageGeneration,
  generatePortrait,
} from './imageUtils';

// Constants
export {
  DEFAULT_FALLBACK_STYLE_PROMPT,
  POLLINATIONS_DEFAULT_MODEL_ID,
  POLLINATIONS_REFERENCE_MODEL_ID,
  IMAGE_STUCK_THRESHOLD_MS,
} from './constants';
