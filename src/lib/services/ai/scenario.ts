import { settings, DEFAULT_OPENROUTER_PROFILE_ID, DEFAULT_NANOGPT_PROFILE_ID, type ProviderPreset } from '$lib/stores/settings.svelte';
import type { ReasoningEffort } from '$lib/types';
import { OpenAIProvider, OPENROUTER_API_URL } from './openrouter';
import { buildExtraBody } from './requestOverrides';
import type { Message } from './types';
import type { StoryMode, POV, Character, Location, Item } from '$lib/types';
import { promptService, type PromptContext } from '$lib/services/prompts';

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
  profileId?: string | null;  // API profile to use (null = use default profile)
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  providerOnly?: string[];
  manualBody?: string;
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
      profileId: DEFAULT_OPENROUTER_PROFILE_ID,
      model: 'deepseek/deepseek-v3.2', // deepseek for world elaboration
      systemPrompt: DEFAULT_PROMPTS.settingExpansion,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    protagonistGeneration: {
      profileId: DEFAULT_OPENROUTER_PROFILE_ID,
      model: 'deepseek/deepseek-v3.2', // deepseek for protagonist generation
      systemPrompt: DEFAULT_PROMPTS.protagonistGeneration,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    characterElaboration: {
      profileId: DEFAULT_OPENROUTER_PROFILE_ID,
      model: 'deepseek/deepseek-v3.2', // deepseek for character elaboration
      systemPrompt: DEFAULT_PROMPTS.characterElaboration,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    supportingCharacters: {
      profileId: DEFAULT_OPENROUTER_PROFILE_ID,
      model: SCENARIO_MODEL, // deepseek for supporting characters
      systemPrompt: DEFAULT_PROMPTS.supportingCharacters,
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    openingGeneration: {
      profileId: DEFAULT_OPENROUTER_PROFILE_ID,
      model: 'z-ai/glm-4.7', // GLM-4.7 with z-ai provider for opening generation
      systemPrompt: '', // Empty = use mode-specific prompts (adventure vs creative-writing)
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'high',
      providerOnly: [],
      manualBody: '',
    },
  };
}

export function getDefaultAdvancedSettingsForProvider(provider: ProviderPreset): AdvancedWizardSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT uses zai-org/ prefix and :thinking suffix for opening generation
  const openingModel = provider === 'nanogpt' ? 'zai-org/glm-4.7:thinking' : 'z-ai/glm-4.7';
  return {
    settingExpansion: {
      profileId,
      model: 'deepseek/deepseek-v3.2',
      systemPrompt: DEFAULT_PROMPTS.settingExpansion,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    protagonistGeneration: {
      profileId,
      model: 'deepseek/deepseek-v3.2',
      systemPrompt: DEFAULT_PROMPTS.protagonistGeneration,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    characterElaboration: {
      profileId,
      model: 'deepseek/deepseek-v3.2',
      systemPrompt: DEFAULT_PROMPTS.characterElaboration,
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    supportingCharacters: {
      profileId,
      model: SCENARIO_MODEL,
      systemPrompt: DEFAULT_PROMPTS.supportingCharacters,
      temperature: 0.3,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
    },
    openingGeneration: {
      profileId,
      model: openingModel,
      systemPrompt: '',
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: 'high',
      providerOnly: [],
      manualBody: '',
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
    visualProseMode?: boolean;
    inlineImageMode?: boolean;
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
  /**
   * Get a provider configured for a specific profile.
   * Used by wizard processes that have their own profile setting.
   */
  private getProvider(profileId?: string) {
    // Use provided profileId or fall back to main narrative profile
    const pid = profileId || settings.apiSettings.mainNarrativeProfileId;
    const apiSettings = settings.getApiSettingsForProfile(pid);

    if (!apiSettings.openaiApiKey) {
      throw new Error('No API key configured');
    }
    return new OpenAIProvider(apiSettings);
  }

  private buildProcessExtraBody(
    overrides: ProcessSettings | undefined,
    baseProvider: Record<string, unknown>,
    defaultReasoningEffort: ReasoningEffort
  ) {
    return buildExtraBody({
      manualMode: settings.advancedRequestSettings.manualMode,
      manualBody: overrides?.manualBody,
      reasoningEffort: overrides?.reasoningEffort ?? defaultReasoningEffort,
      providerOnly: overrides?.providerOnly,
      baseProvider,
    });
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
    log('expandSetting called', { seed, genre, hasOverrides: !!overrides, lorebookEntries: lorebookEntries?.length ?? 0, profileId: overrides?.profileId });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    // Use custom system prompt if provided, otherwise use the template
    const systemPrompt = overrides?.systemPrompt || promptService.renderPrompt('setting-expansion', promptContext);

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
      lorebookContext += '\nMake sure the setting is consistent with the existing lore provided above.';
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('setting-expansion', promptContext, {
          genreLabel,
          seed,
          lorebookContext,
        })
      }
    ];

    const model = overrides?.model || 'deepseek/deepseek-v3.2';

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.3,
      topP: overrides?.topP,
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(overrides, SCENARIO_PROVIDER, 'off'),
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
    log('elaborateCharacter called', { userInput, genre, hasOverrides: !!overrides, profileId: overrides?.profileId });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    const toneInstruction = `- Keep the tone appropriate for the ${genreLabel} genre`;
    const settingInstruction = setting
      ? `- Make the character fit naturally into: ${setting.name}`
      : '';
    // Use custom system prompt if provided, otherwise use the template
    const systemPrompt = overrides?.systemPrompt || promptService.renderPrompt('character-elaboration', promptContext, {
      toneInstruction,
      settingInstruction,
    });

    const characterName = userInput.name ? `NAME: ${userInput.name}` : 'NAME: (suggest one)';
    const characterDescription = userInput.description ? `DESCRIPTION: ${userInput.description}` : '';
    const characterBackgroundParts: string[] = [];
    if (userInput.background) characterBackgroundParts.push(`BACKGROUND: ${userInput.background}`);
    if (userInput.motivation) characterBackgroundParts.push(`MOTIVATION: ${userInput.motivation}`);
    if (userInput.traits && userInput.traits.length > 0) {
      characterBackgroundParts.push(`TRAITS: ${userInput.traits.join(', ')}`);
    }
    const characterBackground = characterBackgroundParts.join('\n');
    const settingContext = setting ? `SETTING: ${setting.name}\n${setting.description}` : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('character-elaboration', promptContext, {
          genreLabel,
          characterName,
          characterDescription,
          characterBackground,
          settingContext,
        })
      }
    ];

    const model = overrides?.model || 'deepseek/deepseek-v3.2';

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.3,
      topP: overrides?.topP,
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(overrides, SCENARIO_PROVIDER, 'off'),
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
    log('generateProtagonist called', { settingName: setting.name, genre, mode, pov, hasOverrides: !!overrides, profileId: overrides?.profileId });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const povContext = pov === 'first'
      ? 'The reader will be this character, narrated in first person (I...).'
      : pov === 'second'
        ? 'The reader will be this character, narrated in second person (You...).'
        : 'This is the main viewpoint character for a third person narrative.';

    const modeContext = mode === 'adventure'
      ? 'This is for an interactive adventure where the reader makes choices as this character.'
      : 'This is for a creative writing project where this character drives the narrative.';

    const promptContext = this.getWizardPromptContext(mode, pov);
    // Use custom system prompt if provided, otherwise use the template
    const systemPrompt = overrides?.systemPrompt || promptService.renderPrompt('protagonist-generation', promptContext);
    const povInstruction = `${povContext}\n${modeContext}`;
    const settingDescription = `${setting.description}\n\nATMOSPHERE: ${setting.atmosphere}\n\nTHEMES: ${setting.themes.join(', ')}`;

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('protagonist-generation', promptContext, {
          genreLabel,
          settingName: setting.name,
          settingDescription,
          povInstruction,
        })
      }
    ];

    const model = overrides?.model || 'deepseek/deepseek-v3.2';

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: overrides?.temperature ?? 0.3,
      topP: overrides?.topP,
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(overrides, SCENARIO_PROVIDER, 'off'),
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
    log('generateCharacters called', { settingName: setting.name, count, hasOverrides: !!overrides, profileId: overrides?.profileId });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext('adventure', 'second', 'present', protagonist.name);
    // Use custom system prompt if provided, otherwise use the template
    const systemPrompt = overrides?.systemPrompt || promptService.renderPrompt('supporting-characters', promptContext);
    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('supporting-characters', promptContext, {
          count,
          genreLabel,
          settingName: setting.name,
          settingDescription: setting.description,
          protagonistName: protagonist.name,
          protagonistDescription: `${protagonist.description}\nMotivation: ${protagonist.motivation}`,
        })
      }
    ];

    // Deepseek with lower temperature for consistency
    const response = await provider.generateResponse({
      messages,
      model: overrides?.model || SCENARIO_MODEL,
      temperature: overrides?.temperature ?? 0.3,
      maxTokens: overrides?.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(overrides, SCENARIO_PROVIDER, 'off'),
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
      profileId: overrides?.profileId,
    });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const { systemPrompt, userPrompt } = this.buildOpeningPrompts(wizardData, lorebookEntries, 'json', overrides?.systemPrompt);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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
      extraBody: this.buildProcessExtraBody(
        overrides,
        isZAI ? { order: ['z-ai'], require_parameters: true } : SCENARIO_PROVIDER,
        'high'
      ),
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
      title: wizardData.title || 'Untitled Adventure',
      initialLocation: {
        name: wizardData.expandedSetting?.keyLocations?.[0]?.name || 'Starting Location',
        description: wizardData.expandedSetting?.keyLocations?.[0]?.description || 'Where the story begins.',
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
    log('streamOpening called', { hasOverrides: !!overrides, profileId: overrides?.profileId });

    const provider = this.getProvider(overrides?.profileId || undefined);
    const { systemPrompt, userPrompt } = this.buildOpeningPrompts(wizardData, undefined, 'stream', overrides?.systemPrompt);

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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
      extraBody: this.buildProcessExtraBody(
        overrides,
        isZAI ? { order: ['z-ai'], require_parameters: true } : SCENARIO_PROVIDER,
        'high'
      ),
    })) {
      yield chunk;
    }
  }

  private buildOpeningPrompts(
    wizardData: WizardData,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    outputMode: 'json' | 'stream' = 'json',
    customSystemPrompt?: string
  ): { systemPrompt: string; userPrompt: string } {
    const { mode, genre, customGenre, expandedSetting, protagonist, characters, writingStyle, title } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const protagonistName = protagonist?.name || 'the protagonist';
    const promptContext = this.getWizardPromptContext(mode, writingStyle.pov, writingStyle.tense, protagonistName);
    const templateId = mode === 'creative-writing'
      ? 'opening-generation-creative'
      : 'opening-generation-adventure';

    const tenseInstruction = writingStyle.tense === 'present'
      ? 'Use present tense.'
      : 'Use past tense.';

    const tone = writingStyle.tone || 'immersive and engaging';
    const outputFormat = this.getOpeningOutputFormat(mode, protagonistName, outputMode, writingStyle.pov);
    const povInfo = this.getOpeningPovInstruction(writingStyle.pov);

    // Use custom system prompt if provided, otherwise use the template
    const systemPrompt = customSystemPrompt || promptService.renderPrompt(templateId, promptContext, {
      genreLabel,
      mode,
      tenseInstruction,
      tone,
      outputFormat,
      povInstruction: povInfo.instruction,
    });

    const atmosphereSection = expandedSetting?.atmosphere
      ? `ATMOSPHERE: ${expandedSetting.atmosphere}`
      : '';
    const protagonistDescription = protagonist?.description ? `\n${protagonist.description}` : '';
    const supportingCharactersSection = characters && characters.length > 0
      ? `NPCs WHO MAY APPEAR:\n${characters.map(c => `- ${c.name} (${c.role}): ${c.description}`).join('\n')}\n`
      : '';
    const guidanceSection = wizardData.openingGuidance?.trim()
      ? `\nAUTHOR'S GUIDANCE FOR OPENING:\n${wizardData.openingGuidance.trim()}\n`
      : '';
    const lorebookContext = this.buildOpeningLorebookContext(lorebookEntries);
    const openingInstruction = mode === 'creative-writing'
      ? ''
      : `\nDescribe the environment and situation. Do NOT write anything ${protagonistName} does, says, thinks, or perceives. End with a moment that invites action.`;

    const userPrompt = promptService.renderUserPrompt(templateId, promptContext, {
      title: title || '(suggest one)',
      genreLabel,
      mode,
      settingName: expandedSetting?.name || 'Unknown World',
      settingDescription: expandedSetting?.description || wizardData.settingSeed,
      atmosphereSection,
      protagonistName,
      protagonistDescription,
      supportingCharactersSection,
      povInstruction: povInfo.instruction,
      povPerspective: povInfo.perspective,
      povPerspectiveInstructions: povInfo.perspectiveInstructions,
      guidanceSection,
      lorebookContext,
      openingInstruction,
    });

    return { systemPrompt, userPrompt };
  }

  private buildOpeningLorebookContext(
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): string {
    if (!lorebookEntries || lorebookEntries.length === 0) return '';

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

    let lorebookContext = '\n\n## LOREBOOK (Established Canon)\nThe opening scene MUST be consistent with this established lore:\n';
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

    return lorebookContext;
  }

  private getOpeningPovInstruction(pov: POV): { instruction: string; perspective: string; perspectiveInstructions: string } {
    switch (pov) {
      case 'first':
        return {
          instruction: 'POV: First person (I/me/my).',
          perspective: 'the protagonist\'s first-person perspective ("I see...", "I feel...")',
          perspectiveInstructions: 'Use "I/me/my" for the protagonist. Write from their internal perspective.',
        };
      case 'second':
        return {
          instruction: 'POV: Second person (You/your).',
          perspective: 'the protagonist\'s second-person perspective ("You see...", "You feel...")',
          perspectiveInstructions: 'Use "you/your" for the protagonist. Address the reader/protagonist directly.',
        };
      case 'third':
      default:
        return {
          instruction: 'POV: Third person (he/she/they).',
          perspective: 'through {{protagonistName}}\'s perspective',
          perspectiveInstructions: 'NEVER use second person ("you"). Always use "{{protagonistName}}" or "he/she/they".',
        };
    }
  }

  private getOpeningOutputFormat(
    mode: StoryMode,
    protagonistName: string,
    outputMode: 'json' | 'stream',
    pov?: POV
  ): string {
    if (outputMode === 'stream') {
      return 'Write ONLY prose. No JSON, no metadata.';
    }

    let sceneInstruction: string;
    if (mode === 'creative-writing') {
      switch (pov) {
        case 'first':
          sceneInstruction = `string - the opening (2-3 paragraphs of first-person narrative featuring ${protagonistName})`;
          break;
        case 'second':
          sceneInstruction = `string - the opening (2-3 paragraphs of second-person narrative featuring ${protagonistName})`;
          break;
        case 'third':
        default:
          sceneInstruction = `string - the opening (2-3 paragraphs of third-person narrative featuring ${protagonistName})`;
          break;
      }
    } else {
      sceneInstruction = `string - the opening (2-3 paragraphs describing environment/situation, NOT ${protagonistName}'s actions)`;
    }

    return `Respond with valid JSON:
{
  "scene": "${sceneInstruction}",
  "title": "string - story title",
  "initialLocation": {
    "name": "string - location name",
    "description": "string - 1-2 sentences"
  }
}`;
  }

  private getWizardPromptContext(
    mode: StoryMode = 'adventure',
    pov: POV = 'second',
    tense: Tense = 'present',
    protagonistName: string = 'the protagonist'
  ): PromptContext {
    return {
      mode,
      pov,
      tense,
      protagonistName,
    };
  }

  /**
   * Convert wizard data to story creation parameters.
   */
prepareStoryData(wizardData: WizardData, opening: GeneratedOpening): {
    title: string;
    genre: string;
    mode: StoryMode;
    settings: { pov: POV; tense: Tense; tone?: string; themes?: string[]; visualProseMode?: boolean; inlineImageMode?: boolean };
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
settings: {
        pov: writingStyle.pov,
        tense: writingStyle.tense,
        tone: writingStyle.tone,
        themes: expandedSetting?.themes,
        visualProseMode: writingStyle.visualProseMode,
        inlineImageMode: writingStyle.inlineImageMode,
      },
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
    const { mode, genre, customGenre, writingStyle } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const userName = '{{protagonistName}}';

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
      return `You are a skilled fiction writer collaborating with an author on a ${genreLabel} story.

<critical_understanding>
The person giving you directions is the AUTHOR, not a character. They sit outside the story, directing what happens. ${userName} is the PROTAGONIST—a fictional character you write, not a stand-in for the author. When the author says "I do X", they mean "write ${userName} doing X."
</critical_understanding>

<setting>
${setting?.name || 'A unique world'}
${setting?.description || ''}
</setting>

<author_vs_protagonist>
You control ALL characters, including ${userName}. Write their:
- Actions and movements
- Dialogue
- Thoughts and perceptions
- Reactions to the environment and other characters

The author's messages are DIRECTIONS, not character actions. Interpret "I do X" as "write ${userName} doing X."
</author_vs_protagonist>

<prose_architecture>
## Sensory Grounding
Anchor every scene in concrete physical detail. Abstract nouns require physical correlatives.
- Avoid: "felt nervous" → Instead show the physical symptom
- Vary sentence rhythm: fragments for impact, longer clauses when moments need weight
- Reach past the first cliché; invisible prose serves the story better than showy prose

## Scene Structure
- Build each response toward one crystallizing moment—the image or line the reader remembers
- Structure: Setup → Setup → MOMENT → Brief aftermath
- For reversals: setup intent clearly, let action play, land the gap
- End scenes on concrete action, sensory detail, or dialogue—never by naming the emotional state

## Dialogue
Characters should rarely answer questions directly:
- Dialogue is imperfect—false starts, evasions, non sequiturs; not prepared speeches
- Compress rather than explain: don't spell out "A, therefore B, therefore C"
- Interruptions cut mid-phrase, not after complete clauses
- Characters talk past each other—they advance their own concerns while nominally replying
- Status through brevity: authority figures state and act; they don't justify
- Expert characters USE knowledge in action; they don't LECTURE through their lines
- "Said" is invisible—use fancy tags sparingly
- Mix clipped lines with fuller ones; not every line should be a fragment

## Relationship & Knowledge Dynamics
- Characters with history should feel different from strangers—show accumulated weight
- Leverage knowledge asymmetries: what characters don't know creates dramatic irony
- Let characters act on false beliefs; protect the irony until the story earns revelation
- Unresolved tension creates undertow in dialogue—they dance around it, avoid topics

## Style
- ${povInstruction}
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'engaging and immersive'}
- Length: Up to 500 words per response
- Balance action, dialogue, and description
</prose_architecture>

<themes>
${setting?.themes?.map(t => `- ${t}`).join('\n') || '- Adventure and discovery'}
</themes>

<ending_instruction>
End each response at a natural narrative beat that invites the author to direct what happens next.
</ending_instruction>

<forbidden_patterns>
- Second person ("you/your") for the protagonist—always use "${userName}" or "he/she/they"
- Treating the author as a character in the story
- Melodramatic phrases: hearts shattering, waves of emotion, breath catching
- Echo phrasing: restating what the author just wrote
- Explanation chains: characters spelling out "A, therefore B, therefore C"
- Formal hedging: "Protocol dictates," "It would suggest," "My assessment remains"
- Over-clipped dialogue: not every line should be a fragment—vary rhythm naturally
- Narrative bows: tying scenes with conclusions or realizations
- Comfort smoothing: sanding down awkward moments into resolution
- Breaking the narrative voice or referencing being an AI
</forbidden_patterns>

{{visualProseBlock}}

{{inlineImageBlock}}`;
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
- Reach past the first cliché; favor specific, grounded imagery

## Scene Structure
- Build each response toward one crystallizing moment—the image or detail the player remembers
- End at a moment of potential action that invites the player's next move

## NPC Dialogue
NPCs should feel like real people with their own agendas:
- Dialogue is imperfect—false starts, evasions, non sequiturs; not prepared speeches
- Compress rather than explain: don't spell out "A, therefore B, therefore C"
- Interruptions cut mid-phrase, not after complete clauses
- Characters talk past each other—they advance their own concerns while nominally replying
- Status through brevity: authority figures state and act; they don't justify
- Expert NPCs USE knowledge in action; they don't LECTURE through their lines
- "Said" is invisible—use fancy tags sparingly
- Mix clipped lines with fuller ones; not every line should be a fragment

## Relationship & Knowledge Dynamics
- NPCs with history feel different from strangers—show accumulated weight
- Leverage knowledge asymmetries: what NPCs don't know creates dramatic irony
- Let NPCs act on false beliefs; protect the irony until the story earns revelation
- Unresolved tension creates undertow in dialogue—they dance around it, avoid topics

## Style
- ${povInstruction}
- ${tenseInstruction}
- Tone: ${writingStyle.tone || 'immersive and engaging'}
- Length: Around 250 words per response
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
- Explanation chains: NPCs spelling out "A, therefore B, therefore C"
- Formal hedging: "Protocol dictates," "It would suggest," "My assessment remains"
- Over-clipped dialogue: not every line should be a fragment—vary rhythm naturally
- Dialogue tag overload: "said" is invisible; use fancy tags sparingly
- Breaking character or referencing being an AI
- Repeating information ${userName} already knows
</forbidden_patterns>

{{visualProseBlock}}

{{inlineImageBlock}}`;
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
