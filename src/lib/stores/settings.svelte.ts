import type { APISettings, UISettings, ThemeId, UpdateSettings, APIProfile } from '$lib/types';
import { database } from '$lib/services/database';
import {
  type AdvancedWizardSettings,
  getDefaultAdvancedSettings,
  getDefaultAdvancedSettingsForProvider,
} from '$lib/services/ai/scenario';
import { OPENROUTER_API_URL } from '$lib/services/ai/openrouter';
import type { ReasoningEffort } from '$lib/types';

// Provider preset types
// 'custom' uses OpenRouter defaults but allows user to configure their own API endpoint
export type ProviderPreset = 'openrouter' | 'nanogpt' | 'custom';

// Default profile IDs for each provider
export const DEFAULT_OPENROUTER_PROFILE_ID = 'default-openrouter-profile';
export const DEFAULT_NANOGPT_PROFILE_ID = 'default-nanogpt-profile';

// Provider URLs
export const NANOGPT_API_URL = 'https://nano-gpt.com/api/v1';

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
- One metaphor or simile per paragraph maximum; reach past the first cliché
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
- Dialogue is imperfect—false starts, evasions, non sequiturs; not prepared speeches
- Compress rather than explain: if an NPC says "A," don't have them spell out "therefore B, therefore C"—let implications land
- Interruptions should cut mid-phrase, not after complete clauses
- Characters talk past each other—they advance their own concerns while nominally replying
- Status through brevity: authority figures state and act; they don't justify
- Expert characters USE knowledge in action; they don't LECTURE through their lines
- Single-word responses can carry weight: "Evidence." "Always." "Work."
- Show body language and physical beats between lines for pacing

# Relationship & Knowledge Dynamics
- Characters with history should feel different from strangers—show accumulated weight
- Leverage knowledge asymmetries: what NPCs don't know creates dramatic irony
- Let characters act on false beliefs; protect the irony until the story earns revelation
- Unresolved tension creates undertow in dialogue—they dance around it, avoid topics

# Prohibited Patterns
- Writing any actions, dialogue, thoughts, or decisions for the player
- Using first person (I/me/my) when describing the player—always use "you/your"
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Epithets: "the dark-haired woman"—use names or pronouns after introduction
- Banned words: orbs (for eyes), tresses, alabaster, porcelain, delve, visceral, palpable
- Telling emotions: "You felt angry"—show through physical sensation instead
- Ending with direct questions like "What do you do?"
- Recapping previous events at the start of responses
- Explanation chains: NPCs spelling out "A, therefore B, therefore C"
- Formal hedging: "Protocol dictates," "It would suggest," "My assessment remains"
- Over-clipped dialogue: not every line should be a fragment—vary rhythm naturally
- Dialogue tag overload: "said" is invisible; use fancy tags sparingly

# Format
- Length: Around 250 words per response
- Build each response toward one crystallizing moment—the image or line the player remembers
- End at a moment of potential action—an NPC awaiting response, a door to open, a sound demanding investigation
- Create a pregnant pause that naturally invites the player's next move`,

  creativeWriting: `# Role
You are an experienced fiction writer with a talent for literary prose. You collaborate with an author who directs the story, and you write the prose.

CRITICAL DISTINCTION: The person giving you directions is the AUTHOR, not a character. They sit outside the story, directing what happens. They are NOT the protagonist. When the author says "I go to the store," they mean "write the protagonist going to the store"—the author is directing, not roleplaying.

# Style Requirements
- POV: Third person limited, past tense (unless story settings specify otherwise)
- Tone: Literary and immersive; match the established tone of the story
- Prose style: Clear and evocative; favor strong, specific verbs over adverb+weak verb combinations
- Sentence rhythm: Vary length deliberately—short sentences for tension and impact, longer for reflection and atmosphere
- Show emotions through action, dialogue, physical sensation, and environmental focus—not direct statement
- One metaphor or simile per paragraph maximum; reach past the first cliché
- Ground description in character perception; what they notice reveals who they are
- Not every sentence needs to be remarkable; invisible prose that serves the story beats showy prose that serves the writer

# Author vs. Protagonist (Critical)
The author directs; the protagonist is a character you write.
- The author's messages are DIRECTIONS, not character actions—interpret "I do X" as "write the protagonist doing X"
- You control ALL characters equally, including the protagonist—write their actions, dialogue, thoughts, and decisions
- The protagonist is a fictional character with their own personality, not a stand-in for the author
- Never use second person ("you")—always third person for the protagonist
- The author may give instructions like "have them argue" or "she discovers the truth"—execute these as narrative
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
- Dialogue is imperfect—false starts, evasions, non sequiturs; not prepared speeches
- Compress rather than explain: if a character says "A," don't have them spell out "therefore B, therefore C"—let implications land
- Interruptions should cut mid-phrase, not after complete clauses
- Characters talk past each other—they advance their own concerns while nominally replying
- Status through brevity: authority figures state and act; they don't justify
- Expert characters USE knowledge in action; they don't LECTURE through their lines
- Single-word responses can carry weight: "Evidence." "Always." "Work."
- Show body language and physical beats between lines for pacing
- Use contractions naturally; their absence sounds stilted
- "Said" is invisible—use it freely; fancy tags ("murmured," "hissed") sparingly
- Mix clipped lines with fuller ones; not every line should be a fragment or power move

# Relationship & Knowledge Dynamics
- Characters with interaction history should feel different from strangers—show accumulated weight
- Leverage knowledge asymmetries: what characters don't know creates dramatic irony
- Let characters act on false beliefs; protect the irony until the story earns revelation
- Unresolved tension creates undertow in dialogue—they dance around it, avoid topics
- Show relationship history through behavior: finishing sentences, knowing which buttons to push

# Show, Don't Tell
- Avoid: "She felt nervous" → Show: physical symptoms, changed behavior, what she notices
- Avoid: "He was angry" → Show: clenched jaw, clipped words, what he does with his hands
- Trust the reader to infer emotional states from evidence
- Emotional goals should manifest as observable actions and details
- Brief internal reactions in italics are permitted (max 1 sentence): *Not again.*
- After showing a trait through action, don't label it

# Scene Structure
- Build each response toward one crystallizing moment—the image or line the reader remembers
- Structure: Setup → Setup → MOMENT → Brief aftermath
- For reversals: setup intent clearly, let action play, land the gap—the reader should think "oh no" before the character realizes
- End scenes on concrete action, sensory detail, or dialogue—never by naming the emotional state

# Prohibited Patterns
- Second person: NEVER use "you/your" for the protagonist—always use their name or "he/she/they"
- Treating the author as a character: the author directs from outside the story
- Purple prose: overwrought metaphors, consecutive similes, excessive adjectives
- Epithets: "the dark-haired woman"—use names or pronouns after introduction
- "Not X, but Y" constructs: avoid "not anger, but something deeper"—just describe the thing directly
- Telling emotions: "She felt sad," "He was furious"—show through concrete detail
- Echo phrasing: restating what the author just wrote
- Hedging language: excessive "seemed," "appeared," "somehow," "slightly"
- Explanation chains: characters spelling out "A, therefore B, therefore C"
- Formal hedging: "Protocol dictates," "It would suggest," "My assessment remains"
- Over-clipped dialogue: not every line should be a fragment—vary rhythm naturally
- Melodrama: hearts shattering, waves of emotion, eyes that speak volumes
- Narrative bows: tying scenes with conclusions or realizations
- Comfort smoothing: sanding down awkward moments into resolution

# Overused Phrases to Avoid
- Cliché similes: "like a physical blow," "ribs like a trapped bird," "like a trapped bird," "hit like a"
- Heart/breathing clichés: "heart hammering against ribs," "took a deep breath" (as filler), "squeezed eyes shut"
- Voice tag clichés: "voice dropping an octave," "said, his/her voice [adjective]" (find fresher constructions)
- Atmosphere clichés: "dust motes dancing," "silence stretched," "metallic tang," "for the first time in years," "seen better decades"
- Banned words: ozone, orbs (for eyes), tresses, alabaster, porcelain
- Banned names: Elara, Kael, Lyra, Seraphina, Thorne, Astra, Zephyr, Caelan, Rowan (when male), Kai—use more distinctive names

# Format
- Length: Up to 500 words per response
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

### Story Beat Updates - CRITICAL for cleanup:
- Always check if existing story beats have been RESOLVED in this passage
- Mark beats as "completed" when: quest finished, goal achieved, mystery solved, plot point resolved
- Mark beats as "failed" when: quest becomes impossible, opportunity lost, goal abandoned
- This prevents story beats from stacking up indefinitely
- Example: If "Find the missing brother" was active and the brother is found, mark it completed

## Critical Rules
1. When in doubt, DO NOT extract - false positives pollute the world state
2. Only extract what ACTUALLY HAPPENED, not what might happen
3. Use the exact names from the text, don't invent or embellish
4. ALWAYS check if active story beats should be marked completed or failed
5. Respond with valid JSON only - no markdown, no explanation`,

  chapterAnalysis: `# Role
You are Auto Summarize Endpoint Selector. Your task is to identify the single best chapter endpoint in the provided message range.

## Task
Select the message ID that represents the longest self-contained narrative arc within the given range. The endpoint should be at a natural narrative beat: resolution, decision, scene change, or clear transition.

## Output Format
Return ONLY a JSON object with a single field:
{ "chapterEnd": <integer message ID> }

## Rules
- Select exactly ONE endpoint
- The endpoint must be within the provided message range
- Choose the point that creates the most complete, self-contained chapter
- Prefer later messages that still complete the arc (avoid cutting mid-beat)`,

  chapterSummarization: `You are a literary analysis expert specializing in narrative structure and scene summarization. Your expertise is in distilling complex narrative elements into concise, query-friendly summaries.

## Task
Create a 'story map' summary of the provided chapter. This summary will be used as part of a searchable timeline database for quick identification and location of specific scenes.

## What to Include
For each chapter, create a concise summary that includes ONLY:
1. The most critical plot developments that drive the story forward
2. Key character turning points or significant changes in motivation/goals
3. Major shifts in narrative direction, tone, or setting
4. Essential conflicts introduced or resolved
5. Critical character moments and their reactions

## What to Exclude
- Minor details or descriptive passages
- Dialogue excerpts (unless pivotal)
- Stylistic or thematic analysis
- Personal interpretations or opinions

## Output Format
Respond with JSON only.`,

  retrievalDecision: `You decide which story chapters are relevant for the current context. Respond with valid JSON only.`,

  suggestions: `You are a creative writing assistant that suggests overall story directions and plot developments. Focus on where the narrative could go—scenes, plot beats, revelations, confrontations—NOT singular character actions like "she picks up the cup." Think like a story editor suggesting arcs, not a player suggesting moves.

IMPORTANT: Format each suggestion as an author's direction that the user would type to guide the AI. Use the style: "Continue the scene, having [character] do [action], and [additional direction]..."

Examples:
- "Continue the scene, having Marcus confront Elena about the missing documents, escalating into a heated argument"
- "Continue with the group discovering the abandoned cabin, but something feels wrong about it"
- "Have the protagonist finally reveal their secret to their companion, leading to an unexpected reaction"

These should read like instructions an author gives to guide the next part of the story.

Respond with valid JSON only.`,

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

export interface AdvancedRequestSettings {
  manualMode: boolean;
}

export function getDefaultAdvancedRequestSettings(): AdvancedRequestSettings {
  return {
    manualMode: false,
  };
}

// Classifier service settings (World State Classifier - extracts entities from narrative)
export interface ClassifierSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultClassifierSettings(): ClassifierSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'x-ai/grok-4-fast',
    temperature: 0.3,
    maxTokens: 8192,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.classifier,
    reasoningEffort: 'medium',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultClassifierSettingsForProvider(provider: ProviderPreset): ClassifierSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT: Use Deepseek v3.2 without thinking (per user request)
  const model = provider === 'nanogpt' ? 'deepseek/deepseek-v3.2' : 'x-ai/grok-4-fast';
  return {
    profileId,
    model,
    temperature: 0.3,
    maxTokens: 8192,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.classifier,
    reasoningEffort: 'medium',
    providerOnly: [],
    manualBody: '',
  };
}

// Lorebook Import Classifier settings (classifies imported lorebook entries by type)
export interface LorebookClassifierSettings {
  profileId: string | null;  // API profile to use (null = use main narrative profile)
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  batchSize: number;         // Entries per batch for LLM classification
  maxConcurrent: number;     // Max concurrent batch requests
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export const DEFAULT_LOREBOOK_CLASSIFIER_PROMPT = `You are a precise classifier for fantasy/RPG lorebook entries. Analyze the name, content, and keywords to determine the most appropriate category. Be decisive - pick the single best category for each entry. Respond only with the JSON array.`;

export function getDefaultLorebookClassifierSettings(): LorebookClassifierSettings {
  return {
    profileId: null,  // null = use main narrative profile
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.1,
    maxTokens: 8192,
    systemPrompt: DEFAULT_LOREBOOK_CLASSIFIER_PROMPT,
    batchSize: 50,
    maxConcurrent: 5,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultLorebookClassifierSettingsForProvider(provider: ProviderPreset): LorebookClassifierSettings {
  // NanoGPT: Use Deepseek v3.2 without thinking (per user request)
  const model = provider === 'nanogpt' ? 'deepseek/deepseek-v3.2' : 'x-ai/grok-4.1-fast';
  return {
    profileId: null,  // null = use main narrative profile
    model,
    temperature: 0.1,
    maxTokens: 8192,
    systemPrompt: DEFAULT_LOREBOOK_CLASSIFIER_PROMPT,
    batchSize: 50,
    maxConcurrent: 5,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

// Memory service settings
export interface MemorySettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  chapterAnalysisPrompt: string;
  chapterSummarizationPrompt: string;
  retrievalDecisionPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultMemorySettings(): MemorySettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.3,
    chapterAnalysisPrompt: DEFAULT_SERVICE_PROMPTS.chapterAnalysis,
    chapterSummarizationPrompt: DEFAULT_SERVICE_PROMPTS.chapterSummarization,
    retrievalDecisionPrompt: DEFAULT_SERVICE_PROMPTS.retrievalDecision,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultMemorySettingsForProvider(provider: ProviderPreset): MemorySettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT: Use Deepseek v3.2 for memory tasks
  const model = provider === 'nanogpt' ? 'deepseek/deepseek-v3.2' : 'x-ai/grok-4.1-fast';
  return {
    profileId,
    model,
    temperature: 0.3,
    chapterAnalysisPrompt: DEFAULT_SERVICE_PROMPTS.chapterAnalysis,
    chapterSummarizationPrompt: DEFAULT_SERVICE_PROMPTS.chapterSummarization,
    retrievalDecisionPrompt: DEFAULT_SERVICE_PROMPTS.retrievalDecision,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

// Suggestions service settings
export interface SuggestionsSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultSuggestionsSettings(): SuggestionsSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.7,
    maxTokens: 8192,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.suggestions,
    reasoningEffort: 'off',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultSuggestionsSettingsForProvider(provider: ProviderPreset): SuggestionsSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // Same model for both - deepseek doesn't have thinking in either provider by default
  return {
    profileId,
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.7,
    maxTokens: 8192,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.suggestions,
    reasoningEffort: 'off',
    providerOnly: [],
    manualBody: '',
  };
}

// Action choices settings (RPG-style choices for adventure mode)
export interface ActionChoicesSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultActionChoicesSettings(): ActionChoicesSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.8,
    maxTokens: 8192,
    reasoningEffort: 'off',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultActionChoicesSettingsForProvider(provider: ProviderPreset): ActionChoicesSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  return {
    profileId,
    model: 'deepseek/deepseek-v3.2',
    temperature: 0.8,
    maxTokens: 8192,
    reasoningEffort: 'off',
    providerOnly: [],
    manualBody: '',
  };
}

// Style reviewer service settings
export interface StyleReviewerSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  enabled: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  triggerInterval: number;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultStyleReviewerSettings(): StyleReviewerSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    enabled: true, // Enabled by default per requirements
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.3,
    maxTokens: 8192,
    triggerInterval: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.styleReviewer,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultStyleReviewerSettingsForProvider(provider: ProviderPreset): StyleReviewerSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT: Use Deepseek v3.2 without thinking (per user request)
  const model = provider === 'nanogpt' ? 'deepseek/deepseek-v3.2' : 'x-ai/grok-4.1-fast';
  return {
    profileId,
    enabled: true,
    model,
    temperature: 0.3,
    maxTokens: 8192,
    triggerInterval: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.styleReviewer,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

// Lore Management service settings (per design doc section 3.4)
export interface LoreManagementSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
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
- Prefer targeted updates (e.g., search/replace) instead of rewriting long descriptions

Use your tools to review the story and make necessary changes. When finished, call finish_lore_management with a summary.`;

export function getDefaultLoreManagementSettings(): LoreManagementSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'minimax/minimax-m2.1', // Good for agentic tool calling with reasoning
    temperature: 0.3,
    maxIterations: 50,
    systemPrompt: DEFAULT_LORE_MANAGEMENT_PROMPT,
    reasoningEffort: 'high',
    providerOnly: ['minimax'],
    manualBody: '',
  };
}

export function getDefaultLoreManagementSettingsForProvider(provider: ProviderPreset): LoreManagementSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // minimax has built-in reasoning, same for both providers
  return {
    profileId,
    model: 'minimax/minimax-m2.1',
    temperature: 0.3,
    maxIterations: 50,
    systemPrompt: DEFAULT_LORE_MANAGEMENT_PROMPT,
    reasoningEffort: 'high',
    providerOnly: ['minimax'],
    manualBody: '',
  };
}

// Agentic Retrieval service settings (per design doc section 3.1.4)
export interface AgenticRetrievalSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  enabled: boolean;
  model: string;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
  agenticThreshold: number; // Use agentic if chapters > N
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
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
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    enabled: false, // Disabled by default, static retrieval usually sufficient
    model: 'minimax/minimax-m2.1',
    temperature: 0.3,
    maxIterations: 30,
    systemPrompt: DEFAULT_AGENTIC_RETRIEVAL_PROMPT,
    agenticThreshold: 30,
    reasoningEffort: 'high',
    providerOnly: ['minimax'],
    manualBody: '',
  };
}

export function getDefaultAgenticRetrievalSettingsForProvider(provider: ProviderPreset): AgenticRetrievalSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // minimax has built-in reasoning, same for both providers
  return {
    profileId,
    enabled: false,
    model: 'minimax/minimax-m2.1',
    temperature: 0.3,
    maxIterations: 30,
    systemPrompt: DEFAULT_AGENTIC_RETRIEVAL_PROMPT,
    agenticThreshold: 30,
    reasoningEffort: 'high',
    providerOnly: ['minimax'],
    manualBody: '',
  };
}

// Timeline Fill service settings (per design doc section 3.1.4: Static Retrieval)
export interface TimelineFillSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  enabled: boolean;
  mode: 'static' | 'agentic';  // 'static' is default, 'agentic' for tool-calling retrieval
  model: string;
  temperature: number;
  maxQueries: number;
  systemPrompt: string;
  queryAnswerPrompt: string;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultTimelineFillSettings(): TimelineFillSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    enabled: true, // Default: enabled (this is the default over agentic retrieval)
    mode: 'static', // Default: static timeline fill (one-time AI call pattern)
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.3,
    maxQueries: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.timelineFill,
    queryAnswerPrompt: DEFAULT_SERVICE_PROMPTS.timelineFillAnswer,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultTimelineFillSettingsForProvider(provider: ProviderPreset): TimelineFillSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT: Use mimo-v2-flash-thinking for timeline fill (query generation and answering)
  const model = provider === 'nanogpt' ? 'xiaomi/mimo-v2-flash-thinking' : 'x-ai/grok-4.1-fast';
  const temperature = provider === 'nanogpt' ? 0.8 : 0.3;
  return {
    profileId,
    enabled: true,
    mode: 'static',
    model,
    temperature,
    maxQueries: 5,
    systemPrompt: DEFAULT_SERVICE_PROMPTS.timelineFill,
    queryAnswerPrompt: DEFAULT_SERVICE_PROMPTS.timelineFillAnswer,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

// Entry Retrieval settings (Tier 3 LLM selection for lorebook entries)
export interface EntryRetrievalSettings {
  profileId: string | null;  // API profile to use (null = use default profile)
  model: string;
  temperature: number;
  maxTier3Entries: number;  // 0 = unlimited
  maxWordsPerEntry: number; // 0 = unlimited
  enableLLMSelection: boolean;
  reasoningEffort: ReasoningEffort;
  providerOnly: string[];
  manualBody: string;
}

export function getDefaultEntryRetrievalSettings(): EntryRetrievalSettings {
  return {
    profileId: DEFAULT_OPENROUTER_PROFILE_ID,
    model: 'x-ai/grok-4.1-fast',
    temperature: 0.2,
    maxTier3Entries: 0,
    maxWordsPerEntry: 0,
    enableLLMSelection: true,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

export function getDefaultEntryRetrievalSettingsForProvider(provider: ProviderPreset): EntryRetrievalSettings {
  const profileId = provider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  // NanoGPT: Use mimo-v2-flash-thinking for lorebook retrieval
  const model = provider === 'nanogpt' ? 'xiaomi/mimo-v2-flash-thinking' : 'x-ai/grok-4.1-fast';
  const temperature = provider === 'nanogpt' ? 0.8 : 0.2;
  return {
    profileId,
    model,
    temperature,
    maxTier3Entries: 0,
    maxWordsPerEntry: 0,
    enableLLMSelection: true,
    reasoningEffort: 'high',
    providerOnly: [],
    manualBody: '',
  };
}

// Update settings
export function getDefaultUpdateSettings(): UpdateSettings {
  return {
    autoCheck: true,
    autoDownload: false,
    checkInterval: 24, // Check every 24 hours
    lastChecked: null,
  };
}

// Combined system services settings
export interface SystemServicesSettings {
  classifier: ClassifierSettings;
  lorebookClassifier: LorebookClassifierSettings;
  memory: MemorySettings;
  suggestions: SuggestionsSettings;
  actionChoices: ActionChoicesSettings;
  styleReviewer: StyleReviewerSettings;
  loreManagement: LoreManagementSettings;
  agenticRetrieval: AgenticRetrievalSettings;
  timelineFill: TimelineFillSettings;
  entryRetrieval: EntryRetrievalSettings;
}

export function getDefaultSystemServicesSettings(): SystemServicesSettings {
  return {
    classifier: getDefaultClassifierSettings(),
    lorebookClassifier: getDefaultLorebookClassifierSettings(),
    memory: getDefaultMemorySettings(),
    suggestions: getDefaultSuggestionsSettings(),
    actionChoices: getDefaultActionChoicesSettings(),
    styleReviewer: getDefaultStyleReviewerSettings(),
    loreManagement: getDefaultLoreManagementSettings(),
    agenticRetrieval: getDefaultAgenticRetrievalSettings(),
    timelineFill: getDefaultTimelineFillSettings(),
    entryRetrieval: getDefaultEntryRetrievalSettings(),
  };
}

export function getDefaultSystemServicesSettingsForProvider(provider: ProviderPreset): SystemServicesSettings {
  return {
    classifier: getDefaultClassifierSettingsForProvider(provider),
    lorebookClassifier: getDefaultLorebookClassifierSettingsForProvider(provider),
    memory: getDefaultMemorySettingsForProvider(provider),
    suggestions: getDefaultSuggestionsSettingsForProvider(provider),
    actionChoices: getDefaultActionChoicesSettingsForProvider(provider),
    styleReviewer: getDefaultStyleReviewerSettingsForProvider(provider),
    loreManagement: getDefaultLoreManagementSettingsForProvider(provider),
    agenticRetrieval: getDefaultAgenticRetrievalSettingsForProvider(provider),
    timelineFill: getDefaultTimelineFillSettingsForProvider(provider),
    entryRetrieval: getDefaultEntryRetrievalSettingsForProvider(provider),
  };
}

// Settings Store using Svelte 5 runes
class SettingsStore {
  // Provider preset - which provider's defaults to use
  providerPreset = $state<ProviderPreset>('openrouter');

  // First-run detection - true if user has completed initial setup
  firstRunComplete = $state(false);

  apiSettings = $state<APISettings>({
    openaiApiKey: null,
    openaiApiURL: OPENROUTER_API_URL,
    profiles: [],
    activeProfileId: null,
    mainNarrativeProfileId: DEFAULT_OPENROUTER_PROFILE_ID,
    defaultModel: 'z-ai/glm-4.7',
    temperature: 0.8,
    maxTokens: 8192,
    reasoningEffort: 'off',
    providerOnly: [],
    manualBody: '',
    enableThinking: false,
  });

  uiSettings = $state<UISettings>({
    theme: 'dark',
    fontSize: 'medium',
    showWordCount: true,
    autoSave: true,
    spellcheckEnabled: true,
  });

  advancedRequestSettings = $state<AdvancedRequestSettings>(getDefaultAdvancedRequestSettings());

  // Advanced wizard settings for scenario generation
  wizardSettings = $state<AdvancedWizardSettings>(getDefaultAdvancedSettings());

  // Story generation settings (main AI prompts)
  storyGenerationSettings = $state<StoryGenerationSettings>(getDefaultStoryGenerationSettings());

  // System services settings (classifier, memory, suggestions)
  systemServicesSettings = $state<SystemServicesSettings>(getDefaultSystemServicesSettings());

  // Update settings
  updateSettings = $state<UpdateSettings>(getDefaultUpdateSettings());

  initialized = $state(false);

  async init() {
    if (this.initialized) return;

    try {
      // Load API settings
      const apiURL = await database.getSetting('openai_api_url') ?? OPENROUTER_API_URL; //Default to OpenRouter.

      // Load API key - check multiple locations for migration
      // Must handle empty strings explicitly since ?? only checks for null/undefined
      let apiKey = await database.getSetting('openai_api_key');
      if (!apiKey || apiKey.length === 0) {
        // Fall back to legacy openrouter_api_key location
        apiKey = await database.getSetting('openrouter_api_key');
      }

      const defaultModel = await database.getSetting('default_model');
      const temperature = await database.getSetting('temperature');
      const maxTokens = await database.getSetting('max_tokens');

      if (apiURL) this.apiSettings.openaiApiURL = apiURL;
      if (apiKey) this.apiSettings.openaiApiKey = apiKey;
      if (defaultModel) this.apiSettings.defaultModel = defaultModel;
      if (temperature) this.apiSettings.temperature = parseFloat(temperature);
      if (maxTokens) this.apiSettings.maxTokens = parseInt(maxTokens);

      // Load thinking toggle
      const enableThinking = await database.getSetting('enable_thinking');
      if (enableThinking) this.apiSettings.enableThinking = enableThinking === 'true';

      const reasoningEffort = await database.getSetting('main_reasoning_effort');
      if (reasoningEffort && ['off', 'low', 'medium', 'high'].includes(reasoningEffort)) {
        this.apiSettings.reasoningEffort = reasoningEffort as ReasoningEffort;
      } else if (this.apiSettings.enableThinking) {
        this.apiSettings.reasoningEffort = 'high';
      }

      const providerOnlyJson = await database.getSetting('main_provider_only');
      if (providerOnlyJson) {
        try {
          const parsed = JSON.parse(providerOnlyJson);
          if (Array.isArray(parsed)) {
            this.apiSettings.providerOnly = parsed.filter(item => typeof item === 'string');
          }
        } catch {
          this.apiSettings.providerOnly = [];
        }
      }

      const manualBody = await database.getSetting('main_manual_body');
      if (manualBody !== null) {
        this.apiSettings.manualBody = manualBody;
      }

      // Load profiles
      const profilesJson = await database.getSetting('api_profiles');
      if (profilesJson) {
        try {
          this.apiSettings.profiles = JSON.parse(profilesJson);
        } catch {
          this.apiSettings.profiles = [];
        }
      }
      const activeProfileId = await database.getSetting('active_profile_id');
      if (activeProfileId) this.apiSettings.activeProfileId = activeProfileId;

      // Load main narrative profile (defaults to OpenRouter if not set)
      const mainNarrativeProfileId = await database.getSetting('main_narrative_profile_id');
      if (mainNarrativeProfileId) {
        this.apiSettings.mainNarrativeProfileId = mainNarrativeProfileId;
      } else {
        // Migration: default to OpenRouter for existing users
        this.apiSettings.mainNarrativeProfileId = DEFAULT_OPENROUTER_PROFILE_ID;
      }

      // Load provider preset (which provider's defaults to use)
      const providerPreset = await database.getSetting('provider_preset');
      if (providerPreset) {
        this.providerPreset = providerPreset as ProviderPreset;
      }

      // Load first-run status
      const firstRunComplete = await database.getSetting('first_run_complete');
      if (firstRunComplete === 'true') {
        this.firstRunComplete = true;
      } else {
        // Migration: Check if this is an existing user (has API key or profiles)
        // If so, mark first run as complete and default to OpenRouter
        const hasExistingSetup = apiKey || (this.apiSettings.profiles && this.apiSettings.profiles.length > 0);
        if (hasExistingSetup) {
          this.firstRunComplete = true;
          this.providerPreset = 'openrouter'; // Default existing users to OpenRouter
          await database.setSetting('first_run_complete', 'true');
          await database.setSetting('provider_preset', 'openrouter');
          console.log('[Settings] Existing user detected, marking first run complete');
        }
      }

      // Load UI settings
      const theme = await database.getSetting('theme');
      const fontSize = await database.getSetting('font_size');
      const showWordCount = await database.getSetting('show_word_count');
      const autoSave = await database.getSetting('auto_save');
      const spellcheckEnabled = await database.getSetting('spellcheck_enabled');

      if (theme) {
        this.uiSettings.theme = theme as ThemeId;
        // Apply theme immediately to prevent FOUC
        this.applyTheme(theme as ThemeId);
      }
      if (fontSize) this.uiSettings.fontSize = fontSize as 'small' | 'medium' | 'large';
      if (showWordCount) this.uiSettings.showWordCount = showWordCount === 'true';
      if (autoSave) this.uiSettings.autoSave = autoSave === 'true';
      if (spellcheckEnabled !== null) this.uiSettings.spellcheckEnabled = spellcheckEnabled === 'true';

      const manualMode = await database.getSetting('advanced_manual_mode');
      if (manualMode !== null) {
        this.advancedRequestSettings.manualMode = manualMode === 'true';
      }

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
          const defaults = getDefaultSystemServicesSettingsForProvider(this.getEffectiveProvider());
          this.systemServicesSettings = {
            classifier: { ...defaults.classifier, ...loaded.classifier },
            lorebookClassifier: { ...defaults.lorebookClassifier, ...loaded.lorebookClassifier },
            memory: { ...defaults.memory, ...loaded.memory },
            suggestions: { ...defaults.suggestions, ...loaded.suggestions },
            actionChoices: { ...defaults.actionChoices, ...loaded.actionChoices },
            styleReviewer: { ...defaults.styleReviewer, ...loaded.styleReviewer },
            loreManagement: { ...defaults.loreManagement, ...loaded.loreManagement },
            agenticRetrieval: { ...defaults.agenticRetrieval, ...loaded.agenticRetrieval },
            timelineFill: { ...defaults.timelineFill, ...loaded.timelineFill },
            entryRetrieval: { ...defaults.entryRetrieval, ...loaded.entryRetrieval },
          };

          const isMissingProfileId = (profileId: string | null | undefined): boolean => {
            return profileId === null || profileId === undefined || profileId === '';
          };
          const suggestionsSettings = loaded?.suggestions ?? this.systemServicesSettings.suggestions;
          const suggestionProfileId = suggestionsSettings?.profileId ?? this.systemServicesSettings.suggestions.profileId;
          if (isMissingProfileId(this.systemServicesSettings.actionChoices.profileId) && suggestionProfileId) {
            this.systemServicesSettings.actionChoices.profileId = suggestionProfileId;
          }
          if (!this.systemServicesSettings.actionChoices.model && suggestionsSettings?.model) {
            this.systemServicesSettings.actionChoices.model = suggestionsSettings.model;
          }
          if (this.systemServicesSettings.actionChoices.temperature === undefined && suggestionsSettings?.temperature !== undefined) {
            this.systemServicesSettings.actionChoices.temperature = suggestionsSettings.temperature;
          }
          if (this.systemServicesSettings.actionChoices.maxTokens === undefined && suggestionsSettings?.maxTokens !== undefined) {
            this.systemServicesSettings.actionChoices.maxTokens = suggestionsSettings.maxTokens;
          }
        } catch {
          this.systemServicesSettings = getDefaultSystemServicesSettingsForProvider(this.getEffectiveProvider());
        }
      } else {
        this.systemServicesSettings = getDefaultSystemServicesSettingsForProvider(this.getEffectiveProvider());
      }

      // Load update settings
      const updateSettingsJson = await database.getSetting('update_settings');
      if (updateSettingsJson) {
        try {
          const loaded = JSON.parse(updateSettingsJson);
          const defaults = getDefaultUpdateSettings();
          this.updateSettings = { ...defaults, ...loaded };
        } catch {
          this.updateSettings = getDefaultUpdateSettings();
        }
      }

      // Only ensure default profile and migrate for existing users (who have completed first run)
      // New users will get their profile created in initializeWithProvider after selecting a provider
      if (this.firstRunComplete) {
        const isOpenRouterUrl = apiURL === OPENROUTER_API_URL;
        const isOpenRouterKey = !!apiKey && apiKey.startsWith('sk-or-');
        const shouldEnsureOpenRouterProfile = this.providerPreset === 'openrouter' || isOpenRouterUrl || isOpenRouterKey;
        const openRouterApiKey = (isOpenRouterUrl || isOpenRouterKey) ? apiKey : null;

        // Ensure default OpenRouter profile exists (migration for existing OpenRouter users)
        if (shouldEnsureOpenRouterProfile) {
          await this.ensureDefaultOpenRouterProfile(openRouterApiKey || null);
        }

        // Migrate null profileIds to default OpenRouter profile
        await this.migrateNullProfileIds();
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.initialized = true; // Mark as initialized even on error to prevent infinite retries
    }
  }
  async setApiURL(apiURL: string) {
    this.apiSettings.openaiApiURL = apiURL;
    await database.setSetting('openai_api_url', apiURL);
  }

  async setApiKey(key: string) {
    this.apiSettings.openaiApiKey = key;
    await database.setSetting('openai_api_key', key);
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
    this.apiSettings.reasoningEffort = enabled ? 'high' : 'off';
    await database.setSetting('enable_thinking', enabled.toString());
    await database.setSetting('main_reasoning_effort', this.apiSettings.reasoningEffort);
  }

  async setMainReasoningEffort(effort: ReasoningEffort) {
    this.apiSettings.reasoningEffort = effort;
    this.apiSettings.enableThinking = effort !== 'off';
    await database.setSetting('main_reasoning_effort', effort);
    await database.setSetting('enable_thinking', this.apiSettings.enableThinking.toString());
  }

  async setMainProviderOnly(providers: string[]) {
    this.apiSettings.providerOnly = providers;
    await database.setSetting('main_provider_only', JSON.stringify(providers));
  }

  async setMainManualBody(body: string) {
    this.apiSettings.manualBody = body;
    await database.setSetting('main_manual_body', body);
  }

  // ===== Profile Management Methods =====

  async saveProfiles() {
    await database.setSetting('api_profiles', JSON.stringify(this.apiSettings.profiles));
    if (this.apiSettings.activeProfileId) {
      await database.setSetting('active_profile_id', this.apiSettings.activeProfileId);
    }
  }

  async addProfile(profile: Omit<APIProfile, 'id' | 'createdAt'>) {
    const newProfile: APIProfile = {
      ...profile,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    this.apiSettings.profiles = [...this.apiSettings.profiles, newProfile];
    await this.saveProfiles();
    return newProfile;
  }

  async updateProfile(id: string, updates: Partial<Omit<APIProfile, 'id' | 'createdAt'>>) {
    const index = this.apiSettings.profiles.findIndex(p => p.id === id);
    if (index === -1) return;

    this.apiSettings.profiles[index] = {
      ...this.apiSettings.profiles[index],
      ...updates,
    };
    this.apiSettings.profiles = [...this.apiSettings.profiles];
    await this.saveProfiles();
  }

  async deleteProfile(id: string) {
    // Prevent deleting the default profile for the current provider
    const defaultProfileId = this.getDefaultProfileIdForProvider();
    if (id === defaultProfileId) {
      console.warn('[Settings] Cannot delete the default profile');
      return false;
    }

    this.apiSettings.profiles = this.apiSettings.profiles.filter(p => p.id !== id);

    // If deleted profile was active, switch to default profile
    if (this.apiSettings.activeProfileId === id) {
      const defaultProfile = this.getProfile(defaultProfileId);
      if (defaultProfile) {
        this.apiSettings.activeProfileId = defaultProfileId;
        this.apiSettings.openaiApiURL = defaultProfile.baseUrl;
        this.apiSettings.openaiApiKey = defaultProfile.apiKey;
      } else if (this.apiSettings.profiles.length > 0) {
        const fallbackProfile = this.apiSettings.profiles[0];
        this.apiSettings.activeProfileId = fallbackProfile.id;
        this.apiSettings.openaiApiURL = fallbackProfile.baseUrl;
        this.apiSettings.openaiApiKey = fallbackProfile.apiKey;
      } else {
        this.apiSettings.activeProfileId = null;
      }
    }

    await this.saveProfiles();
    return true;
  }

  /**
   * Check if a profile can be deleted (not the default profile)
   */
  canDeleteProfile(id: string): boolean {
    return id !== this.getDefaultProfileIdForProvider();
  }

  /**
   * Set the active profile for editing in the API tab (UI state only)
   * This does NOT change which profile is used for API calls
   */
  setActiveProfileForEditing(id: string | null) {
    this.apiSettings.activeProfileId = id;
  }

  /**
   * Set the profile used for main narrative generation
   */
  async setMainNarrativeProfile(profileId: string) {
    this.apiSettings.mainNarrativeProfileId = profileId;
    await database.setSetting('main_narrative_profile_id', profileId);
  }

  /**
   * Get the profile used for main narrative generation
   */
  getMainNarrativeProfile(): APIProfile | undefined {
    return this.getProfile(this.apiSettings.mainNarrativeProfileId);
  }

  /**
   * Get API settings configured for a specific profile.
   * This returns a modified APISettings object with the profile's URL and key.
   * Use this when creating an OpenAIProvider for a specific service.
   */
  getApiSettingsForProfile(profileId: string): APISettings {
    const profile = this.getProfile(profileId);
    if (!profile) {
      // Fall back to the default profile for the current provider
      const defaultProfile = this.getDefaultProfile();
      if (defaultProfile) {
        return {
          ...this.apiSettings,
          openaiApiURL: defaultProfile.baseUrl,
          openaiApiKey: defaultProfile.apiKey,
        };
      }
      // Ultimate fallback - use current settings
      return this.apiSettings;
    }

    return {
      ...this.apiSettings,
      openaiApiURL: profile.baseUrl,
      openaiApiKey: profile.apiKey,
    };
  }

  getProfile(id: string): APIProfile | undefined {
    return this.apiSettings.profiles.find(p => p.id === id);
  }

  getActiveProfile(): APIProfile | undefined {
    if (!this.apiSettings.activeProfileId) return undefined;
    return this.getProfile(this.apiSettings.activeProfileId);
  }

  getProfileModels(profileId: string | null): string[] {
    if (!profileId) return [];
    const profile = this.getProfile(profileId);
    if (!profile) return [];
    return [...new Set([...profile.fetchedModels, ...profile.customModels])];
  }

  /**
   * Collect all models currently in use across all services.
   * This is used for migration to ensure the default profile has all needed models.
   */
  private collectModelsInUse(): string[] {
    const models = new Set<string>();

    // Default model
    if (this.apiSettings.defaultModel) {
      models.add(this.apiSettings.defaultModel);
    }

    // Classifier
    if (this.systemServicesSettings.classifier.model) {
      models.add(this.systemServicesSettings.classifier.model);
    }

    // Memory
    if (this.systemServicesSettings.memory.model) {
      models.add(this.systemServicesSettings.memory.model);
    }

    // Suggestions
    if (this.systemServicesSettings.suggestions.model) {
      models.add(this.systemServicesSettings.suggestions.model);
    }

    // Action Choices
    if (this.systemServicesSettings.actionChoices.model) {
      models.add(this.systemServicesSettings.actionChoices.model);
    }

    // Style Reviewer
    if (this.systemServicesSettings.styleReviewer.model) {
      models.add(this.systemServicesSettings.styleReviewer.model);
    }

    // Lore Management
    if (this.systemServicesSettings.loreManagement.model) {
      models.add(this.systemServicesSettings.loreManagement.model);
    }

    // Agentic Retrieval
    if (this.systemServicesSettings.agenticRetrieval.model) {
      models.add(this.systemServicesSettings.agenticRetrieval.model);
    }

    // Timeline Fill
    if (this.systemServicesSettings.timelineFill.model) {
      models.add(this.systemServicesSettings.timelineFill.model);
    }

    // Entry Retrieval (Tier 3 selection)
    if (this.systemServicesSettings.entryRetrieval.model) {
      models.add(this.systemServicesSettings.entryRetrieval.model);
    }

    // Wizard settings
    for (const process of Object.values(this.wizardSettings)) {
      if (process.model) {
        models.add(process.model);
      }
    }

    return Array.from(models).filter(m => m.length > 0);
  }

  /**
   * Ensure the default OpenRouter profile exists.
   * This handles migration from:
   * - Fresh installs (no profiles, no API key)
   * - Pre-profile versions (existing API key but no profiles)
   * - Profile-aware versions (profiles may or may not include OpenRouter)
   */
  async ensureDefaultOpenRouterProfile(existingApiKey: string | null) {
    // Check if default OpenRouter profile already exists
    const existingDefault = this.apiSettings.profiles.find(
      p => p.id === DEFAULT_OPENROUTER_PROFILE_ID
    );

    // Collect all models currently in use for migration
    const modelsInUse = this.collectModelsInUse();

    // Common OpenRouter models to include by default
    const defaultOpenRouterModels = [
      'deepseek/deepseek-v3.2',
      'x-ai/grok-4.1-fast',
      'x-ai/grok-4-fast',
      'z-ai/glm-4.7',
      'minimax/minimax-m2.1',
    ];

    // Combine models in use with defaults, removing duplicates
    const allModels = [...new Set([...modelsInUse, ...defaultOpenRouterModels])];

    if (!existingDefault) {
      // Create the default OpenRouter profile
      const defaultProfile: APIProfile = {
        id: DEFAULT_OPENROUTER_PROFILE_ID,
        name: 'OpenRouter',
        baseUrl: OPENROUTER_API_URL,
        apiKey: existingApiKey || '', // Migrate existing key if present
        customModels: allModels, // Include all models in use plus defaults
        fetchedModels: [], // Will be populated when user fetches from API
        createdAt: Date.now(),
      };

      // Add to profiles array (at the beginning so it's first)
      this.apiSettings.profiles = [defaultProfile, ...this.apiSettings.profiles];

      // If no active profile is set, make this the active one
      if (!this.apiSettings.activeProfileId) {
        this.apiSettings.activeProfileId = DEFAULT_OPENROUTER_PROFILE_ID;
        // Also set the current URL/key to match the profile
        this.apiSettings.openaiApiURL = defaultProfile.baseUrl;
        this.apiSettings.openaiApiKey = defaultProfile.apiKey;
      }

      // Save to database
      await this.saveProfiles();

      console.log('[Settings] Created default OpenRouter profile with', allModels.length, 'models');
    } else {
      let needsSave = false;

      // Profile exists but has no API key, and we found one in the old location
      if (existingApiKey && !existingDefault.apiKey) {
        existingDefault.apiKey = existingApiKey;
        needsSave = true;
        console.log('[Settings] Migrated API key to existing OpenRouter profile');
      }

      // Add any models in use that aren't already in the profile
      const existingModels = new Set([...existingDefault.fetchedModels, ...existingDefault.customModels]);
      const missingModels = modelsInUse.filter(m => !existingModels.has(m));
      if (missingModels.length > 0) {
        existingDefault.customModels = [...new Set([...existingDefault.customModels, ...missingModels])];
        needsSave = true;
        console.log('[Settings] Added', missingModels.length, 'missing models to OpenRouter profile');
      }

      if (needsSave) {
        this.apiSettings.profiles = [...this.apiSettings.profiles];
        await this.saveProfiles();
      }
    }
  }

  /**
   * Migrate null profileIds to the default OpenRouter profile.
   * This handles existing users who have null profileIds from before
   * profiles were required to be explicitly set.
   */
  async migrateNullProfileIds() {
    let needsSave = false;

    // Helper to check if profileId needs migration (null, undefined, or empty string)
    const needsMigration = (profileId: string | null | undefined): boolean => {
      return profileId === null || profileId === undefined || profileId === '';
    };

    // Migrate system services settings
    if (needsMigration(this.systemServicesSettings.classifier.profileId)) {
      this.systemServicesSettings.classifier.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.memory.profileId)) {
      this.systemServicesSettings.memory.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.suggestions.profileId)) {
      this.systemServicesSettings.suggestions.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.actionChoices.profileId)) {
      this.systemServicesSettings.actionChoices.profileId = this.systemServicesSettings.suggestions.profileId
        ?? DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.styleReviewer.profileId)) {
      this.systemServicesSettings.styleReviewer.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.loreManagement.profileId)) {
      this.systemServicesSettings.loreManagement.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.agenticRetrieval.profileId)) {
      this.systemServicesSettings.agenticRetrieval.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.timelineFill.profileId)) {
      this.systemServicesSettings.timelineFill.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }
    if (needsMigration(this.systemServicesSettings.entryRetrieval.profileId)) {
      this.systemServicesSettings.entryRetrieval.profileId = DEFAULT_OPENROUTER_PROFILE_ID;
      needsSave = true;
    }

    if (needsSave) {
      await this.saveSystemServicesSettings();
      console.log('[Settings] Migrated null/undefined profileIds to default OpenRouter profile');
    }

    // Migrate wizard settings
    let wizardNeedsSave = false;
    for (const [key, process] of Object.entries(this.wizardSettings)) {
      if (needsMigration(process.profileId)) {
        (this.wizardSettings as any)[key].profileId = DEFAULT_OPENROUTER_PROFILE_ID;
        wizardNeedsSave = true;
      }
    }

    if (wizardNeedsSave) {
      await this.saveWizardSettings();
      console.log('[Settings] Migrated wizard null/undefined profileIds to default OpenRouter profile');
    }
  }

  /**
   * Get the default profile for the current provider.
   */
  getDefaultProfile(): APIProfile | undefined {
    const defaultProfileId = this.getDefaultProfileIdForProvider();
    return this.getProfile(defaultProfileId)
      ?? this.getProfile(DEFAULT_OPENROUTER_PROFILE_ID)
      ?? this.apiSettings.profiles[0];
  }

  /**
   * Get the profile to use for a given profileId.
   * If profileId is null, returns the active profile or the default profile.
   */
  getProfileForService(profileId: string | null): APIProfile | undefined {
    if (profileId) {
      return this.getProfile(profileId);
    }
    // Fall back to active profile, then default profile
    return this.getActiveProfile() || this.getDefaultProfile();
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

  async setSpellcheckEnabled(enabled: boolean) {
    this.uiSettings.spellcheckEnabled = enabled;
    await database.setSetting('spellcheck_enabled', enabled.toString());
  }

  async setAdvancedManualMode(enabled: boolean) {
    this.advancedRequestSettings.manualMode = enabled;
    await database.setSetting('advanced_manual_mode', enabled.toString());
  }

  //Return true if an API key is needed for main narrative generation.
  get needsApiKey(): boolean {
    const mainProfile = this.getMainNarrativeProfile() ?? this.getDefaultProfile();
    if (mainProfile) {
      return !mainProfile.apiKey || mainProfile.apiKey.length === 0;
    }

    // Fall back to legacy check for pre-profile installations
    return (!this.apiSettings.openaiApiKey && this.apiSettings.openaiApiURL === OPENROUTER_API_URL);
  }

  // Wizard settings methods
  async saveWizardSettings() {
    await database.setSetting('wizard_settings', JSON.stringify(this.wizardSettings));
  }

  async resetWizardProcess(process: keyof AdvancedWizardSettings) {
    const defaults = getDefaultAdvancedSettingsForProvider(this.getEffectiveProvider());
    this.wizardSettings[process] = { ...defaults[process] };
    await this.saveWizardSettings();
  }

  async resetAllWizardSettings() {
    this.wizardSettings = getDefaultAdvancedSettingsForProvider(this.getEffectiveProvider());
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
    this.systemServicesSettings.classifier = getDefaultClassifierSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetLorebookClassifierSettings() {
    this.systemServicesSettings.lorebookClassifier = getDefaultLorebookClassifierSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetMemorySettings() {
    this.systemServicesSettings.memory = getDefaultMemorySettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetSuggestionsSettings() {
    this.systemServicesSettings.suggestions = getDefaultSuggestionsSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetActionChoicesSettings() {
    this.systemServicesSettings.actionChoices = getDefaultActionChoicesSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetStyleReviewerSettings() {
    this.systemServicesSettings.styleReviewer = getDefaultStyleReviewerSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetLoreManagementSettings() {
    this.systemServicesSettings.loreManagement = getDefaultLoreManagementSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetAgenticRetrievalSettings() {
    this.systemServicesSettings.agenticRetrieval = getDefaultAgenticRetrievalSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetTimelineFillSettings() {
    this.systemServicesSettings.timelineFill = getDefaultTimelineFillSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetEntryRetrievalSettings() {
    this.systemServicesSettings.entryRetrieval = getDefaultEntryRetrievalSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  async resetAllSystemServicesSettings() {
    this.systemServicesSettings = getDefaultSystemServicesSettingsForProvider(this.getEffectiveProvider());
    await this.saveSystemServicesSettings();
  }

  // Update settings methods
  async saveUpdateSettings() {
    await database.setSetting('update_settings', JSON.stringify(this.updateSettings));
  }

  async setAutoCheck(enabled: boolean) {
    this.updateSettings.autoCheck = enabled;
    await this.saveUpdateSettings();
  }

  async setAutoDownload(enabled: boolean) {
    this.updateSettings.autoDownload = enabled;
    await this.saveUpdateSettings();
  }

  async setCheckInterval(hours: number) {
    this.updateSettings.checkInterval = hours;
    await this.saveUpdateSettings();
  }

  async setLastChecked(timestamp: number | null) {
    this.updateSettings.lastChecked = timestamp;
    await this.saveUpdateSettings();
  }

  async resetUpdateSettings() {
    this.updateSettings = getDefaultUpdateSettings();
    await this.saveUpdateSettings();
  }

  /**
   * Reset ALL settings to their default values based on the current provider preset.
   * This preserves the API key and URL but resets everything else.
   */
  async resetAllSettings(preserveApiSettings = true) {
    const provider = this.providerPreset;
    // 'custom' uses OpenRouter defaults
    const effectiveProvider = provider === 'custom' ? 'openrouter' : provider;
    const defaultProfileId = effectiveProvider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
    const defaultApiURL = effectiveProvider === 'nanogpt' ? NANOGPT_API_URL : OPENROUTER_API_URL;

    const apiKey = preserveApiSettings ? this.apiSettings.openaiApiKey : null;
    const apiURL = preserveApiSettings ? this.apiSettings.openaiApiURL : defaultApiURL;
    const profiles = preserveApiSettings ? this.apiSettings.profiles : [];
    const activeProfileId = preserveApiSettings ? this.apiSettings.activeProfileId : null;
    const mainNarrativeProfileId = preserveApiSettings ? this.apiSettings.mainNarrativeProfileId : defaultProfileId;

    // Provider-specific default model (NanoGPT uses zai-org/ prefix)
    const defaultNarrativeModel = effectiveProvider === 'nanogpt' ? 'zai-org/glm-4.7' : 'z-ai/glm-4.7';

    // Reset API settings (except URL/key/profiles if preserving)
    this.apiSettings = {
      openaiApiURL: apiURL,
      openaiApiKey: apiKey,
      profiles: profiles,
      activeProfileId: activeProfileId,
      mainNarrativeProfileId: mainNarrativeProfileId,
      defaultModel: defaultNarrativeModel,
      temperature: 0.8,
      maxTokens: 8192,
      reasoningEffort: 'off',
      providerOnly: [],
      manualBody: '',
      enableThinking: false,
    };

    // Reset UI settings
    this.uiSettings = {
      theme: 'dark',
      fontSize: 'medium',
      showWordCount: true,
      autoSave: true,
      spellcheckEnabled: true,
    };

    this.advancedRequestSettings = getDefaultAdvancedRequestSettings();

    // Reset wizard settings based on provider
    this.wizardSettings = getDefaultAdvancedSettingsForProvider(effectiveProvider);

    // Reset story generation settings
    this.storyGenerationSettings = getDefaultStoryGenerationSettings();

    // Reset system services settings based on provider
    this.systemServicesSettings = getDefaultSystemServicesSettingsForProvider(effectiveProvider);

    // Reset update settings
    this.updateSettings = getDefaultUpdateSettings();

    // Save all to database
    await database.setSetting('default_model', this.apiSettings.defaultModel);
    await database.setSetting('temperature', this.apiSettings.temperature.toString());
    await database.setSetting('max_tokens', this.apiSettings.maxTokens.toString());
    await database.setSetting('enable_thinking', this.apiSettings.enableThinking.toString());
    await database.setSetting('main_reasoning_effort', this.apiSettings.reasoningEffort);
    await database.setSetting('main_provider_only', JSON.stringify(this.apiSettings.providerOnly));
    await database.setSetting('main_manual_body', this.apiSettings.manualBody);
    await database.setSetting('theme', this.uiSettings.theme);
    await database.setSetting('font_size', this.uiSettings.fontSize);
    await database.setSetting('show_word_count', this.uiSettings.showWordCount.toString());
    await database.setSetting('auto_save', this.uiSettings.autoSave.toString());
    await database.setSetting('spellcheck_enabled', this.uiSettings.spellcheckEnabled.toString());
    await database.setSetting('advanced_manual_mode', this.advancedRequestSettings.manualMode.toString());
    await this.saveWizardSettings();
    await this.saveStoryGenerationSettings();
    await this.saveSystemServicesSettings();
    await this.saveUpdateSettings();

    // Apply theme
    this.applyTheme(this.uiSettings.theme);
  }

  // Provider preset methods
  async setProviderPreset(provider: ProviderPreset) {
    this.providerPreset = provider;
    await database.setSetting('provider_preset', provider);
  }

  // First-run methods
  async setFirstRunComplete(complete: boolean) {
    this.firstRunComplete = complete;
    await database.setSetting('first_run_complete', complete.toString());
  }

  /**
   * Initialize settings for a new user with a specific provider.
   * This sets up the default profile and all settings based on the provider.
   */
  async initializeWithProvider(provider: ProviderPreset, apiKey: string) {
    // Set the provider preset
    this.providerPreset = provider;
    await database.setSetting('provider_preset', provider);

    // 'custom' uses OpenRouter defaults but with empty API key
    const effectiveProvider = provider === 'custom' ? 'openrouter' : provider;

    // Create the default profile for the selected provider
    const defaultProfileId = effectiveProvider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
    const defaultApiURL = effectiveProvider === 'nanogpt' ? NANOGPT_API_URL : OPENROUTER_API_URL;
    const profileName = provider === 'custom' ? 'Custom API' : (effectiveProvider === 'nanogpt' ? 'NanoGPT' : 'OpenRouter');

    // Models for each provider (NanoGPT uses zai-org/ prefix, OpenRouter uses z-ai/)
    const defaultModels = effectiveProvider === 'nanogpt'
      ? ['deepseek/deepseek-v3.2', 'zai-org/glm-4.7', 'zai-org/glm-4.7:thinking', 'xiaomi/mimo-v2-flash-thinking', 'minimax/minimax-m2.1']
      : ['deepseek/deepseek-v3.2', 'x-ai/grok-4.1-fast', 'x-ai/grok-4-fast', 'z-ai/glm-4.7', 'minimax/minimax-m2.1'];

    const defaultProfile: APIProfile = {
      id: defaultProfileId,
      name: profileName,
      baseUrl: defaultApiURL,
      apiKey: apiKey, // Will be empty string for 'custom' provider
      customModels: defaultModels,
      fetchedModels: [],
      createdAt: Date.now(),
    };

    // Check if profile already exists (shouldn't for first run, but just in case)
    const existingProfileIndex = this.apiSettings.profiles.findIndex(p => p.id === defaultProfileId);
    if (existingProfileIndex >= 0) {
      this.apiSettings.profiles[existingProfileIndex] = defaultProfile;
    } else {
      this.apiSettings.profiles = [defaultProfile, ...this.apiSettings.profiles];
    }

    // Set this as the active and main narrative profile
    this.apiSettings.activeProfileId = defaultProfileId;
    this.apiSettings.mainNarrativeProfileId = defaultProfileId;
    this.apiSettings.openaiApiURL = defaultApiURL;
    this.apiSettings.openaiApiKey = apiKey;

    // Set provider-specific default model (NanoGPT uses zai-org/ prefix)
    const defaultNarrativeModel = effectiveProvider === 'nanogpt' ? 'zai-org/glm-4.7' : 'z-ai/glm-4.7';
    this.apiSettings.defaultModel = defaultNarrativeModel;
    this.apiSettings.temperature = 0.8;
    this.apiSettings.maxTokens = 8192;
    this.apiSettings.reasoningEffort = 'off';
    this.apiSettings.providerOnly = [];
    this.apiSettings.manualBody = '';
    this.apiSettings.enableThinking = false;
    await database.setSetting('default_model', defaultNarrativeModel);
    await database.setSetting('temperature', this.apiSettings.temperature.toString());
    await database.setSetting('max_tokens', this.apiSettings.maxTokens.toString());
    await database.setSetting('main_reasoning_effort', this.apiSettings.reasoningEffort);
    await database.setSetting('main_provider_only', JSON.stringify(this.apiSettings.providerOnly));
    await database.setSetting('main_manual_body', this.apiSettings.manualBody);
    await database.setSetting('enable_thinking', this.apiSettings.enableThinking.toString());

    // Apply provider-specific defaults to system services (use effectiveProvider for defaults)
    this.systemServicesSettings = getDefaultSystemServicesSettingsForProvider(effectiveProvider);

    // Apply provider-specific defaults to wizard settings
    this.wizardSettings = getDefaultAdvancedSettingsForProvider(effectiveProvider);

    // Save everything
    await this.saveProfiles();
    await database.setSetting('main_narrative_profile_id', defaultProfileId);
    await database.setSetting('openai_api_url', defaultApiURL);
    await database.setSetting('openai_api_key', apiKey);
    await this.saveSystemServicesSettings();
    await this.saveWizardSettings();

    // Mark first run as complete
    this.firstRunComplete = true;
    await database.setSetting('first_run_complete', 'true');

    console.log(`[Settings] Initialized with ${profileName} provider`);
  }

  /**
   * Get the default profile ID for the current provider preset.
   */
  getDefaultProfileIdForProvider(): string {
    // 'custom' uses OpenRouter profile
    const effectiveProvider = this.providerPreset === 'custom' ? 'openrouter' : this.providerPreset;
    return effectiveProvider === 'nanogpt' ? DEFAULT_NANOGPT_PROFILE_ID : DEFAULT_OPENROUTER_PROFILE_ID;
  }

  /**
   * Get the effective provider for defaults (custom uses openrouter defaults).
   */
  getEffectiveProvider(): 'openrouter' | 'nanogpt' {
    return this.providerPreset === 'custom' ? 'openrouter' : this.providerPreset;
  }
}

export const settings = new SettingsStore();
