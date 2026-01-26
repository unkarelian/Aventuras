/**
 * Character Card Importer Service
 *
 * Imports SillyTavern character cards (V1/V2 JSON format) into Aventura's wizard.
 * Supports both JSON files and PNG files with embedded character data.
 * Converts character cards into scenario settings with the card character as an NPC.
 */

import type { StoryMode } from '$lib/types';
import type { Genre, GeneratedCharacter } from '$lib/services/ai/scenario';
import { OpenAIProvider } from './ai/openrouter';
import { settings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from '$lib/services/ai/requestOverrides';
import { promptService, type PromptContext } from './prompts';
import { tryParseJsonWithHealing } from './ai/jsonHealing';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[CharacterCardImporter]', ...args);
  }
}

// ===== PNG Metadata Extraction =====

/**
 * PNG signature bytes
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

/**
 * Check if the data is a PNG file by examining the signature
 */
export function isPngFile(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (bytes.length < 8) return false;
  
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Extract character card JSON from PNG metadata.
 * SillyTavern embeds character data in a tEXt chunk with keyword "chara",
 * containing base64-encoded JSON.
 * 
 * @param data - PNG file data as ArrayBuffer or Uint8Array
 * @returns The decoded JSON string, or null if not found
 */
export function extractCharacterCardFromPng(data: ArrayBuffer | Uint8Array): string | null {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  
  if (!isPngFile(bytes)) {
    log('Not a valid PNG file');
    return null;
  }
  
  // Skip PNG signature (8 bytes)
  let offset = 8;
  
  while (offset < bytes.length) {
    // Read chunk length (4 bytes, big-endian)
    if (offset + 4 > bytes.length) break;
    const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;
    
    // Read chunk type (4 bytes)
    if (offset + 4 > bytes.length) break;
    const type = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    offset += 4;
    
    // Check if this is a tEXt chunk
    if (type === 'tEXt') {
      // Read chunk data
      if (offset + length > bytes.length) break;
      const chunkData = bytes.slice(offset, offset + length);
      
      // tEXt format: keyword (null-terminated) + text
      // Find the null separator
      let nullIndex = -1;
      for (let i = 0; i < chunkData.length; i++) {
        if (chunkData[i] === 0) {
          nullIndex = i;
          break;
        }
      }
      
      if (nullIndex > 0) {
        const keyword = new TextDecoder('latin1').decode(chunkData.slice(0, nullIndex));
        
        // Check if this is the "chara" chunk
        if (keyword.toLowerCase() === 'chara') {
          const textData = chunkData.slice(nullIndex + 1);
          const base64String = new TextDecoder('latin1').decode(textData);
          
          try {
            // Decode base64 to get JSON
            const jsonString = atob(base64String);
            log('Found character data in PNG tEXt chunk');
            return jsonString;
          } catch (e) {
            log('Failed to decode base64 character data:', e);
            return null;
          }
        }
      }
    }
    
    // Skip chunk data and CRC (4 bytes)
    offset += length + 4;
    
    // Stop at IEND chunk
    if (type === 'IEND') break;
  }
  
  log('No character data found in PNG');
  return null;
}

/**
 * Read a file and extract character card JSON.
 * Handles both JSON files (direct text) and PNG files (embedded metadata).
 * 
 * @param file - The file to read
 * @returns The JSON string containing character card data
 */
export async function readCharacterCardFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();
  
  if (fileName.endsWith('.png')) {
    log('Reading PNG file:', file.name);
    const arrayBuffer = await file.arrayBuffer();
    const jsonString = extractCharacterCardFromPng(arrayBuffer);
    
    if (!jsonString) {
      throw new Error('No character data found in PNG file. The image may not be a valid SillyTavern character card.');
    }
    
    return jsonString;
  }
  
  // Assume JSON for other files
  log('Reading JSON file:', file.name);
  return await file.text();
}

// ===== SillyTavern Card Types =====

/**
 * SillyTavern V1 card format (also the core data for V2)
 */
export interface SillyTavernCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
}

/**
 * SillyTavern V2/V3 card format (V3 has same structure as V2)
 */
export interface SillyTavernCardV2 {
  spec: 'chara_card_v2' | 'chara_card_v3';
  spec_version: string;
  data: SillyTavernCardV1 & {
    creator_notes?: string;
    system_prompt?: string;
    post_history_instructions?: string;
    alternate_greetings?: string[];
    character_book?: unknown; // Lorebook - ignored for this import
    tags?: string[];
    creator?: string;
    character_version?: string;
    extensions?: Record<string, unknown>;
  };
  // V3 cards also duplicate fields at root level
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  tags?: string[];
}

/**
 * Parsed card data (normalized from V1, V2, or V3)
 */
export interface ParsedCard {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  exampleMessages: string;
  creator_notes?: string;
  tags?: string[];
  version: 'v1' | 'v2' | 'v3';
}

/**
 * Result of card import/conversion
 */
export interface CardImportResult {
  success: boolean;
  settingSeed: string;
  /** NPCs identified from the card content */
  npcs: GeneratedCharacter[];
  /** The primary character name (for replacing {{char}} in first_mes) */
  primaryCharacterName: string;
  /** Card name to use as story title */
  storyTitle: string;
  /** First message to use as opening scene (with {{char}} replaced) */
  firstMessage: string;
  /** Alternate greetings the user can choose from (with {{char}} replaced) */
  alternateGreetings: string[];
  errors: string[];
}

// ===== Card Parsing =====

/**
 * Check if the data is a V2 or V3 card
 */
function isV2OrV3Card(data: unknown): data is SillyTavernCardV2 {
  if (typeof data !== 'object' || data === null) return false;
  if (!('spec' in data) || !('data' in data)) return false;
  const spec = (data as SillyTavernCardV2).spec;
  return spec === 'chara_card_v2' || spec === 'chara_card_v3';
}

/**
 * Check if the data is a V1 card
 */
function isV1Card(data: unknown): data is SillyTavernCardV1 {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    'description' in data &&
    !('spec' in data) // V2 cards have spec field
  );
}

/**
 * Parse a character card JSON string into normalized format.
 * Supports both V1 and V2 SillyTavern formats.
 */
export function parseCharacterCard(jsonString: string): ParsedCard | null {
  try {
    const data = JSON.parse(jsonString);

    if (isV2OrV3Card(data)) {
      const version = data.spec === 'chara_card_v3' ? 'v3' : 'v2';
      log(`Detected ${version.toUpperCase()} card format`);
      return {
        name: data.data.name || data.name || 'Unknown Character',
        description: data.data.description || data.description || '',
        personality: data.data.personality || data.personality || '',
        scenario: data.data.scenario || data.scenario || '',
        firstMessage: data.data.first_mes || data.first_mes || '',
        alternateGreetings: data.data.alternate_greetings || [],
        exampleMessages: data.data.mes_example || data.mes_example || '',
        creator_notes: data.data.creator_notes || data.creator_notes,
        tags: data.data.tags || data.tags,
        version,
      };
    }

    if (isV1Card(data)) {
      log('Detected V1 card format');
      return {
        name: data.name || 'Unknown Character',
        description: data.description || '',
        personality: data.personality || '',
        scenario: data.scenario || '',
        firstMessage: data.first_mes || '',
        alternateGreetings: [],
        exampleMessages: data.mes_example || '',
        version: 'v1',
      };
    }

    log('Unknown card format');
    return null;
  } catch (error) {
    log('Failed to parse card JSON:', error);
    return null;
  }
}

// ===== Macro Replacement =====

/**
 * Normalize {{user}} macro to consistent case.
 * We keep {{user}} in the text - it will be replaced with protagonist name at story creation time.
 */
export function normalizeUserMacro(text: string): string {
  if (!text) return '';

  // Normalize to consistent {{user}} case
  return text.replace(/\{\{user\}\}/gi, '{{user}}');
}

// ===== LLM Conversion =====

/**
 * Build the combined card content for LLM processing.
 * Combines scenario, description, personality, and example messages.
 * Note: first_mes and alternate_greetings are excluded - they go to step 7.
 * Note: {{user}} is normalized but kept - will be replaced with protagonist name at story creation.
 * Note: {{char}} is left for LLM to interpret.
 */
function buildCardContext(card: ParsedCard): string {
  const sections: string[] = [];

  // Always include scenario if present
  if (card.scenario.trim()) {
    sections.push(`<scenario>\n${normalizeUserMacro(card.scenario)}\n</scenario>`);
  }

  // Always include character description
  if (card.description.trim()) {
    sections.push(`<character_description>\n${normalizeUserMacro(card.description)}\n</character_description>`);
  }

  // Always include personality
  if (card.personality.trim()) {
    sections.push(`<personality>\n${normalizeUserMacro(card.personality)}\n</personality>`);
  }

  // Include example messages for additional lore/context
  if (card.exampleMessages.trim()) {
    sections.push(`<example_messages>\n${normalizeUserMacro(card.exampleMessages)}\n</example_messages>`);
  }

  return sections.join('\n\n');
}

/**
 * Convert a parsed character card into a scenario setting using LLM.
 */
export async function convertCardToScenario(
  jsonString: string,
  mode: StoryMode,
  genre: Genre,
  profileId?: string | null
): Promise<CardImportResult> {
  // Parse the card
  const card = parseCharacterCard(jsonString);
  if (!card) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: '',
      storyTitle: '',
      firstMessage: '',
      alternateGreetings: [],
      errors: ['Failed to parse character card. Please ensure the file is a valid SillyTavern character card JSON.'],
    };
  }

  log('Parsed card:', { name: card.name, version: card.version });

  const cardTitle = card.name;

  // Pre-process first message and alternate greetings - normalize {{user}} case
  // {{char}} will be replaced after LLM determines the actual character name
  const preprocessedFirstMessage = normalizeUserMacro(card.firstMessage);
  const preprocessedAlternateGreetings = card.alternateGreetings.map(g => normalizeUserMacro(g));

  // Get preset configuration from Agent Profiles system
  const presetId = settings.getServicePresetId('characterCardImport');
  const preset = settings.getPresetConfig(presetId, 'Character Card Import');

  // Use specified profile, or fall back to preset profile, or main narrative profile
  const resolvedProfileId = profileId ?? preset.profileId ?? settings.apiSettings.mainNarrativeProfileId;
  const apiSettings = settings.getApiSettingsForProfile(resolvedProfileId);

  if (!apiSettings.openaiApiKey) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: ['No API key configured. Please set up an API key to convert character cards.'],
    };
  }

  const provider = new OpenAIProvider(apiSettings);

  // Build the card context - normalize {{user}}, keep {{char}} for LLM to interpret
  const cardContext = buildCardContext(card);

  if (!cardContext.trim()) {
    return {
      success: false,
      settingSeed: '',
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: ['Character card appears to be empty. No content found to convert.'],
    };
  }

  const context: PromptContext = {
    mode: 'adventure',
    pov: 'second',
    tense: 'present',
    protagonistName: '{{user}}',
  };

  const systemPrompt = promptService.renderPrompt('character-card-import', context);
  const userPrompt = promptService.renderUserPrompt('character-card-import', context, {
    genre,
    title: cardTitle,
    cardContent: cardContext,
  });

  log('Sending to LLM for conversion...');

  try {
    const response = await provider.generateResponse({
      model: preset.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      extraBody: buildExtraBody({
        manualMode: settings.advancedRequestSettings.manualMode,
        manualBody: preset.manualBody,
        reasoningEffort: preset.reasoningEffort,
        providerOnly: preset.providerOnly,
      }),
    });

    log('LLM response received, parsing...');

    interface LLMNpc {
      name: string;
      role: string;
      description: string;
      personality: string;
      relationship: string;
    }

    interface ConversionResult {
      primaryCharacterName: string;
      settingSeed: string;
      npcs: LLMNpc[];
    }

    const result = tryParseJsonWithHealing<ConversionResult>(response.content);
    if (!result) {
      throw new Error('Failed to parse LLM conversion response');
    }

    // Get the primary character name for replacing {{char}} in first_mes
    const primaryName = result.primaryCharacterName || cardTitle;

    // Convert LLM NPCs to GeneratedCharacter format
    const npcs: GeneratedCharacter[] = (result.npcs || []).map(npc => ({
      name: npc.name || 'Unknown',
      role: npc.role || 'NPC',
      description: npc.description || '',
      relationship: npc.relationship || 'acquaintance',
      traits: npc.personality
        ? npc.personality.split(/[,;]/).map(t => t.trim()).filter(t => t.length > 0).slice(0, 5)
        : [],
    }));

    // Replace {{char}} in first message and alternate greetings with the actual character name
    const finalFirstMessage = preprocessedFirstMessage.replace(/\{\{char\}\}/gi, primaryName);
    const finalAlternateGreetings = preprocessedAlternateGreetings.map(g => g.replace(/\{\{char\}\}/gi, primaryName));

    log('Conversion successful:', { 
      settingSeedLength: result.settingSeed?.length, 
      primaryName,
      npcCount: npcs.length 
    });

    return {
      success: true,
      settingSeed: result.settingSeed || '',
      npcs,
      primaryCharacterName: primaryName,
      storyTitle: cardTitle,
      firstMessage: finalFirstMessage,
      alternateGreetings: finalAlternateGreetings,
      errors: [],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error during conversion';
    log('LLM conversion failed:', error);

    // Return a fallback with basic extraction (keep {{char}} as-is since we couldn't determine the name)
    const fallbackDescription = normalizeUserMacro(
      [card.scenario, card.description].filter(s => s.trim()).join('\n\n')
    );

    return {
      success: false,
      settingSeed: fallbackDescription.slice(0, 2000),
      npcs: [],
      primaryCharacterName: cardTitle,
      storyTitle: cardTitle,
      firstMessage: preprocessedFirstMessage,
      alternateGreetings: preprocessedAlternateGreetings,
      errors: [`LLM conversion failed: ${errorMsg}. Basic extraction was used as fallback.`],
    };
  }
}

/**
 * Sanitized character result from vault-character-import prompt.
 * Maps to VaultCharacter fields.
 */
export interface SanitizedCharacter {
  name: string;
  description: string;
  traits: string[];
  visualDescriptors: string[];
}

/**
 * Sanitize a character card using LLM to extract clean character data.
 * Used for importing characters into the Vault.
 */
export async function sanitizeCharacterCard(
  jsonString: string,
  profileId?: string | null
): Promise<SanitizedCharacter | null> {
  const card = parseCharacterCard(jsonString);
  if (!card) {
    log('Failed to parse card for sanitization');
    return null;
  }

  log('Sanitizing card:', card.name);

  // Get preset configuration from Agent Profiles system
  const presetId = settings.getServicePresetId('characterCardImport');
  const preset = settings.getPresetConfig(presetId, 'Character Card Import');
  const resolvedProfileId = profileId ?? preset.profileId ?? settings.apiSettings.mainNarrativeProfileId;
  const apiSettings = settings.getApiSettingsForProfile(resolvedProfileId);

  if (!apiSettings.openaiApiKey) {
    log('No API key for sanitization');
    return null;
  }

  const provider = new OpenAIProvider(apiSettings);
  const cardContext = buildCardContext(card);

  if (!cardContext.trim()) {
    log('Empty card context');
    return null;
  }

  const context: PromptContext = {
    mode: 'adventure',
    pov: 'second',
    tense: 'present',
    protagonistName: '{{user}}',
  };

  // Use the vault-character-import prompt for clean extraction
  const userPrompt = promptService.renderUserPrompt('vault-character-import', context, {
    cardContent: cardContext,
  });

  const systemPrompt = promptService.renderPrompt('vault-character-import', context);

  try {
    log('Sending to LLM for sanitization...');
    const response = await provider.generateResponse({
      model: preset.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: preset.temperature,
      maxTokens: preset.maxTokens,
      extraBody: buildExtraBody({
        manualMode: settings.advancedRequestSettings.manualMode,
        manualBody: preset.manualBody,
        reasoningEffort: preset.reasoningEffort,
        providerOnly: preset.providerOnly,
      }),
    });

    log('LLM response received');

    interface VaultImportResult {
      name: string;
      description: string;
      traits: string[];
      visualDescriptors: string[];
    }

    const result = tryParseJsonWithHealing<VaultImportResult>(response.content);
    if (!result) {
      throw new Error('Failed to parse LLM vault import response');
    }

    // Validate and normalize the result
    return {
      name: result.name || card.name,
      description: result.description || '',
      traits: Array.isArray(result.traits) ? result.traits.slice(0, 10) : [],
      visualDescriptors: Array.isArray(result.visualDescriptors) ? result.visualDescriptors : [],
    };
  } catch (error) {
    log('Sanitization failed:', error);
    return null;
  }
}
