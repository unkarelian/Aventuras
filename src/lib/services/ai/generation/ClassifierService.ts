/**
 * Classifier Service
 *
 * Extracts world state from narrative responses (characters, locations, items, story beats).
 * Uses the Vercel AI SDK for structured output with Zod schema validation.
 *
 * NOTE: For classifier output types (CharacterUpdate, NewCharacter, etc.),
 * import directly from '$lib/services/ai/sdk/schemas/classifier'.
 */

import type {
  Story,
  StoryEntry,
  Character,
  Location,
  Item,
  StoryBeat,
  TimeTracker,
} from '$lib/types'
import { promptService, type PromptContext } from '$lib/services/prompts'
import { createLogger } from '../core/config'
import { generateStructured } from '../sdk/generate'
import { classificationResultSchema, type ClassificationResult } from '../sdk/schemas/classifier'

const log = createLogger('Classifier')

/**
 * Context for classification.
 */
export interface ClassificationContext {
  storyId: string
  story: Story
  narrativeResponse: string
  userAction: string
  existingCharacters: Character[]
  existingLocations: Location[]
  existingItems: Item[]
  existingStoryBeats: StoryBeat[]
}

/**
 * Service that classifies narrative responses to extract world state changes.
 */
export class ClassifierService {
  private presetId: string
  private chatHistoryTruncation: number

  constructor(presetId: string = 'classification', chatHistoryTruncation: number = 100) {
    this.presetId = presetId
    this.chatHistoryTruncation = chatHistoryTruncation
  }

  /**
   * Classify a narrative response to extract world state changes.
   */
  async classify(
    context: ClassificationContext,
    visibleEntries?: StoryEntry[],
    currentStoryTime?: TimeTracker | null,
  ): Promise<ClassificationResult> {
    log('classify', {
      narrativeLength: context.narrativeResponse.length,
      existingCharacters: context.existingCharacters.length,
      existingLocations: context.existingLocations.length,
      existingItems: context.existingItems.length,
      existingStoryBeats: context.existingStoryBeats.length,
    })

    const mode = context.story.mode ?? 'adventure'
    const pov = context.story.settings?.pov ?? 'second'
    const tense = context.story.settings?.tense ?? 'present'
    const protagonist = context.existingCharacters.find((c) => c.relationship === 'self')

    // Build prompt context
    const promptContext: PromptContext = {
      mode,
      pov,
      tense,
      protagonistName: protagonist?.name ?? 'the protagonist',
      genre: context.story.genre ?? undefined,
    }

    // Format existing entities for the prompt
    const existingCharacters = this.formatExistingCharacters(context.existingCharacters)
    const existingLocations = context.existingLocations.map((l) => l.name).join(', ') || '(none)'
    const existingItems = context.existingItems.map((i) => i.name).join(', ') || '(none)'
    const existingBeats = this.formatExistingBeats(context.existingStoryBeats)

    // Build chat history block if entries provided
    const chatHistoryBlock = visibleEntries
      ? this.buildChatHistoryBlock(visibleEntries, currentStoryTime)
      : ''

    // Build time info
    const currentTimeInfo = currentStoryTime
      ? `Current story time: Year ${currentStoryTime.years}, Day ${currentStoryTime.days}, ${String(currentStoryTime.hours).padStart(2, '0')}:${String(currentStoryTime.minutes).padStart(2, '0')}`
      : ''

    // Get prompts
    const system = promptService.renderPrompt('classifier', promptContext)
    const prompt = promptService.renderUserPrompt('classifier', promptContext, {
      genre: context.story.genre ? `Genre: ${context.story.genre}` : '',
      mode,
      entityCounts: `${context.existingCharacters.length} characters, ${context.existingLocations.length} locations, ${context.existingItems.length} items`,
      currentTimeInfo,
      chatHistoryBlock,
      inputLabel: mode === 'creative-writing' ? 'Author Direction' : 'Player Action',
      userAction: context.userAction,
      narrativeResponse: context.narrativeResponse,
      existingCharacters,
      existingLocations,
      existingItems,
      existingBeats,
      storyBeatTypes: 'milestone, quest, revelation, event, plot_point',
      itemLocationOptions: 'inventory, worn, ground, or specific location name',
      defaultItemLocation: 'inventory',
      sceneLocationDesc: 'Name of current location if identifiable, null otherwise',
    })

    try {
      const result = await generateStructured(
        {
          presetId: this.presetId,
          schema: classificationResultSchema,
          system,
          prompt,
        },
        'classifier',
      )

      log('classify complete', {
        characterUpdates: result.entryUpdates.characterUpdates.length,
        newCharacters: result.entryUpdates.newCharacters.length,
        locationUpdates: result.entryUpdates.locationUpdates.length,
        newLocations: result.entryUpdates.newLocations.length,
        itemUpdates: result.entryUpdates.itemUpdates.length,
        newItems: result.entryUpdates.newItems.length,
        storyBeatUpdates: result.entryUpdates.storyBeatUpdates.length,
        newStoryBeats: result.entryUpdates.newStoryBeats.length,
        timeProgression: result.scene.timeProgression,
      })

      return result
    } catch (error) {
      log('classify failed', error)
      // Return empty result on failure
      return {
        entryUpdates: {
          characterUpdates: [],
          locationUpdates: [],
          itemUpdates: [],
          storyBeatUpdates: [],
          newCharacters: [],
          newLocations: [],
          newItems: [],
          newStoryBeats: [],
        },
        scene: {
          currentLocationName: null,
          presentCharacterNames: [],
          timeProgression: 'none',
        },
      }
    }
  }

  /**
   * Format existing characters for the prompt.
   */
  private formatExistingCharacters(characters: Character[]): string {
    if (characters.length === 0) return '(none)'

    return characters
      .map((c) => {
        let entry = `- ${c.name}`
        if (c.relationship) entry += ` (${c.relationship})`
        if (c.status && c.status !== 'active') entry += ` [${c.status}]`
        if (c.visualDescriptors && Object.keys(c.visualDescriptors).length > 0) {
          entry += `\n  Appearance: ${this.formatVisualDescriptors(c.visualDescriptors)}`
        }
        return entry
      })
      .join('\n')
  }

  /**
   * Format visual descriptors object into a readable string.
   */
  private formatVisualDescriptors(descriptors: Character['visualDescriptors']): string {
    if (!descriptors) return ''

    const parts: string[] = []
    if (descriptors.face) parts.push(`Face: ${descriptors.face}`)
    if (descriptors.hair) parts.push(`Hair: ${descriptors.hair}`)
    if (descriptors.eyes) parts.push(`Eyes: ${descriptors.eyes}`)
    if (descriptors.build) parts.push(`Build: ${descriptors.build}`)
    if (descriptors.clothing) parts.push(`Clothing: ${descriptors.clothing}`)
    if (descriptors.accessories) parts.push(`Accessories: ${descriptors.accessories}`)
    if (descriptors.distinguishing) parts.push(`Distinguishing: ${descriptors.distinguishing}`)

    return parts.join(', ')
  }

  /**
   * Format existing story beats for the prompt.
   */
  private formatExistingBeats(beats: StoryBeat[]): string {
    const activeBeats = beats.filter((b) => b.status === 'active' || b.status === 'pending')
    if (activeBeats.length === 0) return '(none)'

    return activeBeats
      .map((b) => {
        let entry = `- "${b.title}" [${b.status}]`
        if (b.description) entry += `: ${b.description}`
        return entry
      })
      .join('\n')
  }

  /**
   * Build chat history block for context.
   */
  private buildChatHistoryBlock(entries: StoryEntry[], _currentTime?: TimeTracker | null): string {
    if (entries.length === 0) return ''

    const recentEntries = entries.slice(-this.chatHistoryTruncation)

    const formatted = recentEntries
      .map((e) => {
        const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATIVE]'
        let timeInfo = ''
        if (e.metadata?.timeStart) {
          const t = e.metadata.timeStart
          timeInfo = ` (at Y${t.years}D${t.days} ${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')})`
        }
        return `${prefix}${timeInfo} ${e.content.slice(0, 500)}${e.content.length > 500 ? '...' : ''}`
      })
      .join('\n\n')

    return `## Recent Chat History\n${formatted}\n`
  }
}
