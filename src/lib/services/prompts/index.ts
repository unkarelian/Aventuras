/**
 * Prompt System - Template definitions and types
 */

// Types
export type { PromptTemplate, PromptCategory } from './types'

// Templates and utilities
export {
  PROMPT_TEMPLATES,
  getTemplateById,
  getTemplatesByCategory,
  getImageStyleTemplates,
  hasUserContent,
} from './templates'
