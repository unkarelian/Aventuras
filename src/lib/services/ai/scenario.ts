import { settings, DEFAULT_OPENROUTER_PROFILE_ID, DEFAULT_NANOGPT_PROFILE_ID, type ProviderPreset, getPresetDefaults } from '$lib/stores/settings.svelte';
import type { ReasoningEffort, GenerationPreset } from '$lib/types';
import { OpenAIProvider, OPENROUTER_API_URL } from './openrouter';
import { buildExtraBody } from './requestOverrides';
import type { Message } from './types';
import type { StoryMode, POV, Character, Location, Item } from '$lib/types';
import { promptService, type PromptContext } from '$lib/services/prompts';
import { tryParseJsonWithHealing } from './jsonHealing';

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
  presetId?: string;  // Agent profile preset ID
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
  settingRefinement: ProcessSettings;
  protagonistGeneration: ProcessSettings;
  characterElaboration: ProcessSettings;
  characterRefinement: ProcessSettings;
  supportingCharacters: ProcessSettings;
  openingGeneration: ProcessSettings;
  openingRefinement: ProcessSettings;
}

// NOTE: All wizard prompts are now in the centralized prompt system at
// src/lib/services/prompts/definitions.ts. The systemPrompt fields in
// ProcessSettings are kept for backwards compatibility with user-customized
// settings, but the actual prompts are rendered via promptService.

export function getDefaultAdvancedSettings(): AdvancedWizardSettings {
  return getDefaultAdvancedSettingsForProvider('openrouter');
}

export function getDefaultAdvancedSettingsForProvider(provider: ProviderPreset, customModel?: string | null): AdvancedWizardSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  const preset = getPresetDefaults(provider, 'wizard', customModel);

  return {
    settingExpansion: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    settingRefinement: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    protagonistGeneration: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    characterElaboration: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    characterRefinement: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    supportingCharacters: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    openingGeneration: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
      providerOnly: [],
      manualBody: '',
    },
    openingRefinement: {
      presetId: 'wizard',
      profileId: provider === 'custom' ? null : profileId,
      model: preset.model,
      systemPrompt: '',
      temperature: 0.3,
      topP: 0.95,
      maxTokens: 8192,
      reasoningEffort: preset.reasoningEffort,
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
    imageGenerationMode?: 'none' | 'auto' | 'inline';
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
  vaultId?: string;
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
    presetConfig: GenerationPreset | Partial<ProcessSettings>,
    baseProvider: Record<string, unknown>,
    defaultReasoningEffort: ReasoningEffort
  ) {
    return buildExtraBody({
      manualMode: settings.advancedRequestSettings.manualMode,
      manualBody: presetConfig.manualBody,
      reasoningEffort: presetConfig.reasoningEffort ?? defaultReasoningEffort,
      providerOnly: presetConfig.providerOnly,
      baseProvider,
    });
  }

  /**
   * Robust JSON parsing using jsonrepair for automatic healing of malformed JSON.
   */
  private parseJsonResponse<T>(content: string): T | null {
    const result = tryParseJsonWithHealing<T>(content);
    if (!result) {
      log('JSON parsing failed for:', content.substring(0, 200));
    }
    return result;
  }

  private buildSettingLorebookContext(
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

    let lorebookContext = '\n\n## Existing Lore (from imported lorebook)\nThese are established canon elements. The expanded setting MUST be consistent with all of this lore:\n';
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

    return lorebookContext;
  }

  /**
   * Expand a user's seed prompt into a full setting description.
   */
  async expandSetting(
    seed: string,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    customInstruction?: string
  ): Promise<ExpandedSetting> {
    log('expandSetting called', { seed, genre, presetId, lorebookEntries: lorebookEntries?.length ?? 0, hasCustomInstruction: !!customInstruction });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Setting Expansion');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    const customInstructionBlock = customInstruction?.trim()
      ? `\n\nAUTHOR'S GUIDANCE: ${customInstruction.trim()}`
      : '';
    const systemPrompt = promptService.renderPrompt('setting-expansion', promptContext, {
      customInstruction: customInstructionBlock,
    });

    const lorebookContext = this.buildSettingLorebookContext(lorebookEntries);

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
          customInstruction: customInstructionBlock,
        })
      }
    ];

    const response = await provider.generateResponse({
      messages,
      model: presetConfig.model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Setting expansion response received', { length: response.content.length });

    const result = tryParseJsonWithHealing<ExpandedSetting>(response.content);
    if (!result) {
      log('Failed to parse setting response');
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
    log('Setting parsed successfully', { name: result.name });
    return result;
  }

  /**
   * Refine an existing setting using the current expanded data.
   */
  async refineSetting(
    currentSetting: ExpandedSetting,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    customInstruction?: string
  ): Promise<ExpandedSetting> {
    log('refineSetting called', { settingName: currentSetting.name, genre, presetId, lorebookEntries: lorebookEntries?.length ?? 0, hasCustomInstruction: !!customInstruction });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Setting Refinement');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    const customInstructionBlock = customInstruction?.trim()
      ? `\n\nAUTHOR'S GUIDANCE: ${customInstruction.trim()}`
      : '';
    const systemPrompt = promptService.renderPrompt('setting-refinement', promptContext, {
      customInstruction: customInstructionBlock,
    });

    const keyLocations = currentSetting.keyLocations ?? [];
    const themes = currentSetting.themes ?? [];
    const potentialConflicts = currentSetting.potentialConflicts ?? [];
    const keyLocationsBlock = keyLocations.length > 0
      ? keyLocations.map((location) => `- ${location.name}: ${location.description}`).join('\n')
      : '- (none)';

    const currentSettingBlock = [
      `NAME: ${currentSetting.name}`,
      `DESCRIPTION: ${currentSetting.description}`,
      `ATMOSPHERE: ${currentSetting.atmosphere || '(none)'}`,
      `THEMES: ${themes.length > 0 ? themes.join(', ') : '(none)'}`,
      `POTENTIAL CONFLICTS: ${potentialConflicts.length > 0 ? potentialConflicts.join(', ') : '(none)'}`,
      `KEY LOCATIONS:\n${keyLocationsBlock}`,
    ].join('\n');

    const lorebookContext = this.buildSettingLorebookContext(lorebookEntries);

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('setting-refinement', promptContext, {
          genreLabel,
          currentSetting: currentSettingBlock,
          lorebookContext,
          customInstruction: customInstructionBlock,
        })
      }
    ];

    const model = presetConfig.model;

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Setting refinement response received', { length: response.content.length });

    const result = this.parseJsonResponse<ExpandedSetting>(response.content);
    if (result) {
      log('Setting refinement parsed successfully', { name: result.name });
      return result;
    }

    log('Failed to parse setting refinement response, returning current setting.');
    return currentSetting;
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
    presetId?: string,
    customInstruction?: string
  ): Promise<GeneratedProtagonist> {
    log('elaborateCharacter called', { userInput, genre, presetId, hasCustomInstruction: !!customInstruction });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Character Elaboration');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    const toneInstruction = `- Keep the tone appropriate for the ${genreLabel} genre`;
    const settingInstruction = setting
      ? `- Make the character fit naturally into: ${setting.name}`
      : '';
    const customInstructionBlock = customInstruction?.trim()
      ? `\n\nAUTHOR'S GUIDANCE: ${customInstruction.trim()}`
      : '';
    const systemPrompt = promptService.renderPrompt('character-elaboration', promptContext, {
      toneInstruction,
      settingInstruction,
      customInstruction: customInstructionBlock,
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
          customInstruction: customInstructionBlock,
        })
      }
    ];

    const model = presetConfig.model;

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Character elaboration response received', { length: response.content.length });

    const result = tryParseJsonWithHealing<GeneratedProtagonist>(response.content);
    if (!result) {
      log('Failed to parse character elaboration response');
      // Return what the user provided with minimal defaults
      return {
        name: userInput.name || 'The Protagonist',
        description: userInput.description || 'A mysterious figure.',
        background: userInput.background || 'Their past is shrouded in mystery.',
        motivation: userInput.motivation || 'To find their purpose.',
        traits: userInput.traits || ['Determined', 'Resourceful'],
      };
    }
    log('Character elaboration parsed successfully', { name: result.name });
    return result;
  }

  /**
   * Refine an existing character using the current expanded data.
   */
  async refineCharacter(
    currentCharacter: GeneratedProtagonist,
    setting: ExpandedSetting | null,
    genre: Genre,
    customGenre?: string,
    presetId?: string,
    customInstruction?: string
  ): Promise<GeneratedProtagonist> {
    log('refineCharacter called', { characterName: currentCharacter.name, genre, presetId, hasCustomInstruction: !!customInstruction });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Character Refinement');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext();
    const toneInstruction = `- Keep the tone appropriate for the ${genreLabel} genre`;
    const settingInstruction = setting
      ? `- Make character fit naturally into: ${setting.name}`
      : '';
    const customInstructionBlock = customInstruction?.trim()
      ? `\n\nAUTHOR'S GUIDANCE: ${customInstruction.trim()}`
      : '';
    const systemPrompt = promptService.renderPrompt('character-refinement', promptContext, {
      toneInstruction,
      settingInstruction,
      customInstruction: customInstructionBlock,
    });

    const traits = currentCharacter.traits ?? [];
    const currentCharacterBlock = [
      `NAME: ${currentCharacter.name || '(suggest one)'}`,
      `DESCRIPTION: ${currentCharacter.description || '(none)'}`,
      `BACKGROUND: ${currentCharacter.background || '(none)'}`,
      `MOTIVATION: ${currentCharacter.motivation || '(none)'}`,
      `TRAITS: ${traits.length > 0 ? traits.join(', ') : '(none)'}`,
      `APPEARANCE: ${currentCharacter.appearance || '(none)'}`,
    ].join('\n');

    const settingContext = setting ? `SETTING: ${setting.name}\n${setting.description}` : '';

    const messages: Message[] = [
      {
        role: 'system',
        content: systemPrompt
      },
      {
        role: 'user',
        content: promptService.renderUserPrompt('character-refinement', promptContext, {
          genreLabel,
          currentCharacter: currentCharacterBlock,
          settingContext,
          customInstruction: customInstructionBlock,
        })
      }
    ];

    const model = presetConfig.model;

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Character refinement response received', { length: response.content.length });

    const result = this.parseJsonResponse<GeneratedProtagonist>(response.content);
    if (result) {
      log('Character refinement parsed successfully', { name: result.name });
      return result;
    }

    log('Failed to parse character refinement response, returning current character.');
    return currentCharacter;
  }

  /**
   * Generate a protagonist character based on setting and mode.
   */
  async generateProtagonist(
    setting: ExpandedSetting,
    genre: Genre,
    mode: StoryMode,
    pov: POV,
    customGenre?: string,
    presetId?: string
  ): Promise<GeneratedProtagonist> {
    log('generateProtagonist called', { settingName: setting.name, genre, mode, pov, presetId });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Protagonist Generation');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const povContext = pov === 'first'
      ? 'The reader will be this character, narrated in first person (I...).'
      : pov === 'second'
        ? 'The reader will be this character, narrated in second person (You...).'
        : 'This is the main viewpoint character for a third person narrative.';

    const modeContext = mode === 'adventure'
      ? 'This is for an interactive adventure where, reader makes choices as this character.'
      : 'This is for a creative writing project where this character drives the narrative.';

    const promptContext = this.getWizardPromptContext(mode, pov);
    const systemPrompt = promptService.renderPrompt('protagonist-generation', promptContext);
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

    const model = presetConfig.model;

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Protagonist response received', { length: response.content.length });

    const result = tryParseJsonWithHealing<GeneratedProtagonist>(response.content);
    if (!result) {
      log('Failed to parse protagonist response');
      return {
        name: pov === 'second' ? 'You' : 'The Protagonist',
        description: 'A wanderer seeking adventure.',
        background: 'Your past is your own to reveal.',
        motivation: 'To uncover the truth and find your purpose.',
        traits: ['Curious', 'Determined', 'Resourceful'],
      };
    }
    log('Protagonist parsed successfully', { name: result.name });
    return result;
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
    presetId?: string
  ): Promise<GeneratedCharacter[]> {
    log('generateCharacters called', { settingName: setting.name, count, presetId });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Supporting Characters');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;

    const promptContext = this.getWizardPromptContext('adventure', 'second', 'present', protagonist.name);
    const systemPrompt = promptService.renderPrompt('supporting-characters', promptContext);
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

    const response = await provider.generateResponse({
      messages,
      model: presetConfig.model,
      temperature: presetConfig.temperature ?? 0.3,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(presetConfig, SCENARIO_PROVIDER, 'off'),
    });

    log('Characters response received', { length: response.content.length });

    const result = tryParseJsonWithHealing<GeneratedCharacter[]>(response.content);
    if (!result) {
      log('Failed to parse characters response');
      return [];
    }
    log('Characters parsed successfully', { count: result.length });
    return result;
  }

  /**
   * Generate an opening scene based on all of setup data.
   */
  async generateOpening(
    wizardData: WizardData,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<GeneratedOpening> {
    log('generateOpening called', {
      settingName: wizardData.expandedSetting?.name,
      protagonist: wizardData.protagonist?.name,
      mode: wizardData.mode,
      presetId,
      lorebookEntries: lorebookEntries?.length ?? 0,
    });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Opening Generation');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const { systemPrompt, userPrompt } = this.buildOpeningPrompts(wizardData, lorebookEntries, 'json');

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const model = presetConfig.model;
    const isZAI = model.startsWith('z-ai/');
    const isGLM = model.includes('glm');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.8,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(
        presetConfig,
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
   * Refine an existing opening scene based on current setup data.
   */
  async refineOpening(
    wizardData: WizardData,
    currentOpening: GeneratedOpening,
    presetId?: string,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[]
  ): Promise<GeneratedOpening> {
    log('refineOpening called', {
      title: currentOpening.title,
      mode: wizardData.mode,
      presetId,
      lorebookEntries: lorebookEntries?.length ?? 0,
    });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Opening Refinement');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const { systemPrompt, userPrompt } = this.buildOpeningRefinementPrompts(
      wizardData,
      currentOpening,
      lorebookEntries,
      'json'
    );

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const model = presetConfig.model;
    const isZAI = model.startsWith('z-ai/');
    const isGLM = model.includes('glm');

    const response = await provider.generateResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.8,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(
        presetConfig,
        isZAI ? { order: ['z-ai'], require_parameters: true } : SCENARIO_PROVIDER,
        'high'
      ),
    });

    log('Opening refinement response received', { length: response.content.length });

    const result = this.parseJsonResponse<GeneratedOpening>(response.content);
    if (result) {
      log('Opening refinement parsed successfully', { title: result.title });
      return result;
    }

    log('Failed to parse opening refinement response, returning current opening.');
    return currentOpening;
  }

  /**
   * Stream opening scene generation for real-time display.
   */
  async *streamOpening(
    wizardData: WizardData,
    presetId?: string
  ): AsyncIterable<{ content: string; done: boolean }> {
    log('streamOpening called', { presetId });

    const presetConfig = settings.getPresetConfig(presetId || '', 'Opening Generation');
    const provider = this.getProvider(presetConfig.profileId || undefined);
    const { systemPrompt, userPrompt } = this.buildOpeningPrompts(wizardData, undefined, 'stream');

    const messages: Message[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const model = presetConfig.model;
    const isZAI = model.startsWith('z-ai/');
    const isGLM = model.includes('glm');

    for await (const chunk of provider.streamResponse({
      messages,
      model,
      temperature: presetConfig.temperature ?? 0.8,
      maxTokens: presetConfig.maxTokens ?? 8192,
      extraBody: this.buildProcessExtraBody(
        presetConfig,
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
    outputMode: 'json' | 'stream' = 'json'
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

    // Use the prompt system - user customizations are handled via template overrides
    const systemPrompt = promptService.renderPrompt(templateId, promptContext, {
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

  private buildOpeningRefinementPrompts(
    wizardData: WizardData,
    currentOpening: GeneratedOpening,
    lorebookEntries?: { name: string; type: string; description: string; hiddenInfo?: string }[],
    outputMode: 'json' | 'stream' = 'json'
  ): { systemPrompt: string; userPrompt: string } {
    const { mode, genre, customGenre, expandedSetting, protagonist, characters, writingStyle, title } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : genre;
    const protagonistName = protagonist?.name || 'the protagonist';
    const promptContext = this.getWizardPromptContext(mode, writingStyle.pov, writingStyle.tense, protagonistName);
    const templateId = mode === 'creative-writing'
      ? 'opening-refinement-creative'
      : 'opening-refinement-adventure';

    const tenseInstruction = writingStyle.tense === 'present'
      ? 'Use present tense.'
      : 'Use past tense.';

    const tone = writingStyle.tone || 'immersive and engaging';
    const outputFormat = this.getOpeningOutputFormat(mode, protagonistName, outputMode, writingStyle.pov);
    const povInfo = this.getOpeningPovInstruction(writingStyle.pov);

    const systemPrompt = promptService.renderPrompt(templateId, promptContext, {
      genreLabel,
      mode,
      tenseInstruction,
      tone,
      outputFormat,
      povInstruction: povInfo.instruction,
      povPerspective: povInfo.perspective,
      povPerspectiveInstructions: povInfo.perspectiveInstructions,
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

    const locationSummary = currentOpening.initialLocation?.description
      ? `${currentOpening.initialLocation.name} - ${currentOpening.initialLocation.description}`
      : currentOpening.initialLocation?.name || 'Starting Location';
    const currentOpeningBlock = [
      `TITLE: ${currentOpening.title || title || '(suggest one)'}`,
      `LOCATION: ${locationSummary}`,
      'SCENE:',
      currentOpening.scene,
    ].join('\n');

    const userPrompt = promptService.renderUserPrompt(templateId, promptContext, {
      title: title || currentOpening.title || '(suggest one)',
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
      currentOpening: currentOpeningBlock,
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
    description?: string;
    mode: StoryMode;
    settings: { pov: POV; tense: Tense; tone?: string; themes?: string[]; visualProseMode?: boolean; inlineImageMode?: boolean; imageGenerationMode?: 'none' | 'auto' | 'inline' };
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
      description: expandedSetting?.description,
      mode,
settings: {
        pov: writingStyle.pov,
        tense: writingStyle.tense,
        tone: writingStyle.tone,
        themes: expandedSetting?.themes,
        visualProseMode: writingStyle.visualProseMode,
        inlineImageMode: writingStyle.inlineImageMode,
        imageGenerationMode: writingStyle.imageGenerationMode,
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
    const { mode, genre, customGenre, writingStyle, protagonist } = wizardData;
    const genreLabel = genre === 'custom' && customGenre ? customGenre : this.capitalizeGenre(genre);

    // Build the setting description with name included
    const settingDescription = setting
      ? `${setting.name || 'A unique world'}\n${setting.description || ''}`
      : undefined;

    // Build the prompt context - the centralized system handles everything
    const promptContext: PromptContext = {
      mode,
      pov: writingStyle.pov,
      tense: writingStyle.tense,
      protagonistName: protagonist?.name || (writingStyle.pov === 'second' ? 'You' : 'The Protagonist'),
      genre: genreLabel,
      tone: writingStyle.tone || (mode === 'creative-writing' ? 'engaging and immersive' : 'immersive and engaging'),
      settingDescription,
      themes: setting?.themes,
      visualProseMode: writingStyle.visualProseMode,
      inlineImageMode: writingStyle.inlineImageMode,
    };

    // Use the centralized prompt templates - macros auto-resolve based on context
    const templateId = mode === 'creative-writing' ? 'creative-writing' : 'adventure';
    return promptService.renderPrompt(templateId, promptContext);
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
