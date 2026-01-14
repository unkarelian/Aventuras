import { settings } from '$lib/stores/settings.svelte';
import { story } from '$lib/stores/story.svelte';
import { OpenAIProvider as OpenAIProvider } from './openrouter';
import { BUILTIN_TEMPLATES } from '$lib/services/templates';
import { promptService, type PromptContext, type StoryMode, type POV, type Tense } from '$lib/services/prompts';
import { ClassifierService, type ClassificationResult, type ClassificationContext, type ClassificationChatEntry } from './classifier';
import { MemoryService, type ChapterAnalysis, type ChapterSummary, type RetrievalDecision, DEFAULT_MEMORY_CONFIG } from './memory';
import { SuggestionsService, type StorySuggestion, type SuggestionsResult } from './suggestions';
import { ActionChoicesService, type ActionChoice, type ActionChoicesResult } from './actionChoices';
import { StyleReviewerService, type StyleReviewResult } from './styleReviewer';
import { LoreManagementService, type LoreManagementSettings } from './loreManagement';
import { AgenticRetrievalService, type AgenticRetrievalSettings, type AgenticRetrievalResult } from './agenticRetrieval';
import { TimelineFillService, type TimelineFillSettings, type TimelineFillResult } from './timelineFill';
import { ContextBuilder, type ContextResult, type ContextConfig, DEFAULT_CONTEXT_CONFIG } from './context';
import { EntryRetrievalService, getEntryRetrievalConfigFromSettings, type EntryRetrievalResult, type ActivationTracker } from './entryRetrieval';
import { ImageGenerationService, type ImageGenerationContext } from './imageGeneration';
import { inlineImageService, type InlineImageContext } from './inlineImageGeneration';
import { buildExtraBody } from './requestOverrides';
import type { Message, GenerationResponse, StreamChunk } from './types';
import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, MemoryConfig, Entry, LoreManagementResult, TimeTracker } from '$lib/types';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[AIService]', ...args);
  }
}

/**
 * Format a TimeTracker into a human-readable string for the narrative prompt.
 * Always returns a value, defaulting to Year 1, Day 1, 0 hours 0 minutes if null.
 */
function formatStoryTime(time: TimeTracker | null | undefined): string {
  const t = time ?? { years: 0, days: 0, hours: 0, minutes: 0 };
  // One-indexed years and days
  const year = t.years + 1;
  const day = t.days + 1;
  return `Year ${year}, Day ${day}, ${t.hours} hours ${t.minutes} minutes`;
}

interface WorldState {
  characters: Character[];
  locations: Location[];
  items: Item[];
  storyBeats: StoryBeat[];
  currentLocation?: Location;
  chapters?: Chapter[];
  memoryConfig?: MemoryConfig;
  lorebookEntries?: Entry[];
}

class AIService {
  /**
   * Get a provider configured for the main narrative generation.
   * Uses the mainNarrativeProfileId to get the correct API credentials.
   */
  private getProvider() {
    const profileId = settings.apiSettings.mainNarrativeProfileId;
    return this.getProviderForProfileId(profileId, 'main narrative');
  }

  /**
   * Get a provider configured for a specific profile.
   * Used by services that have their own profile setting.
   */
  getProviderForProfile(profileId: string | null) {
    const resolvedProfileId = profileId ?? settings.apiSettings.mainNarrativeProfileId;
    return this.getProviderForProfileId(resolvedProfileId);
  }

  private getProviderForProfileId(profileId: string, contextLabel?: string) {
    const apiSettings = settings.getApiSettingsForProfile(profileId);

    log('Getting provider for profile', {
      profileId,
      apiKeyConfigured: !!apiSettings.openaiApiKey,
      context: contextLabel,
    });

    if (!apiSettings.openaiApiKey) {
      if (contextLabel) {
        throw new Error(`No API key configured for ${contextLabel} profile`);
      }
      throw new Error(`No API key configured for profile: ${profileId}`);
    }
    return new OpenAIProvider(apiSettings);
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
    const systemPromptOverride = story?.settings?.systemPromptOverride;
    const pov = story?.settings?.pov ?? (mode === 'creative-writing' ? 'third' : 'first');
    const promptPov = mode === 'creative-writing'
      ? 'third'
      : (pov === 'third' ? 'third' : 'second');
    const tense = story?.settings?.tense ?? (mode === 'creative-writing' ? 'past' : 'present');
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    const protagonistName = protagonist?.name || 'the protagonist';
    const visualProseMode = story?.settings?.visualProseMode ?? false;
    const systemPrompt = this.buildSystemPrompt(worldState, story?.templateId, undefined, mode, undefined, systemPromptOverride, promptPov, tense, story?.timeTracker, story?.genre, story?.description, story?.settings?.tone, story?.settings?.themes, visualProseMode);
    log('System prompt built, length:', systemPrompt.length, 'mode:', mode, 'pov:', promptPov, 'tense:', tense, 'genre:', story?.genre, 'tone:', story?.settings?.tone, 'visualProseMode:', visualProseMode);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const primingMessage = this.buildPrimingMessage(mode, promptPov, tense, protagonistName);
    messages.push({ role: 'user', content: primingMessage });

    // Add recent entries as conversation history
    const recentEntries = entries.slice(-20); // Keep last 20 entries for context
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
      baseProvider: { order: ['z-ai'], require_parameters: true },
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
        const contextResult = await this.buildTieredContext(
          worldState,
          userInput,
          entries.slice(-10), // Recent entries for name matching
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
    const systemPromptOverride = story?.settings?.systemPromptOverride;
    const pov = story?.settings?.pov ?? (mode === 'creative-writing' ? 'third' : 'first');
    const promptPov = mode === 'creative-writing'
      ? 'third'
      : (pov === 'third' ? 'third' : 'second');
    const tense = story?.settings?.tense ?? (mode === 'creative-writing' ? 'past' : 'present');
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    const protagonistName = protagonist?.name || 'the protagonist';
    const visualProseMode = story?.settings?.visualProseMode ?? false;
    let systemPrompt = this.buildSystemPrompt(
      worldState,
      story?.templateId,
      undefined,
      mode,
      tieredContextBlock,
      systemPromptOverride,
      promptPov,
      tense,
      story?.timeTracker,
      story?.genre,
      story?.description,
      story?.settings?.tone,
      story?.settings?.themes,
      visualProseMode
    );

    // Inject chapter summaries if chapters exist
    // Per design doc: summarized entries are excluded from context,
    // but their summaries are included for continuity
    // Timeline fill results (retrieved Q&A) are also included here
    if (worldState.chapters && worldState.chapters.length > 0) {
      const chapterSummariesBlock = this.buildChapterSummariesBlock(worldState.chapters, timelineFillResult);
      systemPrompt += chapterSummariesBlock;
      log('Chapter summaries injected', {
        chapterCount: worldState.chapters.length,
        hasTimelineFill: !!timelineFillResult,
        retrievedQA: timelineFillResult?.responses?.length ?? 0,
      });
    }

    // Inject style guidance if available
    if (styleReview && styleReview.phrases.length > 0) {
      const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview);
      systemPrompt += styleGuidance;
      log('Style guidance injected', { phrasesCount: styleReview.phrases.length });
    }

    log('System prompt built, length:', systemPrompt.length, 'mode:', mode, 'pov:', promptPov, 'tense:', tense);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const primingMessage = this.buildPrimingMessage(mode, promptPov, tense, protagonistName);
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
      baseProvider: { order: ['z-ai'], require_parameters: true },
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.classifier.profileId);
    const classifier = new ClassifierService(provider);

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
   * @param pov - Point of view from story settings
   * @param tense - Tense from story settings
   */
  async generateSuggestions(
    entries: StoryEntry[],
    activeThreads: StoryBeat[],
    genre?: string | null,
    lorebookEntries?: Entry[],
    pov?: POV,
    tense?: Tense
  ): Promise<SuggestionsResult> {
    log('generateSuggestions called', {
      entriesCount: entries.length,
      threadsCount: activeThreads.length,
      genre,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    const provider = this.getProviderForProfile(settings.systemServicesSettings.actionChoices.profileId);
    const suggestions = new SuggestionsService(provider);
    return await suggestions.generateSuggestions(entries, activeThreads, genre, lorebookEntries, pov, tense);
  }

  /**
   * Generate RPG-style action choices for adventure mode.
   * Displayed after narration to give the player clear options.
   */
  async generateActionChoices(
    entries: StoryEntry[],
    worldState: WorldState,
    narrativeResponse: string,
    pov?: 'first' | 'second' | 'third',
    lorebookEntries?: Entry[]
  ): Promise<ActionChoicesResult> {
    log('generateActionChoices called', {
      entriesCount: entries.length,
      narrativeLength: narrativeResponse.length,
      pov,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    const provider = this.getProviderForProfile(settings.systemServicesSettings.suggestions.profileId);
    const actionChoices = new ActionChoicesService(provider);
    return await actionChoices.generateChoices(entries, worldState, narrativeResponse, pov, lorebookEntries);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.styleReviewer.profileId);
    const styleReviewer = new StyleReviewerService(provider);
    return await styleReviewer.analyzeStyle(entries, mode, pov, tense);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.memory.profileId);
    const memory = new MemoryService(provider);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.memory.profileId);
    const memory = new MemoryService(provider);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.memory.profileId);
    const memory = new MemoryService(provider);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.memory.profileId);
    const memory = new MemoryService(provider);
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
        provider = this.getProviderForProfile(settings.systemServicesSettings.entryRetrieval.profileId);
      } catch {
        log('No provider available, skipping Tier 3 LLM selection for entries');
      }
    }

    const entryService = new EntryRetrievalService(provider, config);
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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.loreManagement.profileId);
    const loreManager = new LoreManagementService(provider);

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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.agenticRetrieval.profileId);
    const retrieval = new AgenticRetrievalService(provider);

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

    const provider = this.getProviderForProfile(settings.systemServicesSettings.timelineFill.profileId);
    const timelineFill = new TimelineFillService(provider);

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
    const provider = this.getProviderForProfile(chapterQuerySettings.profileId);
    const timelineFill = new TimelineFillService(provider, {
      model: chapterQuerySettings.model,
      temperature: chapterQuerySettings.temperature,
      reasoningEffort: chapterQuerySettings.reasoningEffort,
      providerOnly: chapterQuerySettings.providerOnly,
      manualBody: chapterQuerySettings.manualBody,
    });
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
    const provider = this.getProviderForProfile(chapterQuerySettings.profileId);
    const timelineFill = new TimelineFillService(provider, {
      model: chapterQuerySettings.model,
      temperature: chapterQuerySettings.temperature,
      reasoningEffort: chapterQuerySettings.reasoningEffort,
      providerOnly: chapterQuerySettings.providerOnly,
      manualBody: chapterQuerySettings.manualBody,
    });
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
   * @param context - The narrative context for image generation
   */
  async generateImagesForNarrative(context: ImageGenerationContext): Promise<void> {
    log('generateImagesForNarrative called', {
      storyId: context.storyId,
      entryId: context.entryId,
      narrativeLength: context.narrativeResponse.length,
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
        log('Using inline image mode');
        const inlineContext: InlineImageContext = {
          storyId: context.storyId,
          entryId: context.entryId,
          narrativeContent: context.narrativeResponse,
          presentCharacters: context.presentCharacters,
        };
        await inlineImageService.processNarrativeForInlineImages(inlineContext);
      } else {
        // Use analyzed image generation (LLM scene analysis)
        log('Using analyzed image mode');
        const provider = this.getProviderForProfile(settings.systemServicesSettings.imageGeneration.promptProfileId);
        const imageService = new ImageGenerationService(provider);
        await imageService.generateForNarrative(context);
      }
    } catch (error) {
      log('Image generation failed (non-fatal)', error);
      // Don't throw - image generation failure shouldn't break the main flow
    }
  }

  /**
   * Build a block containing chapter summaries for injection into the system prompt.
   * Per design doc: summarized entries are excluded from direct context,
   * but their summaries provide narrative continuity.
   */
  private buildChapterSummariesBlock(chapters: Chapter[], timelineFillResult?: TimelineFillResult | null): string {
    if (chapters.length === 0) return '';

    let block = '\n\n<story_history>\n';
    block += '## Previous Chapters\n';
    block += 'The following chapters have occurred earlier in the story. Use them for continuity and context.\n\n';

    for (const chapter of chapters) {
      block += `### Chapter ${chapter.number}`;
      if (chapter.title) {
        block += `: ${chapter.title}`;
      }
      block += '\n';

      // Add time range if available
      const startTime = formatStoryTime(chapter.startTime);
      const endTime = formatStoryTime(chapter.endTime);
      if (startTime && endTime) {
        block += `*Time: ${startTime} → ${endTime}*\n`;
      } else if (startTime) {
        block += `*Time: ${startTime}*\n`;
      }

      block += chapter.summary;
      block += '\n';

      // Add metadata for context
      const metadata: string[] = [];
      if (chapter.characters.length > 0) {
        metadata.push(`Characters: ${chapter.characters.join(', ')}`);
      }
      if (chapter.locations.length > 0) {
        metadata.push(`Locations: ${chapter.locations.join(', ')}`);
      }
      if (chapter.emotionalTone) {
        metadata.push(`Tone: ${chapter.emotionalTone}`);
      }
      if (metadata.length > 0) {
        block += `*${metadata.join(' | ')}*\n`;
      }
      block += '\n';
    }

    // Add retrieved Q&A from timeline fill if available
    if (timelineFillResult && timelineFillResult.responses.length > 0) {
      block += '## Retrieved Context\n';
      block += 'The following information was retrieved from past chapters and is relevant to the current scene:\n\n';

      for (const response of timelineFillResult.responses) {
        const chapterLabel = response.chapterNumbers.length === 1
          ? `Chapter ${response.chapterNumbers[0]}`
          : `Chapters ${response.chapterNumbers.join(', ')}`;

        block += `**${chapterLabel}**\n`;
        block += `Q: ${response.query}\n`;
        block += `A: ${response.answer}\n\n`;
      }
    }

    block += '</story_history>';
    return block;
  }

  /**
   * Build a priming user message to establish the narrator role.
   * This helps models that expect user-first conversation format.
   *
   * Uses the centralized prompt system for macro-based resolution.
   */
  private buildPrimingMessage(
    mode: 'adventure' | 'creative-writing',
    pov?: 'first' | 'second' | 'third',
    tense: 'past' | 'present' = 'present',
    protagonistName: string = 'the protagonist'
  ): string {
    // Build context for the prompt service
    const context: PromptContext = {
      mode,
      pov: pov ?? 'second',
      tense,
      protagonistName,
    };

    // Use the centralized prompt service for priming message
    return promptService.getPrimingMessage(context);
  }

  private buildSystemPrompt(
    worldState: WorldState,
    templateId?: string | null,
    retrievedContext?: string,
    mode: 'adventure' | 'creative-writing' = 'adventure',
    tieredContextBlock?: string,
    systemPromptOverride?: string,
    pov?: 'first' | 'second' | 'third',
    tense: 'past' | 'present' = 'present',
    timeTracker?: TimeTracker | null,
    genre?: string | null,
    settingDescription?: string | null,
    tone?: string | null,
    themes?: string[] | null,
    visualProseMode?: boolean
  ): string {
    const protagonist = worldState.characters.find(c => c.relationship === 'self');
    const protagonistName = protagonist?.name || 'the protagonist';

    // Build prompt context for macro expansion
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
    };

    // Determine the base prompt source
    let basePrompt = '';
    let useLegacyInjection = false;
    let promptSource = 'none';

    // Check if user has customized the global template for this mode
    const globalTemplateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure';
    const hasGlobalTemplateOverride = promptService.hasTemplateOverride(globalTemplateId);

    if (hasGlobalTemplateOverride) {
      // User customized the global template - always prefer that over per-story overrides
      basePrompt = promptService.getPrompt(globalTemplateId, promptContext);
      useLegacyInjection = false;
      promptSource = `promptService:${globalTemplateId} (global override)`;
    } else if (systemPromptOverride) {
      // User/wizard-provided per-story override - check if it has macros
      basePrompt = systemPromptOverride;
      useLegacyInjection = !this.promptHasMacros(basePrompt);
      promptSource = 'systemPromptOverride';
    } else if (templateId && mode === 'adventure') {
      // Template-specific system prompt
      const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);
      if (template?.systemPrompt) {
        basePrompt = template.systemPrompt;
        useLegacyInjection = !this.promptHasMacros(basePrompt);
        promptSource = `BUILTIN_TEMPLATE:${templateId}`;
      }
    }

    // If still no prompt, use the centralized prompt service defaults
    if (!basePrompt) {
      basePrompt = promptService.getPrompt(globalTemplateId, promptContext);
      useLegacyInjection = false;
      promptSource = `promptService:${globalTemplateId} (default)`;
    } else if (useLegacyInjection) {
      // Only expand macros if we're using a legacy prompt (systemPromptOverride or BUILTIN_TEMPLATE)
      basePrompt = promptService.expandMacros(basePrompt, promptContext);
    }

    log('buildSystemPrompt', {
      mode,
      templateId,
      genre,
      tone,
      themes,
      settingDescription: settingDescription?.substring(0, 50),
      hasGlobalTemplateOverride,
      hasSystemPromptOverride: !!systemPromptOverride,
      promptSource,
      basePromptLength: basePrompt.length,
    });

    // Legacy injection: add style and response instructions if not present
    if (useLegacyInjection) {
      basePrompt = this.injectLegacyInstructions(basePrompt, mode, pov, tense, protagonistName);
    }

    // Build world state context block
    let contextBlock = '';
    let hasContext = false;

    // Use tiered context block if provided (from ContextBuilder)
    if (tieredContextBlock) {
      hasContext = true;
      contextBlock = tieredContextBlock;
    } else {
      // Fallback to inline context building (legacy behavior)

      // Current location (most important for scene-setting)
      if (worldState.currentLocation) {
        hasContext = true;
        contextBlock += `\n\n[CURRENT LOCATION]\n${worldState.currentLocation.name}`;
        if (worldState.currentLocation.description) {
          contextBlock += `\n${worldState.currentLocation.description}`;
        }
      }

      // Characters currently present or known (excluding protagonist)
      const activeChars = worldState.characters.filter(c => c.status === 'active' && c.relationship !== 'self');
      if (activeChars.length > 0) {
        hasContext = true;
        contextBlock += '\n\n[KNOWN CHARACTERS]';
        for (const char of activeChars) {
          contextBlock += `\n• ${char.name}`;
          if (char.relationship) contextBlock += ` (${char.relationship})`;
          if (char.description) contextBlock += ` - ${char.description}`;
          if (char.traits && char.traits.length > 0) {
            contextBlock += ` [${char.traits.join(', ')}]`;
          }
        }
      }

      // Inventory (what the player has available)
      const inventory = worldState.items.filter(i => i.location === 'inventory');
      if (inventory.length > 0) {
        hasContext = true;
        const inventoryStr = inventory.map(item => {
          let str = item.name;
          if (item.quantity > 1) str += ` (×${item.quantity})`;
          if (item.equipped) str += ' [equipped]';
          return str;
        }).join(', ');
        contextBlock += `\n\n[INVENTORY]\n${inventoryStr}`;
      }

      // Active quests and story threads
      const activeQuests = worldState.storyBeats.filter(b => b.status === 'active' || b.status === 'pending');
      if (activeQuests.length > 0) {
        hasContext = true;
        contextBlock += '\n\n[ACTIVE THREADS]';
        for (const quest of activeQuests) {
          contextBlock += `\n• ${quest.title}`;
          if (quest.description) contextBlock += `: ${quest.description}`;
        }
      }

      // Previously visited locations (for geographic context)
      const visitedLocations = worldState.locations.filter(l => l.visited && !l.current);
      if (visitedLocations.length > 0) {
        hasContext = true;
        contextBlock += `\n\n[PLACES VISITED]\n${visitedLocations.map(l => l.name).join(', ')}`;
      }

      // Add retrieved context from memory system
      if (retrievedContext) {
        hasContext = true;
        contextBlock += retrievedContext;
      }
    }

    // Add current story time if available
    const formattedTime = formatStoryTime(timeTracker);
    if (formattedTime) {
      hasContext = true;
      contextBlock = `\n\n[CURRENT STORY TIME]\n${formattedTime}` + contextBlock;
    }

    // Combine prompt with context
    if (hasContext) {
      basePrompt += '\n\n───────────────────────────────────────\n';
      basePrompt += 'WORLD STATE (for your reference, do not mention directly)';
      basePrompt += contextBlock;
      basePrompt += '\n───────────────────────────────────────';
    }

// Replace {{visualProseBlock}} placeholder with visual prose instructions if enabled
    if (visualProseMode) {
      const visualProseInstructions = promptService.resolveMacro('visualProseInstructions', promptContext);
      basePrompt = basePrompt.replace(/\{\{visualProseBlock\}\}/g, visualProseInstructions);
    } else {
      // Remove the placeholder when Visual Prose mode is disabled
      basePrompt = basePrompt.replace(/\{\{visualProseBlock\}\}/g, '');
    }

    // Replace {{inlineImageBlock}} placeholder with inline image instructions if enabled
    const inlineImageMode = story.currentStory?.settings?.inlineImageMode ?? false;
    const imageGenEnabled = ImageGenerationService.isEnabled();
    log('Inline image mode check:', { inlineImageMode, imageGenEnabled, storySettings: story.currentStory?.settings });
    if (inlineImageMode && imageGenEnabled) {
      const inlineImageInstructions = promptService.resolveMacro('inlineImageInstructions', promptContext);
      log('Injecting inline image instructions, length:', inlineImageInstructions.length);
      basePrompt = basePrompt.replace(/\{\{inlineImageBlock\}\}/g, inlineImageInstructions);
    } else {
      // Remove the placeholder when Inline Image mode is disabled
      basePrompt = basePrompt.replace(/\{\{inlineImageBlock\}\}/g, '');
    }

    return basePrompt;
  }

  /**
   * Check if a prompt contains macro syntax (for determining legacy vs new mode)
   */
  private promptHasMacros(prompt: string): boolean {
    return prompt.includes('{{styleInstruction}}') ||
           prompt.includes('{{responseInstruction}}') ||
           prompt.includes('{{primingMessage}}');
  }

  /**
   * Inject legacy style and response instructions for prompts without macros
   * (backward compatibility for systemPromptOverride and template prompts)
   */
  private injectLegacyInstructions(
    basePrompt: string,
    mode: 'adventure' | 'creative-writing',
    pov: 'first' | 'second' | 'third' | undefined,
    tense: 'past' | 'present',
    protagonistName: string
  ): string {
    const tenseInstruction = tense === 'past' ? 'PAST TENSE' : 'PRESENT TENSE';
    const tenseRule = tense === 'past' ? 'Use PAST TENSE consistently.' : 'Use PRESENT TENSE consistently.';

    // Add style instruction
    if (mode === 'creative-writing') {
      basePrompt += `\n\n<style_instruction>
Write in ${tenseInstruction}, THIRD PERSON.
Refer to the protagonist as "${protagonistName}" or "they/them".
Example: "${protagonistName} ${tense === 'past' ? 'stepped' : 'steps'} forward..." or "They ${tense === 'past' ? 'examined' : 'examine'} the door..."
</style_instruction>`;
    } else if (pov === 'third') {
      basePrompt += `\n\n<style_instruction>
Write in ${tenseInstruction}, THIRD PERSON.
Refer to the protagonist as "${protagonistName}" or "they/them".
Example: "${protagonistName} ${tense === 'past' ? 'stepped' : 'steps'} forward..." or "They ${tense === 'past' ? 'examined' : 'examine'} the door..."
Do NOT use "you" to refer to the protagonist.
</style_instruction>`;
    } else {
      basePrompt += `\n\n<style_instruction>
Write in ${tenseInstruction}, SECOND PERSON.
Use "you/your" for the protagonist.
Example: "You ${tense === 'past' ? 'stepped' : 'step'} forward..." or "You ${tense === 'past' ? 'examined' : 'examine'} the door..."
</style_instruction>`;
    }

    // Add response instruction
    if (mode === 'creative-writing') {
      basePrompt += `\n\n<response_instruction>
Write prose based on the author's direction:
1. Bring the scene to life with sensory detail
2. Write dialogue, actions, and thoughts for any character as directed
3. Maintain consistent characterization

STYLE:
- ${tenseRule}
- Use THIRD PERSON for all characters. Refer to the protagonist as "${protagonistName}".
- Write vivid, engaging prose
- Follow the author's lead on what happens

End at a natural narrative beat.
</response_instruction>`;
    } else if (pov === 'third') {
      basePrompt += `\n\n<response_instruction>
Respond to the player's action with an engaging narrative continuation:
1. Show the immediate results of their action through sensory detail
2. Bring NPCs and environment to life with their own reactions
3. Create new tension, opportunity, or discovery

CRITICAL VOICE RULES:
- ${tenseRule}
- Use THIRD PERSON. Refer to the protagonist as "${protagonistName}" or "they/them".
- Do NOT use "you" to address the protagonist.
- You are the NARRATOR describing what happens, not the protagonist themselves.
- NEVER write the protagonist's dialogue, thoughts, or decisions.

End with a natural opening for action, not a direct question.
</response_instruction>`;
    } else {
      basePrompt += `\n\n<response_instruction>
Respond to the player's action with an engaging narrative continuation:
1. Show the immediate results of their action through sensory detail
2. Bring NPCs and environment to life with their own reactions
3. Create new tension, opportunity, or discovery

CRITICAL VOICE RULES:
- ${tenseRule}
- Use SECOND PERSON (you/your). When the player writes "I do X", respond with "You do X".
- You are the NARRATOR describing what happens TO the player, not the player themselves.
- NEVER use "I/me/my" as if you are the player character.
- NEVER write the player's dialogue, thoughts, or decisions.

End with a natural opening for action, not a direct question.
</response_instruction>`;
    }

    return basePrompt;
  }
}

export const aiService = new AIService();
