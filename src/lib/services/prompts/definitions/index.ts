/**
 * Centralized Prompt System - Definitions Index
 *
 * This module aggregates all macro and template definitions.
 * Import from here to get the combined registries.
 */

// Macros
export {
  BUILTIN_MACROS,
  coreMacros,
  contextMacros,
  narrativeMacros,
  featureMacros,
  CONTEXT_PLACEHOLDERS,
  getPlaceholderByToken,
} from './macros'

// Re-export individual macros for direct access
export * from './macros/core'
export * from './macros/context'
export * from './macros/narrative'
export * from './macros/features'

// Templates will be added in Plan 02
// For now, re-export from the original definitions.ts
export {
  PROMPT_TEMPLATES,
  getTemplateById,
  getMacroByToken,
  getMacrosByType,
  getTemplatesByCategory,
  getImageStyleTemplates,
  hasUserContent,
} from '../definitions'
