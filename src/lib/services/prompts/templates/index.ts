/**
 * Prompt Templates Registry
 *
 * Central index for all modular prompt templates.
 * Templates are organized by domain (narrative, analysis, memory, etc.)
 */

import type { PromptTemplate, PromptCategory } from '../types'

// Import all template groups
import { SUGGESTIONS_TEMPLATES } from './suggestions'
import { storyTemplates } from './narrative'
import { analysisTemplates } from './analysis'
import { memoryTemplates } from './memory'
import { generationTemplates } from './generation'
import { wizardTemplates } from './wizard'
import { translationTemplates } from './translation'
import { imageTemplates } from './image'

// Combined list of all templates for PromptService
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  ...storyTemplates,
  ...analysisTemplates,
  ...memoryTemplates,
  ...SUGGESTIONS_TEMPLATES, // Already migrated
  ...generationTemplates,
  ...wizardTemplates,
  ...translationTemplates,
  ...imageTemplates,
]

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
  category: PromptCategory,
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

// Re-export all templates for direct access
export * from './suggestions'
export * from './narrative'
export * from './analysis'
export * from './memory'
export * from './generation'
export * from './wizard'
export * from './translation'
export * from './image'

// Re-export grouped arrays
export {
  storyTemplates,
  analysisTemplates,
  memoryTemplates,
  generationTemplates,
  wizardTemplates,
  translationTemplates,
  imageTemplates,
}
