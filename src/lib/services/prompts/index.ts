/**
 * Prompt System
 *
 * This module exports prompt template definitions and types.
 * All prompt rendering now goes through the ContextBuilder + LiquidJS pipeline
 * (see $lib/services/context).
 *
 * The old PromptService class, MacroEngine, and macro definitions have been removed.
 */

// Re-export types
export type {
  PromptTemplate,
  PromptCategory,
  PromptOverride,
  PromptSettings,
} from './types'

// Re-export settings utilities
export { getDefaultPromptSettings } from './types'

// Re-export template definitions and utilities
export {
  PROMPT_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getImageStyleTemplates,
  hasUserContent,
} from './definitions'
