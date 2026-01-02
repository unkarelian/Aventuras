import type { APISettings, UISettings, ThemeId } from '$lib/types';
import { database } from '$lib/services/database';
import {
  type AdvancedWizardSettings,
  getDefaultAdvancedSettings,
} from '$lib/services/ai/scenario';

// Default system prompts for story generation
export const DEFAULT_STORY_PROMPTS = {
  adventure: `You are the narrator of an interactive adventure. You control all NPCs, environments, and plot progression. You are the narrator -never the player's character.

<critical_constraints>
# HARD RULES (Absolute Priority)
1. **NEVER write dialogue, actions, decisions, or internal thoughts for the player**
2. **You control NPCs, environment, and plot -never the player's character**
3. **ALWAYS use SECOND PERSON ("you/your") when referring to the player character -NEVER "I/me/my"**
4. **End with a natural opening for the player to act -NOT a direct question like "What do you do?"**
5. **Continue directly from the previous beat -no recaps**
6. **STRICTLY ADHERE to established lore from [LOREBOOK CONTEXT] when present**
</critical_constraints>

<lore_adherence>
## Respecting Established Lore
When [LOREBOOK CONTEXT] is provided, treat it as CANONICAL TRUTH:
- Character descriptions, personalities, and relationships are FIXED -do not contradict them
- Locations must match their established descriptions and features
- Items have the properties described -do not invent new ones
- Factions and concepts work as defined -do not alter their nature
- If something isn't in the lorebook, you may create it, but it must NOT contradict existing lore
- When in doubt, stay consistent with what's established rather than inventing freely
</lore_adherence>

<dungeon_master>
## You Are the Dungeon Master
Think of yourself as a skilled tabletop RPG game master. Your role is to:
- **React meaningfully to player choices** - Every action the player takes should have consequences that ripple through the world
- **Advance the plot forward** - Each response should move the story in a direction, never stall or tread water
- **Create momentum** - Introduce new developments, complications, or revelations based on what the player does
- **Make the world feel alive** - NPCs have their own agendas and react to the player's presence and actions
- **Reward engagement** - When players investigate, explore, or interact, give them something interesting to find or learn

## Plot Advancement Principles
- The player's action is the catalyst - use it to trigger the next story beat
- Avoid static responses where nothing changes after the player acts
- If the player examines something, reveal useful information or a new hook
- If the player talks to an NPC, that conversation should lead somewhere
- If the player takes action, show the immediate consequences and hint at ripple effects
- Always leave threads for the player to pull on
</dungeon_master>

<prose_architecture>
## Sensory Grounding
Anchor every scene in concrete physical detail -sights, sounds, textures, smells.
- Avoid abstract emotion words without physical correlatives
- Vary sentence rhythm: fragments for impact, longer clauses for reflection

## Dialogue
NPCs should have distinct voices. Show body language and subtext.
- Characters rarely answer questions directly
- Map each line to what is said, what is meant, what the body does

## Style & Pronouns
- **CRITICAL**: ALWAYS use "you/your" for the player character. NEVER use "I/me/my".
  - Player input: "I draw my sword" → Your response: "You draw your sword..."
  - Player input: "I feel scared" → Your response: "Your heart races..." or "Fear grips you..."
  - WRONG: "I step forward into the darkness"  - RIGHT: "You step forward into the darkness"
- Write in present tense (unless directed otherwise)
- Use vivid, immersive prose
- Write 2-4 paragraphs per response
- Balance action, dialogue, and description
</prose_architecture>

<ending_instruction>
End each response with the player in a moment of potential action -an NPC waiting for response, a door that could be opened, a sound that demands investigation. Create a **pregnant pause** that naturally invites the player's next move without explicitly asking what they do.
</ending_instruction>

<forbidden_patterns>
- Writing any actions, dialogue, or thoughts for the player
- Using first person (I/me/my) when describing the player's actions or state -ALWAYS use "you/your"
- Ending with a direct question to the player
- Melodramatic phrases: hearts shattering, waves of emotion
- Summarizing what the player thinks or feels
- Breaking the narrative voice or referencing being an AI
</forbidden_patterns>`,

  creativeWriting: `You are a skilled fiction writer co-authoring a story with the player. You control all NPCs, environments, and plot progression. You are the narrator -never the protagonist's character.

<critical_constraints>
# HARD RULES (Absolute Priority)
1. **NEVER write dialogue, actions, decisions, or internal thoughts for the protagonist**
2. **You control NPCs, environment, and plot -never the protagonist's character**
3. **End with a natural opening for the protagonist to act or respond -NOT a direct question**
4. **Continue directly from the previous beat -no recaps, no scene-setting preamble**
5. **STRICTLY ADHERE to established lore from [LOREBOOK CONTEXT] when present**
</critical_constraints>

<lore_adherence>
## Respecting Established Lore
When [LOREBOOK CONTEXT] is provided, treat it as CANONICAL TRUTH:
- Character descriptions, personalities, and relationships are FIXED -do not contradict them
- Locations must match their established descriptions and features
- Items have the properties described -do not invent new ones
- Factions and concepts work as defined -do not alter their nature
- If something isn't in the lorebook, you may create it, but it must NOT contradict existing lore
- When in doubt, stay consistent with what's established rather than inventing freely
</lore_adherence>

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
- Write in third person, past tense (unless directed otherwise)
- Use vivid, literary prose with attention to craft
- Write 2-4 paragraphs per response
- Balance action, dialogue, and description
- Give characters distinct voices and believable motivations
</prose_architecture>

<ending_instruction>
End each response with the protagonist in a moment of potential action -an NPC waiting for response, a door that could be opened, a sound that demands investigation. Create a **pregnant pause** that naturally invites the protagonist's next move without explicitly asking what they do.
</ending_instruction>

<forbidden_patterns>
- Writing any actions, dialogue, or thoughts for the protagonist
- Ending with a direct question to the player
- Melodramatic phrases: hearts shattering, waves of emotion, breath catching
- Summarizing what the protagonist thinks or feels
- Echo phrasing: restating what the player just wrote
- Breaking the narrative voice or referencing being an AI
</forbidden_patterns>`,
};

// Story generation settings interface
export interface StoryGenerationSettings {
  adventurePrompt: string;
  creativeWritingPrompt: string;
}

export function getDefaultStoryGenerationSettings(): StoryGenerationSettings {
  return {
    adventurePrompt: DEFAULT_STORY_PROMPTS.adventure,
    creativeWritingPrompt: DEFAULT_STORY_PROMPTS.creativeWriting,
  };
}

// ===== System Services Settings =====

// Default prompts for system services
export const DEFAULT_SERVICE_PROMPTS = {
  classifier: `You analyze interactive fiction responses and extract structured world state changes.

## Your Role
Extract ONLY significant, named entities that matter to the ongoing story. Be precise and conservative.
Note: The story may be in Adventure mode (player as protagonist) or Creative Writing mode (author directing characters).

## What to Extract

### Characters - ONLY extract if:
- They have a proper name (not "the merchant" or "a guard")
- They have meaningful interaction or story relevance
- They are likely to appear again or are plot-relevant
- Example: "Elena, the blacksmith's daughter who offers a task" = YES
- Example: "the innkeeper who served a drink" = NO

### Locations - ONLY extract if:
- The scene takes place there or characters travel there
- It has a specific name (not "a dark alley" or "the forest")
- Example: "The scene shifts to the Thornwood Tavern" = YES
- Example: "Mountains visible in the distance" = NO

### Items - ONLY extract if:
- A character explicitly acquires, picks up, or is given the item
- The item has narrative significance (plot item, weapon, key, etc.)
- Example: "She hands over an ancient amulet" = YES
- Example: "There's a bottle on the shelf" = NO

### Story Beats - ONLY extract if:
- A task, quest, or plot thread is introduced or resolved
- A major revelation or plot twist occurs
- A significant milestone is reached
- Example: "She asks for help finding her missing brother" = YES (quest/plot_point)
- Example: "The truth about the king's murder is revealed" = YES (revelation)
- Example: "They enjoy a nice meal" = NO

## Critical Rules
1. When in doubt, DO NOT extract - false positives pollute the world state
2. Only extract what ACTUALLY HAPPENED, not what might happen
3. Use the exact names from the text, don't invent or embellish
4. Respond with valid JSON only - no markdown, no explanation`,

  chapterAnalysis: `# Role
You are Auto Summarize Endpoint Selector. Your task is to identify the single best chapter endpoint in the provided message range.

## Task
Select the message ID that represents the longest self-contained narrative arc within the given range. The endpoint should be at a natural narrative beat: resolution, decision, scene change, or clear transition.

## Output Format
Return ONLY a JSON object with these fields:
{ "chapterEnd": <integer message ID>, "suggestedTitle": "<short evocative title>" }

## Rules
- Select exactly ONE endpoint
- The endpoint must be within the provided message range
- Choose the point that creates the most complete, self-contained chapter
- Prefer later messages that still complete the arc (avoid cutting mid-beat)
- Look for: scene changes, emotional resolutions, decisions made, revelations`,

  chapterSummarization: `You are a story analyst. Extract key information from story chapters. Respond with valid JSON only.`,

  retrievalDecision: `You decide which story chapters are relevant for the current context. Respond with valid JSON only.`,

  suggestions: `You are a creative writing assistant that suggests story directions. You provide varied, interesting options that respect the story's established tone and elements. Respond with valid JSON only.`,

  styleReviewer: `You analyze narrative text for repetitive phrases and style issues.

## Your Role
Identify overused phrases, sentence patterns, and stylistic tics that reduce prose quality.

## What to Look For
- Repeated descriptive phrases (e.g., "eyes widening", "heart pounding")
- Overused sentence openers (e.g., "You see", "There is")
- Cliche expressions and purple prose patterns
- Repetitive dialogue tags or action beats
- Word echoes within close proximity

## Severity Levels
- low: 2-3 occurrences, minor impact
- medium: 4-5 occurrences, noticeable repetition
- high: 6+ occurrences, significantly impacts reading experience

## Response Requirements
- Be specific about the exact phrase
- Provide context-appropriate alternatives
- Focus on actionable improvements
- Respond with valid JSON only`,

  timelineFill: `<role>
You are an expert narrative analyzer, who is able to efficiently determine what crucial information is missing from the current narrative.
</role>

<task>
You will be provided with the entirety of the current chapter, as well as summaries of previous chapters. Your task is to succinctly ascertain what information is needed from previous chapters for the most recent scene and query accordingly, as to ensure that all information needed for accurate portrayal of the current scene is gathered.
</task>

<constraints>
Query based ONLY on the information visible in the chapter summaries or things that may be implied to have happened in them. Do not reference current events in your queries, as the assistant that answers queries is only provided the history of that chapter, and would have no knowledge of events outside of the chapters queried. However, do not ask about information directly answered in the summaries. Instead, try to ask questions that 'fill in the gaps'. The maximum range of chapters (startChapter - endChapter) for a single query is 3, but you may make as many queries as you wish.
</constraints>`,

  timelineFillAnswer: `You answer specific questions about story chapters. Be concise and factual. Only include information that directly answers the question. If the chapter doesn't contain relevant information, say "Not mentioned in this chapter."`,
};

// Classifier service settings
export interface ClassifierSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export function getDefaultClassifierSettings(): ClassifierSettings {
  return {
    model: 'xiaomi/mimo-v2-flash:free',
    temperature: 0.3,
    maxTokens: 2000,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.classifier,
  };
}

// Memory service settings
export interface MemorySettings {
  model: string;
  temperature: number;
  chapterAnalysisPrompt: string;
  chapterSummarizationPrompt: string;
  retrievalDecisionPrompt: string;
}

export function getDefaultMemorySettings(): MemorySettings {
  return {
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.3,
    chapterAnalysisPrompt: DEFAULT_SERVICE_PROMPTS.chapterAnalysis,
    chapterSummarizationPrompt: DEFAULT_SERVICE_PROMPTS.chapterSummarization,
    retrievalDecisionPrompt: DEFAULT_SERVICE_PROMPTS.retrievalDecision,
  };
}

// Suggestions service settings
export interface SuggestionsSettings {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export function getDefaultSuggestionsSettings(): SuggestionsSettings {
  return {
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.7,
    maxTokens: 500,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.suggestions,
  };
}

// Style reviewer service settings
export interface StyleReviewerSettings {
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  triggerInterval: number;
  systemPrompt: string;
}

export function getDefaultStyleReviewerSettings(): StyleReviewerSettings {
  return {
    enabled: true, // Enabled by default per requirements
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.3,
    maxTokens: 1500,
    triggerInterval: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.styleReviewer,
  };
}

// Lore Management service settings (per design doc section 3.4)
export interface LoreManagementSettings {
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
}

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

export function getDefaultLoreManagementSettings(): LoreManagementSettings {
  return {
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.3,
    maxIterations: 20,
    systemPrompt: DEFAULT_LORE_MANAGEMENT_PROMPT,
  };
}

// Agentic Retrieval service settings (per design doc section 3.1.4)
export interface AgenticRetrievalSettings {
  enabled: boolean;
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
  agenticThreshold: number; // Use agentic if chapters > N
}

export const DEFAULT_AGENTIC_RETRIEVAL_PROMPT = `You are a context retrieval agent for an interactive story. Your job is to gather relevant past context that will help the narrator respond to the current situation.

Guidelines:
1. Start by reviewing the chapter list to understand the story structure
2. Query specific chapters that seem relevant to the current user input
3. Focus on gathering context about:
   - Characters mentioned or involved
   - Locations being revisited
   - Plot threads being referenced
   - Items or information from the past
   - Relationship history
4. Be selective - only gather truly relevant information
5. When you have enough context, call finish_retrieval with a synthesized summary

The context you provide will be injected into the narrator's prompt to help maintain story consistency.`;

export function getDefaultAgenticRetrievalSettings(): AgenticRetrievalSettings {
  return {
    enabled: false, // Disabled by default, static retrieval usually sufficient
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.3,
    maxIterations: 10,
    systemPrompt: DEFAULT_AGENTIC_RETRIEVAL_PROMPT,
    agenticThreshold: 30,
  };
}

// Timeline Fill service settings (per design doc section 3.1.4: Static Retrieval)
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
    enabled: true, // Default: enabled (this is the default over agentic retrieval)
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.3,
    maxQueries: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.timelineFill,
    queryAnswerPrompt: DEFAULT_SERVICE_PROMPTS.timelineFillAnswer,
  };
}

// Combined system services settings
export interface SystemServicesSettings {
  classifier: ClassifierSettings;
  memory: MemorySettings;
  suggestions: SuggestionsSettings;
  styleReviewer: StyleReviewerSettings;
  loreManagement: LoreManagementSettings;
  agenticRetrieval: AgenticRetrievalSettings;
  timelineFill: TimelineFillSettings;
}

export function getDefaultSystemServicesSettings(): SystemServicesSettings {
  return {
    classifier: getDefaultClassifierSettings(),
    memory: getDefaultMemorySettings(),
    suggestions: getDefaultSuggestionsSettings(),
    styleReviewer: getDefaultStyleReviewerSettings(),
    loreManagement: getDefaultLoreManagementSettings(),
    agenticRetrieval: getDefaultAgenticRetrievalSettings(),
    timelineFill: getDefaultTimelineFillSettings(),
  };
}

// Settings Store using Svelte 5 runes
class SettingsStore {
  apiSettings = $state<APISettings>({
    openrouterApiKey: null,
    defaultModel: 'z-ai/glm-4.7',
    temperature: 0.8,
    maxTokens: 8192,
    enableThinking: true,
  });

  uiSettings = $state<UISettings>({
    theme: 'dark',
    fontSize: 'medium',
    showWordCount: true,
    autoSave: true,
  });

  // Advanced wizard settings for scenario generation
  wizardSettings = $state<AdvancedWizardSettings>(getDefaultAdvancedSettings());

  // Story generation settings (main AI prompts)
  storyGenerationSettings = $state<StoryGenerationSettings>(getDefaultStoryGenerationSettings());

  // System services settings (classifier, memory, suggestions)
  systemServicesSettings = $state<SystemServicesSettings>(getDefaultSystemServicesSettings());

  initialized = $state(false);

  async init() {
    if (this.initialized) return;

    try {
      // Load API settings
      const apiKey = await database.getSetting('openrouter_api_key');
      const defaultModel = await database.getSetting('default_model');
      const temperature = await database.getSetting('temperature');
      const maxTokens = await database.getSetting('max_tokens');

      if (apiKey) this.apiSettings.openrouterApiKey = apiKey;
      if (defaultModel) this.apiSettings.defaultModel = defaultModel;
      if (temperature) this.apiSettings.temperature = parseFloat(temperature);
      if (maxTokens) this.apiSettings.maxTokens = parseInt(maxTokens);

      // Load thinking toggle
      const enableThinking = await database.getSetting('enable_thinking');
      if (enableThinking) this.apiSettings.enableThinking = enableThinking === 'true';

      // Load UI settings
      const theme = await database.getSetting('theme');
      const fontSize = await database.getSetting('font_size');
      const showWordCount = await database.getSetting('show_word_count');
      const autoSave = await database.getSetting('auto_save');

      if (theme) {
        this.uiSettings.theme = theme as ThemeId;
        // Apply theme immediately to prevent FOUC
        this.applyTheme(theme as ThemeId);
      }
      if (fontSize) this.uiSettings.fontSize = fontSize as 'small' | 'medium' | 'large';
      if (showWordCount) this.uiSettings.showWordCount = showWordCount === 'true';
      if (autoSave) this.uiSettings.autoSave = autoSave === 'true';

      // Load wizard settings
      const wizardSettingsJson = await database.getSetting('wizard_settings');
      if (wizardSettingsJson) {
        try {
          const loaded = JSON.parse(wizardSettingsJson);
          // Merge with defaults to ensure all fields exist
          const defaults = getDefaultAdvancedSettings();
          this.wizardSettings = {
            settingExpansion: { ...defaults.settingExpansion, ...loaded.settingExpansion },
            protagonistGeneration: { ...defaults.protagonistGeneration, ...loaded.protagonistGeneration },
            characterElaboration: { ...defaults.characterElaboration, ...loaded.characterElaboration },
            supportingCharacters: { ...defaults.supportingCharacters, ...loaded.supportingCharacters },
            openingGeneration: { ...defaults.openingGeneration, ...loaded.openingGeneration },
          };
        } catch {
          // If parsing fails, use defaults
          this.wizardSettings = getDefaultAdvancedSettings();
        }
      }

      // Load story generation settings
      const storyGenSettingsJson = await database.getSetting('story_generation_settings');
      if (storyGenSettingsJson) {
        try {
          const loaded = JSON.parse(storyGenSettingsJson);
          const defaults = getDefaultStoryGenerationSettings();
          this.storyGenerationSettings = {
            adventurePrompt: loaded.adventurePrompt || defaults.adventurePrompt,
            creativeWritingPrompt: loaded.creativeWritingPrompt || defaults.creativeWritingPrompt,
          };
        } catch {
          this.storyGenerationSettings = getDefaultStoryGenerationSettings();
        }
      }

      // Load system services settings
      const systemServicesJson = await database.getSetting('system_services_settings');
      if (systemServicesJson) {
        try {
          const loaded = JSON.parse(systemServicesJson);
          const defaults = getDefaultSystemServicesSettings();
          this.systemServicesSettings = {
            classifier: { ...defaults.classifier, ...loaded.classifier },
            memory: { ...defaults.memory, ...loaded.memory },
            suggestions: { ...defaults.suggestions, ...loaded.suggestions },
            styleReviewer: { ...defaults.styleReviewer, ...loaded.styleReviewer },
            loreManagement: { ...defaults.loreManagement, ...loaded.loreManagement },
            agenticRetrieval: { ...defaults.agenticRetrieval, ...loaded.agenticRetrieval },
            timelineFill: { ...defaults.timelineFill, ...loaded.timelineFill },
          };
        } catch {
          this.systemServicesSettings = getDefaultSystemServicesSettings();
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.initialized = true; // Mark as initialized even on error to prevent infinite retries
    }
  }

  async setApiKey(key: string) {
    this.apiSettings.openrouterApiKey = key;
    await database.setSetting('openrouter_api_key', key);
  }

  async setDefaultModel(model: string) {
    this.apiSettings.defaultModel = model;
    await database.setSetting('default_model', model);
  }

  async setTemperature(temp: number) {
    this.apiSettings.temperature = temp;
    await database.setSetting('temperature', temp.toString());
  }

  async setMaxTokens(tokens: number) {
    this.apiSettings.maxTokens = tokens;
    await database.setSetting('max_tokens', tokens.toString());
  }

  async setEnableThinking(enabled: boolean) {
    this.apiSettings.enableThinking = enabled;
    await database.setSetting('enable_thinking', enabled.toString());
  }

  /**
   * Apply theme to the DOM using data-theme attribute and legacy dark class
   */
  private applyTheme(theme: ThemeId) {
    // Set data-theme attribute for CSS custom properties
    document.documentElement.setAttribute('data-theme', theme);

    // Also maintain legacy 'dark' class for any Tailwind dark: utilities
    if (theme === 'dark' || theme === 'retro-console') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  async setTheme(theme: ThemeId) {
    this.uiSettings.theme = theme;
    await database.setSetting('theme', theme);
    this.applyTheme(theme);
  }

  async setFontSize(size: 'small' | 'medium' | 'large') {
    this.uiSettings.fontSize = size;
    await database.setSetting('font_size', size);
  }

  get hasApiKey(): boolean {
    return !!this.apiSettings.openrouterApiKey;
  }

  // Wizard settings methods
  async saveWizardSettings() {
    await database.setSetting('wizard_settings', JSON.stringify(this.wizardSettings));
  }

  async resetWizardProcess(process: keyof AdvancedWizardSettings) {
    const defaults = getDefaultAdvancedSettings();
    this.wizardSettings[process] = { ...defaults[process] };
    await this.saveWizardSettings();
  }

  async resetAllWizardSettings() {
    this.wizardSettings = getDefaultAdvancedSettings();
    await this.saveWizardSettings();
  }

  // Story generation settings methods
  async saveStoryGenerationSettings() {
    await database.setSetting('story_generation_settings', JSON.stringify(this.storyGenerationSettings));
  }

  async resetStoryGenerationSettings() {
    this.storyGenerationSettings = getDefaultStoryGenerationSettings();
    await this.saveStoryGenerationSettings();
  }

  // System services settings methods
  async saveSystemServicesSettings() {
    await database.setSetting('system_services_settings', JSON.stringify(this.systemServicesSettings));
  }

  async resetClassifierSettings() {
    this.systemServicesSettings.classifier = getDefaultClassifierSettings();
    await this.saveSystemServicesSettings();
  }

  async resetMemorySettings() {
    this.systemServicesSettings.memory = getDefaultMemorySettings();
    await this.saveSystemServicesSettings();
  }

  async resetSuggestionsSettings() {
    this.systemServicesSettings.suggestions = getDefaultSuggestionsSettings();
    await this.saveSystemServicesSettings();
  }

  async resetStyleReviewerSettings() {
    this.systemServicesSettings.styleReviewer = getDefaultStyleReviewerSettings();
    await this.saveSystemServicesSettings();
  }

  async resetLoreManagementSettings() {
    this.systemServicesSettings.loreManagement = getDefaultLoreManagementSettings();
    await this.saveSystemServicesSettings();
  }

  async resetAgenticRetrievalSettings() {
    this.systemServicesSettings.agenticRetrieval = getDefaultAgenticRetrievalSettings();
    await this.saveSystemServicesSettings();
  }

  async resetTimelineFillSettings() {
    this.systemServicesSettings.timelineFill = getDefaultTimelineFillSettings();
    await this.saveSystemServicesSettings();
  }

  async resetAllSystemServicesSettings() {
    this.systemServicesSettings = getDefaultSystemServicesSettings();
    await this.saveSystemServicesSettings();
  }
}

export const settings = new SettingsStore();
