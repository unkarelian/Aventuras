/**
 * Centralized Prompt System - Macro Expansion Engine
 *
 * Handles the resolution and expansion of macros in prompt templates.
 * Supports simple text substitution and complex conditional variants.
 */

import { BUILTIN_MACROS } from './definitions'
import type {
  Macro,
  SimpleMacro,
  ComplexMacro,
  MacroVariant,
  PromptContext,
  MacroOverride,
  VariantKey,
} from './types'
import { settings } from '$lib/stores/settings.svelte'
import { getLanguageDisplayName } from '$lib/services/ai/utils/TranslationService'

/**
 * Macro expansion engine
 * Resolves macro tokens to their values based on context and overrides.
 */
export class MacroEngine {
  private builtinMacros: Map<string, Macro>
  private customMacros: Map<string, Macro> = new Map()
  private globalOverrides: MacroOverride[] = []

  constructor() {
    // Index builtin macros by token
    this.builtinMacros = new Map(BUILTIN_MACROS.map((m) => [m.token, m]))
  }

  /**
   * Register custom macros (user-created)
   */
  setCustomMacros(macros: Macro[]): void {
    this.customMacros = new Map(macros.map((m) => [m.token, m]))
  }

  /**
   * Register global overrides for macro values
   */
  setGlobalOverrides(overrides: MacroOverride[]): void {
    this.globalOverrides = overrides
  }

  /**
   * Remove a global override for a specific macro
   */
  removeGlobalOverride(macroId: string): void {
    this.globalOverrides = this.globalOverrides.filter((o) => o.macroId !== macroId)
  }

  /**
   * Get all global macro overrides.
   * Used for persistence/export.
   */
  getGlobalOverrides(): MacroOverride[] {
    return [...this.globalOverrides]
  }

  /**
   * Get all available macros (builtin + custom)
   */
  getAllMacros(): Macro[] {
    return [...Array.from(this.builtinMacros.values()), ...Array.from(this.customMacros.values())]
  }

  /**
   * Get a macro by its token
   */
  getMacro(token: string): Macro | undefined {
    return this.builtinMacros.get(token) ?? this.customMacros.get(token)
  }

  /**
   * Resolve a single macro token to its value
   *
   * @param token - The macro token (without {{ }})
   * @param context - The prompt context (mode, pov, tense, etc.)
   * @param storyOverrides - Story-specific overrides (take precedence over global)
   * @returns The resolved macro value, or the original {{token}} if not found
   */
  resolve(token: string, context: PromptContext, storyOverrides?: MacroOverride[]): string {
    const macro = this.getMacro(token)

    // Unknown macro - check custom values in context, otherwise leave as-is
    if (!macro) {
      if (context.customValues && token in context.customValues) {
        return context.customValues[token]
      }
      return `{{${token}}}`
    }

    if (macro.type === 'simple') {
      return this.resolveSimple(macro, context, storyOverrides)
    } else {
      return this.resolveComplex(macro, context, storyOverrides)
    }
  }

  /**
   * Expand all macros in a prompt string
   *
   * @param prompt - The prompt text with {{macro}} placeholders
   * @param context - The prompt context
   * @param storyOverrides - Story-specific overrides
   * @param maxDepth - Maximum recursion depth for nested macros (default: 5)
   * @returns The fully expanded prompt
   */
  expand(
    prompt: string,
    context: PromptContext,
    storyOverrides?: MacroOverride[],
    maxDepth: number = 5,
  ): string {
    // Clamp maxDepth to valid range to prevent issues with invalid input
    const safeDepth = Math.max(0, Math.min(maxDepth, 10))
    if (safeDepth <= 0) {
      // Prevent infinite recursion
      return prompt
    }

    // Use a fresh regex literal in replace to avoid stateful global regex issues
    let expanded = prompt.replace(/\{\{(\w+)\}\}/g, (_match, token) => {
      return this.resolve(token, context, storyOverrides)
    })

    // Check if any macros remain (nested expansion) - use fresh regex to avoid state issues
    if (/\{\{(\w+)\}\}/.test(expanded)) {
      expanded = this.expand(expanded, context, storyOverrides, safeDepth - 1)
    }

    return expanded
  }

  /**
   * Parse a prompt to find all macro tokens
   *
   * @param prompt - The prompt text
   * @returns Array of macro tokens found (without {{ }})
   */
  findMacros(prompt: string): string[] {
    const macroPattern = /\{\{(\w+)\}\}/g
    const tokens: string[] = []
    let match

    while ((match = macroPattern.exec(prompt)) !== null) {
      if (!tokens.includes(match[1])) {
        tokens.push(match[1])
      }
    }

    return tokens
  }

  /**
   * Get macro positions in a prompt (for UI rendering)
   *
   * @param prompt - The prompt text
   * @returns Array of { token, start, end } positions
   */
  getMacroPositions(prompt: string): Array<{ token: string; start: number; end: number }> {
    const macroPattern = /\{\{(\w+)\}\}/g
    const positions: Array<{ token: string; start: number; end: number }> = []
    let match

    while ((match = macroPattern.exec(prompt)) !== null) {
      positions.push({
        token: match[1],
        start: match.index,
        end: match.index + match[0].length,
      })
    }

    return positions
  }

  /**
   * Resolve a simple macro
   */
  private resolveSimple(
    macro: SimpleMacro,
    context: PromptContext,
    storyOverrides?: MacroOverride[],
  ): string {
    // Check story overrides first (highest priority)
    const storyOverride = this.findOverride(macro.id, storyOverrides)
    if (storyOverride?.value !== undefined) {
      return storyOverride.value
    }

    // Check global overrides
    const globalOverride = this.findOverride(macro.id, this.globalOverrides)
    if (globalOverride?.value !== undefined) {
      return globalOverride.value
    }

    // Dynamic resolution from context
    if (macro.dynamic) {
      switch (macro.token) {
        case 'protagonistName':
          return context.protagonistName || macro.defaultValue
        case 'currentLocation':
          return context.currentLocation || macro.defaultValue
        case 'storyTime':
          return context.storyTime || macro.defaultValue
        case 'genre':
          return context.genre || macro.defaultValue
        case 'tone':
          return context.tone || macro.defaultValue
        case 'settingDescription':
          return context.settingDescription || macro.defaultValue
        case 'themes':
          return context.themes?.join(', ') || macro.defaultValue
        case 'storyContextBlock':
          return this.buildStoryContextBlock(context)
        case 'visualProseBlock':
          // Resolve to visual prose instructions if mode is enabled, empty otherwise
          if (context.visualProseMode) {
            return this.resolve('visualProseInstructions', context, storyOverrides)
          }
          return ''
        case 'inlineImageBlock':
          // Resolve to inline image instructions if mode is enabled, empty otherwise
          if (context.inlineImageMode) {
            return this.resolve('inlineImageInstructions', context, storyOverrides)
          }
          return ''
        case 'targetLanguage':
          // Derive from translation settings
          if (
            settings.translationSettings?.enabled &&
            settings.translationSettings?.targetLanguage
          ) {
            return getLanguageDisplayName(settings.translationSettings.targetLanguage)
          }
          return macro.defaultValue
        case 'sourceLanguage':
          // Derive from translation settings
          if (
            settings.translationSettings?.enabled &&
            settings.translationSettings?.sourceLanguage
          ) {
            const code = settings.translationSettings.sourceLanguage
            return code === 'auto' ? 'the detected language' : getLanguageDisplayName(code)
          }
          return macro.defaultValue
        default:
          // Unknown dynamic macro, fall through to default
          break
      }
    }

    return macro.defaultValue
  }

  /**
   * Build the story context block from available context values.
   * Only includes sections that have values.
   */
  private buildStoryContextBlock(context: PromptContext): string {
    const lines: string[] = []

    if (context.genre) {
      lines.push(`- Genre: ${context.genre}`)
    }
    if (context.tone) {
      lines.push(`- Tone: ${context.tone}`)
    }
    if (context.settingDescription) {
      lines.push(`- Setting: ${context.settingDescription}`)
    }
    if (context.themes && context.themes.length > 0) {
      lines.push(`- Themes: ${context.themes.join(', ')}`)
    }

    if (lines.length === 0) {
      return ''
    }

    return `# Story Context\n${lines.join('\n')}`
  }

  /**
   * Resolve a complex macro by finding the best matching variant
   */
  private resolveComplex(
    macro: ComplexMacro,
    context: PromptContext,
    storyOverrides?: MacroOverride[],
  ): string {
    // Check story overrides first
    const storyOverride = this.findOverride(macro.id, storyOverrides)
    if (storyOverride?.variantOverrides) {
      const overrideVariant = this.findBestVariant(
        storyOverride.variantOverrides,
        context,
        macro.variesBy,
      )
      if (overrideVariant) {
        return overrideVariant.content
      }
    }

    // Check global overrides
    const globalOverride = this.findOverride(macro.id, this.globalOverrides)
    if (globalOverride?.variantOverrides) {
      const overrideVariant = this.findBestVariant(
        globalOverride.variantOverrides,
        context,
        macro.variesBy,
      )
      if (overrideVariant) {
        return overrideVariant.content
      }
    }

    // Use builtin variants
    const variant = this.findBestVariant(macro.variants, context, macro.variesBy)
    if (variant) {
      return variant.content
    }

    // Fallback
    return macro.fallbackContent || ''
  }

  /**
   * Find an override by macro ID
   */
  private findOverride(macroId: string, overrides?: MacroOverride[]): MacroOverride | undefined {
    if (!overrides) return undefined
    return overrides.find((o) => o.macroId === macroId)
  }

  /**
   * Find the best matching variant for the current context
   *
   * Uses a scoring system:
   * - Exact match on a dimension: +2 points
   * - Undefined in variant (wildcard): +1 point
   * - Mismatch: -10 points (effectively disqualifies)
   *
   * The variant with the highest score wins.
   */
  private findBestVariant(
    variants: MacroVariant[],
    context: PromptContext,
    variesBy: ComplexMacro['variesBy'],
  ): MacroVariant | undefined {
    let bestVariant: MacroVariant | undefined
    let bestScore = -Infinity

    for (const variant of variants) {
      const score = this.scoreVariant(variant.key, context, variesBy)
      if (score > bestScore) {
        bestScore = score
        bestVariant = variant
      }
    }

    // Only return if we found a non-disqualified variant
    return bestScore >= 0 ? bestVariant : undefined
  }

  /**
   * Score how well a variant matches the context
   */
  private scoreVariant(
    key: VariantKey,
    context: PromptContext,
    variesBy: ComplexMacro['variesBy'],
  ): number {
    let score = 0

    // Mode dimension
    if (variesBy.mode) {
      if (key.mode === undefined) {
        score += 1 // Wildcard
      } else if (key.mode === context.mode) {
        score += 2 // Exact match
      } else {
        score -= 10 // Mismatch
      }
    }

    // POV dimension
    if (variesBy.pov) {
      if (key.pov === undefined) {
        score += 1 // Wildcard
      } else if (key.pov === context.pov) {
        score += 2 // Exact match
      } else {
        score -= 10 // Mismatch
      }
    }

    // Tense dimension
    if (variesBy.tense) {
      if (key.tense === undefined) {
        score += 1 // Wildcard
      } else if (key.tense === context.tense) {
        score += 2 // Exact match
      } else {
        score -= 10 // Mismatch
      }
    }

    return score
  }
}

// Singleton instance
export const macroEngine = new MacroEngine()
