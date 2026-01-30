/**
 * AI Service - Main Orchestrator
 *
 * Coordinates AI services for narrative generation, classification, memory, and more.
 *
 * STATUS: PARTIALLY MIGRATED
 * - streamNarrative(), generateNarrative() - WORKING (uses NarrativeService)
 * - generateSuggestions() - WORKING (uses SuggestionsService)
 * - buildTieredContext(), getRelevantLorebookEntries() - WORKING (Tier 1&2)
 * - Other AI-calling methods - STUBBED (awaiting migration)
 */

import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import type { PromptContext, StoryMode, POV, Tense } from '$lib/services/prompts';
import { ClassifierService, type ClassificationContext } from './generation/ClassifierService';
import type { ClassificationResult } from './sdk/schemas/classifier';
import { MemoryService, type RetrievalContext } from './generation/MemoryService';
import type { ChapterAnalysis, ChapterSummaryResult, RetrievalDecision } from './sdk/schemas/memory';
import type { StorySuggestion, SuggestionsResult } from './generation/SuggestionsService';
import type { ActionChoice, ActionChoicesResult } from './generation/ActionChoicesService';
import type { StyleReviewResult } from './generation/StyleReviewerService';
import type { AgenticRetrievalResult } from './retrieval/AgenticRetrievalService';
import type { TimelineFillResult } from './retrieval/TimelineFillService';
import { ContextBuilder, type ContextResult, type ContextConfig } from './generation/ContextBuilder';
import { EntryRetrievalService, type EntryRetrievalResult, type ActivationTracker, getEntryRetrievalConfigFromSettings } from './retrieval/EntryRetrievalService';
import { ImageGenerationService, type ImageGenerationContext } from './image/ImageGenerationService';
import { inlineImageService, type InlineImageContext } from './image/InlineImageService';
import type { TranslationResult, UITranslationItem } from './utils/TranslationService';
import type { StreamChunk } from './core/types';
import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, MemoryConfig, Entry, LoreManagementResult, TimeTracker } from '$lib/types';
import { createLogger } from './core/config';
import { serviceFactory } from './core/factory';
import { NarrativeService } from './generation/NarrativeService';
import type { WorldStateContext } from './prompts/systemBuilder';

const log = createLogger('AIService');

interface WorldState extends WorldStateContext {
  memoryConfig?: MemoryConfig;
  lorebookEntries?: Entry[];
}

class AIService {
  private narrativeService: NarrativeService;

  constructor() {
    this.narrativeService = serviceFactory.createNarrativeService();
  }

  /**
   * Generate a complete narrative response (non-streaming).
   */
  async generateNarrative(
    entries: StoryEntry[],
    worldState: WorldState,
    story?: Story | null
  ): Promise<string> {
    return this.narrativeService.generate(entries, worldState, story);
  }

  /**
   * Stream a narrative response.
   * This is the primary method for real-time story generation.
   */
  async *streamNarrative(
    entries: StoryEntry[],
    worldState: WorldState,
    currentStory?: Story | null,
    useTieredContext = true,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    signal?: AbortSignal,
    timelineFillResult?: TimelineFillResult | null
  ): AsyncIterable<StreamChunk> {
    log('streamNarrative called', {
      entriesCount: entries.length,
      useTieredContext,
      hasStyleReview: !!styleReview,
      hasRetrievedContext: !!retrievedChapterContext,
      hasTimelineFill: !!timelineFillResult,
    });

    // Build tiered context if requested
    let tieredContextBlock: string | undefined;
    if (useTieredContext) {
      const lastEntry = entries[entries.length - 1];
      const userInput = lastEntry?.content ?? '';
      const contextResult = await this.buildTieredContext(
        worldState,
        userInput,
        entries,
        retrievedChapterContext ?? undefined
      );
      tieredContextBlock = contextResult.contextBlock;
    }

    // Delegate to NarrativeService
    yield* this.narrativeService.stream(entries, worldState, currentStory, {
      tieredContextBlock,
      styleReview,
      retrievedChapterContext,
      signal,
      timelineFillResult,
    });
  }

  /**
   * Classify a narrative response to extract world state changes.
   */
  async classifyResponse(
    narrativeResponse: string,
    userAction: string,
    worldState: WorldState,
    story?: Story | null,
    visibleEntries?: StoryEntry[],
    currentStoryTime?: TimeTracker | null
  ): Promise<ClassificationResult> {
    log('classifyResponse called', {
      narrativeLength: narrativeResponse.length,
      userActionLength: userAction.length,
      hasStory: !!story,
      hasVisibleEntries: !!visibleEntries,
    });

    if (!story) {
      log('classifyResponse: No story provided, returning empty result');
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
      };
    }

    const classifierService = serviceFactory.createClassifierService();
    const context: ClassificationContext = {
      storyId: story.id,
      story,
      narrativeResponse,
      userAction,
      existingCharacters: worldState.characters,
      existingLocations: worldState.locations,
      existingItems: worldState.items,
      existingStoryBeats: worldState.storyBeats ?? [],
    };

    return classifierService.classify(context, visibleEntries, currentStoryTime);
  }

  /**
   * Generate story direction suggestions for creative writing mode.
   * NOTE: This method WORKS - uses SDK-based SuggestionsService.
   */
  async generateSuggestions(
    entries: StoryEntry[],
    activeThreads: StoryBeat[],
    lorebookEntries?: Entry[],
    promptContext?: PromptContext,
    pov?: POV,
    tense?: Tense
  ): Promise<SuggestionsResult> {
    log('generateSuggestions called', {
      entriesCount: entries.length,
      threadsCount: activeThreads.length,
      hasPromptContext: !!promptContext,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    const suggestionsService = serviceFactory.createSuggestionsService();
    return await suggestionsService.generateSuggestions(entries, activeThreads, lorebookEntries, promptContext, pov, tense);
  }

  /**
   * Generate RPG-style action choices for adventure mode.
   * @throws Error - Service not implemented during SDK migration
   */
  async generateActionChoices(
    entries: StoryEntry[],
    worldState: WorldState,
    narrativeResponse: string,
    lorebookEntries?: Entry[],
    promptContext?: PromptContext,
    pov?: 'first' | 'second' | 'third'
  ): Promise<ActionChoicesResult> {
    throw new Error('AIService.generateActionChoices() not implemented - awaiting SDK migration');
  }

  /**
   * Analyze narration entries for style issues.
   * @throws Error - Service not implemented during SDK migration
   */
  async analyzeStyle(entries: StoryEntry[], mode: StoryMode = 'adventure', pov?: POV, tense?: Tense): Promise<StyleReviewResult> {
    throw new Error('AIService.analyzeStyle() not implemented - awaiting SDK migration');
  }

  /**
   * Analyze if a new chapter should be created.
   */
  async analyzeForChapter(
    entries: StoryEntry[],
    lastChapterEndIndex: number,
    config: MemoryConfig,
    tokensOutsideBuffer: number,
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<ChapterAnalysis> {
    const memoryService = serviceFactory.createMemoryService();
    return memoryService.analyzeForChapter(entries, lastChapterEndIndex, tokensOutsideBuffer, mode, pov, tense);
  }

  /**
   * Generate a summary and metadata for a chapter.
   */
  async summarizeChapter(entries: StoryEntry[], previousChapters?: Chapter[], mode: StoryMode = 'adventure', pov?: POV, tense?: Tense): Promise<ChapterSummaryResult> {
    const memoryService = serviceFactory.createMemoryService();
    return memoryService.summarizeChapter(entries, previousChapters, mode, pov, tense);
  }

  /**
   * Resummarize an existing chapter.
   */
  async resummarizeChapter(
    chapter: Chapter,
    entries: StoryEntry[],
    allChapters: Chapter[],
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<ChapterSummaryResult> {
    const memoryService = serviceFactory.createMemoryService();
    return memoryService.summarizeChapter(entries, allChapters, mode, pov, tense);
  }

  /**
   * Decide which chapters are relevant for the current context.
   */
  async decideRetrieval(
    userInput: string,
    recentEntries: StoryEntry[],
    chapters: Chapter[],
    config: MemoryConfig,
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<RetrievalDecision> {
    const memoryService = serviceFactory.createMemoryService();
    const context: RetrievalContext = {
      userInput,
      recentNarrative: recentEntries.map(e => e.content).join(' '),
      availableChapters: chapters,
    };
    return memoryService.decideRetrieval(context, mode, pov, tense);
  }

  /**
   * Build context block from retrieved chapters.
   * NOTE: This method works - it's just string building.
   */
  buildRetrievedContextBlock(
    chapters: Chapter[],
    decision: RetrievalDecision
  ): string {
    const memory = new MemoryService('memory');
    return memory.buildRetrievedContextBlock(chapters, decision);
  }

  /**
   * Build tiered context using the ContextBuilder.
   * NOTE: Tier 1 & 2 work. Tier 3 (LLM selection) is stubbed.
   */
  async buildTieredContext(
    worldState: WorldState,
    userInput: string,
    recentEntries: StoryEntry[],
    retrievedChapterContext?: string,
    config?: Partial<ContextConfig>
  ): Promise<ContextResult> {
    log('buildTieredContext called', {
      userInputLength: userInput.length,
      recentEntriesCount: recentEntries.length,
      hasRetrievedContext: !!retrievedChapterContext,
    });

    const contextBuilder = new ContextBuilder(config);
    const result = await contextBuilder.buildContext(
      worldState,
      userInput,
      recentEntries,
      retrievedChapterContext
    );

    log('buildTieredContext complete', {
      tier1: result.tier1.length,
      tier2: result.tier2.length,
      tier3: result.tier3.length,
      total: result.all.length,
    });

    return result;
  }

  /**
   * Get relevant lorebook entries using tiered injection.
   * NOTE: Tier 1 & 2 work. Tier 3 (LLM selection) is stubbed.
   */
  async getRelevantLorebookEntries(
    entries: Entry[],
    userInput: string,
    recentStoryEntries: StoryEntry[],
    liveState?: { characters: Character[]; locations: Location[]; items: Item[] },
    activationTracker?: ActivationTracker,
    signal?: AbortSignal
  ): Promise<EntryRetrievalResult> {
    log('getRelevantLorebookEntries called', {
      totalEntries: entries.length,
      userInputLength: userInput.length,
      liveCharacters: liveState?.characters.length ?? 0,
      liveLocations: liveState?.locations.length ?? 0,
      liveItems: liveState?.items.length ?? 0,
      hasActivationTracker: !!activationTracker,
    });

    const config = getEntryRetrievalConfigFromSettings();
    const entryService = new EntryRetrievalService(config, settings.getServicePresetId('entryRetrieval'));
    const result = await entryService.getRelevantEntries(
      entries,
      userInput,
      recentStoryEntries,
      liveState,
      activationTracker,
      signal
    );

    log('getRelevantLorebookEntries complete', {
      tier1: result.tier1.length,
      tier2: result.tier2.length,
      tier3: result.tier3.length,
      total: result.all.length,
    });

    return result;
  }

  /**
   * Run a lore management session.
   * @throws Error - Service not implemented during SDK migration
   */
  async runLoreManagement(
    storyId: string,
    branchId: string | null,
    entries: Entry[],
    recentMessages: StoryEntry[],
    chapters: Chapter[],
    callbacks: {
      onCreateEntry: (entry: Entry) => Promise<void>;
      onUpdateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
      onDeleteEntry: (id: string) => Promise<void>;
      onMergeEntries: (entryIds: string[], mergedEntry: Entry) => Promise<void>;
      onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>;
    },
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<LoreManagementResult> {
    throw new Error('AIService.runLoreManagement() not implemented - awaiting SDK migration');
  }

  /**
   * Run agentic retrieval.
   * @throws Error - Service not implemented during SDK migration
   */
  async runAgenticRetrieval(
    userInput: string,
    recentEntries: StoryEntry[],
    chapters: Chapter[],
    entries: Entry[],
    onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>,
    onQueryChapters?: (startChapter: number, endChapter: number, question: string) => Promise<string>,
    signal?: AbortSignal,
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<AgenticRetrievalResult> {
    throw new Error('AIService.runAgenticRetrieval() not implemented - awaiting SDK migration');
  }

  /**
   * Determine if agentic retrieval should be used.
   */
  shouldUseAgenticRetrieval(chapters: Chapter[]): boolean {
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    if (!timelineFillSettings?.enabled) {
      return false;
    }
    const mode = timelineFillSettings.mode ?? 'static';
    return mode === 'agentic';
  }

  /**
   * Format agentic retrieval result for prompt injection.
   * NOTE: This is just string formatting - works without SDK.
   */
  formatAgenticRetrievalForPrompt(result: AgenticRetrievalResult): string {
    // Return empty since service is stubbed
    return '';
  }

  /**
   * Run timeline fill.
   * @throws Error - Service not implemented during SDK migration
   */
  async runTimelineFill(
    userInput: string,
    visibleEntries: StoryEntry[],
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal,
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<TimelineFillResult> {
    throw new Error('AIService.runTimelineFill() not implemented - awaiting SDK migration');
  }

  /**
   * Answer a specific chapter question.
   * @throws Error - Service not implemented during SDK migration
   */
  async answerChapterQuestion(
    chapterNumber: number,
    question: string,
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal,
    mode: StoryMode = 'adventure'
  ): Promise<string> {
    throw new Error('AIService.answerChapterQuestion() not implemented - awaiting SDK migration');
  }

  /**
   * Answer a range question across chapters.
   * @throws Error - Service not implemented during SDK migration
   */
  async answerChapterRangeQuestion(
    startChapter: number,
    endChapter: number,
    question: string,
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal,
    mode: StoryMode = 'adventure'
  ): Promise<string> {
    throw new Error('AIService.answerChapterRangeQuestion() not implemented - awaiting SDK migration');
  }

  /**
   * Determine if timeline fill should be used.
   */
  shouldUseTimelineFill(chapters: Chapter[]): boolean {
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    if (!timelineFillSettings?.enabled) {
      return false;
    }
    const mode = timelineFillSettings.mode ?? 'static';
    return mode === 'static';
  }

  /**
   * Format timeline fill result for prompt injection.
   * NOTE: This is just string formatting - works without SDK.
   */
  formatTimelineFillForPrompt(
    chapters: Chapter[],
    result: TimelineFillResult,
    currentEntryPosition: number,
    firstVisibleEntryPosition: number,
    locations?: Location[]
  ): string {
    // Return empty since service is stubbed
    return '';
  }

  /**
   * Check if image generation is enabled and configured.
   */
  isImageGenerationEnabled(): boolean {
    return ImageGenerationService.isEnabled();
  }

  /**
   * Generate images for a narrative response.
   * @throws Error - Scene analysis not implemented during SDK migration
   */
  async generateImagesForNarrative(context: ImageGenerationContext): Promise<void> {
    log('generateImagesForNarrative called', {
      storyId: context.storyId,
      entryId: context.entryId,
      narrativeLength: context.narrativeResponse.length,
      hasTranslation: !!context.translatedNarrative,
      translationLanguage: context.translationLanguage,
    });

    if (!this.isImageGenerationEnabled()) {
      log('Image generation not enabled or not configured');
      return;
    }

    // Check if inline image mode is enabled for this story
    const inlineImageMode = story.currentStory?.settings?.inlineImageMode ?? false;

    try {
      if (inlineImageMode) {
        // Use inline image generation (process <pic> tags from AI response)
        // This works without SDK - it just processes tags and calls image providers
        const narrativeToProcess = context.translatedNarrative || context.narrativeResponse;
        log('Using inline image mode', {
          usingTranslated: !!context.translatedNarrative,
        });
        const inlineContext: InlineImageContext = {
          storyId: context.storyId,
          entryId: context.entryId,
          narrativeContent: narrativeToProcess,
          presentCharacters: context.presentCharacters,
        };
        await inlineImageService.processNarrativeForInlineImages(inlineContext);
      } else {
        // Analyzed mode requires LLM scene analysis - stubbed
        throw new Error('Analyzed image mode not implemented - scene analysis awaiting SDK migration');
      }
    } catch (error) {
      log('Image generation failed (non-fatal)', error);
      // Don't throw - image generation failure shouldn't break the main flow
    }
  }

  // ===== Translation Methods (All Stubbed) =====

  /**
   * Translate narrative content.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateNarration(
    content: string,
    targetLanguage: string,
    isVisualProse: boolean = false
  ): Promise<TranslationResult> {
    throw new Error('AIService.translateNarration() not implemented - awaiting SDK migration');
  }

  /**
   * Translate user input to English.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateInput(
    content: string,
    sourceLanguage: string
  ): Promise<TranslationResult> {
    throw new Error('AIService.translateInput() not implemented - awaiting SDK migration');
  }

  /**
   * Batch translate UI elements.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateUIElements(
    items: UITranslationItem[],
    targetLanguage: string
  ): Promise<UITranslationItem[]> {
    throw new Error('AIService.translateUIElements() not implemented - awaiting SDK migration');
  }

  /**
   * Translate suggestions.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateSuggestions<T extends { text: string; type?: string }>(
    suggestions: T[],
    targetLanguage: string
  ): Promise<T[]> {
    throw new Error('AIService.translateSuggestions() not implemented - awaiting SDK migration');
  }

  /**
   * Translate action choices.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateActionChoices<T extends { text: string; type?: string }>(
    choices: T[],
    targetLanguage: string
  ): Promise<T[]> {
    throw new Error('AIService.translateActionChoices() not implemented - awaiting SDK migration');
  }

  /**
   * Translate wizard content.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateWizardContent(
    content: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    throw new Error('AIService.translateWizardContent() not implemented - awaiting SDK migration');
  }

  /**
   * Batch translate wizard content.
   * @throws Error - Service not implemented during SDK migration
   */
  async translateWizardBatch(
    fields: Record<string, string>,
    targetLanguage: string
  ): Promise<Record<string, string>> {
    throw new Error('AIService.translateWizardBatch() not implemented - awaiting SDK migration');
  }
}

export const aiService = new AIService();
