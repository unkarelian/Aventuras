import type { OpenAIProvider as OpenAIProvider } from './openrouter';
import type { Chapter, StoryEntry } from '$lib/types';
import { settings } from '$lib/stores/settings.svelte';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[TimelineFill]', ...args);
  }
}

// ===== Interfaces =====

/**
 * A query can target either:
 * - A specific list of chapter numbers (chapters array)
 * - A range of chapters (startChapter to endChapter, inclusive)
 */
export interface TimelineQuery {
  query: string;
  // Either chapters array OR startChapter/endChapter range
  chapters?: number[];
  startChapter?: number;
  endChapter?: number;
}

/**
 * Normalized query with resolved chapter IDs for execution.
 */
export interface ResolvedTimelineQuery {
  query: string;
  chapterIds: string[];
  chapterNumbers: number[];
}

export interface TimelineQueryResult {
  query: string;
  chapterNumbers: number[];
  answer: string;
}

export interface TimelineFillResult {
  queries: ResolvedTimelineQuery[];
  responses: TimelineQueryResult[];
  timestamp: number;
}

export interface TimelineChapterInfo {
  id: string;
  number: number;
  title: string | null;
  summary: string;
  messageRange: { start: number; end: number };
  characters: string[];
  locations: string[];
}

// ===== Default Prompts =====

export const DEFAULT_TIMELINE_FILL_PROMPT = `<role>
You are an expert narrative analyzer, who is able to efficiently determine what crucial information is missing from the current narrative.
</role>

<task>
You will be provided with the entirety of the current chapter, as well as summaries of previous chapters. Your task is to succinctly ascertain what information is needed from previous chapters for the most recent scene and query accordingly, as to ensure that all information needed for accurate portrayal of the current scene is gathered.
</task>

<constraints>
Query based ONLY on the information visible in the chapter summaries or things that may be implied to have happened in them. Do not reference current events in your queries, as the assistant that answers queries is only provided the history of that chapter, and would have no knowledge of events outside of the chapters queried. However, do not ask about information directly answered in the summaries. Instead, try to ask questions that 'fill in the gaps'. The maximum range of chapters (startChapter - endChapter) for a single query is 3, but you may make as many queries as you wish.
</constraints>`;

export const DEFAULT_QUERY_ANSWER_PROMPT = `You answer specific questions about story chapters. Be concise and factual. Only include information that directly answers the question. If the chapter doesn't contain relevant information, say "Not mentioned in this chapter."`;

// ===== Service Class =====

export class TimelineFillService {
  private provider: OpenAIProvider;
  private settingsOverride?: Partial<TimelineFillSettings>;

  constructor(provider: OpenAIProvider, settingsOverride?: Partial<TimelineFillSettings>) {
    this.provider = provider;
    this.settingsOverride = settingsOverride;
  }

  private get model(): string {
    return this.settingsOverride?.model ?? settings.systemServicesSettings.timelineFill?.model ?? 'deepseek/deepseek-v3.2';
  }

  private get temperature(): number {
    return this.settingsOverride?.temperature ?? settings.systemServicesSettings.timelineFill?.temperature ?? 0.3;
  }

  private get maxQueries(): number {
    return this.settingsOverride?.maxQueries ?? settings.systemServicesSettings.timelineFill?.maxQueries ?? 5;
  }

  private get systemPrompt(): string {
    return this.settingsOverride?.systemPrompt ?? settings.systemServicesSettings.timelineFill?.systemPrompt ?? DEFAULT_TIMELINE_FILL_PROMPT;
  }

  private get queryAnswerPrompt(): string {
    return this.settingsOverride?.queryAnswerPrompt ?? settings.systemServicesSettings.timelineFill?.queryAnswerPrompt ?? DEFAULT_QUERY_ANSWER_PROMPT;
  }

  /**
   * Main entry point: Generate queries and execute them against chapter content.
   * This is a "one-time" AI call pattern - generates queries, then executes in parallel.
   *
   * @param userInput - The user's current action/input
   * @param visibleEntries - Entries in the current (unsummarized) chapter
   * @param chapters - All summarized chapters (the timeline)
   * @param allEntries - All entries including summarized ones (for querying chapter content)
   */
  async fillTimeline(
    userInput: string,
    visibleEntries: StoryEntry[],
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal
  ): Promise<TimelineFillResult> {
    log('fillTimeline called', {
      userInputLength: userInput.length,
      visibleEntriesCount: visibleEntries.length,
      chaptersCount: chapters.length,
      allEntriesCount: allEntries.length,
    });

    if (chapters.length === 0) {
      return { queries: [], responses: [], timestamp: Date.now() };
    }

    // Step 1: Generate queries based on current context (visible entries = current chapter)
    const queries = await this.generateQueries(userInput, visibleEntries, chapters, signal);
    log('Generated queries', { count: queries.length, queries: queries.map(q => q.query) });

    if (queries.length === 0) {
      return { queries: [], responses: [], timestamp: Date.now() };
    }

    // Step 2: Execute queries in parallel against full chapter content
    const responses = await this.executeQueries(queries, chapters, allEntries, signal);
    log('Executed queries', { responsesCount: responses.length });

    return {
      queries,
      responses,
      timestamp: Date.now(),
    };
  }

  /**
   * Step 1: Generate targeted queries based on the current scene and timeline.
   * Uses SillyTavern-style prompting with visible chat history and chapter timeline.
   */
  private async generateQueries(
    userInput: string,
    recentEntries: StoryEntry[],
    chapters: Chapter[],
    signal?: AbortSignal
  ): Promise<ResolvedTimelineQuery[]> {
    // Build visible chat history (current chapter content)
    const chapterHistory = recentEntries.map(e => {
      const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATION]';
      return `${prefix} ${e.content}`;
    }).join('\n\n');

    // Build timeline (chapter summaries)
    const timeline = chapters.map(ch => ({
      chapter: ch.number,
      title: ch.title || `Chapter ${ch.number}`,
      summary: ch.summary,
      characters: ch.characters,
      locations: ch.locations,
    }));

    // SillyTavern-style user prompt
    const prompt = `Visible chat history:
${chapterHistory}

Existing chapter timeline:
${JSON.stringify(timeline, null, 2)}

Provide a JSON array where each item describes a question to ask about the timeline. Each item MUST be an object with:
- "query": the question string.
- EITHER "chapters": an array of chapter numbers to query,
  OR both "startChapter" and "endChapter" integers defining an inclusive range.
You may include both styles in the same array. The maximum number of chapters per query is 3.
Return ONLY the JSON array, no code fences or commentary.`;

    try {
      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.temperature,
        maxTokens: 8192,
        signal,
      });

      return this.parseQueriesResponse(response.content, chapters);
    } catch (error) {
      log('Query generation failed', error);
      return [];
    }
  }

  /**
   * Step 2: Execute queries against chapter content in parallel.
   * Each query may span multiple chapters (up to 3 per SillyTavern constraints).
   */
  private async executeQueries(
    queries: ResolvedTimelineQuery[],
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal
  ): Promise<TimelineQueryResult[]> {
    // Build a map of chapter content for querying
    const chapterContentMap = this.buildChapterContentMap(chapters, allEntries);

    // Execute all queries in parallel
    const queryPromises = queries.map(async query => {
      // Get all chapters for this query
      const queryChapters = chapters.filter(ch => query.chapterIds.includes(ch.id));

      if (queryChapters.length === 0) {
        return {
          query: query.query,
          chapterNumbers: query.chapterNumbers,
          answer: 'Chapters not found.',
        };
      }

      // Combine content from all chapters in the query
      const combinedContent = queryChapters.map(ch => {
        const content = chapterContentMap.get(ch.id);
        if (content) {
          return `=== Chapter ${ch.number}: ${ch.title || 'Untitled'} ===\n${content}`;
        }
        return `=== Chapter ${ch.number}: ${ch.title || 'Untitled'} ===\n[Summary only] ${ch.summary}`;
      }).join('\n\n');

      return await this.answerFromCombinedContent(query, combinedContent, signal);
    });

    return Promise.all(queryPromises);
  }

  /**
   * Answer a specific question using a limited set of chapters (max 3).
   */
  async answerQuestionForChapters(
    question: string,
    chapterNumbers: number[],
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal
  ): Promise<string> {
    const limitedNumbers = chapterNumbers.filter(n => typeof n === 'number').slice(0, 3);
    if (limitedNumbers.length === 0) {
      return 'Chapters not found.';
    }

    const chapterIds: string[] = [];
    const validNumbers: number[] = [];

    for (const num of limitedNumbers) {
      const chapter = chapters.find(ch => ch.number === num);
      if (chapter) {
        chapterIds.push(chapter.id);
        validNumbers.push(num);
      }
    }

    if (chapterIds.length === 0) {
      return 'Chapters not found.';
    }

    const chapterContentMap = this.buildChapterContentMap(chapters, allEntries);
    const queryChapters = chapters.filter(ch => chapterIds.includes(ch.id));
    const combinedContent = queryChapters.map(ch => {
      const content = chapterContentMap.get(ch.id);
      if (content) {
        return `=== Chapter ${ch.number}: ${ch.title || 'Untitled'} ===\n${content}`;
      }
      return `=== Chapter ${ch.number}: ${ch.title || 'Untitled'} ===\n[Summary only] ${ch.summary}`;
    }).join('\n\n');

    const result = await this.answerFromCombinedContent(
      { query: question, chapterIds, chapterNumbers: validNumbers },
      combinedContent,
      signal
    );

    return result.answer;
  }

  /**
   * Answer a question across a contiguous chapter range (max 3 chapters).
   */
  async answerQuestionForChapterRange(
    question: string,
    startChapter: number,
    endChapter: number,
    chapters: Chapter[],
    allEntries: StoryEntry[],
    signal?: AbortSignal
  ): Promise<string> {
    const start = startChapter;
    const end = Math.min(endChapter, startChapter + 2);
    const chapterNumbers: number[] = [];
    for (let i = start; i <= end; i++) {
      chapterNumbers.push(i);
    }
    return this.answerQuestionForChapters(question, chapterNumbers, chapters, allEntries, signal);
  }

  /**
   * Build a map of chapter ID to concatenated entry content.
   */
  private buildChapterContentMap(
    chapters: Chapter[],
    allEntries: StoryEntry[]
  ): Map<string, string> {
    const contentMap = new Map<string, string>();

    for (const chapter of chapters) {
      // Find entries that belong to this chapter
      const startIdx = allEntries.findIndex(e => e.id === chapter.startEntryId);
      const endIdx = allEntries.findIndex(e => e.id === chapter.endEntryId);

      if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
        const chapterEntries = allEntries.slice(startIdx, endIdx + 1);
        const content = chapterEntries.map(e => {
          const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATION]';
          return `${prefix} ${e.content}`;
        }).join('\n\n');
        contentMap.set(chapter.id, content);
      }
    }

    return contentMap;
  }

  /**
   * Answer a query using combined content from one or more chapters.
   */
  private async answerFromCombinedContent(
    query: ResolvedTimelineQuery,
    combinedContent: string,
    signal?: AbortSignal
  ): Promise<TimelineQueryResult> {
    const chapterLabel = query.chapterNumbers.length === 1
      ? `Chapter ${query.chapterNumbers[0]}`
      : `Chapters ${query.chapterNumbers.join(', ')}`;

    const prompt = `${combinedContent}

QUESTION: ${query.query}

Provide a concise, factual answer based only on the chapter content above. If the information isn't available in these chapters, say "Not mentioned in these chapters."`;

    try {
      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          { role: 'system', content: this.queryAnswerPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 8192,
        signal,
      });

      return {
        query: query.query,
        chapterNumbers: query.chapterNumbers,
        answer: response.content.trim(),
      };
    } catch (error) {
      log('Query answer failed', error);
      return {
        query: query.query,
        chapterNumbers: query.chapterNumbers,
        answer: 'Failed to retrieve information from these chapters.',
      };
    }
  }

  /**
   * Parse the query generation response into structured queries.
   * Handles both "chapters" array and "startChapter"/"endChapter" range formats.
   */
  private parseQueriesResponse(content: string, chapters: Chapter[]): ResolvedTimelineQuery[] {
    try {
      let jsonStr = content.trim();
      // Remove markdown code blocks if present
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      const resolvedQueries: ResolvedTimelineQuery[] = [];

      // Handle both array format (direct array) and object with queries property
      const queryArray = Array.isArray(parsed) ? parsed : (parsed.queries || []);

      if (!Array.isArray(queryArray)) {
        return [];
      }

      for (const q of queryArray.slice(0, this.maxQueries)) {
        if (!q.query) continue;

        let chapterNumbers: number[] = [];

        // Handle "chapters" array format
        if (Array.isArray(q.chapters)) {
          chapterNumbers = q.chapters
            .filter((n: any) => typeof n === 'number')
            .slice(0, 3);
        }
        // Handle "startChapter"/"endChapter" range format
        else if (typeof q.startChapter === 'number' && typeof q.endChapter === 'number') {
          // Enforce max range of 3 chapters per SillyTavern constraints
          const start = q.startChapter;
          const end = Math.min(q.endChapter, start + 2); // Max range of 3
          for (let i = start; i <= end; i++) {
            chapterNumbers.push(i);
          }
        }

        if (chapterNumbers.length === 0) continue;

        // Resolve chapter numbers to IDs
        const chapterIds: string[] = [];
        const validChapterNumbers: number[] = [];

        for (const num of chapterNumbers) {
          const chapter = chapters.find(ch => ch.number === num);
          if (chapter) {
            chapterIds.push(chapter.id);
            validChapterNumbers.push(num);
          }
        }

        if (chapterIds.length > 0) {
          resolvedQueries.push({
            query: String(q.query).trim(),
            chapterIds,
            chapterNumbers: validChapterNumbers,
          });
        }
      }

      return resolvedQueries;
    } catch (e) {
      log('Failed to parse queries response', e, content);
      return [];
    }
  }

  /**
   * Format timeline fill results for injection into the system prompt.
   * Based on SillyTavern's timeline-memory format.
   */
  static formatForPromptInjection(
    chapters: Chapter[],
    result: TimelineFillResult,
    currentEntryPosition: number,
    firstVisibleEntryPosition: number
  ): string {
    if (chapters.length === 0) {
      return '';
    }

    // Build timeline JSON
    const timeline = chapters.map(ch => ({
      chapter_id: ch.number,
      title: ch.title || `Chapter ${ch.number}`,
      entry_count: ch.entryCount,
      summary: ch.summary,
      characters: ch.characters,
      locations: ch.locations,
    }));

    let block = `
<timeline>
${JSON.stringify(timeline, null, 2)}

## Timeline Guidelines
Above is a timeline, with each chapter_id corresponding to a chapter summary. This contains only past information, not future information.

## Position
Your current position is message ${currentEntryPosition}, and the 'chapter' you are on begins at message ${firstVisibleEntryPosition}. All information contained within this range is the current chapter. Everything you see in the current chapter is past the timeline.`;

    // Add retrieved information if we have query responses
    if (result.responses.length > 0) {
      block += `

<retrieved_timeline_information>
The following is information retrieved from the timeline that is directly relevant to the current scenario. Take it into close consideration.

`;
      for (const response of result.responses) {
        const chapterLabel = response.chapterNumbers.length === 1
          ? `Chapter ${response.chapterNumbers[0]}`
          : `Chapters ${response.chapterNumbers.join(', ')}`;

        block += `### ${chapterLabel}
**Q:** ${response.query}
**A:** ${response.answer}

`;
      }
      block += `</retrieved_timeline_information>`;
    }

    block += `
</timeline>`;

    return block;
  }
}

// ===== Settings Interface =====

export interface TimelineFillSettings {
  enabled: boolean;
  model: string;
  temperature: number;
  maxQueries: number;
  systemPrompt: string;
  queryAnswerPrompt: string;
}

export function getDefaultTimelineFillSettings(): TimelineFillSettings {
  return {
    enabled: true, // Default: enabled (default over agentic retrieval)
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.3,
    maxQueries: 5,
    systemPrompt: DEFAULT_TIMELINE_FILL_PROMPT,
    queryAnswerPrompt: DEFAULT_QUERY_ANSWER_PROMPT,
  };
}
