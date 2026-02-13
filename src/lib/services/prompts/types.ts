/**
 * Prompt System - Type Definitions
 *
 * Template types for the prompt template system.
 * Macro types have been removed -- all prompt rendering now goes through
 * the ContextBuilder + LiquidJS pipeline.
 */

// Re-export story types from $lib/types for backward compatibility
export type { StoryMode, POV, Tense } from '$lib/types'

/**
 * Prompt template category
 * - story: Main narrative prompts (adventure, creative-writing)
 * - service: Supporting service prompts (classifier, suggestions, etc.)
 * - wizard: Story wizard prompts (setting expansion, character generation, etc.)
 * - image-style: Image generation style prompts (soft anime, semi-realistic, etc.)
 */
export type PromptCategory = 'story' | 'service' | 'wizard' | 'image-style'

/**
 * Prompt template definition
 * Templates contain the base prompt text with Liquid template syntax.
 */
export interface PromptTemplate {
  id: string
  name: string
  category: PromptCategory
  description: string
  /**
   * The system prompt content with Liquid template syntax.
   * Variables are resolved at runtime via ContextBuilder.
   */
  content: string
  /**
   * Optional user message template with Liquid template syntax.
   * For services that send a structured user message alongside the system prompt.
   */
  userContent?: string
}

/**
 * Override for a prompt template (user customization)
 *
 * Naming convention for templateId:
 * - System prompt override: Use the template ID directly (e.g., 'adventure', 'classifier')
 * - User message override: Append '-user' suffix (e.g., 'adventure-user', 'classifier-user')
 */
export interface PromptOverride {
  templateId: string
  content: string
}

/**
 * Settings for the prompt system (stored in settings store)
 *
 * Legacy fields (customMacros, macroOverrides) are preserved as any[] for
 * backward compatibility with existing saved settings JSON. They are ignored
 * at runtime since the macro system has been removed.
 */
export interface PromptSettings {
  /** @deprecated Macro system removed. Kept as any[] for saved settings backward compatibility. */
  customMacros: unknown[]
  /** @deprecated Macro system removed. Kept as any[] for saved settings backward compatibility. */
  macroOverrides: unknown[]
  /**
   * Overrides for prompt templates
   */
  templateOverrides: PromptOverride[]
  /**
   * Flag indicating legacy prompt migration has been completed.
   */
  legacyMigrationComplete?: boolean
}

/**
 * Default prompt settings
 */
export function getDefaultPromptSettings(): PromptSettings {
  return {
    customMacros: [],
    macroOverrides: [],
    templateOverrides: [],
  }
}
