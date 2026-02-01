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
