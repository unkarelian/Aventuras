/**
 * System Prompt Builder
 *
 * Centralized logic for building system prompts for narrative generation.
 * Handles world state context injection, chapter summaries, and priming messages.
 */

import { story } from '$lib/stores/story.svelte'
import { promptService, type PromptContext } from '$lib/services/prompts'
import { isImageGenerationEnabled } from '../image'
import { StyleReviewerService, type StyleReviewResult } from '../generation/StyleReviewerService'
import { createLogger } from '../core/config'
import type { Character, Location, Item, StoryBeat, Chapter, TimeTracker } from '$lib/types'
import type { TimelineFillResult } from '../retrieval/TimelineFillService'

const log = createLogger('SystemBuilder')

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
 * Format a TimeTracker into a human-readable string for the narrative prompt.
 * Always returns a value, defaulting to Year 1, Day 1, 0 hours 0 minutes if null.
 */
export function formatStoryTime(time: TimeTracker | null | undefined): string {
  const t = time ?? { years: 0, days: 0, hours: 0, minutes: 0 }
  // One-indexed years and days
  const year = t.years + 1
  const day = t.days + 1
  return `Year ${year}, Day ${day}, ${t.hours} hours ${t.minutes} minutes`
}

/**
 * Build a priming user message to establish the narrator role.
 * This helps models that expect user-first conversation format.
 *
 * Uses the centralized prompt system for macro-based resolution.
 */
export function buildPrimingMessage(
  mode: 'adventure' | 'creative-writing',
  pov?: 'first' | 'second' | 'third',
  tense: 'past' | 'present' = 'present',
  protagonistName: string = 'the protagonist',
): string {
  // Build context for the prompt service
  const context: PromptContext = {
    mode,
    pov: pov ?? 'second',
    tense,
    protagonistName,
  }

  // Use the centralized prompt service for priming message
  return promptService.getPrimingMessage(context)
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

    // Add time range if available
    const startTime = formatStoryTime(chapter.startTime)
    const endTime = formatStoryTime(chapter.endTime)
    if (startTime && endTime) {
      block += `*Time: ${startTime} → ${endTime}*\n`
    } else if (startTime) {
      block += `*Time: ${startTime}*\n`
    }

    block += chapter.summary
    block += '\n'

    // Add metadata for context
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

  // Add retrieved Q&A from timeline fill if available
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
 * Build the complete system prompt for narrative generation.
 */
export function buildSystemPrompt(
  worldState: WorldStateContext,
  options: {
    templateId?: string | null
    retrievedContext?: string
    mode?: 'adventure' | 'creative-writing'
    tieredContextBlock?: string
    pov?: 'first' | 'second' | 'third'
    tense?: 'past' | 'present'
    timeTracker?: TimeTracker | null
    genre?: string | null
    settingDescription?: string | null
    tone?: string | null
    themes?: string[] | null
    visualProseMode?: boolean
    styleReview?: StyleReviewResult | null
    chapters?: Chapter[]
    timelineFillResult?: TimelineFillResult | null
  } = {},
): string {
  const {
    templateId,
    retrievedContext,
    mode = 'adventure',
    tieredContextBlock,
    pov,
    tense = 'present',
    timeTracker,
    genre,
    settingDescription,
    tone,
    themes,
    visualProseMode,
    styleReview,
    chapters,
    timelineFillResult,
  } = options

  const protagonist = worldState.characters.find((c) => c.relationship === 'self')
  const protagonistName = protagonist?.name || 'the protagonist'

  // Determine inline image mode (requires both setting enabled and image gen service available)
  const inlineImageMode =
    (story.currentStory?.settings?.inlineImageMode ?? false) && isImageGenerationEnabled()
  log('Inline image mode check:', { inlineImageMode, imageGenEnabled: isImageGenerationEnabled() })

  // Build prompt context for macro expansion - blocks auto-resolve based on mode flags
  const promptContext: PromptContext = {
    mode,
    pov: pov ?? 'second',
    tense,
    protagonistName,
    currentLocation: worldState.currentLocation?.name,
    storyTime: formatStoryTime(timeTracker),
    genre: genre ?? undefined,
    settingDescription: settingDescription ?? undefined,
    tone: tone ?? undefined,
    themes: themes ?? undefined,
    visualProseMode: visualProseMode ?? false,
    inlineImageMode,
  }

  // Determine the base prompt source using the centralized prompt service
  const globalTemplateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure'
  const hasGlobalTemplateOverride = promptService.hasTemplateOverride(globalTemplateId)

  // All stories now use the centralized prompt service
  let basePrompt = promptService.getPrompt(globalTemplateId, promptContext)
  const promptSource = hasGlobalTemplateOverride
    ? `promptService:${globalTemplateId} (user customized)`
    : `promptService:${globalTemplateId} (default)`

  log('buildSystemPrompt', {
    mode,
    templateId,
    genre,
    tone,
    themes,
    settingDescription: settingDescription?.substring(0, 50),
    hasGlobalTemplateOverride,
    promptSource,
    basePromptLength: basePrompt.length,
  })

  // Build world state context block
  let contextBlock = ''
  let hasContext = false

  // Use tiered context block if provided (from ContextBuilder)
  if (tieredContextBlock) {
    hasContext = true
    contextBlock = tieredContextBlock
  } else {
    // Fallback to inline context building (legacy behavior)
    contextBlock = buildLegacyContextBlock(worldState, retrievedContext)
    hasContext = contextBlock.length > 0
  }

  // Add current story time if available
  const formattedTime = formatStoryTime(timeTracker)
  if (formattedTime) {
    hasContext = true
    contextBlock = `\n\n[CURRENT STORY TIME]\n${formattedTime}` + contextBlock
  }

  // Combine prompt with context
  if (hasContext) {
    basePrompt += '\n\n───────────────────────────────────────\n'
    basePrompt += 'WORLD STATE (for your reference, do not mention directly)'
    basePrompt += contextBlock
    basePrompt += '\n───────────────────────────────────────'
  }

  // Inject chapter summaries if chapters exist
  if (chapters && chapters.length > 0) {
    const chapterSummariesBlock = buildChapterSummariesBlock(chapters, timelineFillResult)
    basePrompt += chapterSummariesBlock
    log('Chapter summaries injected', {
      chapterCount: chapters.length,
      hasTimelineFill: !!timelineFillResult,
      retrievedQA: timelineFillResult?.responses?.length ?? 0,
    })
  }

  // Inject style guidance if available
  if (styleReview && styleReview.phrases.length > 0) {
    const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview)
    basePrompt += styleGuidance
    log('Style guidance injected', { phrasesCount: styleReview.phrases.length })
  }

  return basePrompt
}

/**
 * Build legacy context block when tiered context is not available.
 */
function buildLegacyContextBlock(worldState: WorldStateContext, retrievedContext?: string): string {
  let contextBlock = ''

  // Current location (most important for scene-setting)
  if (worldState.currentLocation) {
    contextBlock += `\n\n[CURRENT LOCATION]\n${worldState.currentLocation.name}`
    if (worldState.currentLocation.description) {
      contextBlock += `\n${worldState.currentLocation.description}`
    }
  }

  // Characters currently present or known (excluding protagonist)
  const activeChars = worldState.characters.filter(
    (c) => c.status === 'active' && c.relationship !== 'self',
  )
  if (activeChars.length > 0) {
    contextBlock += '\n\n[KNOWN CHARACTERS]'
    for (const char of activeChars) {
      contextBlock += `\n• ${char.name}`
      if (char.relationship) contextBlock += ` (${char.relationship})`
      if (char.description) contextBlock += ` - ${char.description}`
      if (char.traits && char.traits.length > 0) {
        contextBlock += ` [${char.traits.join(', ')}]`
      }
    }
  }

  // Inventory (what the player has available)
  const inventory = worldState.items.filter((i) => i.location === 'inventory')
  if (inventory.length > 0) {
    const inventoryStr = inventory
      .map((item) => {
        let str = item.name
        if (item.quantity > 1) str += ` (×${item.quantity})`
        if (item.equipped) str += ' [equipped]'
        return str
      })
      .join(', ')
    contextBlock += `\n\n[INVENTORY]\n${inventoryStr}`
  }

  // Active quests and story threads
  const activeQuests = worldState.storyBeats.filter(
    (b) => b.status === 'active' || b.status === 'pending',
  )
  if (activeQuests.length > 0) {
    contextBlock += '\n\n[ACTIVE THREADS]'
    for (const quest of activeQuests) {
      contextBlock += `\n• ${quest.title}`
      if (quest.description) contextBlock += `: ${quest.description}`
    }
  }

  // Previously visited locations (for geographic context)
  const visitedLocations = worldState.locations.filter((l) => l.visited && !l.current)
  if (visitedLocations.length > 0) {
    contextBlock += `\n\n[PLACES VISITED]\n${visitedLocations.map((l) => l.name).join(', ')}`
  }

  // Add retrieved context from memory system
  if (retrievedContext) {
    contextBlock += retrievedContext
  }

  return contextBlock
}
