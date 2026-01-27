import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import { promptService, type PromptContext, type StoryMode, type POV, type Tense } from '$lib/services/prompts';
import { ClassifierService, type ClassificationResult, type ClassificationContext, type ClassificationChatEntry } from './generation/ClassifierService';
import { MemoryService, type ChapterAnalysis, type ChapterSummary, type RetrievalDecision, DEFAULT_MEMORY_CONFIG } from './generation/MemoryService';
import type { StorySuggestion, SuggestionsResult } from './generation/SuggestionsService';
import type { ActionChoice, ActionChoicesResult } from './generation/ActionChoicesService';
import { StyleReviewerService, type StyleReviewResult } from './generation/StyleReviewerService';
import { LoreManagementService, type LoreManagementSettings } from './lorebook/LoreManagementService';
import { AgenticRetrievalService, type AgenticRetrievalSettings, type AgenticRetrievalResult } from './retrieval/AgenticRetrievalService';
import { TimelineFillService, type TimelineFillSettings, type TimelineFillResult } from './retrieval/TimelineFillService';
import { ContextBuilder, type ContextResult, type ContextConfig, DEFAULT_CONTEXT_CONFIG } from './generation/ContextBuilder';
import { EntryRetrievalService, type EntryRetrievalResult, type ActivationTracker, getEntryRetrievalConfigFromSettings } from './retrieval/EntryRetrievalService';
import { ImageGenerationService, type ImageGenerationContext } from './image/ImageGenerationService';
import { inlineImageService, type InlineImageContext } from './image/InlineImageService';
import { TranslationService, type TranslationResult, type UITranslationItem } from './utils/TranslationService';
import { buildExtraBody } from './core/requestOverrides';
import type { Message, StreamChunk } from './core/types';
import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, MemoryConfig, Entry, LoreManagementResult, TimeTracker } from '$lib/types';
import { createLogger, getContextConfig } from './core/config';
import { OpenAIProvider } from './core/OpenAIProvider';

// Import from new modules
import { serviceFactory } from './core/factory';
import {
  formatStoryTime,
  buildPrimingMessage,
  buildChapterSummariesBlock,
  buildSystemPrompt,
  type WorldStateContext
} from './prompts/systemBuilder';

const log = createLogger('AIService');

interface WorldState extends WorldStateContext {
  memoryConfig?: MemoryConfig;
  lorebookEntries?: Entry[];
}

class AIService {
  /**
   * Get a provider configured for the main narrative generation.
   * Delegates to ServiceFactory.
   */
  private getProvider() {
    return serviceFactory.getMainProvider();
  }

  /**
   * Get a provider configured for a specific profile.
   * Delegates to ServiceFactory.
   */
  getProviderForProfile(profileId: string | null) {
    return serviceFactory.getProviderForProfile(profileId);
  }

  async generateResponse(
    entries: StoryEntry[],
    worldState: WorldState,
    story?: Story | null
  ): Promise<string> {
    log('generateResponse called', {
      entriesCount: entries.length,
      storyId: story?.id,
      templateId: story?.templateId,
    });

    const provider = this.getProvider();
    const mode = story?.mode || 'adventure';

    // Build the system prompt with world state context
    const pov = story?.settings?.pov ?? (mode === 'creative-writing' ? 'third' : 'first');
    // For creative-writing mode, respect the user's POV selection directly
    // For adventure mode, remap first->second (player as "you"), keep third as third
    const promptPov = mode === 'creative-writing'
      ? pov
      : (pov === 'third' ? 'third' : 'second');
    const tense = story?.settings?.tense ?? (mode === 'creative-writing' ? 'past' : 'present');
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    const protagonistName = protagonist?.name || 'the protagonist';
    const visualProseMode = story?.settings?.visualProseMode ?? false;
    const systemPrompt = buildSystemPrompt(worldState, {
      templateId: story?.templateId,
      mode,
      pov: promptPov,
      tense,
      timeTracker: story?.timeTracker,
      genre: story?.genre,
      settingDescription: story?.description,
      tone: story?.settings?.tone,
      themes: story?.settings?.themes,
      visualProseMode,
    });
    log('System prompt built, length:', systemPrompt.length, 'mode:', mode, 'pov:', promptPov, 'tense:', tense, 'genre:', story?.genre, 'tone:', story?.settings?.tone, 'visualProseMode:', visualProseMode);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const primingMessage = buildPrimingMessage(mode, promptPov, tense, protagonistName);
    messages.push({ role: 'user', content: primingMessage });

    // Add recent entries as conversation history
    const contextConfig = getContextConfig();
    const recentEntries = entries.slice(-contextConfig.recentEntriesForNarrative);
    for (const entry of recentEntries) {
      if (entry.type === 'user_action') {
        messages.push({ role: 'user', content: entry.content });
      } else if (entry.type === 'narration') {
        messages.push({ role: 'assistant', content: entry.content });
      }
    }

    const extraBody = buildExtraBody({
      manualMode: settings.advancedRequestSettings.manualMode,
      manualBody: settings.apiSettings.manualBody,
      reasoningEffort: settings.apiSettings.reasoningEffort,
      providerOnly: settings.apiSettings.providerOnly,
      baseProvider: { order: ['z-ai'], require_parameters: false },
    });

    log('Messages built:', {
      totalMessages: messages.length,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      reasoningEffort: settings.apiSettings.reasoningEffort,
    });

    const response = await provider.generateResponse({
      messages,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      extraBody,
    });

    log('Response received, length:', response.content.length);
    return response.content;
  }

  async *streamResponse(
    entries: StoryEntry[],
    worldState: WorldState,
    story?: Story | null,
    useTieredContext = true,
    styleReview?: StyleReviewResult | null,
    retrievedChapterContext?: string | null,
    signal?: AbortSignal,
    timelineFillResult?: TimelineFillResult | null
  ): AsyncIterable<StreamChunk> {
    log('streamResponse called', {
      entriesCount: entries.length,
      storyId: story?.id,
      templateId: story?.templateId,
      mode: story?.mode,
      useTieredContext,
      hasChapters: (worldState.chapters?.length ?? 0) > 0,
      hasRetrievedContext: !!retrievedChapterContext,
      hasTimelineFill: !!timelineFillResult,
      worldState: {
        characters: worldState.characters.length,
        locations: worldState.locations.length,
        items: worldState.items.length,
        storyBeats: worldState.storyBeats.length,
        currentLocation: worldState.currentLocation?.name,
      },
    });

    const provider = this.getProvider();
    const mode = story?.mode || 'adventure';

    // Extract user's last input for tiered context building
    const lastUserEntry = entries.findLast(e => e.type === 'user_action');
    const userInput = lastUserEntry?.content || '';

    // Build tiered context if enabled
    // Note: Lorebook entry retrieval is done in ActionInput (parallel with memory retrieval)
    // and passed via retrievedChapterContext parameter
    let tieredContextBlock: string | undefined;

    if (useTieredContext && userInput) {
      try {
        // Build world state context (characters, locations, items, story beats)
        // Lorebook context is already included in retrievedChapterContext from ActionInput
        const tieredContextConfig = getContextConfig();
        const contextResult = await this.buildTieredContext(
          worldState,
          userInput,
          entries.slice(-tieredContextConfig.recentEntriesForTiered),
          retrievedChapterContext ?? undefined
        );
        tieredContextBlock = contextResult.contextBlock;
        log('Tiered context built', {
          tier1: contextResult.tier1.length,
          tier2: contextResult.tier2.length,
          tier3: contextResult.tier3.length,
          blockLength: tieredContextBlock.length,
        });
      } catch (error) {
        log('Tiered context building failed, falling back to legacy', error);
        // Fall back to legacy context building
      }
    }

    // Build the system prompt with world state context
    const pov = story?.settings?.pov ?? (mode === 'creative-writing' ? 'third' : 'first');
    // For creative-writing mode, respect the user's POV selection directly
    // For adventure mode, remap first->second (player as "you"), keep third as third
    const promptPov = mode === 'creative-writing'
      ? pov
      : (pov === 'third' ? 'third' : 'second');
    const tense = story?.settings?.tense ?? (mode === 'creative-writing' ? 'past' : 'present');
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    const protagonistName = protagonist?.name || 'the protagonist';
    const visualProseMode = story?.settings?.visualProseMode ?? false;

    // Build system prompt with all context (chapters, style review, tiered context)
    const systemPrompt = buildSystemPrompt(worldState, {
      templateId: story?.templateId,
      mode,
      tieredContextBlock,
      pov: promptPov,
      tense,
      timeTracker: story?.timeTracker,
      genre: story?.genre,
      settingDescription: story?.description,
      tone: story?.settings?.tone,
      themes: story?.settings?.themes,
      visualProseMode,
      styleReview,
      chapters: worldState.chapters,
      timelineFillResult,
    });

    log('System prompt built, length:', systemPrompt.length, 'mode:', mode, 'pov:', promptPov, 'tense:', tense);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const primingMessage = buildPrimingMessage(mode, promptPov, tense, protagonistName);
    messages.push({ role: 'user', content: primingMessage });

    // Add ALL visible entries as conversation history
    // These are entries that have NOT been summarized into chapters
    // Per design doc section 3.1.2: only non-summarized entries are in direct context
    for (const entry of entries) {
      if (entry.type === 'user_action') {
        messages.push({ role: 'user', content: entry.content });
      } else if (entry.type === 'narration') {
        messages.push({ role: 'assistant', content: entry.content });
      }
    }
    log('Conversation history built', { visibleEntries: entries.length });

    const extraBody = buildExtraBody({
      manualMode: settings.advancedRequestSettings.manualMode,
      manualBody: settings.apiSettings.manualBody,
      reasoningEffort: settings.apiSettings.reasoningEffort,
      providerOnly: settings.apiSettings.providerOnly,
      baseProvider: { order: ['z-ai'], require_parameters: false },
    });

    log('Starting stream with', {
      totalMessages: messages.length,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      reasoningEffort: settings.apiSettings.reasoningEffort,
    });

    // Debug: Log message roles to verify correct format
    log('Message roles:', messages.map(m => ({ role: m.role, contentPreview: m.content.substring(0, 100) + '...' })));

    let chunkCount = 0;
    let totalContent = 0;

    for await (const chunk of provider.streamResponse({
      messages,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      extraBody,
      signal,
    })) {
      chunkCount++;
      totalContent += chunk.content.length;
      if (chunkCount <= 3 || chunk.done) {
        log('Stream chunk', { chunkCount, contentLength: chunk.content.length, done: chunk.done });
      }
      yield chunk;
    }

    log('Stream complete', { totalChunks: chunkCount, totalContentLength: totalContent });
  }

  /**
   * Classify a narrative response to extract world state changes.
   * This is Phase 3 of the processing pipeline per design doc.
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
      responseLength: narrativeResponse.length,
      userActionLength: userAction.length,
      genre: story?.genre,
      visibleEntriesCount: visibleEntries?.length ?? 0,
      currentStoryTime,
    });

    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('classifier'), 'Classifier').profileId);
    const classifier = new ClassifierService(
      provider,
      settings.getServicePresetId('classifier'),
      settings.systemServicesSettings.classifier.chatHistoryTruncation ?? 100
    );

    // Build chat history from visible entries with time metadata
    const chatHistory: ClassificationChatEntry[] = (visibleEntries ?? [])
      .filter(e => e.type === 'user_action' || e.type === 'narration')
      .map(e => ({
        role: e.type === 'user_action' ? 'user' as const : 'assistant' as const,
        content: e.content,
        timeStart: e.metadata?.timeStart ?? null,
        timeEnd: e.metadata?.timeEnd ?? null,
      }));

    const context: ClassificationContext = {
      narrativeResponse,
      userAction,
      existingCharacters: worldState.characters,
      existingLocations: worldState.locations,
      existingItems: worldState.items,
      existingStoryBeats: worldState.storyBeats,
      genre: story?.genre ?? null,
      storyMode: story?.mode ?? 'adventure',
      chatHistory,
      currentStoryTime,
    };

    const result = await classifier.classify(context);
    log('classifyResponse complete', {
      newCharacters: result.entryUpdates.newCharacters.length,
      newLocations: result.entryUpdates.newLocations.length,
      newItems: result.entryUpdates.newItems.length,
      newStoryBeats: result.entryUpdates.newStoryBeats.length,
    });

    return result;
  }

  /**
   * Generate story direction suggestions for creative writing mode.
   * Per design doc section 4.2: Suggestions System
   * @param promptContext - Complete story context for macro expansion (preferred)
   * @param pov - Point of view (deprecated, use promptContext)
   * @param tense - Tense (deprecated, use promptContext)
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
   * Displayed after narration to give the player clear options.
   * @param entries - Recent story entries
   * @param worldState - Current world state (characters, locations, items, story beats)
   * @param narrativeResponse - The latest narrative response
   * @param lorebookEntries - Active lorebook entries
   * @param promptContext - Complete story context for macro expansion
   * @param pov - Point of view (deprecated, use promptContext)
   */
  async generateActionChoices(
    entries: StoryEntry[],
    worldState: WorldState,
    narrativeResponse: string,
    lorebookEntries?: Entry[],
    promptContext?: PromptContext,
    pov?: 'first' | 'second' | 'third'
  ): Promise<ActionChoicesResult> {
    log('generateActionChoices called', {
      entriesCount: entries.length,
      narrativeLength: narrativeResponse.length,
      hasPromptContext: !!promptContext,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    const actionChoicesService = serviceFactory.createActionChoicesService();
    return await actionChoicesService.generateChoices(entries, worldState, narrativeResponse, lorebookEntries, promptContext, pov);
  }

  /**
   * Analyze narration entries for style issues (overused phrases, etc.).
   * Runs in background every N messages to provide writing guidance.
   * @param entries - Story entries to analyze
   * @param mode - Story mode (affects prompt context defaults)
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
   */
  async analyzeStyle(entries: StoryEntry[], mode: StoryMode = 'adventure', pov?: POV, tense?: Tense): Promise<StyleReviewResult> {
    log('analyzeStyle called', { entriesCount: entries.length, mode });

    const styleReviewerService = serviceFactory.createStyleReviewerService();
    return await styleReviewerService.analyzeStyle(entries, mode, pov, tense);
  }

  /**
   * Analyze if a new chapter should be created based on token count.
   * Per design doc section 3.1.2: Auto-Summarization
   * @param entries - Story entries to analyze
   * @param lastChapterEndIndex - Index of the last chapter end
   * @param config - Memory configuration
   * @param tokensOutsideBuffer - Token count outside the buffer
   * @param mode - Story mode (affects prompt context defaults)
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
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
    log('analyzeForChapter called', {
      entriesCount: entries.length,
      lastChapterEndIndex,
      tokensOutsideBuffer,
      mode,
    });

    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('memory'), 'Memory').profileId);
    const memory = new MemoryService(provider, settings.getServicePresetId('memory'));
    return await memory.analyzeForChapter(entries, lastChapterEndIndex, config, tokensOutsideBuffer, mode, pov, tense);
  }

  /**
   * Generate a summary and metadata for a chapter.
   * @param entries - The entries to summarize
   * @param previousChapters - Previous chapter summaries for context (optional)
   * @param mode - Story mode (affects prompt context defaults)
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
   */
  async summarizeChapter(entries: StoryEntry[], previousChapters?: Chapter[], mode: StoryMode = 'adventure', pov?: POV, tense?: Tense): Promise<ChapterSummary> {
    log('summarizeChapter called', { entriesCount: entries.length, previousChaptersCount: previousChapters?.length ?? 0, mode });

    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('memory'), 'Memory').profileId);
    const memory = new MemoryService(provider, settings.getServicePresetId('memory'));
    return await memory.summarizeChapter(entries, previousChapters, mode, pov, tense);
  }

  /**
   * Resummarize an existing chapter (excludes its own old summary and later chapters)
   * @param chapter - The chapter to resummarize
   * @param entries - The entries in this chapter
   * @param allChapters - All chapters in the story
   * @param mode - Story mode (affects prompt context defaults)
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
   */
  async resummarizeChapter(
    chapter: Chapter,
    entries: StoryEntry[],
    allChapters: Chapter[],
    mode: StoryMode = 'adventure',
    pov?: POV,
    tense?: Tense
  ): Promise<ChapterSummary> {
    log('resummarizeChapter called', { chapterId: chapter.id, chapterNumber: chapter.number, mode });

    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('memory'), 'Memory').profileId);
    const memory = new MemoryService(provider, settings.getServicePresetId('memory'));
    return await memory.resummarizeChapter(chapter, entries, allChapters, mode, pov, tense);
  }

  /**
   * Decide which chapters are relevant for the current context.
   * Per design doc section 3.1.3: Retrieval Flow
   * @param userInput - User's current input/action
   * @param recentEntries - Recent story entries for context
   * @param chapters - All chapters in the story
   * @param config - Memory configuration
   * @param mode - Story mode (affects prompt context defaults)
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
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
    log('decideRetrieval called', {
      userInputLength: userInput.length,
      recentEntriesCount: recentEntries.length,
      chaptersCount: chapters.length,
      mode,
    });

    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('memory'), 'Memory').profileId);
    const memory = new MemoryService(provider, settings.getServicePresetId('memory'));
    return await memory.decideRetrieval(userInput, recentEntries, chapters, config, mode, pov, tense);
  }

  /**
   * Build context block from retrieved chapters for injection into narrator prompt.
   */
  buildRetrievedContextBlock(
    chapters: Chapter[],
    decision: RetrievalDecision
  ): string {
    const memory = new MemoryService(null as any); // Only using static method
    return memory.buildRetrievedContextBlock(chapters, decision);
  }

  /**
   * Build tiered context using the ContextBuilder.
   * Per design doc section 3.2.3: Tiered Injection
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

    let provider: OpenAIProvider | null = null;
    try {
      provider = this.getProvider();
    } catch {
      // Provider not available (no API key), will skip Tier 3
      log('No provider available, skipping Tier 3 LLM selection');
    }

    const contextBuilder = new ContextBuilder(provider, config);
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
   * Per design doc section 3.2.3: Tiered Injection for Entries
   *
   * @param entries - Lorebook entries to consider
   * @param userInput - The user's action/input
   * @param recentStoryEntries - Recent story entries for context
   * @param liveState - Live-tracked characters, locations, items (become Tier 1)
   * @param activationTracker - Optional tracker for entry stickiness
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
    let provider: OpenAIProvider | null = null;
    if (config.enableLLMSelection) {
      try {
        provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('entryRetrieval'), 'Entry Retrieval').profileId);
      } catch {
        log('No provider available, skipping Tier 3 LLM selection for entries');
      }
    }

    const entryService = new EntryRetrievalService(provider, config, settings.getServicePresetId('entryRetrieval'));
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
   * Per design doc section 3.4: Lore Management Mode
   * This is an on-demand agentic system that reviews and updates lorebook entries.
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
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
    log('runLoreManagement called', {
      storyId,
      branchId,
      entriesCount: entries.length,
      recentMessagesCount: recentMessages.length,
      chaptersCount: chapters.length,
    });

    const loreManagementSettings = settings.systemServicesSettings.loreManagement;
    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('loreManagement'), 'Lore Manager').profileId);
    const loreManager = new LoreManagementService(
      provider,
      settings.getServicePresetId('loreManagement'),
      loreManagementSettings.maxIterations
    );

    return await loreManager.runSession({
      storyId,
      branchId,
      entries,
      recentMessages,
      chapters,
      ...callbacks,
    }, mode, pov, tense);
  }

  /**
   * Run agentic retrieval to gather context for the current situation.
   * Per design doc section 3.1.4: Agentic Retrieval (Optional)
   * Used for long stories or complex queries where static retrieval is insufficient.
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
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
    log('runAgenticRetrieval called', {
      userInputLength: userInput.length,
      recentEntriesCount: recentEntries.length,
      chaptersCount: chapters.length,
      entriesCount: entries.length,
    });

    const agenticRetrievalSettings = settings.systemServicesSettings.agenticRetrieval;
    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('agenticRetrieval'), 'Agentic Retrieval').profileId);
    const retrieval = new AgenticRetrievalService(
      provider,
      settings.getServicePresetId('agenticRetrieval'),
      agenticRetrievalSettings.maxIterations
    );

    return await retrieval.runRetrieval(
      { userInput, recentEntries, chapters, entries },
      onQueryChapter,
      onQueryChapters,
      signal,
      mode,
      pov,
      tense
    );
  }

  /**
   * Determine if agentic retrieval should be used based on timeline fill mode.
   * Returns true if timeline fill is enabled and mode is set to 'agentic'.
   */
  shouldUseAgenticRetrieval(chapters: Chapter[]): boolean {
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;

    // If timeline fill is disabled, no retrieval
    if (!timelineFillSettings?.enabled) {
      return false;
    }

    // Check the mode setting (default to 'static' for backwards compatibility)
    const mode = timelineFillSettings.mode ?? 'static';
    return mode === 'agentic';
  }

  /**
   * Format agentic retrieval result for prompt injection.
   */
  formatAgenticRetrievalForPrompt(result: AgenticRetrievalResult): string {
    return AgenticRetrievalService.formatForPromptInjection(result);
  }

  /**
   * Run timeline fill to gather context from past chapters.
   * Per design doc section 3.1.4: Static Retrieval (Default)
   *
   * This is a "one-time" AI call that:
   * 1. Analyzes the current scene and generates targeted queries
   * 2. Executes those queries against chapter content in parallel
   * 3. Returns results for injection into the narrator's prompt
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
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
    log('runTimelineFill called', {
      userInputLength: userInput.length,
      visibleEntriesCount: visibleEntries.length,
      chaptersCount: chapters.length,
      allEntriesCount: allEntries.length,
    });

    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('timelineFill'), 'Timeline Fill').profileId);
    const timelineFill = new TimelineFillService(
      provider,
      settings.getServicePresetId('timelineFill'),
      timelineFillSettings.maxQueries
    );

    return await timelineFill.fillTimeline(
      userInput,
      visibleEntries,
      chapters,
      allEntries,
      signal,
      mode,
      pov,
      tense
    );
  }

  /**
   * Answer a specific chapter question using full chapter content (max 3 chapters).
   * Uses dedicated chapterQuery settings (shared by both static and agentic modes).
   */
  async answerChapterQuestion(
    chapterNumber: number,
    question: string,
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal,
    mode: StoryMode = 'adventure'
  ): Promise<string> {
    const chapterQuerySettings = settings.systemServicesSettings.chapterQuery;
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('chapterQuery'), 'Chapter Query').profileId);
    const timelineFill = new TimelineFillService(
      provider,
      settings.getServicePresetId('chapterQuery'),
      timelineFillSettings.maxQueries,
      {
        model: chapterQuerySettings.model,
        temperature: chapterQuerySettings.temperature,
        reasoningEffort: chapterQuerySettings.reasoningEffort,
        providerOnly: chapterQuerySettings.providerOnly,
        manualBody: chapterQuerySettings.manualBody,
      }
    );
    return await timelineFill.answerQuestionForChapters(
      question,
      [chapterNumber],
      chapters,
      allEntries,
      signal,
      mode
    );
  }

  /**
   * Answer a range question across chapters (max 3 chapters).
   * Uses dedicated chapterQuery settings (shared by both static and agentic modes).
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
    const chapterQuerySettings = settings.systemServicesSettings.chapterQuery;
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    const provider = this.getProviderForProfile(settings.getPresetConfig(settings.getServicePresetId('chapterQuery'), 'Chapter Query').profileId);
    const timelineFill = new TimelineFillService(
      provider,
      settings.getServicePresetId('chapterQuery'),
      timelineFillSettings.maxQueries,
      {
        model: chapterQuerySettings.model,
        temperature: chapterQuerySettings.temperature,
        reasoningEffort: chapterQuerySettings.reasoningEffort,
        providerOnly: chapterQuerySettings.providerOnly,
        manualBody: chapterQuerySettings.manualBody,
      }
    );
    return await timelineFill.answerQuestionForChapterRange(
      question,
      startChapter,
      endChapter,
      chapters,
      allEntries,
      signal,
      mode
    );
  }

  /**
   * Determine if timeline fill should be used for memory retrieval.
   * Uses the mode setting: 'static' (default) or 'agentic'.
   */
  shouldUseTimelineFill(chapters: Chapter[]): boolean {
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;

    // If timeline fill is disabled, don't use it
    if (!timelineFillSettings?.enabled) {
      return false;
    }

    // Check the mode setting (default to 'static' for backwards compatibility)
    const mode = timelineFillSettings.mode ?? 'static';
    return mode === 'static';
  }

  /**
   * Format timeline fill result for prompt injection.
   */
  formatTimelineFillForPrompt(
    chapters: Chapter[],
    result: TimelineFillResult,
    currentEntryPosition: number,
    firstVisibleEntryPosition: number,
    locations?: Location[]
  ): string {
    return TimelineFillService.formatForPromptInjection(
      chapters,
      result,
      currentEntryPosition,
      firstVisibleEntryPosition,
      locations
    );
  }

  /**
   * Check if image generation is enabled and configured.
   */
  isImageGenerationEnabled(): boolean {
    return ImageGenerationService.isEnabled();
  }

/**
   * Generate images for a narrative response.
   * Uses either inline image mode (AI-placed <pic> tags) or analyzed mode (LLM scene analysis).
   * This runs in background and doesn't block the main flow.
   *
   * When translation is enabled:
   * - Inline mode: processes the translated narrative (which should preserve <pic> tags)
   * - Analyzed mode: uses translated narrative for sourceText, but prompts are always in English
   *
   * @param context - The narrative context for image generation
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
        // If translation is enabled, process the translated narrative which should preserve <pic> tags
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
        // Use analyzed image generation (LLM scene analysis)
        // The context already includes translatedNarrative for sourceText extraction
        log('Using analyzed image mode', {
          hasTranslation: !!context.translatedNarrative,
        });
        const preset = settings.getPresetConfig(settings.getServicePresetId('imageGeneration'), 'Image Generation');
        const provider = this.getProviderForProfile(preset.profileId);
        const imageService = new ImageGenerationService(provider, settings.getServicePresetId('imageGeneration'));
        await imageService.generateForNarrative(context);
      }
    } catch (error) {
      log('Image generation failed (non-fatal)', error);
      // Don't throw - image generation failure shouldn't break the main flow
    }
  }
  // ===== Translation Methods =====

  /**
   * Translate narrative content to the target language.
   * Used for post-generation translation of AI responses.
   */
  async translateNarration(
    content: string,
    targetLanguage: string,
    isVisualProse: boolean = false
  ): Promise<TranslationResult> {
    log('translateNarration called', {
      contentLength: content.length,
      targetLanguage,
      isVisualProse,
    });

    const presetId = settings.getServicePresetId('translation:narration');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateNarration(content, targetLanguage, isVisualProse);
  }

  /**
   * Translate user input to English for AI processing.
   * The original input is preserved for display.
   */
  async translateInput(
    content: string,
    sourceLanguage: string
  ): Promise<TranslationResult> {
    log('translateInput called', {
      contentLength: content.length,
      sourceLanguage,
    });

    const presetId = settings.getServicePresetId('translation:input');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateInput(content, sourceLanguage);
  }

  /**
   * Batch translate UI elements (world state names/descriptions).
   */
  async translateUIElements(
    items: UITranslationItem[],
    targetLanguage: string
  ): Promise<UITranslationItem[]> {
    log('translateUIElements called', {
      itemCount: items.length,
      targetLanguage,
    });

    const presetId = settings.getServicePresetId('translation:ui');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateUIElements(items, targetLanguage);
  }

  /**
   * Translate suggestions (creative writing plot suggestions).
   */
  async translateSuggestions<T extends { text: string; type?: string }>(
    suggestions: T[],
    targetLanguage: string
  ): Promise<T[]> {
    log('translateSuggestions called', {
      count: suggestions.length,
      targetLanguage,
    });

    const presetId = settings.getServicePresetId('translation:suggestions');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateSuggestions(suggestions, targetLanguage);
  }

  /**
   * Translate action choices (adventure mode).
   */
  async translateActionChoices<T extends { text: string; type?: string }>(
    choices: T[],
    targetLanguage: string
  ): Promise<T[]> {
    log('translateActionChoices called', {
      count: choices.length,
      targetLanguage,
    });

    const presetId = settings.getServicePresetId('translation:actionChoices');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateActionChoices(choices, targetLanguage);
  }

  /**
   * Translate wizard content (settings, characters, openings).
   */
  async translateWizardContent(
    content: string,
    targetLanguage: string
  ): Promise<TranslationResult> {
    log('translateWizardContent called', {
      contentLength: content.length,
      targetLanguage,
    });

    const presetId = settings.getServicePresetId('translation:wizard');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateWizardContent(content, targetLanguage);
  }

  /**
   * Batch translate wizard content - all fields in one API call.
   * Much more efficient than calling translateWizardContent for each field.
   */
  async translateWizardBatch(
    fields: Record<string, string>,
    targetLanguage: string
  ): Promise<Record<string, string>> {
    log('translateWizardBatch called', {
      fieldCount: Object.keys(fields).length,
      targetLanguage,
    });

    const presetId = settings.getServicePresetId('translation:wizard');
    const provider = this.getProviderForProfile(settings.getPresetConfig(presetId, 'Translation').profileId);
    const translationService = new TranslationService(provider, presetId);
    return await translationService.translateWizardBatch(fields, targetLanguage);
  }
}

export const aiService = new AIService();
