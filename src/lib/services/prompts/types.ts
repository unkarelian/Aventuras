/**
 * Centralized Prompt System - Type Definitions
 *
 * This module defines the types for the macro-based prompt system.
 * Macros are placeholders that auto-resolve based on context (mode, POV, tense).
 */

// Re-export story types for convenience
export type StoryMode = 'adventure' | 'creative-writing'
export type POV = 'first' | 'second' | 'third'
export type Tense = 'past' | 'present'

/**
 * Macro type classification
 * - simple: Direct text substitution (e.g., {{protagonistName}})
 * - complex: Conditional variants based on mode/POV/tense (e.g., {{styleInstruction}})
 */
export type MacroType = 'simple' | 'complex'

/**
 * Variant key for complex macros - describes which combination of conditions
 * this variant applies to. Undefined keys mean "any value matches".
 */
export interface VariantKey {
  mode?: StoryMode
  pov?: POV
  tense?: Tense
}

/**
 * Single variant of a complex macro
 */
export interface MacroVariant {
  key: VariantKey
  content: string
}

/**
 * Base properties shared by all macros
 */
interface MacroBase {
  id: string
  name: string
  token: string
  builtin: boolean
  description: string
}

/**
 * Simple macro - direct text substitution
 * Examples: {{protagonistName}}, {{currentLocation}}, {{customGreeting}}
 */
export interface SimpleMacro extends MacroBase {
  type: 'simple'
  defaultValue: string
  /**
   * If true, the value is computed dynamically from context at expansion time.
   * If false, uses defaultValue or user override.
   */
  dynamic: boolean
}

/**
 * Complex macro - conditional text based on mode/POV/tense
 * Examples: {{styleInstruction}}, {{responseInstruction}}, {{primingMessage}}
 */
export interface ComplexMacro extends MacroBase {
  type: 'complex'
  /**
   * Which dimensions this macro varies by.
   * Used by the UI to know which tabs to show in the editor.
   */
  variesBy: {
    mode?: boolean
    pov?: boolean
    tense?: boolean
  }
  variants: MacroVariant[]
  /**
   * Fallback content if no variant matches the context.
   */
  fallbackContent?: string
}

export type Macro = SimpleMacro | ComplexMacro

/**
 * Context placeholder - runtime-filled tokens that can't be edited
 * These are automatically replaced with actual data at prompt expansion time.
 * Examples: {{recentContent}}, {{chapterContent}}, {{userInput}}
 */
export interface ContextPlaceholder {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** The token without braces (e.g., 'recentContent') */
  token: string
  /** Description of what this placeholder contains */
  description: string
  /** Category for grouping in UI */
  category: 'story' | 'entities' | 'memory' | 'wizard' | 'service' | 'other'
}

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
 * Templates contain the base prompt text with {{macro}} placeholders.
 */
export interface PromptTemplate {
  id: string
  name: string
  category: PromptCategory
  description: string
  /**
   * The system prompt content with {{macro}} placeholders.
   * Macros are expanded at runtime based on context.
   */
  content: string
  /**
   * Optional user message template with {{macro}} placeholders.
   * For services that send a structured user message alongside the system prompt.
   */
  userContent?: string
}

/**
 * Context for macro expansion
 * Provides all the information needed to resolve macros.
 */
export interface PromptContext {
  mode: StoryMode
  pov: POV
  tense: Tense
  protagonistName: string
  currentLocation?: string
  storyTime?: string

  // Genre and wizard-generated context
  genre?: string
  tone?: string
  settingDescription?: string
  themes?: string[]

  // Visual Prose Mode
  visualProseMode?: boolean

  // Inline Image Mode
  inlineImageMode?: boolean

  /**
   * Additional custom values for user-defined macros.
   * Key is the macro token, value is the resolved text.
   */
  customValues?: Record<string, string>
}

/**
 * Override for a macro value (user customization)
 */
export interface MacroOverride {
  macroId: string
  /**
   * For simple macros: the overridden value
   */
  value?: string
  /**
   * For complex macros: overrides for specific variants
   */
  variantOverrides?: MacroVariant[]
}

/**
 * Override for a prompt template (user customization)
 *
 * Naming convention for templateId:
 * - System prompt override: Use the template ID directly (e.g., 'adventure', 'classifier')
 * - User message override: Append '-user' suffix (e.g., 'adventure-user', 'classifier-user')
 *
 * This convention allows a single templateOverrides array to store both system and user
 * prompt customizations while keeping them distinguishable.
 */
export interface PromptOverride {
  templateId: string
  content: string
}

/**
 * Settings for the prompt system (stored in settings store)
 */
export interface PromptSettings {
  /**
   * User-created custom macros
   */
  customMacros: Macro[]
  /**
   * Global overrides for builtin macro defaults
   */
  macroOverrides: MacroOverride[]
  /**
   * Overrides for prompt templates
   */
  templateOverrides: PromptOverride[]
  /**
   * Flag indicating legacy prompt migration has been completed.
   * This prevents re-migration on every app load.
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
