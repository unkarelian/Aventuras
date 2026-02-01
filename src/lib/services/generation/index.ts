/**
 * Generation Pipeline Module
 *
 * Orchestrates the narrative generation pipeline including:
 * - Pre-generation setup (retry state, time tracking)
 * - Retrieval (memory, lorebook)
 * - Narrative streaming
 * - Classification (world state extraction)
 * - Translation (optional)
 * - Image generation (optional)
 * - Post-generation (suggestions, action choices)
 */

// Types
export type {
  GenerationPhase,
  WorldState,
  GenerationContext,
  RetrievalResult,
  PhaseStartEvent,
  PhaseCompleteEvent,
  NarrativeChunkEvent,
  NarrativeCompleteEvent,
  ClassificationCompleteEvent,
  ErrorEvent,
  AbortedEvent,
  GenerationEvent,
} from './types';

// Phase services
export { PreGenerationPhase, RetrievalPhase, NarrativePhase, ClassificationPhase, TranslationPhase, ImagePhase, PostGenerationPhase } from './phases';
export type { RetryBackupData, PreGenerationResult, PreGenerationInput } from './phases';
export type { RetrievalDependencies, RetrievalInput } from './phases';
export type { NarrativeDependencies, NarrativeInput, NarrativeResult } from './phases';
export type { ClassificationDependencies, ClassificationInput, ClassificationPhaseResult } from './phases';
export type { TranslationDependencies, TranslationInput, TranslationResult2 } from './phases';
export type { ImageDependencies, ImageSettings, ImageInput, ImageResult } from './phases';
export type {
  PromptContext,
  PostWorldState,
  PostGenerationDependencies,
  PostGenerationInput,
  PostGenerationResult,
} from './phases';
