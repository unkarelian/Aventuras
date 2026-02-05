/**
 * Lorebook CRUD Tools
 *
 * Tool definitions for lorebook entry management.
 * These tools are used by LoreManagementService and InteractiveLorebookService.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { VaultLorebookEntry } from '$lib/types'
import {
  entryTypeSchema,
  injectionModeSchema,
  vaultLorebookEntrySchema,
  type PendingChangeSchema,
} from '../schemas/lorebook'

/**
 * Chapter info for lore management context.
 */
export interface ChapterInfo {
  number: number
  title: string | null
  summary: string
  keywords?: string[]
  characters?: string[]
}

/**
 * Context provided to lorebook tools.
 * Tools are factory functions that capture this context.
 */
export interface LorebookToolContext {
  /** Current entries in the lorebook */
  entries: VaultLorebookEntry[]
  /** Callback to register a pending change */
  onPendingChange: (change: PendingChangeSchema) => void
  /** Generate unique ID for pending changes */
  generateId: () => string
  /** Available chapters for querying */
  chapters?: ChapterInfo[]
  /** Callback to query a chapter with a question */
  queryChapter?: (chapterNumber: number, question: string) => Promise<string>
}

/**
 * Create lorebook tools with the given context.
 * Each invocation creates fresh tools bound to the current entries.
 */
export function createLorebookTools(context: LorebookToolContext) {
  const { entries, onPendingChange, generateId, chapters, queryChapter } = context

  return {
    /**
     * List available chapters for querying.
     */
    list_chapters: tool({
      description:
        'List all available chapters with their summaries. Use this to understand the story timeline before making lore updates.',
      inputSchema: z.object({
        limit: z.number().optional().default(20).describe('Maximum chapters to return'),
      }),
      execute: async ({ limit }: { limit?: number }) => {
        if (!chapters || chapters.length === 0) {
          return { chapters: [], total: 0, message: 'No chapters available' }
        }
        const limitedChapters = chapters.slice(0, limit ?? 20)
        return {
          chapters: limitedChapters.map((ch) => ({
            number: ch.number,
            title: ch.title,
            summary: ch.summary.slice(0, 500) + (ch.summary.length > 500 ? '...' : ''),
            keywords: ch.keywords,
            characters: ch.characters,
          })),
          total: chapters.length,
        }
      },
    }),

    /**
     * Ask a question about a specific chapter.
     */
    query_chapter: tool({
      description:
        'Ask a specific question about a chapter to understand story events for lore updates. Ask targeted questions like "What did [character] do?" or "What was revealed about [item]?"',
      inputSchema: z.object({
        chapterNumber: z.number().describe('The chapter number to query'),
        question: z.string().describe('A specific question about the chapter content'),
      }),
      execute: async ({ chapterNumber, question }: { chapterNumber: number; question: string }) => {
        if (!chapters || chapters.length === 0) {
          return { found: false, error: 'No chapters available' }
        }

        const chapter = chapters.find((ch) => ch.number === chapterNumber)
        if (!chapter) {
          return { found: false, error: `Chapter ${chapterNumber} not found` }
        }

        let answer: string | undefined
        if (queryChapter) {
          try {
            answer = await queryChapter(chapterNumber, question)
          } catch {
            // Query failed, return summary only
          }
        }

        return {
          found: true,
          chapter: {
            number: chapter.number,
            title: chapter.title,
            summary: chapter.summary,
          },
          question,
          answer: answer ?? 'Unable to answer - using summary only',
        }
      },
    }),

    /**
     * List all lorebook entries with optional type filter.
     */
    list_entries: tool({
      description:
        'List all lorebook entries. Optionally filter by type. Returns entry summaries with indices for further operations.',
      inputSchema: z.object({
        type: entryTypeSchema
          .optional()
          .describe('Filter entries by type (character, location, item, faction, concept, event)'),
        includeDisabled: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include disabled entries in the list'),
      }),
      execute: async ({
        type,
        includeDisabled,
      }: {
        type?: z.infer<typeof entryTypeSchema>
        includeDisabled?: boolean
      }) => {
        let filtered = entries

        if (type) {
          filtered = filtered.filter((e) => e.type === type)
        }

        if (!includeDisabled) {
          filtered = filtered.filter((e) => !e.disabled)
        }

        return {
          entries: filtered.map((e) => {
            // Find original index in full entries array
            const originalIndex = entries.indexOf(e)
            return {
              index: originalIndex,
              name: e.name,
              type: e.type,
              description: e.description.slice(0, 200) + (e.description.length > 200 ? '...' : ''),
              keywords: e.keywords.slice(0, 5),
              disabled: e.disabled,
            }
          }),
          total: filtered.length,
        }
      },
    }),

    /**
     * Read full details of a specific entry by index.
     */
    read_entry: tool({
      description:
        'Read the full details of a lorebook entry by its index. Use list_entries first to find entry indices.',
      inputSchema: z.object({
        index: z.number().describe('The index of the entry to read (from list_entries)'),
      }),
      execute: async ({ index }: { index: number }) => {
        if (index < 0 || index >= entries.length) {
          return {
            found: false,
            error: `Entry index ${index} out of range (0-${entries.length - 1})`,
          }
        }

        return {
          found: true,
          index,
          entry: entries[index],
        }
      },
    }),

    /**
     * Create a new lorebook entry.
     * Returns a pending change for approval workflow.
     */
    create_entry: tool({
      description: 'Create a new lorebook entry. The change will be pending until approved.',
      inputSchema: z.object({
        name: z.string().describe('Name of the entry'),
        type: entryTypeSchema.describe('Type of entry'),
        description: z.string().describe('Full description of the entry'),
        keywords: z.array(z.string()).describe('Keywords that will trigger this entry'),
        injectionMode: injectionModeSchema
          .optional()
          .default('keyword')
          .describe('When to inject (default: keyword)'),
        priority: z
          .number()
          .optional()
          .default(50)
          .describe('Injection priority 0-100 (default: 50)'),
        group: z
          .string()
          .nullable()
          .optional()
          .default(null)
          .describe('Optional group for organization'),
      }),
      execute: async ({
        name,
        type,
        description,
        keywords,
        injectionMode,
        priority,
        group,
      }: {
        name: string
        type: z.infer<typeof entryTypeSchema>
        description: string
        keywords: string[]
        injectionMode?: z.infer<typeof injectionModeSchema>
        priority?: number
        group?: string | null
      }) => {
        const newEntry: VaultLorebookEntry = {
          name,
          type,
          description,
          keywords,
          injectionMode: injectionMode ?? 'keyword',
          priority: priority ?? 50,
          disabled: false,
          group: group ?? null,
        }

        const changeId = generateId()
        const pendingChange: PendingChangeSchema = {
          id: changeId,
          type: 'create',
          toolCallId: changeId,
          entry: newEntry,
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending entry "${name}" (${type}). Awaiting approval.`,
        }
      },
    }),

    /**
     * Update an existing lorebook entry.
     * Returns a pending change for approval workflow.
     */
    update_entry: tool({
      description:
        'Update an existing lorebook entry by index. Only include fields you want to change. The change will be pending until approved.',
      inputSchema: z.object({
        index: z.number().describe('Index of the entry to update'),
        name: z.string().optional().describe('New name'),
        type: entryTypeSchema.optional().describe('New type'),
        description: z.string().optional().describe('New description'),
        keywords: z.array(z.string()).optional().describe('New keywords (replaces existing)'),
        injectionMode: injectionModeSchema.optional().describe('New injection mode'),
        priority: z.number().optional().describe('New priority'),
        disabled: z.boolean().optional().describe('Enable/disable the entry'),
        group: z.string().nullable().optional().describe('New group'),
      }),
      execute: async ({
        index,
        ...updates
      }: {
        index: number
        name?: string
        type?: z.infer<typeof entryTypeSchema>
        description?: string
        keywords?: string[]
        injectionMode?: z.infer<typeof injectionModeSchema>
        priority?: number
        disabled?: boolean
        group?: string | null
      }) => {
        if (index < 0 || index >= entries.length) {
          return {
            success: false,
            error: `Entry index ${index} out of range (0-${entries.length - 1})`,
          }
        }

        const previous = entries[index]
        const changeId = generateId()

        // Filter out undefined values
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, v]) => v !== undefined),
        ) as Partial<VaultLorebookEntry>

        const pendingChange: PendingChangeSchema = {
          id: changeId,
          type: 'update',
          toolCallId: changeId,
          index,
          updates: cleanUpdates,
          previous,
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending update for "${previous.name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Delete a lorebook entry.
     * Returns a pending change for approval workflow.
     */
    delete_entry: tool({
      description: 'Delete a lorebook entry by index. The change will be pending until approved.',
      inputSchema: z.object({
        index: z.number().describe('Index of the entry to delete'),
        reason: z.string().optional().describe('Reason for deletion'),
      }),
      execute: async ({ index, reason }: { index: number; reason?: string }) => {
        if (index < 0 || index >= entries.length) {
          return {
            success: false,
            error: `Entry index ${index} out of range (0-${entries.length - 1})`,
          }
        }

        const previous = entries[index]
        const changeId = generateId()

        const pendingChange: PendingChangeSchema = {
          id: changeId,
          type: 'delete',
          toolCallId: changeId,
          index,
          previous,
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending deletion for "${previous.name}"${reason ? ` (${reason})` : ''}. Awaiting approval.`,
        }
      },
    }),

    /**
     * Merge multiple entries into one.
     * Returns a pending change for approval workflow.
     */
    merge_entries: tool({
      description:
        'Merge multiple lorebook entries into a single entry. Useful for consolidating duplicate or related entries. The change will be pending until approved.',
      inputSchema: z.object({
        indices: z.array(z.number()).min(2).describe('Indices of entries to merge (at least 2)'),
        mergedEntry: vaultLorebookEntrySchema.describe('The resulting merged entry'),
      }),
      execute: async ({
        indices,
        mergedEntry,
      }: {
        indices: number[]
        mergedEntry: VaultLorebookEntry
      }) => {
        // Validate all indices
        for (const idx of indices) {
          if (idx < 0 || idx >= entries.length) {
            return {
              success: false,
              error: `Entry index ${idx} out of range (0-${entries.length - 1})`,
            }
          }
        }

        // Check for duplicates
        const uniqueIndices = [...new Set(indices)]
        if (uniqueIndices.length !== indices.length) {
          return {
            success: false,
            error: 'Duplicate indices provided',
          }
        }

        const previousEntries = indices.map((i) => entries[i])
        const changeId = generateId()

        const pendingChange: PendingChangeSchema = {
          id: changeId,
          type: 'merge',
          toolCallId: changeId,
          indices: uniqueIndices,
          entry: mergedEntry,
          previousEntries,
          status: 'pending',
        }

        onPendingChange(pendingChange)

        const names = previousEntries.map((e) => e.name).join(', ')
        return {
          success: true,
          pendingChange,
          message: `Created pending merge of [${names}] into "${mergedEntry.name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Terminal tool to finish lore management session.
     * Signals completion of the agentic loop.
     */
    finish_lore_management: tool({
      description:
        'Call this when you have finished reviewing and updating the lorebook. Provide a summary of all changes made.',
      inputSchema: z.object({
        summary: z.string().describe('Summary of all changes made during this session'),
        entriesCreated: z.number().describe('Number of entries created'),
        entriesUpdated: z.number().describe('Number of entries updated'),
        entriesDeleted: z.number().describe('Number of entries deleted'),
        entriesMerged: z.number().describe('Number of merge operations performed'),
      }),
      execute: async (args: {
        summary: string
        entriesCreated: number
        entriesUpdated: number
        entriesDeleted: number
        entriesMerged: number
      }) => {
        // This tool's execution is a signal to stop the agent loop
        return {
          completed: true,
          ...args,
        }
      },
    }),
  }
}

export type LorebookTools = ReturnType<typeof createLorebookTools>
