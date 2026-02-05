/**
 * Centralized Prompt System
 *
 * This module provides a unified API for managing prompts and macros.
 * All AI services should import from here instead of handling prompts directly.
 *
 * Usage:
 * ```typescript
 * import { promptService, type PromptContext } from '$lib/services/prompts';
 *
 * const context: PromptContext = {
 *   mode: 'adventure',
 *   pov: 'second',
 *   tense: 'present',
 *   protagonistName: 'Alex',
 * };
 *
 * const systemPrompt = promptService.getPrompt('adventure', context);
 * const primingMessage = promptService.getPrimingMessage(context);
 * ```
 */

import { macroEngine } from './macros'
import {
  BUILTIN_MACROS,
  PROMPT_TEMPLATES,
  CONTEXT_PLACEHOLDERS,
  getTemplateById,
} from './definitions'
import type {
  Macro,
  PromptTemplate,
  PromptContext,
  MacroOverride,
  PromptOverride,
  PromptSettings,
} from './types'

/**
 * Main prompt service - the public API for the prompt system
 */
class PromptService {
  private templateOverrides: Map<string, string> = new Map()
  private initialized = false

  /**
   * Initialize the prompt service with saved settings
   *
   * @param settings - Saved prompt settings (overrides, custom macros)
   */
  init(settings: PromptSettings): void {
    // Validate all templates on init (fail fast)
    this.validateAllTemplates()

    // Register custom macros
    macroEngine.setCustomMacros(settings.customMacros)

    // Register global macro overrides
    macroEngine.setGlobalOverrides(settings.macroOverrides)

    // Register template overrides
    this.templateOverrides.clear()
    for (const override of settings.templateOverrides) {
      this.templateOverrides.set(override.templateId, override.content)
    }

    this.initialized = true
  }

  /**
   * Check if the service has been initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }

  // ===========================================================================
  // PROMPT METHODS
  // ===========================================================================

  /**
   * Check if a template exists
   *
   * @param templateId - The template ID to check
   * @returns True if the template exists
   */
  hasTemplate(templateId: string): boolean {
    return getTemplateById(templateId) !== undefined
  }

  /**
   * Get a fully expanded prompt by template ID
   *
   * @param templateId - The template ID (e.g., 'adventure', 'creative-writing', 'classifier')
   * @param context - The prompt context for macro expansion
   * @param storyOverrides - Story-specific macro overrides
   * @returns The fully expanded prompt string, or empty string if template not found
   * @note Use hasTemplate() to check if a template exists before calling this method
   */
  getPrompt(templateId: string, context: PromptContext, storyOverrides?: MacroOverride[]): string {
    const template = this.getTemplate(templateId)
    if (!template) {
      console.error(
        `[PromptService] Template not found: ${templateId}. Use hasTemplate() to check existence.`,
      )
      return ''
    }

    // Use override content if available, otherwise use default
    const content = this.templateOverrides.get(templateId) ?? template.content

    // Expand all macros
    return macroEngine.expand(content, context, storyOverrides)
  }

  /**
   * Render a system prompt with macros and context placeholders resolved.
   *
   * @param templateId - The template ID
   * @param context - The prompt context for macro expansion
   * @param placeholders - Runtime placeholder values (e.g., {{recentContent}})
   * @param storyOverrides - Story-specific macro overrides
   * @returns The fully rendered prompt, or empty string if template not found
   */
  renderPrompt(
    templateId: string,
    context: PromptContext,
    placeholders?: Record<string, string | number | null | undefined>,
    storyOverrides?: MacroOverride[],
  ): string {
    const template = this.getTemplate(templateId)
    if (!template) {
      console.error(
        `[PromptService] Template not found: ${templateId}. Use hasTemplate() to check existence.`,
      )
      return ''
    }

    const content = this.templateOverrides.get(templateId) ?? template.content
    const expanded = macroEngine.expand(content, context, storyOverrides)
    return this.applyPlaceholders(expanded, placeholders)
  }

  /**
   * Render a user prompt with macros and context placeholders resolved.
   *
   * @param templateId - The template ID
   * @param context - The prompt context for macro expansion
   * @param placeholders - Runtime placeholder values (e.g., {{userInput}})
   * @param storyOverrides - Story-specific macro overrides
   */
  renderUserPrompt(
    templateId: string,
    context: PromptContext,
    placeholders?: Record<string, string | number | null | undefined>,
    storyOverrides?: MacroOverride[],
  ): string {
    const raw = this.getUserTemplateContent(templateId)
    if (!raw) return ''
    const expanded = macroEngine.expand(raw, context, storyOverrides)
    return this.applyPlaceholders(expanded, placeholders)
  }

  /**
   * Get the priming message (first user message establishing narrator role)
   *
   * @param context - The prompt context
   * @param storyOverrides - Story-specific macro overrides
   * @returns The expanded priming message
   */
  getPrimingMessage(context: PromptContext, storyOverrides?: MacroOverride[]): string {
    // The priming message is a special complex macro
    const resolved = macroEngine.resolve('primingMessage', context, storyOverrides)

    // Expand any nested macros (like {{protagonistName}})
    return macroEngine.expand(resolved, context, storyOverrides)
  }

  /**
   * Get the raw template (for editor display)
   *
   * @param templateId - The template ID
   * @returns The template with macro syntax intact, or undefined if not found
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return getTemplateById(templateId)
  }

  /**
   * Get the template content (with user override if set)
   *
   * @param templateId - The template ID
   * @returns The template content (override or default)
   */
  getTemplateContent(templateId: string): string {
    const override = this.templateOverrides.get(templateId)
    if (override !== undefined) {
      return override
    }

    const template = this.getTemplate(templateId)
    return template?.content ?? ''
  }

  /**
   * Get the user message template content (with override if set).
   *
   * User content overrides are stored with '-user' suffix convention.
   * For example, template 'classifier' has user override at 'classifier-user'.
   *
   * @param templateId - The base template ID (without -user suffix)
   * @returns The user content (override or default), or empty string if none
   */
  getUserTemplateContent(templateId: string): string {
    // User content overrides use the '-user' suffix convention
    const override = this.templateOverrides.get(`${templateId}-user`)
    if (override !== undefined) {
      return override
    }

    const template = this.getTemplate(templateId)
    return template?.userContent ?? ''
  }

  /**
   * Check if a template has been overridden
   */
  hasTemplateOverride(templateId: string): boolean {
    return this.templateOverrides.has(templateId)
  }

  /**
   * Get all available templates
   */
  getAllTemplates(): PromptTemplate[] {
    return PROMPT_TEMPLATES
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: 'story' | 'service' | 'wizard'): PromptTemplate[] {
    return PROMPT_TEMPLATES.filter((t) => t.category === category)
  }

  /**
   * Set a template override (user customization)
   *
   * @param templateId - The template ID
   * @param content - The new content
   */
  setTemplateOverride(templateId: string, content: string): void {
    this.templateOverrides.set(templateId, content)
  }

  /**
   * Reset a template to default (remove override)
   *
   * @param templateId - The template ID
   */
  resetTemplate(templateId: string): void {
    this.templateOverrides.delete(templateId)
  }

  /**
   * Get all template overrides (for saving)
   */
  getTemplateOverrides(): PromptOverride[] {
    const overrides: PromptOverride[] = []
    for (const [templateId, content] of this.templateOverrides) {
      overrides.push({ templateId, content })
    }
    return overrides
  }

  // ===========================================================================
  // MACRO METHODS
  // ===========================================================================

  /**
   * Get all available macros (builtin + custom)
   */
  getAllMacros(): Macro[] {
    return macroEngine.getAllMacros()
  }

  /**
   * Get a macro by its token
   */
  getMacro(token: string): Macro | undefined {
    return macroEngine.getMacro(token)
  }

  /**
   * Get builtin macros only
   */
  getBuiltinMacros(): Macro[] {
    return BUILTIN_MACROS
  }

  /**
   * Resolve a single macro
   */
  resolveMacro(token: string, context: PromptContext, storyOverrides?: MacroOverride[]): string {
    return macroEngine.resolve(token, context, storyOverrides)
  }

  /**
   * Expand all macros in a text
   */
  expandMacros(text: string, context: PromptContext, storyOverrides?: MacroOverride[]): string {
    return macroEngine.expand(text, context, storyOverrides)
  }

  /**
   * Find all macros in a prompt text
   *
   * @param prompt - The prompt text
   * @returns Array of macro tokens found
   */
  findMacrosInText(prompt: string): string[] {
    return macroEngine.findMacros(prompt)
  }

  /**
   * Get macro positions in text (for UI rendering)
   */
  getMacroPositions(prompt: string): Array<{ token: string; start: number; end: number }> {
    return macroEngine.getMacroPositions(prompt)
  }

  /**
   * Add a custom macro
   *
   * Note: This doesn't persist - call getExportableSettings() and save to persist
   */
  addCustomMacro(macro: Macro): void {
    const allCustom = macroEngine.getAllMacros().filter((m) => !m.builtin)
    allCustom.push(macro)
    macroEngine.setCustomMacros(allCustom)
  }

  /**
   * Remove a custom macro and clean up any associated overrides
   */
  removeCustomMacro(macroId: string): void {
    const allCustom = macroEngine.getAllMacros().filter((m) => !m.builtin && m.id !== macroId)
    macroEngine.setCustomMacros(allCustom)
    // Also remove any global override for this macro to prevent orphaned data
    macroEngine.removeGlobalOverride(macroId)
  }

  /**
   * Set global macro overrides
   */
  setGlobalMacroOverrides(overrides: MacroOverride[]): void {
    macroEngine.setGlobalOverrides(overrides)
  }

  // ===========================================================================
  // EXPORT/IMPORT
  // ===========================================================================

  /**
   * Get all settings for export/persistence
   */
  getExportableSettings(): PromptSettings {
    const customMacros = macroEngine.getAllMacros().filter((m) => !m.builtin)

    return {
      customMacros,
      macroOverrides: macroEngine.getGlobalOverrides(),
      templateOverrides: this.getTemplateOverrides(),
    }
  }

  /**
   * Preview what a prompt would look like with given context
   * (For UI preview purposes)
   */
  previewPrompt(
    templateId: string,
    context: PromptContext,
    storyOverrides?: MacroOverride[],
  ): {
    raw: string
    expanded: string
    macrosUsed: string[]
  } {
    const raw = this.getTemplateContent(templateId)
    const expanded = this.getPrompt(templateId, context, storyOverrides)
    const macrosUsed = this.findMacrosInText(raw)

    return { raw, expanded, macrosUsed }
  }

  // ===========================================================================
  // VALIDATION METHODS
  // ===========================================================================

  /**
   * Validate that all macros referenced in a template exist.
   * Checks both builtin macros and context placeholders.
   *
   * @param template - The template to validate
   * @returns Array of unknown tokens (empty if all valid)
   */
  private validateTemplateReferences(template: PromptTemplate): string[] {
    const allContent = template.content + (template.userContent || '')
    const tokens = macroEngine.findMacros(allContent)

    return tokens.filter((token) => {
      // Check if it's a builtin macro
      if (macroEngine.getMacro(token)) return false
      // Check if it's a known context placeholder
      if (CONTEXT_PLACEHOLDERS.find((p) => p.token === token)) return false
      // Unknown token
      return true
    })
  }

  /**
   * Validate all templates and throw if any have invalid macro references.
   * Called during init() to fail fast.
   */
  private validateAllTemplates(): void {
    const errors: string[] = []

    for (const template of PROMPT_TEMPLATES) {
      const unknownTokens = this.validateTemplateReferences(template)
      if (unknownTokens.length > 0) {
        errors.push(
          `Template "${template.id}" references unknown macros: ${unknownTokens.join(', ')}`,
        )
      }
    }

    if (errors.length > 0) {
      throw new Error(`[PromptService] Template validation failed:\n${errors.join('\n')}`)
    }
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private applyPlaceholders(
    text: string,
    placeholders?: Record<string, string | number | null | undefined>,
  ): string {
    if (!placeholders) return text

    // Use a local regex literal to avoid stateful global regex issues
    return text.replace(/\{\{(\w+)\}\}/g, (match, token) => {
      if (Object.prototype.hasOwnProperty.call(placeholders, token)) {
        const value = placeholders[token]
        return value === null || value === undefined ? '' : String(value)
      }
      return match
    })
  }
}

// Singleton instance
export const promptService = new PromptService()

// Re-export types and definitions for convenience
export * from './types'
export {
  BUILTIN_MACROS,
  PROMPT_TEMPLATES,
  CONTEXT_PLACEHOLDERS,
  hasUserContent,
  getPlaceholderByToken,
} from './definitions'
export { macroEngine } from './macros'
