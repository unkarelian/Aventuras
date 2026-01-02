import { settings } from '$lib/stores/settings.svelte';
import { OpenRouterProvider } from './openrouter';
import type { Message } from './types';
import type { StoryMode, POV, Character, Location, Item } from '$lib/types';

const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[ScenarioService]', ...args);
  }
}

// Default model for scenario generation - fast and capable
export const SCENARIO_MODEL = 'deepseek/deepseek-v3.2';

// Provider preference - prioritize Deepseek with fallbacks, require all parameters
export const SCENARIO_PROVIDER = { order: ['deepseek'], require_parameters: true };

export type Genre = 'fantasy' | 'scifi' | 'modern' | 'horror' | 'mystery' | 'romance' | 'custom';
export type Tense = 'past' | 'present';

// Advanced settings for customizing generation processes
export interface ProcessSettings {
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface AdvancedWizardSettings {
  settingExpansion: ProcessSettings;
  protagonistGeneration: ProcessSettings;
  characterElaboration: ProcessSettings;
  supportingCharacters: ProcessSettings;
  openingGeneration: ProcessSettings;
}

// Default prompts for each process (can be exported for UI editing)
export const DEFAULT_PROMPTS = {
  settingExpansion: `You are a world-building expert creating settings for interactive fiction. Generate rich, evocative settings that inspire creative storytelling.

You MUST respond with valid JSON matching this exact schema:
{
  "name": "string - a memorable name for this setting/world",
  "description": "string - 2-3 paragraphs describing the world, its rules, and atmosphere",
  "keyLocations": [
    { "name": "string", "description": "string - 1-2 sentences" }
  ],
  "atmosphere": "string - the overall mood and feeling of this world",
  "themes": ["string array - 3-5 themes this setting explores"],
  "potentialConflicts": ["string array - 3-5 story hooks or conflicts"]
}

Be creative but grounded. Make the setting feel lived-in and full of story potential.`,

  characterElaboration: `You are a character development expert. The user has provided some details about their character. Your job is to elaborate and enrich these details while staying true to their vision.

You MUST respond with valid JSON matching this exact schema:
{
  "name": "string - keep the user's name if provided, or suggest one if not",
  "description": "string - 2-3 sentences expanding on who they are",
  "background": "string - 2-3 sentences about their history, elaborating on what the user provided",
  "motivation": "string - what drives them, expanding on the user's input",
  "traits": ["string array - 4-5 personality traits, incorporating any the user mentioned"],
  "appearance": "string - brief physical description if not provided"
}

Rules:
- Preserve everything the user specified - don't contradict or replace their ideas
- Add depth and detail to flesh out what they provided
- Fill in gaps they left blank with fitting suggestions`,

  protagonistGeneration: `You are a character creation expert for interactive fiction. Create compelling protagonists that readers will want to embody or follow.

You MUST respond with valid JSON matching this exact schema:
{
  "name": "string - a fitting name for this character (or leave generic if POV is second person)",
  "description": "string - 1-2 sentences about who they are",
  "background": "string - 2-3 sentences about their history",
  "motivation": "string - what drives them, what they want",
  "traits": ["string array - 3-5 personality traits"],
  "appearance": "string - brief physical description (optional for 2nd person)"
}

Create a protagonist that fits naturally into the setting and has interesting story potential.`,

  supportingCharacters: `You are a character creation expert. Create compelling supporting characters that complement the protagonist and drive story conflict.

You MUST respond with valid JSON: an array of character objects:
[
  {
    "name": "string",
    "role": "string - their role in the story (ally, antagonist, mentor, love interest, etc.)",
    "description": "string - 1-2 sentences about who they are",
    "relationship": "string - their relationship to the protagonist",
    "traits": ["string array - 2-4 personality traits"]
  }
]

Create diverse characters with different roles and personalities.`,

  openingGeneration: `You are crafting the opening scene of an interactive story.

<critical_constraints>
# ABSOLUTE RULES - VIOLATION IS FAILURE
1. **NEVER write what the protagonist does** - no actions, movements, or gestures
2. **NEVER write what the protagonist says** - no dialogue or speech
3. **NEVER write what the protagonist thinks or feels** - no internal states, emotions, or reactions
4. **NEVER write what the protagonist perceives** - avoid "you see", "you notice", "you hear" constructions
5. **Only describe the environment, NPCs, and situation** - let the protagonist decide how to engage
</critical_constraints>

<what_to_write>
Write ONLY:
- The physical environment (sights, sounds, smells, textures)
- What NPCs are doing, saying, or how they're positioned
- Objects, details, and atmosphere of the scene
- Tension, stakes, or interesting elements present
</what_to_write>

<ending>
End by presenting a situation that naturally invites the protagonist to act:
- An NPC looking expectantly, mid-conversation
- A door ajar, a sound from within
- An object of interest within reach
- A choice point or moment of tension

NO questions. NO "What do you do?" Just the pregnant moment.
</ending>

Respond with valid JSON:
{
  "scene": "string - the opening (2-3 paragraphs describing environment/situation)",
  "title": "string - story title",
  "initialLocation": {
    "name": "string - location name",
    "description": "string - 1-2 sentences"
  }
}`,
};

export function getDefaultAdvancedSettings(): AdvancedWizardSettings {
  return {
    settingExpansion: {
      model: 'xiaomi/mimo-v2-flash:free', // mimo-v2-flash with reasoning for world elaboration
      systemPrompt: DEFAULT_PROMPTS.settingExpansion,
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
    },
    protagonistGeneration: {
      model: 'xiaomi/mimo-v2-flash:free', // mimo-v2-flash with reasoning for protagonist generation
      systemPrompt: DEFAULT_PROMPTS.protagonistGeneration,
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
    },
    characterElaboration: {
      model: 'xiaomi/mimo-v2-flash:free', // mimo-v2-flash with reasoning for character elaboration
      systemPrompt: DEFAULT_PROMPTS.characterElaboration,
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
    },
    supportingCharacters: {
      model: SCENARIO_MODEL, // deepseek for supporting characters
      systemPrompt: DEFAULT_PROMPTS.supportingCharacters,
      temperature: 0.3,
      maxTokens: 8192,
    },
    openingGeneration: {
      model: 'z-ai/glm-4.7', // GLM-4.7 with z-ai provider for opening generation
      systemPrompt: DEFAULT_PROMPTS.openingGeneration,
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
    },
  };
}

export interface WizardData {
  mode: StoryMode;
  genre: Genre;
  customGenre?: string;
  settingSeed: string;
  expandedSetting?: ExpandedSetting;
  protagonist?: GeneratedProtagonist;
  characters?: GeneratedCharacter[];
  writingStyle: {
    pov: POV;
    tense: Tense;
    tone: string;
  };
  title: string;
  openingGuidance?: string; // Creative writing mode: user guidance for the opening scene
}

export interface ExpandedSetting {
  name: string;
  description: string;
  keyLocations: {
    name: string;
    description: string;
  }[];
  atmosphere: string;
  themes: string[];
  potentialConflicts: string[];
}

export interface GeneratedProtagonist {
  name: string;
  description: string;
  background: string;
  motivation: string;
  traits: string[];
  appearance?: string;
}

export interface GeneratedCharacter {
  name: string;
  role: string;
  description: string;
  relationship: string;
  traits: string[];
}

export interface GeneratedOpening {
  scene: string;
  title: string;
  initialLocation: {
    name: string;
    description: string;
  };
}

class ScenarioService {
  private getProvider() {
    const apiKey = settings.apiSettings.openrouterApiKey;
    if (!apiKey) {
      throw new Error('No API key configured');
    }
    return new OpenRouterProvider(apiKey);
  }

  /**
   * Robust JSON parsing that handles various markdown code block formats.
   */
  private parseJsonResponse<T>(content: string): T | null {
    let jsonStr = content.trim();

    // Method 1: Strip markdown code blocks if the response is wrapped in them
    if (jsonStr.startsWith('```')) {
      // Remove opening ``` with optional language identifier
      jsonStr = jsonStr.replace(/^```(?:json|JSON)?\s*\n?/, '');
      // Remove closing ```
      jsonStr = jsonStr.replace(/\n?```\s*$/, '');
      jsonStr = jsonStr.trim();
    }

    // Method 2: Try to parse as-is
    try {
      return JSON.parse(jsonStr) as T;
    } catch {
      // Continue to other methods
    }

    // Method 3: Extract JSON object {...} from anywhere in the string
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]) as T;
      } catch {
        // Continue
      }
    }

    // Method 4: Extract JSON array [...] from anywhere in the string
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]) as T;
      } catch {
        // Continue
      }
    }

    log('All JSON parsing methods failed for:', content.substring(0, 200));
    return null;
  }

  /**
   * Expand a user's seed prompt into a full setting description.
   */
  async expandSetting(
    seed: string,
    genre: Genre,
    customGenre?: string,
    overrides?: ProcessSettings,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<ExpandedSetting> {
    log('expandSetting called', { seed, genre, hasOverrides: !!overrides, lorebookEntries: lorebookEntries?.length ?? 0 });

    const provider = this.getProvider();
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const systemPrompt = overrides?.systemPrompt || DEFAULT_PROMPTS.settingExpansion;

    // Build lorebook context if entries are provided - include ALL entries with full descriptions
    // to avoid hallucinating details that contradict established lore
    let lorebookContext = '';
    if (lorebookEntries && lorebookEntries.length > 0) {
      const entriesByType: Record<string, { name: string; description: string; hiddenInfo?: string }[]> = {};
      for (const entry of lorebookEntries) {
        if (!entriesByType[entry.type]) {
          entriesByType[entry.type] = [];
        }
        entriesByType[entry.type].push({
          name: entry.name,
          description: entry.description,
          hiddenInfo: entry.hiddenInfo,
        });
      }

      lorebookContext = '\n\n## Existing Lore (from imported lorebook)\nThese are established canon elements. The expanded setting MUST be consistent with all of this lore:\n';
      for (const [type, entries] of Object.entries(entriesByType)) {
        if (entries.length > 0) {
          lorebookContext += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s:\n`;
          for (const entry of entries) {
            lorebookContext += `- **${entry.name}**: ${entry.description}`;
            if (entry.hiddenInfo) {
              lorebookContext += ` [Hidden lore: ${entry.hiddenInfo}]`;
            }
            lorebookContext += '\n';
          }
        }
      }
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Create a ${genreLabel} setting based on this seed idea:

"${seed}"
${lorebookContext}
Expand this into a rich, detailed world suitable for interactive storytelling.${lorebookEntries && lorebookEntries.length > 0 ? ' Make sure the setting is consistent with the existing lore provided above.' : ''}`
      }
    ];

    const model = overrides?.model || 'xiaomi/mimo-v2-flash:free';
    const isMimo = model.includes('mimo');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.8,
      topP: overrides?.topP ?? (isMimo ? 0.95 : undefined),
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: {
        provider: SCENARIO_PROVIDER,
        ...(isMimo && { reasoning: { max_tokens: 8000 } }),
      },
    });

    log('Setting expansion response received', { length: response.content.length });

    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const result = JSON.parse(jsonStr) as ExpandedSetting;
      log('Setting parsed successfully', { name: result.name });
      return result;
    } catch (error) {
      log('Failed to parse setting response', error);
      // Return a fallback based on the seed
      return {
        name: 'Unnamed World',
        description: seed,
        keyLocations: [{ name: 'Starting Location', description: 'Where the story begins.' }],
        atmosphere: 'Mysterious and full of potential.',
        themes: ['Adventure', 'Discovery'],
        potentialConflicts: ['Unknown dangers lurk ahead.'],
      };
    }
  }

  /**
   * Elaborate on user-provided character details using AI.
   */
  async elaborateCharacter(
    userInput: {
      name?: string;
      description?: string;
      background?: string;
      motivation?: string;
      traits?: string[];
    },
    setting: ExpandedSetting | null,
    genre: Genre,
    customGenre?: string,
    overrides?: ProcessSettings
  ): Promise<GeneratedProtagonist> {
    log('elaborateCharacter called', { userInput, genre, hasOverrides: !!overrides });

    const provider = this.getProvider();
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    // Build system prompt with context-specific additions
    let systemPrompt = overrides?.systemPrompt || DEFAULT_PROMPTS.characterElaboration;
    systemPrompt += `\n- Keep the tone appropriate for the ${genreLabel} genre`;
    if (setting) {
      systemPrompt += `\n- Make the character fit naturally into: ${setting.name}`;
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Elaborate on this character for a ${genreLabel} story:

${userInput.name ? `NAME: ${userInput.name}` : 'NAME: (suggest one)'}
${userInput.description ? `DESCRIPTION: ${userInput.description}` : ''}
${userInput.background ? `BACKGROUND: ${userInput.background}` : ''}
${userInput.motivation ? `MOTIVATION: ${userInput.motivation}` : ''}
${userInput.traits && userInput.traits.length > 0 ? `TRAITS: ${userInput.traits.join(', ')}` : ''}

${setting ? `SETTING: ${setting.name}\n${setting.description}` : ''}

Expand and enrich these details while staying true to what I've provided.`
      }
    ];

    // Use reasoning for mimo models
    const model = overrides?.model || 'xiaomi/mimo-v2-flash:free';
    const isMimo = model.includes('mimo');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.8,
      topP: overrides?.topP ?? (isMimo ? 0.95 : undefined),
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: {
        provider: SCENARIO_PROVIDER,
        ...(isMimo && { reasoning: { max_tokens: 8000 } }),
      },
    });

    log('Character elaboration response received', { length: response.content.length });

    try {
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const result = JSON.parse(jsonStr) as GeneratedProtagonist;
      log('Character elaboration parsed successfully', { name: result.name });
      return result;
    } catch (error) {
      log('Failed to parse character elaboration response', error);
      // Return what the user provided with minimal defaults
      return {
        name: userInput.name || 'The Protagonist',
        description: userInput.description || 'A mysterious figure.',
        background: userInput.background || 'Their past is shrouded in mystery.',
        motivation: userInput.motivation || 'To find their purpose.',
        traits: userInput.traits || ['Determined', 'Resourceful'],
      };
    }
  }

  /**
   * Generate a protagonist character based on the setting and mode.
   */
  async generateProtagonist(
    setting: ExpandedSetting,
    genre: Genre,
    mode: StoryMode,
    pov: POV,
    customGenre?: string,
    overrides?: ProcessSettings
  ): Promise<GeneratedProtagonist> {
    log('generateProtagonist called', { settingName: setting.name, genre, mode, pov, hasOverrides: !!overrides });

    const provider = this.getProvider();
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const povContext = pov === 'first'
      ? 'The reader will be this character, narrated in first person (I...).'
      : pov === 'second'
        ? 'The reader will be this character, narrated in second person (You...).'
        : 'This is the main viewpoint character for a third person narrative.';

    const modeContext = mode === 'adventure'
      ? 'This is for an interactive adventure where the reader makes choices as this character.'
      : 'This is for a creative writing project where this character drives the narrative.';

    // Build system prompt with context
    const basePrompt = overrides?.systemPrompt || DEFAULT_PROMPTS.protagonistGeneration;
    const systemPrompt = `${basePrompt}\n\n${povContext}\n${modeContext}`;

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Create a protagonist for this ${genreLabel} setting:

SETTING: ${setting.name}
${setting.description}

ATMOSPHERE: ${setting.atmosphere}

THEMES: ${setting.themes.join(', ')}

Generate a compelling protagonist who would fit naturally into this world.`
      }
    ];

    // Use MiMo with reasoning for protagonist generation
    const model = overrides?.model || 'xiaomi/mimo-v2-flash:free';
    const isMimo = model.includes('mimo');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.8,
      topP: overrides?.topP ?? (isMimo ? 0.95 : undefined),
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: {
        provider: SCENARIO_PROVIDER,
        ...(isMimo && { reasoning: { max_tokens: 8000 } }),
      },
    });

    log('Protagonist response received', { length: response.content.length });

    try {
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const result = JSON.parse(jsonStr) as GeneratedProtagonist;
      log('Protagonist parsed successfully', { name: result.name });
      return result;
    } catch (error) {
      log('Failed to parse protagonist response', error);
      return {
        name: pov === 'second' ? 'You' : 'The Protagonist',
        description: 'A wanderer seeking adventure.',
        background: 'Your past is your own to reveal.',
        motivation: 'To uncover the truth and find your purpose.',
        traits: ['Curious', 'Determined', 'Resourceful'],
      };
    }
  }

  /**
   * Generate supporting characters for creative writing mode.
   */
  async generateCharacters(
    setting: ExpandedSetting,
    protagonist: GeneratedProtagonist,
    genre: Genre,
    count: number = 3,
    customGenre?: string,
    overrides?: ProcessSettings
  ): Promise<GeneratedCharacter[]> {
    log('generateCharacters called', { settingName: setting.name, count, hasOverrides: !!overrides });

    const provider = this.getProvider();
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const messages: Message[] = [
      {
        role: 'system',
        content: overrides?.systemPrompt || DEFAULT_PROMPTS.supportingCharacters
      },
      {
        role: 'user',
        content: `Create ${count} supporting characters for this ${genreLabel} story:

SETTING: ${setting.name}
${setting.description}

PROTAGONIST: ${protagonist.name}
${protagonist.description}
Motivation: ${protagonist.motivation}

Generate ${count} interesting supporting characters who would create compelling dynamics with the protagonist.`
      }
    ];

    // Deepseek with lower temperature for consistency
    const response = await provider.generateResponse({
      messages,
      model: overrides?.model || SCENARIO_MODEL,
      temperature: overrides?.temperature ?? 0.3,
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: { provider: SCENARIO_PROVIDER },
    });

    log('Characters response received', { length: response.content.length });

    try {
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // For arrays, look for [...] pattern
        const jsonArrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          jsonStr = jsonArrayMatch[0];
        }
      }

      const result = JSON.parse(jsonStr) as GeneratedCharacter[];
      log('Characters parsed successfully', { count: result.length });
      return result;
    } catch (error) {
      log('Failed to parse characters response', error);
      return [];
    }
  }

  /**
   * Generate an opening scene based on all the setup data.
   */
  async generateOpening(
    wizardData: WizardData,
    overrides?: ProcessSettings,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<GeneratedOpening> {
    log('generateOpening called', {
      settingName: wizardData.expandedSetting?.name,
      protagonist: wizardData.protagonist?.name,
      mode: wizardData.mode,
      hasOverrides: !!overrides,
      lorebookEntries: lorebookEntries?.length ?? 0,
    });

    const provider = this.getProvider();
    const { mode, genre, customGenre, expandedSetting, protagonist, characters, writingStyle, title } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const userName = protagonist?.name || 'the protagonist';

    const tenseInstruction = writingStyle.tense === 'present'
      ? 'Use present tense.'
      : 'Use past tense.';

    // Build system prompt - use override if provided, otherwise build contextual prompt
    let systemPrompt: string;
    if (overrides?.systemPrompt) {
      // Replace placeholder tokens in custom prompt
      systemPrompt = overrides.systemPrompt
        .replace(/\{userName\}/g, userName)
        .replace(/\{genreLabel\}/g, genreLabel)
        .replace(/\{mode\}/g, mode)
        .replace(/\{tense\}/g, tenseInstruction)
        .replace(/\{tone\}/g, writingStyle.tone || 'immersive and engaging');
    } else {
      systemPrompt = `You are crafting the opening scene of an interactive ${genreLabel} ${mode === 'adventure' ? 'adventure' : 'story'}.

<critical_constraints>
# ABSOLUTE RULES - VIOLATION IS FAILURE
1. **NEVER write what ${userName} does** - no actions, movements, or gestures
2. **NEVER write what ${userName} says** - no dialogue or speech
3. **NEVER write what ${userName} thinks or feels** - no internal states, emotions, or reactions
4. **NEVER write what ${userName} perceives** - avoid "you see", "you notice", "you hear" constructions
5. **Only describe the environment, NPCs, and situation** - let ${userName} decide how to engage
</critical_constraints>

<what_to_write>
Write ONLY:
- The physical environment (sights, sounds, smells, textures)
- What NPCs are doing, saying, or how they're positioned
- Objects, details, and atmosphere of the scene
- Tension, stakes, or interesting elements present

Do NOT write:
- "${userName} walks into..." / "${userName} looks at..." / "${userName} feels..."
- "You notice..." / "You see..." / "You sense..."
- Any action, perception, or internal state belonging to ${userName}
</what_to_write>

<style>
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'immersive and engaging'}
- 2-3 paragraphs of environmental and situational detail
- Concrete sensory details, not abstractions
</style>

<ending>
End by presenting a situation that naturally invites ${userName} to act:
- An NPC looking expectantly, mid-conversation
- A door ajar, a sound from within
- An object of interest within reach
- A choice point or moment of tension

NO questions. NO "What do you do?" Just the pregnant moment.
</ending>

Respond with valid JSON:
{
  "scene": "string - the opening (2-3 paragraphs describing environment/situation, NOT ${userName}'s actions)",
  "title": "string - story title",
  "initialLocation": {
    "name": "string - location name",
    "description": "string - 1-2 sentences"
  }
}`;
    }

    // Build lorebook context if entries are provided - include ALL entries with full descriptions
    let lorebookContext = '';
    if (lorebookEntries && lorebookEntries.length > 0) {
      const entriesByType: Record<string, { name: string; description: string; hiddenInfo?: string }[]> = {};
      for (const entry of lorebookEntries) {
        if (!entriesByType[entry.type]) {
          entriesByType[entry.type] = [];
        }
        entriesByType[entry.type].push({
          name: entry.name,
          description: entry.description,
          hiddenInfo: entry.hiddenInfo,
        });
      }

      lorebookContext = '\n\n## LOREBOOK (Established Canon)\nThe opening scene MUST be consistent with this established lore:\n';
      for (const [type, entries] of Object.entries(entriesByType)) {
        if (entries.length > 0) {
          lorebookContext += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s:\n`;
          for (const entry of entries) {
            lorebookContext += `- **${entry.name}**: ${entry.description}`;
            if (entry.hiddenInfo) {
              lorebookContext += ` [Hidden lore: ${entry.hiddenInfo}]`;
            }
            lorebookContext += '\n';
          }
        }
      }
    }

    // Build opening guidance section if provided
    const guidanceSection = wizardData.openingGuidance?.trim()
      ? `\nAUTHOR'S GUIDANCE FOR OPENING:\n${wizardData.openingGuidance.trim()}\n`
      : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Create the opening scene:

TITLE: ${title || '(suggest one)'}

SETTING: ${expandedSetting?.name || 'Unknown World'}
${expandedSetting?.description || wizardData.settingSeed}

ATMOSPHERE: ${expandedSetting?.atmosphere || 'mysterious'}

PROTAGONIST: ${userName}
${protagonist?.description || ''}

${characters && characters.length > 0 ? `NPCs WHO MAY APPEAR:
${characters.map(c => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}
` : ''}${guidanceSection}${lorebookContext}
Describe the environment and situation. Do NOT write anything ${userName} does, says, thinks, or perceives. End with a moment that invites action.`
      }
    ];

    // Use z-ai provider for GLM models
    const model = overrides?.model || 'z-ai/glm-4.7';
    const isZAI = model.startsWith('z-ai/');
    const isGLM = model.includes('glm');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.8,
      topP: overrides?.topP ?? (isGLM ? 0.95 : undefined),
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: {
        provider: isZAI ? { order: ['z-ai'], require_parameters: true } : SCENARIO_PROVIDER,
        reasoning: { max_tokens: 8000 },
      },
    });

    log('Opening response received', { length: response.content.length });

    const result = this.parseJsonResponse<GeneratedOpening>(response.content);
    if (result) {
      log('Opening parsed successfully', { title: result.title });
      return result;
    }

    log('Failed to parse opening response, using fallback. Raw:', response.content.substring(0, 300));
    // Fallback: use the raw response as the scene (strip any markdown artifacts)
    let cleanedContent = response.content.trim();
    // Remove markdown code block wrapper if present
    cleanedContent = cleanedContent.replace(/^```(?:json|JSON)?\s*\n?/, '').replace(/\n?```\s*$/, '');

    return {
      scene: cleanedContent,
      title: title || 'Untitled Adventure',
      initialLocation: {
        name: expandedSetting?.keyLocations?.[0]?.name || 'Starting Location',
        description: expandedSetting?.keyLocations?.[0]?.description || 'Where the story begins.',
      },
    };
  }

  /**
   * Stream the opening scene generation for real-time display.
   */
  async *streamOpening(
    wizardData: WizardData,
    overrides?: ProcessSettings
  ): AsyncIterable<{ content: string; done: boolean }> {
    log('streamOpening called', { hasOverrides: !!overrides });

    const provider = this.getProvider();
    const { mode, genre, customGenre, expandedSetting, protagonist, writingStyle } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const userName = protagonist?.name || 'the protagonist';

    const tenseInstruction = writingStyle.tense === 'present'
      ? 'Use present tense.'
      : 'Use past tense.';

    // Build system prompt - use override if provided, otherwise build contextual prompt
    let systemPrompt: string;
    if (overrides?.systemPrompt) {
      // Replace placeholder tokens in custom prompt
      systemPrompt = overrides.systemPrompt
        .replace(/\{userName\}/g, userName)
        .replace(/\{genreLabel\}/g, genreLabel)
        .replace(/\{mode\}/g, mode)
        .replace(/\{tense\}/g, tenseInstruction)
        .replace(/\{tone\}/g, writingStyle.tone || 'immersive and engaging');
      // Add prose-only instruction for streaming
      systemPrompt += '\n\nWrite ONLY prose. No JSON, no metadata.';
    } else {
      systemPrompt = `You are crafting the opening scene of an interactive ${genreLabel} ${mode === 'adventure' ? 'adventure' : 'story'}.

<critical_constraints>
# ABSOLUTE RULES - VIOLATION IS FAILURE
1. **NEVER write what ${userName} does** - no actions, movements, or gestures
2. **NEVER write what ${userName} says** - no dialogue or speech
3. **NEVER write what ${userName} thinks or feels** - no internal states, emotions, or reactions
4. **NEVER write what ${userName} perceives** - avoid "you see", "you notice", "you hear"
5. **Only describe the environment, NPCs, and situation**
</critical_constraints>

<what_to_write>
Write ONLY:
- The physical environment (sights, sounds, smells, textures)
- What NPCs are doing, saying, or how they're positioned
- Objects, details, and atmosphere of the scene

Do NOT write:
- "${userName} walks..." / "${userName} looks..." / "${userName} feels..."
- "You notice..." / "You see..." / "You sense..."
- Any action or perception belonging to ${userName}
</what_to_write>

<style>
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'immersive and engaging'}
- 2-3 paragraphs of environmental and situational detail
</style>

<ending>
End with a situation inviting action: an NPC waiting, a door ajar, an object within reach.
NO questions. Just the pregnant moment.
</ending>

Write ONLY prose. No JSON, no metadata.`;
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: `Write the opening scene:

SETTING: ${expandedSetting?.name || 'Unknown World'}
${expandedSetting?.description || wizardData.settingSeed}

PROTAGONIST: ${userName}

Describe the environment and situation only. Do NOT write anything ${userName} does, says, thinks, or perceives.`
      }
    ];

    // Use z-ai provider for GLM models
    const model = overrides?.model || 'z-ai/glm-4.7';
    const isZAI = model.startsWith('z-ai/');
    const isGLM = model.includes('glm');

    for await (const chunk of provider.streamResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.8,
      topP: overrides?.topP ?? (isGLM ? 0.95 : undefined),
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: isZAI ? { provider: { order: ['z-ai'], require_parameters: true } } : undefined,
    })) {
      yield chunk;
    }
  }

  /**
   * Convert wizard data to story creation parameters.
   */
  prepareStoryData(wizardData: WizardData, opening: GeneratedOpening): {
    title: string;
    genre: string;
    mode: StoryMode;
    settings: { pov: POV };
    protagonist: Partial<Character>;
    startingLocation: Partial<Location>;
    initialItems: Partial<Item>[];
    openingScene: string;
    systemPrompt: string;
    characters: Partial<Character>[];
  } {
    const { mode, genre, customGenre, expandedSetting, protagonist, characters, writingStyle } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : this.capitalizeGenre(genre);

    // Build a custom system prompt based on the setting
    const systemPrompt = this.buildSystemPrompt(wizardData, expandedSetting);

    return {
      title: opening.title || wizardData.title,
      genre: genreLabel,
      mode,
      settings: { pov: writingStyle.pov },
      protagonist: {
        name: protagonist?.name || (writingStyle.pov === 'second' ? 'You' : 'The Protagonist'),
        description: protagonist?.description,
        relationship: 'self',
        traits: protagonist?.traits || [],
        status: 'active',
      },
      startingLocation: {
        name: opening.initialLocation.name,
        description: opening.initialLocation.description,
        visited: true,
        current: true,
        connections: [],
      },
      initialItems: [],
      openingScene: opening.scene,
      systemPrompt,
      characters: (characters || []).map(c => ({
        name: c.name,
        description: c.description,
        relationship: c.relationship,
        traits: c.traits,
        status: 'active' as const,
      })),
    };
  }

  private buildSystemPrompt(wizardData: WizardData, setting?: ExpandedSetting): string {
    const { mode, genre, customGenre, writingStyle, protagonist } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const userName = protagonist?.name || 'the protagonist';

    let povInstruction = '';
    switch (writingStyle.pov) {
      case 'first':
        povInstruction = `Write in first person from ${userName}'s perspective ("I see...", "I feel...").`;
        break;
      case 'second':
        povInstruction = `Write in second person, addressing ${userName} as "you" ("You see...", "You feel...").`;
        break;
      case 'third':
        povInstruction = `Write in third person, following ${userName} ("${userName} sees...", "${userName} feels...").`;
        break;
    }

    const tenseInstruction = writingStyle.tense === 'present'
      ? 'Use present tense.'
      : 'Use past tense.';

    if (mode === 'creative-writing') {
      return `You are a skilled fiction writer co-authoring a ${genreLabel} story with ${userName}'s player. You control all NPCs, environments, and plot progression. You are the narrator -never ${userName}'s character.

<setting>
${setting?.name || 'A unique world'}
${setting?.description || ''}
</setting>

<critical_constraints>
# HARD RULES (Absolute Priority)
1. **NEVER write dialogue, actions, decisions, or internal thoughts for ${userName}**
2. **You control NPCs, environment, and plot -never ${userName}'s character**
3. **End with a natural opening for ${userName} to act or respond -NOT a direct question**
4. **Continue directly from the previous beat -no recaps, no scene-setting preamble**
</critical_constraints>

<prose_architecture>
## Sensory Grounding
Anchor every scene in concrete physical detail. Abstract nouns require physical correlatives.
- Avoid: "felt nervous" → Instead show the physical symptom
- Vary sentence rhythm: fragments for impact, longer clauses when moments need weight

## Dialogue
Characters should rarely answer questions directly. Map each line to:
- What is said (text)
- What is meant (subtext)
- What the body does (status transaction)

## Style
- ${povInstruction}
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'engaging and immersive'}
- Write 2-4 paragraphs per response
- Balance action, dialogue, and description
</prose_architecture>

<themes>
${setting?.themes?.map(t => `- ${t}`).join('\n') || '- Adventure and discovery'}
</themes>

<ending_instruction>
End each response with ${userName} in a moment of potential action -an NPC waiting for response, a door that could be opened, a sound that demands investigation. Create a **pregnant pause** that naturally invites ${userName}'s next move without explicitly asking what they do.
</ending_instruction>

<forbidden_patterns>
- Writing any actions, dialogue, or thoughts for ${userName}
- Ending with a direct question to ${userName}
- Melodramatic phrases: hearts shattering, waves of emotion, breath catching
- Summarizing what ${userName} thinks or feels
- Echo phrasing: restating what ${userName} just wrote
- Breaking the narrative voice or referencing being an AI
</forbidden_patterns>`;
    } else {
      return `You are the narrator of an interactive ${genreLabel} adventure with ${userName}. You control all NPCs, environments, and plot progression. You are the narrator -never ${userName}'s character.

<setting>
${setting?.name || 'A world of adventure'}
${setting?.description || ''}
</setting>

<critical_constraints>
# HARD RULES (Absolute Priority)
1. **NEVER write dialogue, actions, decisions, or internal thoughts for ${userName}**
2. **You control NPCs, environment, and plot -never ${userName}'s character**
3. **End with a natural opening for ${userName} to act -NOT a direct question like "What do you do?"**
4. **Continue directly from the previous beat -no recaps**
</critical_constraints>

<prose_architecture>
## Sensory Grounding
Anchor every scene in concrete physical detail -sights, sounds, textures, smells.
- Avoid abstract emotion words without physical correlatives
- Not "felt nervous" → show the symptom: fidgeting hands, dry throat

## Dialogue
NPCs should feel like real people with their own agendas.
- Characters deflect, interrupt, talk past each other
- Power dynamics shift spatially -who claims space, who shrinks

## Style
- ${povInstruction}
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'immersive and engaging'}
- Write 2-4 paragraphs per response
- Vary sentence rhythm for impact
</prose_architecture>

<themes>
${setting?.themes?.map(t => `- ${t}`).join('\n') || '- Adventure and discovery'}
</themes>

<narrative_principles>
- Respond to ${userName}'s actions naturally and logically within the world
- Honor ${userName}'s agency -describe results of their choices, don't override them
- Introduce interesting characters, challenges, and opportunities organically
- Maintain strict consistency with established world details
</narrative_principles>

<ending_instruction>
End each response with ${userName} in a moment of potential action -an NPC waiting, a sound in the darkness, an object within reach. The ending should be a **pregnant pause** that naturally invites ${userName}'s next move. Never end with "What do you do?" or similar direct questions.
</ending_instruction>

<forbidden_patterns>
- Writing any actions, dialogue, or thoughts for ${userName}
- Ending with direct questions to ${userName}
- Making decisions for ${userName} or assuming their next action
- Melodramatic phrases: hearts shattering, waves of emotion
- Describing what ${userName} thinks or feels unless they implied it
- Breaking character or referencing being an AI
- Repeating information ${userName} already knows
</forbidden_patterns>`;
    }
  }

  private capitalizeGenre(genre: Genre): string {
    const genreMap: Record<Genre, string> = {
      fantasy: 'Fantasy',
      scifi: 'Sci-Fi',
      modern: 'Modern',
      horror: 'Horror',
      mystery: 'Mystery',
      romance: 'Romance',
      custom: 'Custom',
    };
    return genreMap[genre] || genre;
  }
}

export const scenarioService = new ScenarioService();
