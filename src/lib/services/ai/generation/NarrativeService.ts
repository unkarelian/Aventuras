/**
 * Narrative Service
 *
 * The core service that generates story responses.
 * This is the heart of the application - it handles narrative generation
 * both streaming and non-streaming.
 *
 * Unlike other services that use the preset system, NarrativeService uses
 * the main narrative profile directly (apiSettings.defaultModel, temperature, maxTokens).
 *
 * Uses ContextBuilder for prompt generation through the unified Liquid template pipeline.
 */

import { streamNarrative, generateNarrative } from '../sdk/generate'
import { ContextBuilder } from '$lib/services/context'
import { StyleReviewerService } from './StyleReviewerService'
import { createLogger } from '../core/config'
import type { StreamChunk } from '../core/types'
import type { Story, StoryEntry, Entry, Character, Location, Item, StoryBeat, Chapter, TimeTracker } from '$lib/types'
import type { StyleReviewResult } from './StyleReviewerService'
import type { TimelineFillResult } from '../retrieval/TimelineFillService'

const log = createLogger('Narrative')

/**
 * World state context for prompt building
 */
export interface WorldStateContext {
  characters: Character[]
  locations: Location[]
  items: Item[]
  storyBeats: StoryBeat[]
  currentLocation?: Location
  chapters?: Chapter[]
}

/**
 * World state context for narrative generation.
 * Extends the base WorldStateContext with lorebook entries.
 */
export interface NarrativeWorldState extends WorldStateContext {
  lorebookEntries?: Entry[]
}

/**
 * Format a TimeTracker into a human-readable string for the narrative prompt.
 * Always returns a value, defaulting to Year 1, Day 1, 0 hours 0 minutes if null.
 */
export function formatStoryTime(time: TimeTracker | null | undefined): string {
  const t = time ?? { years: 0, days: 0, hours: 0, minutes: 0 }
  const year = t.years + 1
  const day = t.days + 1
  return `Year ${year}, Day ${day}, ${t.hours} hours ${t.minutes} minutes`
}

/**
 * Build a block containing chapter summaries for injection into the system prompt.
 * Per design doc: summarized entries are excluded from direct context,
 * but their summaries provide narrative continuity.
 */
export function buildChapterSummariesBlock(
  chapters: Chapter[],
  timelineFillResult?: TimelineFillResult | null,
): string {
  if (chapters.length === 0) return ''

  let block = '\n\n<story_history>\n'
  block += '## Previous Chapters\n'
  block +=
    'The following chapters have occurred earlier in the story. Use them for continuity and context.\n\n'

  for (const chapter of chapters) {
    block += `### Chapter ${chapter.number}`
    if (chapter.title) {
      block += `: ${chapter.title}`
    }
    block += '\n'

    const startTime = formatStoryTime(chapter.startTime)
    const endTime = formatStoryTime(chapter.endTime)
    if (startTime && endTime) {
      block += `*Time: ${startTime} \u2192 ${endTime}*\n`
    } else if (startTime) {
      block += `*Time: ${startTime}*\n`
    }

    block += chapter.summary
    block += '\n'

    const metadata: string[] = []
    if (chapter.characters.length > 0) {
      metadata.push(`Characters: ${chapter.characters.join(', ')}`)
    }
    if (chapter.locations.length > 0) {
      metadata.push(`Locations: ${chapter.locations.join(', ')}`)
    }
    if (chapter.emotionalTone) {
      metadata.push(`Tone: ${chapter.emotionalTone}`)
    }
    if (metadata.length > 0) {
      block += `*${metadata.join(' | ')}*\n`
    }
    block += '\n'
  }

  if (timelineFillResult && timelineFillResult.responses.length > 0) {
    block += '## Retrieved Context\n'
    block +=
      'The following information was retrieved from past chapters and is relevant to the current scene:\n\n'

    for (const response of timelineFillResult.responses) {
      const chapterLabel =
        response.chapterNumbers.length === 1
          ? `Chapter ${response.chapterNumbers[0]}`
          : `Chapters ${response.chapterNumbers.join(', ')}`

      block += `**${chapterLabel}**\n`
      block += `Q: ${response.query}\n`
      block += `A: ${response.answer}\n\n`
    }
  }

  block += '</story_history>'
  return block
}

/**
 * Options for narrative generation.
 */
export interface NarrativeOptions {
  /** Pre-built tiered context block for injection */
  tieredContextBlock?: string
  /** Style review results for avoiding repetition */
  styleReview?: StyleReviewResult | null
  /** Retrieved chapter context from memory system */
  retrievedChapterContext?: string | null
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Timeline fill result for Q&A injection */
  timelineFillResult?: TimelineFillResult | null
}

/**
 * Service for generating narrative responses.
 *
 * This service uses the main narrative profile from apiSettings directly,
 * rather than going through the preset system. This ensures narrative
 * generation uses the user's primary model and settings.
 *
 * Prompt generation flows through ContextBuilder + Liquid templates.
 */
export class NarrativeService {
  /**
   * Create a new NarrativeService.
   * No preset required - uses main narrative profile from settings.
   */
  constructor() {
    // No configuration needed - uses main profile directly
  }

  /**
   * Stream a narrative response.
   *
   * This is the primary method used by the UI for real-time narrative generation.
   * Yields StreamChunk objects as text arrives from the model.
   */
  async *stream(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: NarrativeOptions = {},
  ): AsyncIterable<StreamChunk> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal, timelineFillResult } =
      options

    log('stream', {
      entriesCount: entries.length,
      hasTieredContext: !!tieredContextBlock,
      hasStyleReview: !!styleReview,
      hasRetrievedContext: !!retrievedChapterContext,
      hasTimelineFill: !!timelineFillResult,
    })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      timelineFillResult,
    )

    // Build the user prompt from entries
    const mode = story?.mode ?? 'adventure'
    const userPrompt = this.buildUserPrompt(entries, mode)

    try {
      // Stream using the main narrative profile
      const stream = streamNarrative({
        system: systemPrompt,
        prompt: `${primingMessage}\n\n${userPrompt}`,
        signal,
      })

      // Use fullStream to capture both text and reasoning
      // - Native reasoning providers (Anthropic, OpenAI) emit reasoning-delta parts
      // - Models using <think> tags have reasoning extracted by extractReasoningMiddleware
      for await (const part of stream.fullStream) {
        if (part.type === 'reasoning-delta') {
          // Reasoning delta from native providers or extracted from <think> tags
          yield { content: '', reasoning: (part as { text?: string }).text, done: false }
        } else if (part.type === 'text-delta') {
          // Regular text content
          yield { content: (part as { text?: string }).text || '', done: false }
        }
        // Ignore other part types (reasoning-start, reasoning-end, tool calls, finish, etc.)
      }

      yield { content: '', done: true }
    } catch (error) {
      log('stream error', error)
      // Re-throw to let caller handle the error
      throw error
    }
  }

  /**
   * Generate a complete narrative response (non-streaming).
   *
   * Used for scenarios where streaming is not needed or supported.
   */
  async generate(
    entries: StoryEntry[],
    worldState: NarrativeWorldState,
    story?: Story | null,
    options: Omit<NarrativeOptions, 'timelineFillResult'> = {},
  ): Promise<string> {
    const { tieredContextBlock, styleReview, retrievedChapterContext, signal } = options

    log('generate', { entriesCount: entries.length })

    // Build system prompt via ContextBuilder pipeline
    const { systemPrompt, primingMessage } = await this.buildPrompts(
      story,
      worldState,
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
    )

    const mode = story?.mode ?? 'adventure'
    const userPrompt = this.buildUserPrompt(entries, mode)

    return generateNarrative({
      system: systemPrompt,
      prompt: `${primingMessage}\n\n${userPrompt}`,
      signal,
    })
  }

  /**
   * Build system and priming prompts through the ContextBuilder pipeline.
   *
   * Creates a ContextBuilder from the story, adds runtime variables
   * (tiered context, chapter summaries, style guidance), then renders
   * through the Liquid template for the story's mode.
   */
  private async buildPrompts(
    story: Story | null | undefined,
    worldState: NarrativeWorldState,
    tieredContextBlock?: string,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    timelineFillResult?: TimelineFillResult | null,
  ): Promise<{ systemPrompt: string; primingMessage: string }> {
    const mode = story?.mode ?? 'adventure'

    // Create ContextBuilder -- forStory auto-populates mode, pov, tense, genre,
    // protagonistName, protagonistDescription, currentLocation, storyTime, etc.
    let ctx: ContextBuilder

    if (story?.id) {
      ctx = await ContextBuilder.forStory(story.id)
    } else {
      // Fallback for edge cases where story doesn't exist yet
      ctx = new ContextBuilder()
      ctx.add({
        mode,
        pov: story?.settings?.pov ?? 'second',
        tense: story?.settings?.tense ?? 'present',
        protagonistName: 'the protagonist',
      })
    }

    // Add runtime variables for template rendering
    // These are pre-formatted blocks that templates inject via {{ variable }}

    if (tieredContextBlock) {
      ctx.add({ tieredContextBlock })
    }

    if (retrievedChapterContext) {
      ctx.add({ retrievedChapterContext })
    }

    // Build chapter summaries block
    if (worldState.chapters && worldState.chapters.length > 0) {
      const chapterSummaries = buildChapterSummariesBlock(
        worldState.chapters,
        timelineFillResult,
      )
      if (chapterSummaries) {
        ctx.add({ chapterSummaries })
      }
    }

    // Build style guidance block
    if (styleReview && styleReview.phrases.length > 0) {
      const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview)
      if (styleGuidance) {
        ctx.add({ styleGuidance })
      }
    }

    // Render through the mode-specific template
    const templateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure'
    const { system: systemPrompt } = await ctx.render(templateId)

    // Build priming message based on mode/pov/tense
    const context = ctx.getContext()
    const primingMessage = this.buildPrimingMessage(
      mode,
      (context.pov as string) ?? 'second',
      (context.tense as string) ?? 'present',
      (context.protagonistName as string) ?? 'the protagonist',
    )

    log('buildPrompts complete', {
      mode,
      templateId,
      systemPromptLength: systemPrompt.length,
      primingMessageLength: primingMessage.length,
    })

    return { systemPrompt, primingMessage }
  }

  /**
   * Build the user prompt from recent story entries.
   *
   * Formats entries as a conversation history with the current action highlighted.
   */
  private buildUserPrompt(entries: StoryEntry[], mode: 'adventure' | 'creative-writing'): string {
    // Use all entries passed - these are already the visible (non-summarized) entries
    // Truncation/context management happens upstream via the memory system

    // Format entries based on mode
    const historyParts: string[] = []
    for (const entry of entries) {
      if (entry.type === 'user_action') {
        const prefix = mode === 'creative-writing' ? '[DIRECTION]' : '[ACTION]'
        historyParts.push(`${prefix} ${entry.content}`)
      } else if (entry.type === 'narration') {
        historyParts.push(`[NARRATIVE]\n${entry.content}`)
      }
    }

    // Get the last user action as the current input
    const lastUserAction = [...entries].reverse().find((e) => e.type === 'user_action')
    const currentAction = lastUserAction?.content ?? ''

    // Build final prompt
    let prompt = ''

    if (historyParts.length > 1) {
      // Include history minus the last action (which becomes current)
      prompt += '## Recent Story:\n'
      prompt += historyParts.slice(0, -1).join('\n\n')
      prompt += '\n\n'
    }

    prompt += '## Current Action:\n'
    prompt += currentAction
    prompt += '\n\n'
    prompt += 'Continue the narrative:'

    return prompt
  }

  /**
   * Build a priming user message to establish the narrator role.
   * This helps models that expect user-first conversation format.
   */
  private buildPrimingMessage(
    mode: string,
    pov: string,
    tense: string,
    protagonistName: string,
  ): string {
    if (mode === 'creative-writing') {
      return this.buildCreativeWritingPriming(pov, tense, protagonistName)
    }
    return this.buildAdventurePriming(pov, tense, protagonistName)
  }

  private buildAdventurePriming(pov: string, tense: string, protagonistName: string): string {
    const tenseWord = tense === 'past' ? 'past' : 'present'
    const actionExample = tense === 'past' ? 'pushed open the heavy door' : 'pushes open the heavy door'
    const descWords = tense === 'past' ? 'saw, heard, and experienced as I explored' : 'see, hear, and experience as I explore'

    if (pov === 'third') {
      return `You are the narrator of this interactive adventure. Write in ${tenseWord} tense, third person (they/the character name).

Your role:
- Describe ${protagonistName}'s experiences and the world around them
- Control all NPCs and the environment
- NEVER write ${protagonistName}'s dialogue, decisions, or inner thoughts - I decide those
- When I say "I do X", describe the results in third person (e.g., "I open the door" -> "${protagonistName} ${actionExample}...")

I am the player controlling ${protagonistName}. You narrate what happens. Begin when I take my first action.`
    }

    return `You are the narrator of this interactive adventure. Write in ${tenseWord} tense, second person (you/your).

Your role:
- Describe what I ${descWords}
- Control all NPCs and the environment
- NEVER write my dialogue, decisions, or inner thoughts
- When I say "I do X", describe the results using "you" (e.g., "I open the door" -> "You ${actionExample}...")

I am the player. You narrate the world around me. Begin when I take my first action.`
  }

  private buildCreativeWritingPriming(pov: string, tense: string, protagonistName: string): string {
    const tenseWord = tense === 'past' ? 'past' : 'present'

    if (pov === 'first') {
      return `You are a skilled fiction writer. Write in ${tenseWord} tense, first person (I/me/my).

Your role:
- Write prose based on my directions from ${protagonistName}'s internal perspective
- Bring scenes to life with vivid detail and internal monologue
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
    }

    if (pov === 'second') {
      return `You are a skilled fiction writer. Write in ${tenseWord} tense, second person (you/your).

Your role:
- Write prose based on my directions, addressing ${protagonistName} directly
- Bring scenes to life with vivid detail
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
    }

    // Third person (default for creative-writing)
    return `You are a skilled fiction writer. Write in ${tenseWord} tense, third person (they/the character name).

Your role:
- Write prose based on my directions
- Bring scenes to life with vivid detail
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`
  }
}
