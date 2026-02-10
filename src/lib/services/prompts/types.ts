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
 * Legacy fields (customMacros, macroOverrides) are preserved for backward
 * compatibility with existing saved settings. They are ignored at runtime
 * since the macro system has been removed.
 */
export interface PromptSettings {
  /**
   * @deprecated Macro system removed. Kept for saved settings compatibility.
   */
  customMacros: Macro[]
  /**
   * @deprecated Macro system removed. Kept for saved settings compatibility.
   */
  macroOverrides: MacroOverride[]
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

// ===========================================================================
// LEGACY TYPE STUBS
//
// These types are preserved as stubs so existing UI components (PromptEditor,
// MacroEditor, ComplexMacroEditor, MacroChip, etc.) continue to compile.
// The macro system has been removed -- these types are no longer used at runtime.
// They will be removed when the UI is rewritten in Phase 4.
// ===========================================================================

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export type MacroType = 'simple' | 'complex'

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface VariantKey {
  mode?: 'adventure' | 'creative-writing'
  pov?: 'first' | 'second' | 'third'
  tense?: 'past' | 'present'
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface MacroVariant {
  key: VariantKey
  content: string
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
interface MacroBase {
  id: string
  name: string
  token: string
  builtin: boolean
  description: string
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface SimpleMacro extends MacroBase {
  type: 'simple'
  defaultValue: string
  dynamic: boolean
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface ComplexMacro extends MacroBase {
  type: 'complex'
  variesBy: {
    mode?: boolean
    pov?: boolean
    tense?: boolean
  }
  variants: MacroVariant[]
  fallbackContent?: string
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export type Macro = SimpleMacro | ComplexMacro

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface ContextPlaceholder {
  id: string
  name: string
  token: string
  description: string
  category: 'story' | 'entities' | 'memory' | 'wizard' | 'service' | 'other'
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface MacroOverride {
  macroId: string
  value?: string
  variantOverrides?: MacroVariant[]
}

/** @deprecated Macro system removed. Stub type for UI compatibility. */
export interface PromptContext {
  mode: 'adventure' | 'creative-writing'
  pov: 'first' | 'second' | 'third'
  tense: 'past' | 'present'
  protagonistName: string
  currentLocation?: string
  storyTime?: string
  genre?: string
  tone?: string
  settingDescription?: string
  themes?: string[]
  visualProseMode?: boolean
  inlineImageMode?: boolean
  customValues?: Record<string, string>
}
