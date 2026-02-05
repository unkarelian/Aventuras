/**
 * Centralized Prompt System - Definitions
 *
 * This file maintains backward compatibility by re-exporting from the
 * modular definitions structure. All actual definitions live in:
 * - ./definitions/macros/ (macro definitions)
 * - ./templates/ (template definitions)
 *
 * For new code, prefer importing directly from './templates' or './definitions'
 * for better tree-shaking and clearer dependencies.
 */

// Re-export macros from modular structure
export { BUILTIN_MACROS, CONTEXT_PLACEHOLDERS, getPlaceholderByToken } from './definitions/macros'

// Re-export templates from modular structure
export { PROMPT_TEMPLATES } from './templates'

// Types for backward compatibility
import type { Macro, PromptTemplate } from './types'

// Import for helper functions
import { BUILTIN_MACROS } from './definitions/macros'
import { PROMPT_TEMPLATES } from './templates'

/**
 * Get a macro by its token
 */
export function getMacroByToken(token: string): Macro | undefined {
  return BUILTIN_MACROS.find((m) => m.token === token)
}

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id)
}

/**
 * Get all macros of a specific type
 */
export function getMacrosByType(type: 'simple' | 'complex'): Macro[] {
  return BUILTIN_MACROS.filter((m) => m.type === type)
}

/**
 * Get all templates of a specific category
 */
export function getTemplatesByCategory(
  category: 'story' | 'service' | 'wizard' | 'image-style',
): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === category)
}

/**
 * Get all image style templates
 */
export function getImageStyleTemplates(): PromptTemplate[] {
  return PROMPT_TEMPLATES.filter((t) => t.category === 'image-style')
}

/**
 * Check if a template has a user prompt component
 */
export function hasUserContent(template: PromptTemplate): boolean {
  return template.userContent !== undefined && template.userContent.length > 0
}
