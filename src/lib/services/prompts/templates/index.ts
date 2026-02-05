/**
 * Prompt Templates Registry
 *
 * Central index for all modular prompt templates.
 * Templates are organized by domain (narrative, analysis, memory, etc.)
 */

import type { PromptTemplate } from '../types'

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
