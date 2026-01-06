/**
 * Lorebook Importer Service
 *
 * Imports lorebooks from various formats (primarily SillyTavern) into Aventura's Entry system.
 */

import type { Entry, EntryType, EntryInjectionMode, EntryCreator } from '$lib/types';
import { OpenAIProvider as OpenAIProvider } from './ai/openrouter';
import { settings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from '$lib/services/ai/requestOverrides';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[LorebookImporter]', ...args);
  }
}

// ===== SillyTavern Format Types =====

interface SillyTavernCharacterFilter {
  isExclude: boolean;
  names: string[];
  tags: string[];
}

interface SillyTavernEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;           // Entry name/title
  content: string;           // Entry description
  constant: boolean;         // Always inject
  vectorized: boolean;
  selective: boolean;        // Use keyword matching
  selectiveLogic: number;    // 0 = AND, 1 = OR, etc.
  addMemo: boolean;
  order: number;             // Priority
  position: number;
  disable: boolean;
  ignoreBudget: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  matchPersonaDescription: boolean;
  matchCharacterDescription: boolean;
  matchCharacterPersonality: boolean;
  matchCharacterDepthPrompt: boolean;
  matchScenario: boolean;
  matchCreatorNotes: boolean;
  delayUntilRecursion: number;
  probability: number;
  useProbability: boolean;
  depth: number;
  outletName: string;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: number | null;
  caseSensitive: boolean | null;
  matchWholeWords: boolean | null;
  useGroupScoring: boolean | null;
  automationId: string;
  role: string | null;
  sticky: boolean | null;
  cooldown: number | null;
  delay: number | null;
  triggers: string[];
  displayIndex: number;
  characterFilter: SillyTavernCharacterFilter;
}

interface SillyTavernLorebook {
  entries: Record<string, SillyTavernEntry>;
  // Optional metadata fields
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions?: Record<string, unknown>;
}

// ===== Import Result Types =====

export interface ImportedEntry {
  name: string;
  type: EntryType;
  description: string;
  keywords: string[];
  injectionMode: EntryInjectionMode;
  priority: number;
  disabled: boolean;
  group: string | null;
  originalData: SillyTavernEntry;
}

export interface LorebookImportResult {
  success: boolean;
  entries: ImportedEntry[];
  errors: string[];
  warnings: string[];
  metadata: {
    format: 'aventura' | 'sillytavern' | 'unknown';
    totalEntries: number;
    importedEntries: number;
    skippedEntries: number;
  };
}

// ===== Entry Type Inference =====

// Keywords that suggest entry types
const TYPE_KEYWORDS: Record<EntryType, string[]> = {
  character: [
    'character', 'person', 'npc', 'protagonist', 'antagonist', 'villain', 'hero',
    'he is', 'she is', 'they are', 'personality', 'appearance', 'occupation',
    'age:', 'gender:', 'species:', 'race:', 'class:'
  ],
  location: [
    'location', 'place', 'area', 'region', 'city', 'town', 'village', 'building',
    'room', 'forest', 'mountain', 'ocean', 'river', 'located in', 'found at',
    'geography', 'terrain', 'climate'
  ],
  item: [
    'item', 'weapon', 'armor', 'tool', 'artifact', 'object', 'equipment',
    'potion', 'scroll', 'key', 'contains', 'grants', 'provides', 'equip'
  ],
  faction: [
    'faction', 'organization', 'guild', 'group', 'clan', 'tribe', 'kingdom',
    'empire', 'alliance', 'order', 'members', 'leader', 'founded'
  ],
  concept: [
    'concept', 'magic', 'system', 'rule', 'lore', 'history', 'tradition',
    'technology', 'science', 'religion', 'culture', 'custom', 'law'
  ],
  event: [
    'event', 'war', 'battle', 'ceremony', 'festival', 'disaster', 'catastrophe',
    'happened', 'occurred', 'took place', 'anniversary', 'historical'
  ],
};

/**
 * Infer the entry type from content and name.
 */
function inferEntryType(name: string, content: string): EntryType {
  const textToAnalyze = `${name} ${content}`.toLowerCase();

  // Count keyword matches for each type
  const scores: Record<EntryType, number> = {
    character: 0,
    location: 0,
    item: 0,
    faction: 0,
    concept: 0,
    event: 0,
  };

  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS) as [EntryType, string[]][]) {
    for (const keyword of keywords) {
      if (textToAnalyze.includes(keyword)) {
        scores[type]++;
      }
    }
  }

  // Find the type with the highest score
  let maxType: EntryType = 'concept'; // Default
  let maxScore = 0;

  for (const [type, score] of Object.entries(scores) as [EntryType, number][]) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type;
    }
  }

  return maxType;
}

/**
 * LLM-based entry type classification using configurable settings.
 * Classifies entries in batches with concurrent requests for faster processing.
 */
export async function classifyEntriesWithLLM(
  entries: ImportedEntry[],
  onProgress?: (classified: number, total: number) => void
): Promise<ImportedEntry[]> {
  if (entries.length === 0) return entries;

  // Get lorebook classifier settings
  const lorebookSettings = settings.systemServicesSettings.lorebookClassifier;

  // Use specified profile, or fall back to main narrative profile
  const profileId = lorebookSettings.profileId ?? settings.apiSettings.mainNarrativeProfileId;
  const apiSettings = settings.getApiSettingsForProfile(profileId);

  if (!apiSettings.openaiApiKey) {
    log('No API key available, skipping LLM classification');
    return entries;
  }

  const provider = new OpenAIProvider(apiSettings);
  const BATCH_SIZE = lorebookSettings.batchSize;
  const MAX_CONCURRENT = lorebookSettings.maxConcurrent;
  const classifiedEntries = [...entries];

  log('Starting LLM classification', {
    totalEntries: entries.length,
    batchSize: BATCH_SIZE,
    maxConcurrent: MAX_CONCURRENT,
    model: lorebookSettings.model,
  });

  // Create batches
  const batches: { startIndex: number; batch: ImportedEntry[]; batchIndex: number }[] = [];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    batches.push({
      startIndex: i,
      batch: entries.slice(i, i + BATCH_SIZE),
      batchIndex: Math.floor(i / BATCH_SIZE),
    });
  }

  // Process a single batch
  async function processBatch(batchInfo: { startIndex: number; batch: ImportedEntry[]; batchIndex: number }): Promise<void> {
    const { startIndex, batch, batchIndex } = batchInfo;

    try {
      const entriesForPrompt = batch.map((entry, idx) => ({
        index: startIndex + idx,
        name: entry.name,
        content: entry.description,
        keywords: entry.keywords,
      }));

      const prompt = `Classify each lorebook entry into exactly one category. The categories are:
- character: A person, creature, or being with personality/traits (NPCs, monsters, etc.)
- location: A place, area, building, or geographic feature
- item: An object, weapon, artifact, tool, or piece of equipment
- faction: An organization, group, guild, kingdom, or collective entity
- concept: A magic system, rule, tradition, technology, or abstract idea
- event: A historical occurrence, battle, ceremony, or significant happening

For each entry, output ONLY a JSON array with objects containing "index" and "type".

Entries to classify:
${JSON.stringify(entriesForPrompt, null, 2)}

Respond with ONLY valid JSON in this exact format:
[{"index": 0, "type": "character"}, {"index": 1, "type": "location"}, ...]`;

      const response = await provider.generateResponse({
        model: lorebookSettings.model,
        messages: [
          {
            role: 'system',
            content: lorebookSettings.systemPrompt,
          },
          { role: 'user', content: prompt },
        ],
        temperature: lorebookSettings.temperature,
        maxTokens: lorebookSettings.maxTokens,
        extraBody: buildExtraBody({
          manualMode: settings.advancedRequestSettings.manualMode,
          manualBody: lorebookSettings.manualBody,
          reasoningEffort: lorebookSettings.reasoningEffort,
          providerOnly: lorebookSettings.providerOnly,
        }),
      });

      // Parse the response
      try {
        let jsonStr = response.content.trim();
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }

        const classifications = JSON.parse(jsonStr) as { index: number; type: string }[];

        for (const classification of classifications) {
          const validTypes: EntryType[] = ['character', 'location', 'item', 'faction', 'concept', 'event'];
          if (
            typeof classification.index === 'number' &&
            classification.index >= 0 &&
            classification.index < classifiedEntries.length &&
            validTypes.includes(classification.type as EntryType)
          ) {
            classifiedEntries[classification.index] = {
              ...classifiedEntries[classification.index],
              type: classification.type as EntryType,
            };
          }
        }

        log(`Batch ${batchIndex + 1} classified`, {
          batchSize: batch.length,
          classified: classifications.length
        });
      } catch (parseError) {
        log('Failed to parse LLM classification response:', parseError);
      }
    } catch (error) {
      log('LLM classification batch failed:', error);
    }
  }

  // Process batches with concurrency limit
  let completedCount = 0;
  const totalBatches = batches.length;

  // Process in groups of MAX_CONCURRENT
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT);
    await Promise.all(concurrentBatches.map(processBatch));

    completedCount += concurrentBatches.length;
    const entriesCompleted = Math.min(completedCount * BATCH_SIZE, entries.length);

    if (onProgress) {
      onProgress(entriesCompleted, entries.length);
    }

    log(`Completed ${completedCount}/${totalBatches} batches`);
  }

  log('LLM classification complete');
  return classifiedEntries;
}

/**
 * Determine injection mode from SillyTavern entry flags.
 */
function determineInjectionMode(entry: SillyTavernEntry): EntryInjectionMode {
  if (entry.disable) {
    return 'never';
  }
  if (entry.constant) {
    return 'always';
  }
  if (entry.selective && entry.key.length > 0) {
    return 'keyword';
  }
  // Default to relevant (LLM-based selection)
  return 'relevant';
}

/**
 * Parse a SillyTavern lorebook JSON string.
 */
export function parseSillyTavernLorebook(jsonString: string): LorebookImportResult {
  const result: LorebookImportResult = {
    success: false,
    entries: [],
    errors: [],
    warnings: [],
    metadata: {
      format: 'unknown',
      totalEntries: 0,
      importedEntries: 0,
      skippedEntries: 0,
    },
  };

  try {
    const data = JSON.parse(jsonString);

    // Validate basic structure
    if (!data.entries || typeof data.entries !== 'object') {
      result.errors.push('Invalid lorebook format: missing "entries" object');
      return result;
    }

    result.metadata.format = 'sillytavern';

    const entries = Object.values(data.entries) as SillyTavernEntry[];
    result.metadata.totalEntries = entries.length;

    log('Parsing SillyTavern lorebook', {
      totalEntries: entries.length,
      name: data.name || 'Unnamed',
    });

    for (const entry of entries) {
      try {
        // Skip if no content AND no comment (empty entry)
        if (!entry.content?.trim() && !entry.comment?.trim()) {
          result.warnings.push(`Skipped empty entry (UID: ${entry.uid})`);
          result.metadata.skippedEntries++;
          continue;
        }

        // Use comment as name, fallback to first keyword or generate one
        let name = entry.comment?.trim();
        if (!name) {
          name = entry.key?.[0] || `Entry ${entry.uid}`;
          result.warnings.push(`Entry UID ${entry.uid} has no name, using "${name}"`);
        }

        // Combine primary and secondary keywords
        const keywords = [
          ...(entry.key || []),
          ...(entry.keysecondary || []),
        ].filter(k => k && k.trim());

        const importedEntry: ImportedEntry = {
          name,
          type: inferEntryType(name, entry.content || ''),
          description: entry.content || '',
          keywords,
          injectionMode: determineInjectionMode(entry),
          priority: entry.order ?? 100,
          disabled: entry.disable ?? false,
          group: entry.group?.trim() || null,
          originalData: entry,
        };

        result.entries.push(importedEntry);
        result.metadata.importedEntries++;

      } catch (entryError) {
        const errorMsg = entryError instanceof Error ? entryError.message : 'Unknown error';
        result.errors.push(`Failed to parse entry UID ${entry.uid}: ${errorMsg}`);
        result.metadata.skippedEntries++;
      }
    }

    result.success = result.metadata.importedEntries > 0;

    log('Import complete', {
      imported: result.metadata.importedEntries,
      skipped: result.metadata.skippedEntries,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
    result.errors.push(`Failed to parse JSON: ${errorMsg}`);
    log('Parse error:', parseError);
  }

  return result;
}

/**
 * Check if the data is in Aventura JSON format.
 * Aventura format is an array of Entry objects with specific fields.
 */
function isAventuraFormat(data: unknown): data is Entry[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return false;

  // Check if first item looks like an Entry object
  const first = data[0];
  return (
    typeof first === 'object' &&
    first !== null &&
    'name' in first &&
    'type' in first &&
    'description' in first &&
    'injection' in first &&
    typeof first.injection === 'object' &&
    first.injection !== null &&
    'mode' in first.injection
  );
}

/**
 * Parse an Aventura JSON lorebook (array of Entry objects).
 */
export function parseAventuraLorebook(jsonString: string): LorebookImportResult {
  const result: LorebookImportResult = {
    success: false,
    entries: [],
    errors: [],
    warnings: [],
    metadata: {
      format: 'aventura',
      totalEntries: 0,
      importedEntries: 0,
      skippedEntries: 0,
    },
  };

  try {
    const data = JSON.parse(jsonString);

    if (!isAventuraFormat(data)) {
      result.errors.push('Invalid Aventura format: expected array of Entry objects');
      result.metadata.format = 'unknown';
      return result;
    }

    result.metadata.totalEntries = data.length;

    log('Parsing Aventura lorebook', { totalEntries: data.length });

    for (const entry of data) {
      try {
        // Validate required fields
        if (!entry.name?.trim()) {
          result.warnings.push(`Skipped entry with no name`);
          result.metadata.skippedEntries++;
          continue;
        }

        if (!entry.description?.trim() && !entry.hiddenInfo?.trim()) {
          result.warnings.push(`Skipped empty entry: ${entry.name}`);
          result.metadata.skippedEntries++;
          continue;
        }

        // Convert Entry to ImportedEntry format for consistency
        const importedEntry: ImportedEntry = {
          name: entry.name,
          type: entry.type || 'concept',
          description: entry.description || '',
          keywords: entry.injection?.keywords || [],
          injectionMode: entry.injection?.mode || 'keyword',
          priority: entry.injection?.priority ?? 100,
          disabled: entry.injection?.mode === 'never',
          group: null,
          originalData: entry as unknown as SillyTavernEntry, // Store original for full restoration
        };

        result.entries.push(importedEntry);
        result.metadata.importedEntries++;

      } catch (entryError) {
        const errorMsg = entryError instanceof Error ? entryError.message : 'Unknown error';
        result.errors.push(`Failed to parse entry "${entry.name}": ${errorMsg}`);
        result.metadata.skippedEntries++;
      }
    }

    result.success = result.metadata.importedEntries > 0;

    log('Aventura import complete', {
      imported: result.metadata.importedEntries,
      skipped: result.metadata.skippedEntries,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
    result.errors.push(`Failed to parse JSON: ${errorMsg}`);
    log('Parse error:', parseError);
  }

  return result;
}

/**
 * Auto-detect format and parse a lorebook JSON string.
 * Supports both Aventura and SillyTavern formats.
 */
export function parseLorebook(jsonString: string): LorebookImportResult {
  try {
    const data = JSON.parse(jsonString);

    // Check for Aventura format (array of Entry objects)
    if (isAventuraFormat(data)) {
      log('Detected Aventura format');
      return parseAventuraLorebook(jsonString);
    }

    // Check for SillyTavern format (object with entries property)
    if (data && typeof data === 'object' && 'entries' in data) {
      log('Detected SillyTavern format');
      return parseSillyTavernLorebook(jsonString);
    }

    // Unknown format
    return {
      success: false,
      entries: [],
      errors: ['Unknown lorebook format. Expected Aventura JSON array or SillyTavern format.'],
      warnings: [],
      metadata: {
        format: 'unknown',
        totalEntries: 0,
        importedEntries: 0,
        skippedEntries: 0,
      },
    };

  } catch (parseError) {
    const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown error';
    return {
      success: false,
      entries: [],
      errors: [`Failed to parse JSON: ${errorMsg}`],
      warnings: [],
      metadata: {
        format: 'unknown',
        totalEntries: 0,
        importedEntries: 0,
        skippedEntries: 0,
      },
    };
  }
}

/**
 * Convert imported entries to Aventura Entry format.
 * For Aventura imports, restores original Entry data when available.
 * Note: Entries are created without storyId - this should be set when saving to database.
 */
export function convertToEntries(
  importedEntries: ImportedEntry[],
  createdBy: EntryCreator = 'import'
): Omit<Entry, 'id' | 'storyId'>[] {
  const now = Date.now();

  return importedEntries.map(imported => {
    // Check if originalData is a full Aventura Entry (has state and injection.mode)
    const original = imported.originalData as unknown as Partial<Entry>;
    const isAventuraEntry = original && 'state' in original && 'injection' in original && original.injection?.mode;

    // For Aventura imports, restore the full entry data
    if (isAventuraEntry && original.state) {
      return {
        name: original.name || imported.name,
        type: original.type || imported.type,
        description: original.description || imported.description,
        hiddenInfo: original.hiddenInfo || null,
        aliases: original.aliases || [],
        state: original.state,
        adventureState: original.adventureState || null,
        creativeState: original.creativeState || null,
        injection: original.injection || {
          mode: imported.injectionMode,
          keywords: imported.keywords,
          priority: imported.priority,
        },
        firstMentioned: original.firstMentioned || null,
        lastMentioned: original.lastMentioned || null,
        mentionCount: original.mentionCount || 0,
        createdBy,
        createdAt: now,
        updatedAt: now,
        loreManagementBlacklisted: original.loreManagementBlacklisted || false,
      };
    }

    // For SillyTavern imports, create new state based on type
    const baseState = { type: imported.type };

    // Create type-specific state
    let state: Entry['state'];
    switch (imported.type) {
      case 'character':
        state = {
          ...baseState,
          type: 'character',
          isPresent: false,
          lastSeenLocation: null,
          currentDisposition: null,
          relationship: {
            level: 0,
            status: 'unknown',
            history: [],
          },
          knownFacts: [],
          revealedSecrets: [],
        };
        break;
      case 'location':
        state = {
          ...baseState,
          type: 'location',
          isCurrentLocation: false,
          visitCount: 0,
          changes: [],
          presentCharacters: [],
          presentItems: [],
        };
        break;
      case 'item':
        state = {
          ...baseState,
          type: 'item',
          inInventory: false,
          currentLocation: null,
          condition: null,
          uses: [],
        };
        break;
      case 'faction':
        state = {
          ...baseState,
          type: 'faction',
          playerStanding: 0,
          status: 'unknown',
          knownMembers: [],
        };
        break;
      case 'event':
        state = {
          ...baseState,
          type: 'event',
          occurred: false,
          occurredAt: null,
          witnesses: [],
          consequences: [],
        };
        break;
      case 'concept':
      default:
        state = {
          ...baseState,
          type: 'concept',
          revealed: false,
          comprehensionLevel: 'unknown',
          relatedEntries: [],
        };
        break;
    }

    return {
      name: imported.name,
      type: imported.type,
      description: imported.description,
      hiddenInfo: null,
      aliases: imported.keywords.slice(0, 5), // Use first 5 keywords as aliases
      state,
      adventureState: null,
      creativeState: null,
      injection: {
        mode: imported.injectionMode,
        keywords: imported.keywords,
        priority: imported.priority,
      },
      firstMentioned: null,
      lastMentioned: null,
      mentionCount: 0,
      createdBy,
      createdAt: now,
      updatedAt: now,
      loreManagementBlacklisted: false,
    };
  });
}

/**
 * Parse a lorebook file and return a preview of the entries.
 * This is used in the wizard to show users what will be imported.
 */
export function previewLorebook(jsonString: string): {
  success: boolean;
  preview: {
    name: string;
    type: EntryType;
    hasContent: boolean;
    keywordCount: number;
    injectionMode: EntryInjectionMode;
  }[];
  errors: string[];
  totalCount: number;
} {
  const result = parseSillyTavernLorebook(jsonString);

  return {
    success: result.success,
    preview: result.entries.map(e => ({
      name: e.name,
      type: e.type,
      hasContent: e.description.length > 0,
      keywordCount: e.keywords.length,
      injectionMode: e.injectionMode,
    })),
    errors: result.errors,
    totalCount: result.metadata.totalEntries,
  };
}

/**
 * Group imported entries by their type for display.
 */
export function groupEntriesByType(entries: ImportedEntry[]): Record<EntryType, ImportedEntry[]> {
  const grouped: Record<EntryType, ImportedEntry[]> = {
    character: [],
    location: [],
    item: [],
    faction: [],
    concept: [],
    event: [],
  };

  for (const entry of entries) {
    grouped[entry.type].push(entry);
  }

  return grouped;
}

/**
 * Get summary statistics for imported entries.
 */
export function getImportSummary(entries: ImportedEntry[]): {
  total: number;
  byType: Record<EntryType, number>;
  withContent: number;
  withKeywords: number;
  alwaysInject: number;
  disabled: number;
} {
  const byType: Record<EntryType, number> = {
    character: 0,
    location: 0,
    item: 0,
    faction: 0,
    concept: 0,
    event: 0,
  };

  let withContent = 0;
  let withKeywords = 0;
  let alwaysInject = 0;
  let disabled = 0;

  for (const entry of entries) {
    byType[entry.type]++;
    if (entry.description.length > 0) withContent++;
    if (entry.keywords.length > 0) withKeywords++;
    if (entry.injectionMode === 'always') alwaysInject++;
    if (entry.disabled) disabled++;
  }

  return {
    total: entries.length,
    byType,
    withContent,
    withKeywords,
    alwaysInject,
    disabled,
  };
}
