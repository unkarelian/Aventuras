/**
 * Suggestions Service
 *
 * Generates story direction suggestions for creative writing mode.
 * Uses the Vercel AI SDK for structured output with Zod schema validation.
 */

import type { StoryEntry, StoryBeat, Entry } from '$lib/types'
import { promptService, type PromptContext } from '$lib/services/prompts'
import { createLogger, getContextConfig, getLorebookConfig } from '../core/config'
import { generateStructured } from '../sdk/generate'
import { suggestionsResultSchema, type SuggestionsResult } from '../sdk/schemas/suggestions'

const log = createLogger('Suggestions')

/**
 * Service for generating story direction suggestions.
 *
 * This service has been refactored to use the Vercel AI SDK with Zod schemas
 * for automatic output validation. The constructor no longer requires a provider.
 */
export class SuggestionsService {
  private presetId: string

  /**
   * Create a new SuggestionsService.
   * @param presetId - The preset ID to use for generation settings (default: 'suggestions')
   */
  constructor(presetId: string = 'suggestions') {
    this.presetId = presetId
  }

  /**
   * Generate story direction suggestions for creative writing mode.
   * Per design doc section 4.2: Suggestions System
   *
   * @param recentEntries - Recent story entries for context
   * @param activeThreads - Active story beats/threads
   * @param lorebookEntries - Optional lorebook entries for world context
   * @param promptContext - Complete story context for macro expansion
   */
  async generateSuggestions(
    recentEntries: StoryEntry[],
    activeThreads: StoryBeat[],
    lorebookEntries?: Entry[],
    promptContext?: PromptContext,
  ): Promise<SuggestionsResult> {
    log('generateSuggestions called', {
      recentEntriesCount: recentEntries.length,
      activeThreadsCount: activeThreads.length,
      hasPromptContext: !!promptContext,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    })

    // Get the last few entries for context
    const contextConfig = getContextConfig()
    const lorebookConfig = getLorebookConfig()
    const lastEntries = recentEntries.slice(-contextConfig.recentEntriesForRetrieval)
    const lastContent = lastEntries
      .map((e) => {
        const prefix = e.type === 'user_action' ? '[DIRECTION]' : '[NARRATIVE]'
        return `${prefix} ${e.content}`
      })
      .join('\n\n')

    // Format active threads
    const threadsContext =
      activeThreads.length > 0
        ? activeThreads
            .map((t) => `• ${t.title}${t.description ? `: ${t.description}` : ''}`)
            .join('\n')
        : '(none)'

    // Format lorebook entries for context
    let lorebookContext = ''
    if (lorebookEntries && lorebookEntries.length > 0) {
      const entryDescriptions = lorebookEntries
        .slice(0, lorebookConfig.maxForSuggestions)
        .map((e) => {
          let desc = `• ${e.name} (${e.type})`
          if (e.description) {
            desc += `: ${e.description}`
          }
          return desc
        })
        .join('\n')
      lorebookContext = `\n## Lorebook/World Elements\nThe following characters, locations, and concepts exist in this world and can be incorporated into suggestions:\n${entryDescriptions}`
    }

    // Use provided context or build minimal fallback
    const context: PromptContext = promptContext ?? {
      mode: 'creative-writing',
      pov: 'third',
      tense: 'past',
      protagonistName: 'the protagonist',
    }

    // Build genre string from context if available
    const genreStr = context.genre ? `## Genre: ${context.genre}\n` : ''

    // Get prompts from PromptService
    const system = promptService.renderPrompt('suggestions', context)
    const prompt = promptService.renderUserPrompt('suggestions', context, {
      recentContent: lastContent,
      activeThreads: threadsContext,
      genre: genreStr,
      lorebookContext,
    })

    try {
      // Use SDK's generateStructured - all boilerplate handled automatically
      const result = await generateStructured(
        {
          presetId: this.presetId,
          schema: suggestionsResultSchema,
          system,
          prompt,
        },
        'suggestions',
      )

      log('Suggestions generated:', result.suggestions.length)
      return result
    } catch (error) {
      log('Suggestions generation failed:', error)
      return { suggestions: [] }
    }
  }
}
