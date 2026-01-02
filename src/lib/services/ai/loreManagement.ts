import type { OpenRouterProvider } from './openrouter';
import type {
  Tool,
  ToolCall,
  AgenticMessage,
  AgenticResponse,
} from './types';
import type {
  Entry,
  EntryType,
  EntryState,
  EntryPreview,
  LoreChange,
  LoreManagementResult,
  Chapter,
  StoryEntry,
  CharacterEntryState,
  LocationEntryState,
  ItemEntryState,
  FactionEntryState,
  ConceptEntryState,
  EventEntryState,
} from '$lib/types';
import { settings } from '$lib/stores/settings.svelte';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[LoreManagement]', ...args);
  }
}

// Tool definitions for Lore Management Mode (per design doc section 3.4.3)
const LORE_MANAGEMENT_TOOLS: Tool[] = [
  // === Entry Operations ===
  {
    type: 'function',
    function: {
      name: 'list_entries',
      description: 'List all entries in the lorebook, optionally filtered by type',
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
      name: 'get_entry',
      description: 'Get full details of a specific entry by ID',
      parameters: {
        type: 'object',
        properties: {
          entry_id: {
            type: 'string',
            description: 'The ID of the entry to retrieve',
          },
        },
        required: ['entry_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_entry',
      description: 'Create a new lorebook entry',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the entry',
          },
          type: {
            type: 'string',
            description: 'Type of entry',
            enum: ['character', 'location', 'item', 'faction', 'concept', 'event'],
          },
          description: {
            type: 'string',
            description: 'Description of the entry',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Alternative names or keywords',
          },
          hidden_info: {
            type: 'string',
            description: 'Information the protagonist does not know yet',
          },
        },
        required: ['name', 'type', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_entry',
      description: 'Update an existing lorebook entry',
      parameters: {
        type: 'object',
        properties: {
          entry_id: {
            type: 'string',
            description: 'The ID of the entry to update',
          },
          name: {
            type: 'string',
            description: 'New name (optional)',
          },
          description: {
            type: 'string',
            description: 'New description (optional)',
          },
          aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'New aliases (optional)',
          },
          hidden_info: {
            type: 'string',
            description: 'New hidden info (optional)',
          },
        },
        required: ['entry_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'merge_entries',
      description: 'Merge multiple entries into one (for duplicates)',
      parameters: {
        type: 'object',
        properties: {
          entry_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'IDs of entries to merge',
          },
          merged_name: {
            type: 'string',
            description: 'Name for the merged entry',
          },
          merged_description: {
            type: 'string',
            description: 'Description for the merged entry',
          },
          merged_aliases: {
            type: 'array',
            items: { type: 'string' },
            description: 'Combined aliases',
          },
        },
        required: ['entry_ids', 'merged_name', 'merged_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_entry',
      description: 'Delete an entry from the lorebook',
      parameters: {
        type: 'object',
        properties: {
          entry_id: {
            type: 'string',
            description: 'The ID of the entry to delete',
          },
        },
        required: ['entry_id'],
      },
    },
  },
  // === Memory/Story Access ===
  {
    type: 'function',
    function: {
      name: 'get_recent_story',
      description: 'Get recent story messages for context',
      parameters: {
        type: 'object',
        properties: {
          message_count: {
            type: 'number',
            description: 'Number of recent messages to retrieve (default: 50)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description: 'List all chapter summaries',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chapter_summary',
      description: 'Get the summary of a specific chapter',
      parameters: {
        type: 'object',
        properties: {
          chapter_number: {
            type: 'number',
            description: 'The chapter number to get',
          },
        },
        required: ['chapter_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_chapter',
      description: 'Ask a specific question about a chapter',
      parameters: {
        type: 'object',
        properties: {
          chapter_number: {
            type: 'number',
            description: 'The chapter number to query',
          },
          question: {
            type: 'string',
            description: 'The question to ask about the chapter',
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
      description: 'Ask a question across a range of chapters',
      parameters: {
        type: 'object',
        properties: {
          start_chapter: {
            type: 'number',
            description: 'Start of chapter range',
          },
          end_chapter: {
            type: 'number',
            description: 'End of chapter range',
          },
          question: {
            type: 'string',
            description: 'The question to ask',
          },
        },
        required: ['start_chapter', 'end_chapter', 'question'],
      },
    },
  },
  // === Completion ===
  {
    type: 'function',
    function: {
      name: 'finish_lore_management',
      description: 'Signal that lore management is complete and provide a summary',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of changes made during this session',
          },
        },
        required: ['summary'],
      },
    },
  },
];

// Default system prompt for Lore Management Mode
export const DEFAULT_LORE_MANAGEMENT_PROMPT = `You are a lore manager for an interactive story. Your job is to maintain a consistent, comprehensive database of story elements.

Your tasks:
1. Identify important characters, locations, items, factions, and concepts that appear in the story but have no entry
2. Find entries that are outdated or incomplete based on story events
3. Identify redundant entries that should be merged
4. Update relationship statuses and character states

Guidelines:
- Be conservative - only create entries for elements that are genuinely important to the story
- Use exact names from the story text
- When merging, combine all relevant information
- Focus on facts that would help maintain story consistency

Use your tools to review the story and make necessary changes. When finished, call finish_lore_management with a summary.`;

interface LoreManagementContext {
  entries: Entry[];
  recentMessages: StoryEntry[];
  chapters: Chapter[];
}

interface ToolExecutionContext {
  storyId: string;
  entries: Entry[];
  recentMessages: StoryEntry[];
  chapters: Chapter[];
  // Callbacks to execute actual database operations
  onCreateEntry: (entry: Entry) => Promise<void>;
  onUpdateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onMergeEntries: (entryIds: string[], mergedEntry: Entry) => Promise<void>;
  // Memory query callback
  onQueryChapter?: (chapterNumber: number, question: string) => Promise<string>;
}

export class LoreManagementService {
  private provider: OpenRouterProvider;
  private changes: LoreChange[] = [];
  private settingsOverride?: Partial<LoreManagementSettings>;

  constructor(provider: OpenRouterProvider, settingsOverride?: Partial<LoreManagementSettings>) {
    this.provider = provider;
    this.settingsOverride = settingsOverride;
  }

  private get model(): string {
    // Use minimax-m2.1 as default - good for agentic tool calling with reasoning
    return this.settingsOverride?.model ?? settings.systemServicesSettings.loreManagement?.model ?? 'minimax/minimax-m2.1';
  }

  private get temperature(): number {
    return this.settingsOverride?.temperature ?? settings.systemServicesSettings.loreManagement?.temperature ?? 0.3;
  }

  private get maxIterations(): number {
    return this.settingsOverride?.maxIterations ?? settings.systemServicesSettings.loreManagement?.maxIterations ?? 20;
  }

  private get systemPrompt(): string {
    return this.settingsOverride?.systemPrompt ?? settings.systemServicesSettings.loreManagement?.systemPrompt ?? DEFAULT_LORE_MANAGEMENT_PROMPT;
  }

  /**
   * Run a lore management session.
   * This is an agentic loop that reviews and updates entries.
   */
  async runSession(context: ToolExecutionContext): Promise<LoreManagementResult> {
    this.changes = [];
    const sessionId = crypto.randomUUID();

    // Filter out blacklisted entries - AI won't see or be able to modify them
    const blacklistedCount = context.entries.filter(e => e.loreManagementBlacklisted).length;
    context.entries = context.entries.filter(e => !e.loreManagementBlacklisted);

    log('Starting lore management session', {
      sessionId,
      entriesCount: context.entries.length,
      blacklistedCount,
      recentMessagesCount: context.recentMessages.length,
      chaptersCount: context.chapters.length,
    });

    // Build initial prompt with context
    const initialPrompt = this.buildInitialPrompt(context);

    // Initialize conversation with system message and context
    const messages: AgenticMessage[] = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: initialPrompt },
    ];

    let complete = false;
    let iterations = 0;

    while (!complete && iterations < this.maxIterations) {
      iterations++;
      log(`Iteration ${iterations}/${this.maxIterations}`);

      try {
        const response = await this.provider.generateWithTools({
          messages,
          model: this.model,
          temperature: this.temperature,
          maxTokens: 2048,
          tools: LORE_MANAGEMENT_TOOLS,
          tool_choice: 'auto',
          extraBody: {
            // Enable reasoning for better decision-making
            reasoning: {
              effort: 'medium',
            },
            // Use Minimax provider for best tool calling support
            provider: {
              only: ['Minimax'],
            },
          },
        });

        log('Agent response', {
          hasContent: !!response.content,
          hasToolCalls: !!response.tool_calls,
          toolCallCount: response.tool_calls?.length ?? 0,
          finishReason: response.finish_reason,
          hasReasoning: !!response.reasoning,
        });

        // Log reasoning if present (useful for debugging agent decisions)
        if (response.reasoning) {
          log('Agent reasoning:', response.reasoning.substring(0, 500));
        }

        // If no tool calls and finish reason is stop, agent is done thinking
        if (!response.tool_calls || response.tool_calls.length === 0) {
          if (response.content) {
            log('Agent finished without tool call, content:', response.content.substring(0, 200));
          }
          break;
        }

        // Add assistant response to messages, including reasoning for context continuity
        messages.push({
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls,
          reasoning: response.reasoning ?? null, // Pass reasoning back to maintain context
        });

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(toolCall, context);

          if (toolCall.function.name === 'finish_lore_management') {
            complete = true;
          }

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      } catch (error) {
        log('Error in lore management iteration:', error);
        break;
      }
    }

    if (iterations >= this.maxIterations) {
      log('Max iterations reached');
    }

    const summary = this.changes.find(c => c.type === 'complete')?.summary || 'Session completed';

    log('Lore management session complete', {
      sessionId,
      iterations,
      changesCount: this.changes.length,
    });

    return {
      changes: this.changes,
      summary,
      sessionId,
    };
  }

  private buildInitialPrompt(context: ToolExecutionContext): string {
    // Build entry summary
    const entrySummary = context.entries.length > 0
      ? context.entries.map(e => `- ${e.name} (${e.type}): ${e.description.substring(0, 100)}...`).join('\n')
      : 'No entries yet.';

    // Build recent story summary (last few messages)
    const recentStory = context.recentMessages.slice(-10).map(m => {
      const prefix = m.type === 'user_action' ? '[ACTION]' : '[NARRATION]';
      return `${prefix} ${m.content.substring(0, 200)}...`;
    }).join('\n\n');

    // Build chapter summary
    const chapterSummary = context.chapters.length > 0
      ? context.chapters.map(c => `Chapter ${c.number}: ${c.summary.substring(0, 100)}...`).join('\n')
      : 'No chapters yet.';

    return `# Current Lorebook Entries
${entrySummary}

# Recent Story (last ${Math.min(10, context.recentMessages.length)} messages)
${recentStory}

# Chapter Summaries
${chapterSummary}

Please review the story content and identify:
1. Important elements that should have entries but don't
2. Entries that need updating based on story events
3. Redundant or duplicate entries that should be merged

Use the available tools to make necessary changes, then call finish_lore_management when done.`;
  }

  private async executeTool(toolCall: ToolCall, context: ToolExecutionContext): Promise<string> {
    const args = JSON.parse(toolCall.function.arguments);
    log('Executing tool:', toolCall.function.name, args);

    switch (toolCall.function.name) {
      case 'list_entries': {
        const typeFilter = args.type as EntryType | undefined;
        const filtered = typeFilter
          ? context.entries.filter(e => e.type === typeFilter)
          : context.entries;
        return JSON.stringify(filtered.map(e => ({
          id: e.id,
          name: e.name,
          type: e.type,
          description: e.description.substring(0, 200),
          aliases: e.aliases,
        })));
      }

      case 'get_entry': {
        const entry = context.entries.find(e => e.id === args.entry_id);
        if (!entry) {
          return JSON.stringify({ error: `Entry ${args.entry_id} not found` });
        }
        return JSON.stringify(entry);
      }

      case 'create_entry': {
        const newEntry = this.createEntry(context.storyId, args);
        context.entries.push(newEntry);
        await context.onCreateEntry(newEntry);
        this.changes.push({ type: 'create', entry: newEntry });
        return JSON.stringify({ success: true, id: newEntry.id, name: newEntry.name });
      }

      case 'update_entry': {
        const entryIndex = context.entries.findIndex(e => e.id === args.entry_id);
        if (entryIndex === -1) {
          return JSON.stringify({ error: `Entry ${args.entry_id} not found` });
        }
        const previous = { ...context.entries[entryIndex] };
        const updates: Partial<Entry> = {};
        if (args.name) updates.name = args.name;
        if (args.description) updates.description = args.description;
        if (args.aliases) updates.aliases = args.aliases;
        if (args.hidden_info) updates.hiddenInfo = args.hidden_info;

        Object.assign(context.entries[entryIndex], updates);
        await context.onUpdateEntry(args.entry_id, updates);
        this.changes.push({ type: 'update', entry: context.entries[entryIndex], previous });
        return JSON.stringify({ success: true, id: args.entry_id });
      }

      case 'merge_entries': {
        const entryIds = args.entry_ids as string[];
        const entriesToMerge = context.entries.filter(e => entryIds.includes(e.id));
        if (entriesToMerge.length !== entryIds.length) {
          return JSON.stringify({ error: 'Some entries not found' });
        }

        // Use the type of the first entry
        const mergedEntry = this.createEntry(context.storyId, {
          name: args.merged_name,
          type: entriesToMerge[0].type,
          description: args.merged_description,
          aliases: args.merged_aliases || [],
        });

        // Remove old entries from context
        context.entries = context.entries.filter(e => !entryIds.includes(e.id));
        context.entries.push(mergedEntry);

        await context.onMergeEntries(entryIds, mergedEntry);
        this.changes.push({ type: 'merge', entry: mergedEntry, mergedFrom: entryIds });
        return JSON.stringify({ success: true, id: mergedEntry.id, mergedFrom: entryIds });
      }

      case 'delete_entry': {
        const entryIndex = context.entries.findIndex(e => e.id === args.entry_id);
        if (entryIndex === -1) {
          return JSON.stringify({ error: `Entry ${args.entry_id} not found` });
        }
        const deleted = context.entries.splice(entryIndex, 1)[0];
        await context.onDeleteEntry(args.entry_id);
        this.changes.push({ type: 'delete', entry: deleted });
        return JSON.stringify({ success: true, id: args.entry_id });
      }

      case 'get_recent_story': {
        const count = args.message_count || 50;
        const recent = context.recentMessages.slice(-count);
        return JSON.stringify(recent.map(m => ({
          id: m.id,
          type: m.type,
          content: m.content,
          position: m.position,
        })));
      }

      case 'list_chapters': {
        return JSON.stringify(context.chapters.map(c => ({
          number: c.number,
          title: c.title,
          summary: c.summary,
          characters: c.characters,
          locations: c.locations,
        })));
      }

      case 'get_chapter_summary': {
        const chapter = context.chapters.find(c => c.number === args.chapter_number);
        if (!chapter) {
          return JSON.stringify({ error: `Chapter ${args.chapter_number} not found` });
        }
        return JSON.stringify({
          number: chapter.number,
          title: chapter.title,
          summary: chapter.summary,
          characters: chapter.characters,
          locations: chapter.locations,
          plotThreads: chapter.plotThreads,
          emotionalTone: chapter.emotionalTone,
        });
      }

      case 'query_chapter': {
        if (context.onQueryChapter) {
          const answer = await context.onQueryChapter(args.chapter_number, args.question);
          return JSON.stringify({ chapter: args.chapter_number, question: args.question, answer });
        }
        // Fallback: return summary
        const chapter = context.chapters.find(c => c.number === args.chapter_number);
        if (!chapter) {
          return JSON.stringify({ error: `Chapter ${args.chapter_number} not found` });
        }
        return JSON.stringify({
          chapter: args.chapter_number,
          question: args.question,
          answer: `Based on summary: ${chapter.summary}`,
        });
      }

      case 'query_chapters': {
        // For range queries, concatenate summaries
        const chapters = context.chapters.filter(
          c => c.number >= args.start_chapter && c.number <= args.end_chapter
        );
        if (chapters.length === 0) {
          return JSON.stringify({ error: 'No chapters in range' });
        }
        const combinedSummary = chapters.map(c =>
          `Chapter ${c.number}: ${c.summary}`
        ).join('\n\n');
        return JSON.stringify({
          range: { start: args.start_chapter, end: args.end_chapter },
          question: args.question,
          answer: `Based on summaries:\n${combinedSummary}`,
        });
      }

      case 'finish_lore_management': {
        this.changes.push({ type: 'complete', summary: args.summary });
        return JSON.stringify({ success: true, message: 'Lore management complete' });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolCall.function.name}` });
    }
  }

  private createEntry(storyId: string, args: {
    name: string;
    type: EntryType;
    description: string;
    aliases?: string[];
    hidden_info?: string;
  }): Entry {
    const now = Date.now();
    const id = crypto.randomUUID();

    // Create type-specific state
    const state = this.createDefaultState(args.type);

    return {
      id,
      storyId,
      name: args.name,
      type: args.type,
      description: args.description,
      hiddenInfo: args.hidden_info || null,
      aliases: args.aliases || [],
      state,
      adventureState: null,
      creativeState: null,
      injection: {
        mode: 'keyword',
        keywords: [args.name.toLowerCase(), ...(args.aliases || []).map(a => a.toLowerCase())],
        priority: 0,
      },
      firstMentioned: null,
      lastMentioned: null,
      mentionCount: 0,
      createdBy: 'ai',
      createdAt: now,
      updatedAt: now,
      loreManagementBlacklisted: false,
    };
  }

  private createDefaultState(type: EntryType): EntryState {
    switch (type) {
      case 'character':
        return {
          type: 'character',
          isPresent: false,
          lastSeenLocation: null,
          currentDisposition: null,
          relationship: { level: 0, status: 'neutral', history: [] },
          knownFacts: [],
          revealedSecrets: [],
        } as CharacterEntryState;

      case 'location':
        return {
          type: 'location',
          isCurrentLocation: false,
          visitCount: 0,
          changes: [],
          presentCharacters: [],
          presentItems: [],
        } as LocationEntryState;

      case 'item':
        return {
          type: 'item',
          inInventory: false,
          currentLocation: null,
          condition: null,
          uses: [],
        } as ItemEntryState;

      case 'faction':
        return {
          type: 'faction',
          playerStanding: 0,
          status: 'unknown',
          knownMembers: [],
        } as FactionEntryState;

      case 'concept':
        return {
          type: 'concept',
          revealed: false,
          comprehensionLevel: 'unknown',
          relatedEntries: [],
        } as ConceptEntryState;

      case 'event':
        return {
          type: 'event',
          occurred: false,
          occurredAt: null,
          witnesses: [],
          consequences: [],
        } as EventEntryState;
    }
  }
}

// Settings interface
export interface LoreManagementSettings {
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
}

export function getDefaultLoreManagementSettings(): LoreManagementSettings {
  return {
    model: 'minimax/minimax-m2.1', // Good for agentic tool calling with reasoning
    temperature: 0.3,
    maxIterations: 20,
    systemPrompt: DEFAULT_LORE_MANAGEMENT_PROMPT,
  };
}
