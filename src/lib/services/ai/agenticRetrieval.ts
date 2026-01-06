import type { OpenAIProvider as OpenAIProvider } from './openrouter';
import type {
  Tool,
  ToolCall,
  AgenticMessage,
} from './types';
import type {
  Chapter,
  StoryEntry,
  Entry,
} from '$lib/types';
import { settings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from './requestOverrides';
import type { ReasoningEffort } from '$lib/types';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[AgenticRetrieval]', ...args);
  }
}

// Tool definitions for Agentic Retrieval (per design doc section 3.1.4)
const RETRIEVAL_TOOLS: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description: 'List all available chapters with their summaries, characters, and locations',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_chapter',
      description: 'Ask a specific question about a single chapter to get relevant information',
      parameters: {
        type: 'object',
        properties: {
          chapter_number: {
            type: 'number',
            description: 'The chapter number to query',
          },
          question: {
            type: 'string',
            description: 'The specific question to answer about this chapter',
          },
        },
        required: ['chapter_number', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_chapters',
      description: 'Ask a question across a range of chapters (max 3 per query) for broader information',
      parameters: {
        type: 'object',
        properties: {
          start_chapter: {
            type: 'number',
            description: 'First chapter in the range',
          },
          end_chapter: {
            type: 'number',
            description: 'Last chapter in the range',
          },
          question: {
            type: 'string',
            description: 'The question to answer',
          },
        },
        required: ['start_chapter', 'end_chapter', 'question'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_entries',
      description: 'List lorebook entries for cross-referencing with story context',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: 'Optional filter by entry type',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish_retrieval',
      description: 'Signal that retrieval is complete and provide synthesized context',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Synthesized context from retrieved information that is relevant to the current situation',
          },
        },
        required: ['summary'],
      },
    },
  },
];

// Default system prompt for Agentic Retrieval
export const DEFAULT_AGENTIC_RETRIEVAL_PROMPT = `You are an autonomous context retrieval agent for an interactive narrative. Your purpose is to gather precisely the past context needed for the narrator to respond coherently to the current situation.

## Your Workflow

For each retrieval session, follow this iterative cycle:

1. **ASSESS** - Analyze the user input and recent scene. What specific information from the past is needed?
2. **PLAN** - Decide which tool to call next. Consider: What's the most efficient way to find this information?
3. **EXECUTE** - Call a single tool and observe the result.
4. **EVALUATE** - Did you get what you needed? Is more retrieval necessary, or do you have enough?

Repeat until you have sufficient context, then call \`finish_retrieval\`.

## Tool Strategy

- **list_chapters**: Call this FIRST to survey available history. Scan summaries for relevance before querying.
- **list_entries**: Use when characters, locations, items, or factions in the current scene might have lorebook entries with crucial details.
- **query_chapter**: For targeted questions about a specific chapter. Prefer this for precise information.
- **query_chapters**: For questions spanning events across 2-3 chapters (e.g., "How did X's relationship with Y evolve?").
- **finish_retrieval**: Call when you have gathered enough context OR determined no retrieval is needed.

## What to Retrieve

Focus on information the narrator cannot infer from the visible scene:
- Established facts about characters, relationships, or world details referenced in the current action
- Prior events being directly continued or referenced
- Promises, secrets, or unresolved tensions relevant to the current moment
- Physical descriptions or mannerisms if a character reappears after absence

## When NOT to Retrieve

Call \`finish_retrieval\` immediately with an empty or minimal summary if:
- The user action is self-contained (e.g., examining something new, simple dialogue)
- The recent scene already contains all necessary context
- No past chapters or lorebook entries are relevant

## Completion Criteria

You have enough context when you can answer: "What does the narrator need to know from the past to respond accurately to this moment?" If the answer is "nothing beyond what's visible," finish immediately.

## Output Format

When calling \`finish_retrieval\`, provide a **concise synthesis** (not a list of everything you found). Include only information directly relevant to crafting the narrator's response. Prioritize actionable details over exhaustive summaries.`;

export interface AgenticRetrievalContext {
  userInput: string;
  recentEntries: StoryEntry[];
  chapters: Chapter[];
  entries: Entry[];
}

export interface AgenticRetrievalResult {
  context: string;
  queriedChapters: number[];
  iterations: number;
  sessionId: string;
}

export class AgenticRetrievalService {
  private provider: OpenAIProvider;
  private settingsOverride?: Partial<AgenticRetrievalSettings>;

  constructor(provider: OpenAIProvider, settingsOverride?: Partial<AgenticRetrievalSettings>) {
    this.provider = provider;
    this.settingsOverride = settingsOverride;
  }

  private get model(): string {
    return this.settingsOverride?.model ?? settings.systemServicesSettings.agenticRetrieval?.model ?? 'minimax/minimax-m2.1';
  }

  private get temperature(): number {
    return this.settingsOverride?.temperature ?? settings.systemServicesSettings.agenticRetrieval?.temperature ?? 0.3;
  }

  private get maxIterations(): number {
    return this.settingsOverride?.maxIterations ?? settings.systemServicesSettings.agenticRetrieval?.maxIterations ?? 10;
  }

  private get systemPrompt(): string {
    return this.settingsOverride?.systemPrompt ?? settings.systemServicesSettings.agenticRetrieval?.systemPrompt ?? DEFAULT_AGENTIC_RETRIEVAL_PROMPT;
  }

  /**
   * Run agentic retrieval to gather context for the current situation.
   * Per design doc section 3.1.4: Agentic Retrieval (Optional)
   */
  async runRetrieval(
    context: AgenticRetrievalContext,
    onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>,
    onQueryChapters?: (startChapter: number, endChapter: number, question: string) => Promise<string>,
    signal?: AbortSignal
  ): Promise<AgenticRetrievalResult> {
    const sessionId = crypto.randomUUID();
    const queriedChapters: number[] = [];

    log('Starting agentic retrieval', {
      sessionId,
      userInputLength: context.userInput.length,
      chaptersCount: context.chapters.length,
      entriesCount: context.entries.length,
    });

    // Build initial prompt
    const initialPrompt = this.buildInitialPrompt(context);

    // Initialize conversation
    const messages: AgenticMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: initialPrompt },
    ];

    let complete = false;
    let iterations = 0;
    let retrievedContext = '';
    let consecutiveNoToolCalls = 0;
    const MAX_NO_TOOL_CALL_RETRIES = 2;

    while (!complete && iterations < this.maxIterations) {
      if (signal?.aborted) {
        log('Agentic retrieval aborted before iteration');
        break;
      }

      iterations++;
      log(`Retrieval iteration ${iterations}/${this.maxIterations}`);

      try {
        const response = await this.provider.generateWithTools({
          messages,
          model: this.model,
          temperature: this.temperature,
          maxTokens: 8192,
          tools: RETRIEVAL_TOOLS,
          tool_choice: 'auto',
          extraBody: buildExtraBody({
            manualMode: settings.advancedRequestSettings.manualMode,
            manualBody: this.settingsOverride?.manualBody ?? settings.systemServicesSettings.agenticRetrieval.manualBody,
            reasoningEffort: this.settingsOverride?.reasoningEffort ?? settings.systemServicesSettings.agenticRetrieval.reasoningEffort,
            providerOnly: this.settingsOverride?.providerOnly ?? settings.systemServicesSettings.agenticRetrieval.providerOnly,
          }),
          signal,
        });

        log('Retrieval agent response', {
          hasContent: !!response.content,
          hasToolCalls: !!response.tool_calls,
          toolCallCount: response.tool_calls?.length ?? 0,
          finishReason: response.finish_reason,
          hasReasoning: !!response.reasoning,
          hasReasoningDetails: !!response.reasoning_details,
        });

        if (response.reasoning) {
          log('Agent reasoning:', response.reasoning.substring(0, 500));
        }

        // If no tool calls, prompt the agent to use tools or finish
        if (!response.tool_calls || response.tool_calls.length === 0) {
          consecutiveNoToolCalls++;
          log(`No tool calls (${consecutiveNoToolCalls}/${MAX_NO_TOOL_CALL_RETRIES})`);

          if (response.content) {
            messages.push({
              role: 'assistant',
              content: response.content,
              reasoning: response.reasoning ?? null,
              reasoning_details: response.reasoning_details,
            });
          }

          if (consecutiveNoToolCalls >= MAX_NO_TOOL_CALL_RETRIES) {
            log('Max no-tool-call retries reached, ending retrieval');
            break;
          }

          messages.push({
            role: 'user',
            content: 'Please use the available tools to gather relevant context, or call finish_retrieval when you are done.',
          });
          continue;
        }

        consecutiveNoToolCalls = 0;

        // Add assistant response to messages
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls,
          reasoning: response.reasoning ?? null,
          reasoning_details: response.reasoning_details,
        });

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(
            toolCall,
            context,
            queriedChapters,
            onQueryChapter,
            onQueryChapters
          );

          if (toolCall.function.name === 'finish_retrieval') {
            complete = true;
            const args = JSON.parse(toolCall.function.arguments);
            retrievedContext = args.summary;
          }

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          log('Agentic retrieval aborted');
          break;
        }
        log('Error in retrieval iteration:', error);
        break;
      }
    }

    if (iterations >= this.maxIterations) {
      log('Max iterations reached');
    }

    log('Agentic retrieval complete', {
      sessionId,
      iterations,
      queriedChaptersCount: queriedChapters.length,
      contextLength: retrievedContext.length,
    });

    return {
      context: retrievedContext,
      queriedChapters,
      iterations,
      sessionId,
    };
  }

  private buildInitialPrompt(context: AgenticRetrievalContext): string {
    // Format recent context (last 5 entries)
    const recentContext = context.recentEntries.slice(-5).map(e => {
      const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATION]';
      return `${prefix} ${e.content}`;
    }).join('\n\n');

    return `# Current Situation

USER INPUT:
"${context.userInput}"

RECENT SCENE:
${recentContext}

# Available Chapters: ${context.chapters.length}
${context.chapters.map(c => `- Chapter ${c.number}: ${c.title || 'Untitled'} (${c.characters.join(', ')})`).join('\n')}

# Lorebook Entries: ${context.entries.length}
${context.entries.slice(0, 20).map(e => `- ${e.name} (${e.type})`).join('\n')}
${context.entries.length > 20 ? `...and ${context.entries.length - 20} more` : ''}

Please gather relevant context from past chapters that will help respond to this situation. Focus on information that is actually needed - often, no retrieval is necessary for simple actions.`;
  }

  private async executeTool(
    toolCall: ToolCall,
    context: AgenticRetrievalContext,
    queriedChapters: number[],
    onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>,
    onQueryChapters?: (startChapter: number, endChapter: number, question: string) => Promise<string>
  ): Promise<string> {
    const args = JSON.parse(toolCall.function.arguments);
    log('Executing retrieval tool:', toolCall.function.name, args);

    switch (toolCall.function.name) {
      case 'list_chapters': {
        return JSON.stringify(context.chapters.map(c => ({
          number: c.number,
          title: c.title,
          summary: c.summary,
          characters: c.characters,
          locations: c.locations,
          plotThreads: c.plotThreads,
        })));
      }

      case 'query_chapter': {
        const chapterNum = args.chapter_number;
        const question = args.question;

        // Track queried chapters
        if (!queriedChapters.includes(chapterNum)) {
          queriedChapters.push(chapterNum);
        }

        const chapter = context.chapters.find(c => c.number === chapterNum);
        if (!chapter) {
          return JSON.stringify({ error: `Chapter ${chapterNum} not found` });
        }

        // If we have a query callback, use it for AI-powered answers
        if (onQueryChapter) {
          try {
            const answer = await onQueryChapter(chapterNum, question);
            return JSON.stringify({
              chapter: chapterNum,
              question,
              answer,
            });
          } catch (error) {
            log('Query chapter failed, falling back to summary:', error);
          }
        }

        // Fallback: return summary
        return JSON.stringify({
          chapter: chapterNum,
          question,
          answer: `Based on chapter summary: ${chapter.summary}`,
          characters: chapter.characters,
          locations: chapter.locations,
        });
      }

      case 'query_chapters': {
        const startChapter = args.start_chapter;
        const endChapter = Math.min(args.end_chapter, startChapter + 2);
        const question = args.question;

        const chapters = context.chapters.filter(
          c => c.number >= startChapter && c.number <= endChapter
        );

        // Track queried chapters
        for (const c of chapters) {
          if (!queriedChapters.includes(c.number)) {
            queriedChapters.push(c.number);
          }
        }

        if (chapters.length === 0) {
          return JSON.stringify({ error: 'No chapters in specified range' });
        }

        if (onQueryChapters) {
          try {
            const answer = await onQueryChapters(startChapter, endChapter, question);
            return JSON.stringify({
              range: { start: startChapter, end: endChapter },
              question,
              answer,
            });
          } catch (error) {
            log('Query chapters failed, falling back to summaries:', error);
          }
        }

        const combinedSummaries = chapters.map(c =>
          `Chapter ${c.number}: ${c.summary}`
        ).join('\n\n');

        return JSON.stringify({
          range: { start: startChapter, end: endChapter },
          question,
          answer: `Based on chapters ${startChapter}-${endChapter}:\n${combinedSummaries}`,
        });
      }

      case 'list_entries': {
        const typeFilter = args.type;
        const filtered = typeFilter
          ? context.entries.filter(e => e.type === typeFilter)
          : context.entries;

        return JSON.stringify(filtered.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description,
          aliases: e.aliases,
        })));
      }

      case 'finish_retrieval': {
        return JSON.stringify({
          success: true,
          message: 'Retrieval complete',
          summary_length: args.summary.length,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
    }
  }

  /**
   * Build a context block from retrieval results for injection into narrator prompt.
   */
  static formatForPromptInjection(result: AgenticRetrievalResult): string {
    if (!result.context || result.context.length === 0) {
      return '';
    }

    return `
<retrieved_context>
## From Earlier in the Story
${result.context}
</retrieved_context>`;
  }
}

// Settings interface
export interface AgenticRetrievalSettings {
  enabled: boolean;
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
  // Threshold for when to use agentic retrieval instead of static
  agenticThreshold: number; // Use agentic if chapters > N (default: 30)
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultAgenticRetrievalSettings(): AgenticRetrievalSettings {
  return {
    enabled: false, // Disabled by default, static retrieval is usually sufficient
    model: 'minimax/minimax-m2.1',
    temperature: 0.3,
    maxIterations: 10,
    systemPrompt: DEFAULT_AGENTIC_RETRIEVAL_PROMPT,
    agenticThreshold: 30,
    reasoningEffort: 'high',
    providerOnly: ['minimax'],
    manualBody: '',
  };
}
