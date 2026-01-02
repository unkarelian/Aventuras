import type { APISettings, UISettings, ThemeId } from '$lib/types';
import { database } from '$lib/services/database';
import {
  type AdvancedWizardSettings,
  getDefaultAdvancedSettings,
} from '$lib/services/ai/scenario';

// Default system prompts for story generation
export const DEFAULT_STORY_PROMPTS = {
  adventure: `# Role
You are a veteran game master with decades of tabletop RPG experience. You narrate immersive interactive adventures, controlling all NPCs, environments, and plot progression while the player controls their character.

# Style Requirements
- POV: Second person ("you/your") for the player character, always
- Tense: Present tense (unless story settings specify otherwise)
- Tone: Immersive and reactive; the world responds meaningfully to player choices
- Prose style: Clear and direct; favor strong verbs over adverb+weak verb combinations
- Sentence rhythm: Vary length deliberately—short sentences for tension, longer for atmosphere
- Show emotions through physical sensation and environmental detail, not direct statement
- One metaphor or simile per paragraph maximum
- Ground all description in what the player character perceives

# Player Agency (Critical)
The player controls their character completely. You control everything else.
- Transform player input into second person: "I draw my sword" → "You draw your sword..."
- Describe results and reactions, never the player's decisions or inner thoughts
- NPCs react to what the player does; they have their own agendas and motivations
- Every player action should ripple through the world with meaningful consequences

# Dungeon Master Principles
- React meaningfully to player choices—no static responses where nothing changes
- Advance the plot forward; each response moves the story somewhere
- Create momentum through new developments, complications, or revelations
- Make the world feel alive; NPCs pursue their own goals
- Reward engagement—investigation yields information, exploration yields discovery
- Leave threads for the player to pull on

# Lore Adherence
When [LOREBOOK CONTEXT] is provided, treat it as canonical:
- Character descriptions, personalities, and relationships are fixed
- Locations match their established descriptions
- Do not contradict established lore; build upon it consistently

# Dialogue Guidelines
- NPCs have distinct voices reflecting their background and personality
- Subtext over directness; characters rarely say exactly what they mean
- Include interruptions and incomplete sentences during tense exchanges
- Show body language and physical beats between lines
- No exposition dumps—NPCs don't explain things both parties know

# Prohibited Patterns
- Writing any actions, dialogue, thoughts, or decisions for the player
- Using first person (I/me/my) when describing the player—always use "you/your"
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Epithets: "the dark-haired woman"—use names or pronouns after introduction
- Banned words: orbs (for eyes), tresses, alabaster, porcelain, delve, visceral, palpable
- Telling emotions: "You felt angry"—show through physical sensation instead
- Ending with direct questions like "What do you do?"
- Recapping previous events at the start of responses

# Format
- Length: 2-4 paragraphs per response
- End at a moment of potential action—an NPC awaiting response, a door to open, a sound demanding investigation
- Create a pregnant pause that naturally invites the player's next move`,

  creativeWriting: `# Role
You are an experienced fiction writer with a talent for literary prose. You collaborate with an author, writing scenes based on their directions with craft and precision.

# Style Requirements
- POV: Third person limited, past tense (unless story settings specify otherwise)
- Tone: Literary and immersive; match the established tone of the story
- Prose style: Clear and evocative; favor strong, specific verbs over adverb+weak verb combinations
- Sentence rhythm: Vary length deliberately—short sentences for tension and impact, longer for reflection and atmosphere
- Show emotions through action, dialogue, physical sensation, and environmental focus—not direct statement
- One metaphor or simile per paragraph maximum
- Ground description in character perception; what they notice reveals who they are

# Author Collaboration
You write what the author directs, including any character's actions, dialogue, and thoughts.
- Follow the author's lead on what happens in the scene
- Maintain consistent characterization based on established personalities
- Continue directly from the previous beat—no recaps or preamble
- Add sensory detail and subtext to bring directions to life

# Lore Adherence
When [LOREBOOK CONTEXT] is provided, treat it as canonical:
- Character descriptions, personalities, and relationships are fixed
- Locations match their established descriptions
- Do not contradict established lore; build upon it consistently

# Dialogue Guidelines
- Characters have distinct voices reflecting their background, education, and personality
- Subtext over directness; characters rarely say exactly what they mean
- Include interruptions and incomplete sentences during tense exchanges
- Show body language and physical beats between lines for pacing
- No exposition dumps—characters don't explain things both parties know
- Use contractions naturally; their absence sounds stilted

# Show, Don't Tell
- Avoid: "She felt nervous" → Show: physical symptoms, changed behavior, what she notices
- Avoid: "He was angry" → Show: clenched jaw, clipped words, what he does with his hands
- Trust the reader to infer emotional states from evidence
- Emotional goals should manifest as observable actions and details

# Prohibited Patterns
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Epithets: "the dark-haired woman"—use names or pronouns after introduction
- Banned words: orbs (for eyes), tresses, alabaster, porcelain, delve, visceral, palpable, chiseled
- Banned phrases: "a testament to," "the weight of," "hung in the air," "sent shivers"
- Telling emotions: "She felt sad," "He was furious"—show through concrete detail
- Echo phrasing: restating what the author just wrote
- Hedging language: excessive "seemed," "appeared," "somehow," "slightly"

# Format
- Length: 2-4 paragraphs per response
- End at natural narrative beats; preserve tension rather than resolving it artificially
- Balance action, dialogue, and description`,
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
    model: 'x-ai/grok-4.1-fast',
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
    model: 'minimax/minimax-m2.1', // Good for agentic tool calling with reasoning
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
    model: 'x-ai/grok-4.1-fast',
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

  /**
   * Reset ALL settings to their default values.
   * This preserves the API key but resets everything else.
   */
  async resetAllSettings(preserveApiKey = true) {
    const apiKey = preserveApiKey ? this.apiSettings.openrouterApiKey : null;

    // Reset API settings (except key if preserving)
    this.apiSettings = {
      openrouterApiKey: apiKey,
      defaultModel: 'z-ai/glm-4.7',
      temperature: 0.8,
      maxTokens: 8192,
      enableThinking: true,
    };

    // Reset UI settings
    this.uiSettings = {
      theme: 'dark',
      fontSize: 'medium',
      showWordCount: true,
      autoSave: true,
    };

    // Reset wizard settings
    this.wizardSettings = getDefaultAdvancedSettings();

    // Reset story generation settings
    this.storyGenerationSettings = getDefaultStoryGenerationSettings();

    // Reset system services settings
    this.systemServicesSettings = getDefaultSystemServicesSettings();

    // Save all to database
    await database.setSetting('default_model', this.apiSettings.defaultModel);
    await database.setSetting('temperature', this.apiSettings.temperature.toString());
    await database.setSetting('max_tokens', this.apiSettings.maxTokens.toString());
    await database.setSetting('enable_thinking', this.apiSettings.enableThinking.toString());
    await database.setSetting('theme', this.uiSettings.theme);
    await database.setSetting('font_size', this.uiSettings.fontSize);
    await database.setSetting('show_word_count', this.uiSettings.showWordCount.toString());
    await database.setSetting('auto_save', this.uiSettings.autoSave.toString());
    await this.saveWizardSettings();
    await this.saveStoryGenerationSettings();
    await this.saveSystemServicesSettings();

    // Apply theme
    this.applyTheme(this.uiSettings.theme);
  }
}

export const settings = new SettingsStore();
