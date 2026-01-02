import { settings } from '$lib/stores/settings.svelte';
import { OpenRouterProvider } from './openrouter';
import { BUILTIN_TEMPLATES } from '$lib/services/templates';
import { ClassifierService, type ClassificationResult, type ClassificationContext } from './classifier';
import { MemoryService, type ChapterAnalysis, type ChapterSummary, type RetrievalDecision, DEFAULT_MEMORY_CONFIG } from './memory';
import { SuggestionsService, type StorySuggestion, type SuggestionsResult } from './suggestions';
import { ActionChoicesService, type ActionChoice, type ActionChoicesResult } from './actionChoices';
import { StyleReviewerService, type StyleReviewResult } from './styleReviewer';
import { LoreManagementService, type LoreManagementSettings } from './loreManagement';
import { AgenticRetrievalService, type AgenticRetrievalSettings, type AgenticRetrievalResult } from './agenticRetrieval';
import { TimelineFillService, type TimelineFillSettings, type TimelineFillResult } from './timelineFill';
import { ContextBuilder, type ContextResult, type ContextConfig, DEFAULT_CONTEXT_CONFIG } from './context';
import { EntryRetrievalService, type EntryRetrievalResult, type ActivationTracker } from './entryRetrieval';
import type { Message, GenerationResponse, StreamChunk } from './types';
import type { Story, StoryEntry, Character, Location, Item, StoryBeat, Chapter, MemoryConfig, Entry, LoreManagementResult } from '$lib/types';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[AIService]', ...args);
  }
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
  private getProvider() {
    const apiKey = settings.apiSettings.openrouterApiKey;
    log('Getting provider, API key configured:', !!apiKey);
    if (!apiKey) {
      throw new Error('No API key configured');
    }
    return new OpenRouterProvider(apiKey);
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
    const pov = story?.settings?.pov;
    const systemPrompt = this.buildSystemPrompt(worldState, story?.templateId, undefined, mode, undefined, systemPromptOverride, pov);
    log('System prompt built, length:', systemPrompt.length, 'mode:', mode);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const tense = story?.settings?.tense || 'present';
    const primingMessage = this.buildPrimingMessage(mode, pov, tense);
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

    // Build extra body for provider-specific options
    const extraBody: Record<string, unknown> = {
      provider: { order: ['z-ai'], require_parameters: true },
    };
    if (settings.apiSettings.enableThinking) {
      // Enable extended thinking with a reasonable token budget
      // Reasoning tokens are NOT included in responses, per user requirement
      extraBody.reasoning = { max_tokens: 10000 };
    }

    log('Messages built:', {
      totalMessages: messages.length,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      enableThinking: settings.apiSettings.enableThinking,
    });

    const response = await provider.generateResponse({
      messages,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
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
    retrievedChapterContext?: string | null
  ): AsyncIterable<StreamChunk> {
    log('streamResponse called', {
      entriesCount: entries.length,
      storyId: story?.id,
      templateId: story?.templateId,
      mode: story?.mode,
      useTieredContext,
      hasChapters: (worldState.chapters?.length ?? 0) > 0,
      hasRetrievedContext: !!retrievedChapterContext,
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
    const pov = story?.settings?.pov;
    let systemPrompt = this.buildSystemPrompt(
      worldState,
      story?.templateId,
      undefined,
      mode,
      tieredContextBlock,
      systemPromptOverride,
      pov
    );

    // Inject chapter summaries if chapters exist
    // Per design doc: summarized entries are excluded from context,
    // but their summaries are included for continuity
    if (worldState.chapters && worldState.chapters.length > 0) {
      const chapterSummariesBlock = this.buildChapterSummariesBlock(worldState.chapters);
      systemPrompt += chapterSummariesBlock;
      log('Chapter summaries injected', { chapterCount: worldState.chapters.length });
    }

    // Inject style guidance if available
    if (styleReview && styleReview.phrases.length > 0) {
      const styleGuidance = StyleReviewerService.formatForPromptInjection(styleReview);
      systemPrompt += styleGuidance;
      log('Style guidance injected', { phrasesCount: styleReview.phrases.length });
    }

    log('System prompt built, length:', systemPrompt.length, 'mode:', mode, 'pov:', pov);

    // Build conversation history
    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add priming user message to establish narrator role
    const tense = story?.settings?.tense || 'present';
    const primingMessage = this.buildPrimingMessage(mode, pov, tense);
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

    // Build extra body for provider-specific options
    const extraBody: Record<string, unknown> = {
      provider: { order: ['z-ai'], require_parameters: true },
    };
    if (settings.apiSettings.enableThinking) {
      // Enable extended thinking with a reasonable token budget
      // Reasoning tokens are NOT included in responses, per user requirement
      extraBody.reasoning = { max_tokens: 10000 };
    }

    log('Starting stream with', {
      totalMessages: messages.length,
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      enableThinking: settings.apiSettings.enableThinking,
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
      extraBody: Object.keys(extraBody).length > 0 ? extraBody : undefined,
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
    story?: Story | null
  ): Promise<ClassificationResult> {
    log('classifyResponse called', {
      responseLength: narrativeResponse.length,
      userActionLength: userAction.length,
      genre: story?.genre,
    });

    const provider = this.getProvider();
    const classifier = new ClassifierService(provider);

    const context: ClassificationContext = {
      narrativeResponse,
      userAction,
      existingCharacters: worldState.characters,
      existingLocations: worldState.locations,
      existingItems: worldState.items,
      existingStoryBeats: worldState.storyBeats,
      genre: story?.genre ?? null,
      storyMode: story?.mode ?? 'adventure',
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
   */
  async generateSuggestions(
    entries: StoryEntry[],
    activeThreads: StoryBeat[],
    genre?: string | null,
    lorebookEntries?: Entry[]
  ): Promise<SuggestionsResult> {
    log('generateSuggestions called', {
      entriesCount: entries.length,
      threadsCount: activeThreads.length,
      genre,
      lorebookEntriesCount: lorebookEntries?.length ?? 0,
    });

    const provider = this.getProvider();
    const suggestions = new SuggestionsService(provider);
    return await suggestions.generateSuggestions(entries, activeThreads, genre, lorebookEntries);
  }

  /**
   * Generate RPG-style action choices for adventure mode.
   * Displayed after narration to give the player clear options.
   */
  async generateActionChoices(
    entries: StoryEntry[],
    worldState: WorldState,
    narrativeResponse: string,
    pov?: 'first' | 'second' | 'third'
  ): Promise<ActionChoicesResult> {
    log('generateActionChoices called', {
      entriesCount: entries.length,
      narrativeLength: narrativeResponse.length,
      pov,
    });

    const provider = this.getProvider();
    const actionChoices = new ActionChoicesService(provider);
    return await actionChoices.generateChoices(entries, worldState, narrativeResponse, pov);
  }

  /**
   * Analyze narration entries for style issues (overused phrases, etc.).
   * Runs in background every N messages to provide writing guidance.
   */
  async analyzeStyle(entries: StoryEntry[]): Promise<StyleReviewResult> {
    log('analyzeStyle called', { entriesCount: entries.length });

    const provider = this.getProvider();
    const styleReviewer = new StyleReviewerService(provider);
    return await styleReviewer.analyzeStyle(entries);
  }

  /**
   * Analyze if a new chapter should be created based on token count.
   * Per design doc section 3.1.2: Auto-Summarization
   */
  async analyzeForChapter(
    entries: StoryEntry[],
    lastChapterEndIndex: number,
    config: MemoryConfig,
    tokensOutsideBuffer: number
  ): Promise<ChapterAnalysis> {
    log('analyzeForChapter called', {
      entriesCount: entries.length,
      lastChapterEndIndex,
      tokensOutsideBuffer,
    });

    const provider = this.getProvider();
    const memory = new MemoryService(provider);
    return await memory.analyzeForChapter(entries, lastChapterEndIndex, config, tokensOutsideBuffer);
  }

  /**
   * Generate a summary and metadata for a chapter.
   */
  async summarizeChapter(entries: StoryEntry[]): Promise<ChapterSummary> {
    log('summarizeChapter called', { entriesCount: entries.length });

    const provider = this.getProvider();
    const memory = new MemoryService(provider);
    return await memory.summarizeChapter(entries);
  }

  /**
   * Decide which chapters are relevant for the current context.
   * Per design doc section 3.1.3: Retrieval Flow
   */
  async decideRetrieval(
    userInput: string,
    recentEntries: StoryEntry[],
    chapters: Chapter[],
    config: MemoryConfig
  ): Promise<RetrievalDecision> {
    log('decideRetrieval called', {
      userInputLength: userInput.length,
      recentEntriesCount: recentEntries.length,
      chaptersCount: chapters.length,
    });

    const provider = this.getProvider();
    const memory = new MemoryService(provider);
    return await memory.decideRetrieval(userInput, recentEntries, chapters, config);
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

    let provider: OpenRouterProvider | null = null;
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
    activationTracker?: ActivationTracker
  ): Promise<EntryRetrievalResult> {
    log('getRelevantLorebookEntries called', {
      totalEntries: entries.length,
      userInputLength: userInput.length,
      liveCharacters: liveState?.characters.length ?? 0,
      liveLocations: liveState?.locations.length ?? 0,
      liveItems: liveState?.items.length ?? 0,
      hasActivationTracker: !!activationTracker,
    });

    let provider: OpenRouterProvider | null = null;
    try {
      provider = this.getProvider();
    } catch {
      log('No provider available, skipping Tier 3 LLM selection for entries');
    }

    const entryService = new EntryRetrievalService(provider);
    const result = await entryService.getRelevantEntries(
      entries,
      userInput,
      recentStoryEntries,
      liveState,
      activationTracker
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
   */
  async runLoreManagement(
    storyId: string,
    entries: Entry[],
    recentMessages: StoryEntry[],
    chapters: Chapter[],
    callbacks: {
      onCreateEntry: (entry: Entry) => Promise<void>;
      onUpdateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
      onDeleteEntry: (id: string) => Promise<void>;
      onMergeEntries: (entryIds: string[], mergedEntry: Entry) => Promise<void>;
      onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>;
    }
  ): Promise<LoreManagementResult> {
    log('runLoreManagement called', {
      storyId,
      entriesCount: entries.length,
      recentMessagesCount: recentMessages.length,
      chaptersCount: chapters.length,
    });

    const provider = this.getProvider();
    const loreManager = new LoreManagementService(provider);

    return await loreManager.runSession({
      storyId,
      entries,
      recentMessages,
      chapters,
      ...callbacks,
    });
  }

  /**
   * Run agentic retrieval to gather context for the current situation.
   * Per design doc section 3.1.4: Agentic Retrieval (Optional)
   * Used for long stories or complex queries where static retrieval is insufficient.
   */
  async runAgenticRetrieval(
    userInput: string,
    recentEntries: StoryEntry[],
    chapters: Chapter[],
    entries: Entry[],
    onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>
  ): Promise<AgenticRetrievalResult> {
    log('runAgenticRetrieval called', {
      userInputLength: userInput.length,
      recentEntriesCount: recentEntries.length,
      chaptersCount: chapters.length,
      entriesCount: entries.length,
    });

    const provider = this.getProvider();
    const retrieval = new AgenticRetrievalService(provider);

    return await retrieval.runRetrieval(
      { userInput, recentEntries, chapters, entries },
      onQueryChapter
    );
  }

  /**
   * Determine if agentic retrieval should be used based on story size.
   * Returns true if chapters exceed threshold and agentic retrieval is enabled.
   */
  shouldUseAgenticRetrieval(chapters: Chapter[]): boolean {
    const agenticSettings = settings.systemServicesSettings.agenticRetrieval;
    if (!agenticSettings?.enabled) {
      return false;
    }
    return chapters.length > (agenticSettings.agenticThreshold ?? 30);
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
   */
  async runTimelineFill(
    userInput: string,
    visibleEntries: StoryEntry[],
    chapters: Chapter[],
    allEntries: StoryEntry[]
  ): Promise<TimelineFillResult> {
    log('runTimelineFill called', {
      userInputLength: userInput.length,
      visibleEntriesCount: visibleEntries.length,
      chaptersCount: chapters.length,
      allEntriesCount: allEntries.length,
    });

    const provider = this.getProvider();
    const timelineFill = new TimelineFillService(provider);

    return await timelineFill.fillTimeline(
      userInput,
      visibleEntries,
      chapters,
      allEntries
    );
  }

  /**
   * Determine if timeline fill should be used for memory retrieval.
   * Timeline fill is the default; agentic retrieval is used only if explicitly enabled
   * and the story is long enough (chapters > threshold).
   */
  shouldUseTimelineFill(chapters: Chapter[]): boolean {
    const timelineFillSettings = settings.systemServicesSettings.timelineFill;
    const agenticSettings = settings.systemServicesSettings.agenticRetrieval;

    // If timeline fill is disabled, don't use it
    if (!timelineFillSettings?.enabled) {
      return false;
    }

    // If agentic retrieval is enabled AND we're past the threshold, use agentic instead
    if (agenticSettings?.enabled && chapters.length > (agenticSettings.agenticThreshold ?? 30)) {
      return false;
    }

    // Default: use timeline fill
    return true;
  }

  /**
   * Format timeline fill result for prompt injection.
   */
  formatTimelineFillForPrompt(
    chapters: Chapter[],
    result: TimelineFillResult,
    currentEntryPosition: number,
    firstVisibleEntryPosition: number
  ): string {
    return TimelineFillService.formatForPromptInjection(
      chapters,
      result,
      currentEntryPosition,
      firstVisibleEntryPosition
    );
  }

  /**
   * Build a block containing chapter summaries for injection into the system prompt.
   * Per design doc: summarized entries are excluded from direct context,
   * but their summaries provide narrative continuity.
   */
  private buildChapterSummariesBlock(chapters: Chapter[]): string {
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

    block += '</story_history>';
    return block;
  }

  /**
   * Build a priming user message to establish the narrator role.
   * This helps models that expect user-first conversation format.
   */
  private buildPrimingMessage(
    mode: 'adventure' | 'creative-writing',
    pov?: 'first' | 'second' | 'third',
    tense: 'past' | 'present' = 'present'
  ): string {
    const tenseInstruction = tense === 'past' ? 'past tense' : 'present tense';

    let povInstruction: string;
    if (pov === 'third') {
      povInstruction = 'third person (they/the character name)';
    } else {
      povInstruction = 'second person (you/your)';
    }

    if (mode === 'creative-writing') {
      return `You are a skilled fiction writer. Write in ${tenseInstruction}, ${povInstruction}.

Your role:
- Write prose based on my directions
- Bring scenes to life with vivid detail
- Write for any character I direct you to, including dialogue, actions, and thoughts
- Maintain consistent characterization throughout

I am the author directing the story. Write what I ask for.`;
    } else {
      return `You are the narrator of this interactive adventure. Write in ${tenseInstruction}, ${povInstruction}.

Your role:
- Describe what I see, hear, and experience as I explore
- Control all NPCs and the environment
- NEVER write my dialogue, decisions, or inner thoughts
- When I say "I do X", describe the results using "you" (e.g., "I open the door" → "You push open the heavy door...")

I am the player. You narrate the world around me. Begin when I take my first action.`;
    }
  }

  private buildSystemPrompt(
    worldState: WorldState,
    templateId?: string | null,
    retrievedContext?: string,
    mode: 'adventure' | 'creative-writing' = 'adventure',
    tieredContextBlock?: string,
    systemPromptOverride?: string,
    pov?: 'first' | 'second' | 'third'
  ): string {
    // Use custom system prompt if provided (from wizard-generated stories)
    let basePrompt = '';

    if (systemPromptOverride) {
      basePrompt = systemPromptOverride;
    } else if (templateId) {
      // Get template-specific system prompt if available
      const template = BUILTIN_TEMPLATES.find(t => t.id === templateId);
      if (template?.systemPrompt) {
        basePrompt = template.systemPrompt;
      }
    }

    // If no template prompt, use mode-appropriate default prompt from settings
    if (!basePrompt) {
      if (mode === 'creative-writing') {
        basePrompt = settings.storyGenerationSettings.creativeWritingPrompt;
      } else {
        basePrompt = settings.storyGenerationSettings.adventurePrompt;
      }
    }

    // Add POV-specific instructions
    if (pov === 'third') {
      // Find protagonist name for third person narration
      const protagonist = worldState.characters.find(c => c.relationship === 'self');
      const protagonistName = protagonist?.name || 'the protagonist';
      basePrompt += `\n\n<pov_instruction>
Write in THIRD PERSON. Refer to the player character as "${protagonistName}" or "they/them".
Example: "${protagonistName} steps forward..." or "They examine the door..."
Do NOT use "you" to refer to the player character.
</pov_instruction>`;
    }
    // For first and second person, the default prompt already instructs to use "you"

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

    // Combine prompt with context
    if (hasContext) {
      basePrompt += '\n\n───────────────────────────────────────\n';
      basePrompt += 'WORLD STATE (for your reference, do not mention directly)';
      basePrompt += contextBlock;
      basePrompt += '\n───────────────────────────────────────';
    }

    // Final instruction - reinforcing the core rules (mode-specific)
    if (mode === 'creative-writing') {
      const povInstruction = pov === 'third'
        ? 'Use THIRD PERSON for all characters.'
        : 'Use the POV specified by the author.';

      basePrompt += `\n\n<response_instruction>
Write prose based on the author's direction:
1. Bring the scene to life with sensory detail
2. Write dialogue, actions, and thoughts for any character as directed
3. Maintain consistent characterization

STYLE:
- ${povInstruction}
- Write vivid, engaging prose
- Follow the author's lead on what happens

End at a natural narrative beat.
</response_instruction>`;
    } else {
      const povInstruction = pov === 'third'
        ? 'Use THIRD PERSON (they/the protagonist) to describe what the character does.'
        : 'Use SECOND PERSON (you/your) to describe what the player does. If the player writes "I do X", respond with "You do X".';

      basePrompt += `\n\n<response_instruction>
Respond to the player's action with an engaging narrative continuation:
1. Show the immediate results of their action through sensory detail
2. Bring NPCs and environment to life with their own reactions
3. Create new tension, opportunity, or discovery

CRITICAL VOICE RULES:
- ${povInstruction}
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
