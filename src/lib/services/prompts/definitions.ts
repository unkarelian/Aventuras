/**
 * Prompt System - Definitions
 *
 * Re-exports template definitions and utility functions.
 * Macro definitions have been removed -- all prompt rendering now goes through
 * the ContextBuilder + LiquidJS pipeline.
 */

import type { PromptTemplate } from './types'

// Re-export templates
export { PROMPT_TEMPLATES } from './templates'
import { PROMPT_TEMPLATES } from './templates'

/**
 * Get a template by its ID
 */
export function getTemplateById(id: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.id === id)
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

