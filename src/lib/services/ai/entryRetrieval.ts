/**
 * Entry Retrieval Service for Aventura
 * Per design doc section 3.2.3: Tiered Injection
 *
 * Implements three tiers of entry injection for lorebook entries:
 * - Tier 1: Always inject (injection.mode === 'always', or state-based like isPresent)
 * - Tier 2: Keyword matching (match name/aliases/keywords against user input & recent story)
 * - Tier 3: LLM selection (remaining entries sent to LLM to decide relevance)
 */

import type { Entry, EntryType, StoryEntry } from '$lib/types';
import type { OpenRouterProvider } from './openrouter';
import { settings } from '$lib/stores/settings.svelte';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[EntryRetrieval]', ...args);
  }
}

export interface EntryRetrievalConfig {
  /** Maximum entries to include from Tier 3 (0 = unlimited) */
  maxTier3Entries: number;
  /** Enable LLM selection for Tier 3 */
  enableLLMSelection: boolean;
  /** Number of recent story entries to check for keyword matching */
  recentEntriesCount: number;
  /** Model to use for Tier 3 selection */
  tier3Model: string;
}

export const DEFAULT_ENTRY_RETRIEVAL_CONFIG: EntryRetrievalConfig = {
  maxTier3Entries: 0, // No limit - select all relevant
  enableLLMSelection: true,
  recentEntriesCount: 5,
  tier3Model: 'x-ai/grok-4.1-fast',
};

export interface RetrievedEntry {
  entry: Entry;
  tier: 1 | 2 | 3;
  priority: number;
  matchReason?: string;
}

export interface EntryRetrievalResult {
  tier1: RetrievedEntry[];
  tier2: RetrievedEntry[];
  tier3: RetrievedEntry[];
  all: RetrievedEntry[];
  contextBlock: string;
}

export class EntryRetrievalService {
  private provider: OpenRouterProvider | null;
  private config: EntryRetrievalConfig;

  constructor(provider: OpenRouterProvider | null, config: Partial<EntryRetrievalConfig> = {}) {
    this.provider = provider;
    this.config = { ...DEFAULT_ENTRY_RETRIEVAL_CONFIG, ...config };
  }

  /**
   * Retrieve relevant entries using tiered injection.
   *
   * Tier 1: Always injected (injection.mode === 'always' or state-based conditions)
   * Tier 2: Keyword matched (name/aliases/keywords match user input or recent story)
   * Tier 3: LLM selection (remaining entries evaluated by LLM for relevance)
   */
  async getRelevantEntries(
    entries: Entry[],
    userInput: string,
    recentStoryEntries: StoryEntry[]
  ): Promise<EntryRetrievalResult> {
    if (entries.length === 0) {
      return {
        tier1: [],
        tier2: [],
        tier3: [],
        all: [],
        contextBlock: '',
      };
    }

    log('getRelevantEntries called', {
      totalEntries: entries.length,
      userInputLength: userInput.length,
      recentCount: recentStoryEntries.length,
    });

    // Build search content from user input and recent story
    const recentContent = recentStoryEntries
      .slice(-this.config.recentEntriesCount)
      .map(e => e.content)
      .join(' ');
    const searchContent = `${userInput} ${recentContent}`.toLowerCase();

    // Tier 1: Always inject - entries with injection.mode === 'always' or state-based
    const tier1 = this.getTier1Entries(entries);
    log('Tier 1 entries (always active):', tier1.length, tier1.map(e => e.entry.name));

    // Get IDs already in tier 1
    const tier1Ids = new Set(tier1.map(e => e.entry.id));

    // Filter to entries that could be in tier 2 or 3 (not tier 1, not 'never' mode)
    const candidateEntries = entries.filter(e => !tier1Ids.has(e.id) && e.injection.mode !== 'never');

    // Tier 2: Keyword matching - check name, aliases, keywords against search content
    const tier2 = this.getTier2Entries(candidateEntries, searchContent);
    log('Tier 2 entries (keyword matched):', tier2.length, tier2.map(e => e.entry.name));

    // Get IDs already in tier 1 or tier 2
    const tier1And2Ids = new Set([...tier1Ids, ...tier2.map(e => e.entry.id)]);

    // Remaining entries for Tier 3 LLM selection
    const remainingEntries = candidateEntries.filter(e => !tier1And2Ids.has(e.id));
    log('Remaining entries for Tier 3 LLM:', remainingEntries.length);

    // Tier 3: LLM selection for remaining entries
    let tier3: RetrievedEntry[] = [];

    if (this.config.enableLLMSelection && remainingEntries.length > 0 && this.provider) {
      log('Sending remaining entries to LLM for selection:', remainingEntries.length);
      tier3 = await this.getLLMSelectedEntries(remainingEntries, userInput, recentStoryEntries);
      log('Tier 3 entries (LLM selected):', tier3.length, tier3.map(e => e.entry.name));
    }

    // Combine and sort by priority
    const all = [...tier1, ...tier2, ...tier3].sort((a, b) => b.priority - a.priority);

    // Build context block
    const contextBlock = this.buildContextBlock(tier1, tier2, tier3);

    return { tier1, tier2, tier3, all, contextBlock };
  }

  /**
   * Tier 2: Keyword matching.
   * Match entry name, aliases, and keywords against user input and recent story content.
   */
  private getTier2Entries(entries: Entry[], searchContent: string): RetrievedEntry[] {
    const result: RetrievedEntry[] = [];

    for (const entry of entries) {
      const matchedKeywords: string[] = [];

      // Check entry name
      if (this.textMatches(entry.name, searchContent)) {
        matchedKeywords.push(entry.name);
      }

      // Check aliases
      if (entry.aliases) {
        for (const alias of entry.aliases) {
          if (this.textMatches(alias, searchContent)) {
            matchedKeywords.push(alias);
          }
        }
      }

      // Check injection keywords
      if (entry.injection.keywords) {
        for (const keyword of entry.injection.keywords) {
          if (this.textMatches(keyword, searchContent)) {
            matchedKeywords.push(keyword);
          }
        }
      }

      if (matchedKeywords.length > 0) {
        result.push({
          entry,
          tier: 2,
          priority: 70 + entry.injection.priority,
          matchReason: `matched: ${[...new Set(matchedKeywords)].join(', ')}`,
        });
      }
    }

    return result;
  }

  /**
   * Tier 1: Always inject entries.
   * - Entries with injection.mode === 'always'
   * - Characters that are present (state.isPresent === true)
   * - Current location (state.isCurrentLocation === true)
   * - Items in inventory (state.inInventory === true)
   */
  private getTier1Entries(entries: Entry[]): RetrievedEntry[] {
    const result: RetrievedEntry[] = [];

    for (const entry of entries) {
      let shouldInclude = false;
      let priority = 0;
      let reason = '';

      // Check injection mode
      if (entry.injection.mode === 'always') {
        shouldInclude = true;
        priority = 100;
        reason = 'always inject';
      }

      // Check state-based conditions
      if (entry.state) {
        switch (entry.state.type) {
          case 'character':
            if ('isPresent' in entry.state && entry.state.isPresent) {
              shouldInclude = true;
              priority = Math.max(priority, 95);
              reason = 'character present';
            }
            break;
          case 'location':
            if ('isCurrentLocation' in entry.state && entry.state.isCurrentLocation) {
              shouldInclude = true;
              priority = Math.max(priority, 100);
              reason = 'current location';
            }
            break;
          case 'item':
            if ('inInventory' in entry.state && entry.state.inInventory) {
              shouldInclude = true;
              priority = Math.max(priority, 80);
              reason = 'in inventory';
            }
            break;
          case 'faction':
            // Include factions player is allied/hostile with
            if ('status' in entry.state && (entry.state.status === 'allied' || entry.state.status === 'hostile')) {
              shouldInclude = true;
              priority = Math.max(priority, 70);
              reason = `faction ${entry.state.status}`;
            }
            break;
        }
      }

      if (shouldInclude) {
        result.push({
          entry,
          tier: 1,
          priority,
          matchReason: reason,
        });
      }
    }

    return result;
  }

  /**
   * Tier 3: LLM-based selection for entries not matched by Tier 1 or Tier 2.
   * Evaluates remaining entries for contextual relevance.
   */
  private async getLLMSelectedEntries(
    availableEntries: Entry[],
    userInput: string,
    recentStoryEntries: StoryEntry[]
  ): Promise<RetrievedEntry[]> {
    if (!this.provider || availableEntries.length === 0) return [];

    // Build context for LLM - show more of the recent story
    const recentContent = recentStoryEntries
      .slice(-5)
      .map(e => {
        const prefix = e.type === 'user_action' ? '[ACTION]' : '[NARRATION]';
        return `${prefix}: ${e.content.substring(0, 400)}`;
      })
      .join('\n\n');

    // Build numbered entry list (simple 1, 2, 3...)
    const entryList = availableEntries
      .map((e, i) => `${i + 1}. [${e.type.toUpperCase()}] "${e.name}": ${e.description.substring(0, 250)}${e.description.length > 250 ? '...' : ''}`)
      .join('\n');

    const prompt = `You are a lorebook retrieval system. These entries were NOT matched by keyword search. Your job is to select any that are still relevant to the current scene.

## Current Scene
${recentContent || '(Story just started)'}

## User's Next Action
"${userInput}"

## Available Lorebook Entries (not keyword-matched)
${entryList}

## Instructions
Select entries that are contextually relevant even though they weren't keyword-matched. Include entries if they:
- Describe background lore, magic systems, or world rules that apply
- Are thematically connected to the current situation
- Provide context that would help the narrator
- Describe factions, organizations, or history relevant to current events

Be selective - these entries didn't match keywords, so only include ones with genuine contextual relevance.

Return ONLY a JSON array of numbers: [1, 2, 3, ...]
Return an empty array [] if none are relevant.`;

    try {
      const response = await this.provider.generateResponse({
        messages: [{ role: 'user', content: prompt }],
        model: this.config.tier3Model,
        temperature: 0.2,
        maxTokens: 300,
      });

      log('LLM selection response:', response.content);

      // Parse response - look for JSON array of numbers
      let selectedIndices: number[] = [];

      // Try to extract JSON array
      const jsonMatch = response.content.match(/\[[\d,\s]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            selectedIndices = parsed.filter(n => typeof n === 'number' && n > 0);
          }
        } catch {
          log('Failed to parse JSON array');
        }
      }

      // Fallback: extract any numbers from the response
      if (selectedIndices.length === 0) {
        const numMatches = response.content.matchAll(/\b(\d+)\b/g);
        for (const match of numMatches) {
          const num = parseInt(match[1], 10);
          if (num > 0 && num <= availableEntries.length) {
            selectedIndices.push(num);
          }
        }
        // Deduplicate
        selectedIndices = [...new Set(selectedIndices)];
      }

      log('Selected indices:', selectedIndices);

      // Map indices back to entries (1-indexed)
      const result: RetrievedEntry[] = [];

      for (const idx of selectedIndices) {
        const entry = availableEntries[idx - 1];
        if (entry) {
          result.push({
            entry,
            tier: 3,
            priority: 50 + entry.injection.priority,
            matchReason: 'contextually relevant',
          });
        }
      }

      // Apply max limit if configured (0 = unlimited)
      if (this.config.maxTier3Entries > 0) {
        return result.slice(0, this.config.maxTier3Entries);
      }

      return result;
    } catch (error) {
      log('LLM selection failed:', error);
      return [];
    }
  }

  /**
   * Check if text matches in search content.
   */
  private textMatches(text: string, searchContent: string): boolean {
    const normalized = text.toLowerCase().trim();
    if (normalized.length < 2) return false;

    // Exact match
    if (searchContent.includes(normalized)) {
      return true;
    }

    // Word boundary match
    const wordPattern = new RegExp(`\\b${this.escapeRegex(normalized)}\\b`, 'i');
    if (wordPattern.test(searchContent)) {
      return true;
    }

    return false;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build context block for prompt injection.
   */
  private buildContextBlock(
    tier1: RetrievedEntry[],
    tier2: RetrievedEntry[],
    tier3: RetrievedEntry[]
  ): string {
    const all = [...tier1, ...tier2, ...tier3];
    if (all.length === 0) return '';

    let block = `\n\n[LOREBOOK CONTEXT]
(CANONICAL - All information below is established lore. Do not contradict these facts.)`;

    // Group by type
    const byType: Record<EntryType, RetrievedEntry[]> = {
      character: [],
      location: [],
      item: [],
      faction: [],
      concept: [],
      event: [],
    };

    for (const retrieved of all) {
      byType[retrieved.entry.type].push(retrieved);
    }

    // Characters
    if (byType.character.length > 0) {
      block += '\n\n• Characters:';
      for (const { entry } of byType.character) {
        block += `\n  - ${entry.name}: ${entry.description}`;
        if (entry.state?.type === 'character') {
          const state = entry.state;
          if (state.currentDisposition) {
            block += ` [${state.currentDisposition}]`;
          }
        }
      }
    }

    // Locations
    if (byType.location.length > 0) {
      block += '\n\n• Locations:';
      for (const { entry } of byType.location) {
        block += `\n  - ${entry.name}: ${entry.description}`;
      }
    }

    // Items
    if (byType.item.length > 0) {
      block += '\n\n• Items:';
      for (const { entry } of byType.item) {
        block += `\n  - ${entry.name}: ${entry.description}`;
      }
    }

    // Factions
    if (byType.faction.length > 0) {
      block += '\n\n• Factions:';
      for (const { entry } of byType.faction) {
        block += `\n  - ${entry.name}: ${entry.description}`;
      }
    }

    // Concepts
    if (byType.concept.length > 0) {
      block += '\n\n• Lore:';
      for (const { entry } of byType.concept) {
        block += `\n  - ${entry.name}: ${entry.description}`;
      }
    }

    // Events
    if (byType.event.length > 0) {
      block += '\n\n• Events:';
      for (const { entry } of byType.event) {
        block += `\n  - ${entry.name}: ${entry.description}`;
      }
    }

    return block;
  }
}

/**
 * Quick function to get relevant entries without a full service instance.
 */
export async function getRelevantEntries(
  entries: Entry[],
  userInput: string,
  recentStoryEntries: StoryEntry[],
  provider?: OpenRouterProvider
): Promise<EntryRetrievalResult> {
  const service = new EntryRetrievalService(provider || null);
  return service.getRelevantEntries(entries, userInput, recentStoryEntries);
}
