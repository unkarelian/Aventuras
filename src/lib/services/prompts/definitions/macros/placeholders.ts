/**
 * Context Placeholders - Runtime-Filled Tokens
 *
 * IMPORTANT: These are NOT macros and cannot be edited by users.
 * They are tokens that get replaced with actual data at prompt expansion time.
 *
 * Examples: {{recentContent}}, {{chapterContent}}, {{userInput}}
 *
 * While macros have user-editable default values or variants,
 * placeholders are filled programmatically with runtime data.
 */

import type { ContextPlaceholder } from '../../types'

/**
 * All context placeholders that can appear in prompt templates.
 * Grouped by category for organization.
 */
export const CONTEXT_PLACEHOLDERS: ContextPlaceholder[] = [
  // ============================================================================
  // Story context
  // ============================================================================
  {
    id: 'genre',
    name: 'Genre',
    token: 'genre',
    category: 'story',
    description: "The story's genre (e.g., Fantasy, Sci-Fi, Mystery)",
  },
  {
    id: 'mode',
    name: 'Mode',
    token: 'mode',
    category: 'story',
    description: 'Story mode: "adventure" or "creative-writing"',
  },
  {
    id: 'recent-content',
    name: 'Recent Content',
    token: 'recentContent',
    category: 'story',
    description: 'The most recent story content/messages',
  },
  {
    id: 'user-input',
    name: 'User Input',
    token: 'userInput',
    category: 'story',
    description: "The user's current input/action",
  },
  {
    id: 'user-action',
    name: 'User Action',
    token: 'userAction',
    category: 'story',
    description: "The player's action or author's direction",
  },
  {
    id: 'narrative-response',
    name: 'Narrative Response',
    token: 'narrativeResponse',
    category: 'story',
    description: "The AI's narrative response being analyzed",
  },
  {
    id: 'recent-context',
    name: 'Recent Context',
    token: 'recentContext',
    category: 'story',
    description: 'Recent scene context from the last few messages',
  },
  {
    id: 'input-label',
    name: 'Input Label',
    token: 'inputLabel',
    category: 'story',
    description: '"Player Action" in adventure mode, "Author Direction" in creative writing',
  },
  {
    id: 'active-threads',
    name: 'Active Threads',
    token: 'activeThreads',
    category: 'story',
    description: 'Currently active story threads and plot points',
  },
  {
    id: 'lorebook-context',
    name: 'Lorebook Context',
    token: 'lorebookContext',
    category: 'story',
    description: 'Relevant lorebook entries for the current context',
  },
  {
    id: 'chat-history',
    name: 'Chat History',
    token: 'chatHistory',
    category: 'story',
    description: 'Full untruncated chat history for comprehensive context',
  },

  // ============================================================================
  // Entity tracking
  // ============================================================================
  {
    id: 'entity-counts',
    name: 'Entity Counts',
    token: 'entityCounts',
    category: 'entities',
    description: 'Count of tracked characters, locations, items, etc.',
  },
  {
    id: 'existing-characters',
    name: 'Existing Characters',
    token: 'existingCharacters',
    category: 'entities',
    description: 'List of already-tracked character names',
  },
  {
    id: 'existing-locations',
    name: 'Existing Locations',
    token: 'existingLocations',
    category: 'entities',
    description: 'List of already-tracked location names',
  },
  {
    id: 'existing-items',
    name: 'Existing Items',
    token: 'existingItems',
    category: 'entities',
    description: 'List of already-tracked item names',
  },
  {
    id: 'existing-beats',
    name: 'Existing Beats',
    token: 'existingBeats',
    category: 'entities',
    description: 'List of active story beats/quests',
  },
  {
    id: 'item-location-options',
    name: 'Item Location Options',
    token: 'itemLocationOptions',
    category: 'entities',
    description: 'Valid values for item location field',
  },
  {
    id: 'default-item-location',
    name: 'Default Item Location',
    token: 'defaultItemLocation',
    category: 'entities',
    description: 'Default location for new items',
  },
  {
    id: 'story-beat-types',
    name: 'Story Beat Types',
    token: 'storyBeatTypes',
    category: 'entities',
    description: 'Valid story beat type values',
  },
  {
    id: 'scene-location-desc',
    name: 'Scene Location Desc',
    token: 'sceneLocationDesc',
    category: 'entities',
    description: 'Description of scene location field',
  },
  {
    id: 'current-time-info',
    name: 'Current Time Info',
    token: 'currentTimeInfo',
    category: 'entities',
    description: 'Current in-story time information',
  },
  {
    id: 'chat-history-block',
    name: 'Chat History Block',
    token: 'chatHistoryBlock',
    category: 'entities',
    description: 'Recent chat history for context',
  },

  // ============================================================================
  // Memory system
  // ============================================================================
  {
    id: 'chapter-content',
    name: 'Chapter Content',
    token: 'chapterContent',
    category: 'memory',
    description: 'Full content of the chapter being processed',
  },
  {
    id: 'chapter-summaries',
    name: 'Chapter Summaries',
    token: 'chapterSummaries',
    category: 'memory',
    description: 'Summaries of available chapters',
  },
  {
    id: 'chapter-history',
    name: 'Chapter History',
    token: 'chapterHistory',
    category: 'memory',
    description: 'Historical chapter data',
  },
  {
    id: 'chapter-list',
    name: 'Chapter List',
    token: 'chapterList',
    category: 'memory',
    description: 'List of available chapters',
  },
  {
    id: 'chapters-count',
    name: 'Chapters Count',
    token: 'chaptersCount',
    category: 'memory',
    description: 'Number of available chapters',
  },
  {
    id: 'chapter-summary',
    name: 'Chapter Summary',
    token: 'chapterSummary',
    category: 'memory',
    description: 'Summary of chapters for lore management',
  },
  {
    id: 'previous-context',
    name: 'Previous Context',
    token: 'previousContext',
    category: 'memory',
    description: 'Context from previous chapters',
  },
  {
    id: 'first-valid-id',
    name: 'First Valid ID',
    token: 'firstValidId',
    category: 'memory',
    description: 'First message ID in the range to analyze',
  },
  {
    id: 'last-valid-id',
    name: 'Last Valid ID',
    token: 'lastValidId',
    category: 'memory',
    description: 'Last message ID in the range to analyze',
  },
  {
    id: 'messages-in-range',
    name: 'Messages In Range',
    token: 'messagesInRange',
    category: 'memory',
    description: 'Messages within the analysis range',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    token: 'timeline',
    category: 'memory',
    description: 'Existing timeline data',
  },
  {
    id: 'query',
    name: 'Query',
    token: 'query',
    category: 'memory',
    description: 'The question being asked about chapters',
  },
  {
    id: 'max-chapters-per-retrieval',
    name: 'Max Chapters',
    token: 'maxChaptersPerRetrieval',
    category: 'memory',
    description: 'Maximum chapters that can be queried at once',
  },
  {
    id: 'entry-summary',
    name: 'Entry Summary',
    token: 'entrySummary',
    category: 'memory',
    description: 'Summary of lorebook entries',
  },
  {
    id: 'entry-list',
    name: 'Entry List',
    token: 'entryList',
    category: 'memory',
    description: 'List of lorebook entries',
  },
  {
    id: 'entries-count',
    name: 'Entries Count',
    token: 'entriesCount',
    category: 'memory',
    description: 'Number of lorebook entries',
  },
  {
    id: 'recent-story-section',
    name: 'Recent Story Section',
    token: 'recentStorySection',
    category: 'memory',
    description: 'Recent story section for lore management',
  },

  // ============================================================================
  // Wizard placeholders
  // ============================================================================
  {
    id: 'card-content',
    name: 'Card Content',
    token: 'cardContent',
    category: 'wizard',
    description: 'Raw content from the SillyTavern character card',
  },
  {
    id: 'genre-label',
    name: 'Genre Label',
    token: 'genreLabel',
    category: 'wizard',
    description: 'Human-readable genre name (e.g., "Fantasy", "Science Fiction")',
  },
  {
    id: 'seed',
    name: 'Seed Idea',
    token: 'seed',
    category: 'wizard',
    description: "The user's seed idea for world generation",
  },
  {
    id: 'setting-name',
    name: 'Setting Name',
    token: 'settingName',
    category: 'wizard',
    description: 'Name of the generated setting/world',
  },
  {
    id: 'setting-description',
    name: 'Setting Description',
    token: 'settingDescription',
    category: 'wizard',
    description: 'Description of the setting/world',
  },
  {
    id: 'current-setting',
    name: 'Current Setting',
    token: 'currentSetting',
    category: 'wizard',
    description: 'Full current setting snapshot (name, description, locations, themes, conflicts)',
  },
  {
    id: 'pov-instruction',
    name: 'POV Instruction',
    token: 'povInstruction',
    category: 'wizard',
    description: 'Instructions about point of view for generation',
  },
  {
    id: 'pov-perspective',
    name: 'POV Perspective',
    token: 'povPerspective',
    category: 'wizard',
    description:
      'How to refer to the protagonist based on POV (e.g., "through {{protagonistName}}\'s perspective" or "from the protagonist\'s first-person view")',
  },
  {
    id: 'pov-perspective-instructions',
    name: 'POV Perspective Instructions',
    token: 'povPerspectiveInstructions',
    category: 'wizard',
    description:
      'Instructions on pronoun usage based on POV (e.g., "Use \\"I/me/my\\" for first person" or "NEVER use second person")',
  },
  {
    id: 'setting-context',
    name: 'Setting Context',
    token: 'settingContext',
    category: 'wizard',
    description: 'Setting context block for character elaboration',
  },
  {
    id: 'tone-instruction',
    name: 'Tone Instruction',
    token: 'toneInstruction',
    category: 'wizard',
    description: 'Additional tone guidance for character elaboration',
  },
  {
    id: 'setting-instruction',
    name: 'Setting Instruction',
    token: 'settingInstruction',
    category: 'wizard',
    description: 'Additional setting guidance for character elaboration',
  },
  {
    id: 'custom-instruction',
    name: 'Custom Instruction',
    token: 'customInstruction',
    category: 'wizard',
    description:
      'User-provided guidance for elaboration (e.g., "Make them more cynical", "Focus on dark gothic atmosphere")',
  },
  {
    id: 'tone',
    name: 'Tone',
    token: 'tone',
    category: 'wizard',
    description: 'Writing style tone for the opening scene',
  },
  {
    id: 'tense-instruction',
    name: 'Tense Instruction',
    token: 'tenseInstruction',
    category: 'wizard',
    description: 'Tense guidance for the opening scene',
  },
  {
    id: 'output-format',
    name: 'Output Format',
    token: 'outputFormat',
    category: 'wizard',
    description: 'Output format instructions (JSON vs prose)',
  },
  {
    id: 'guidance-section',
    name: 'Opening Guidance',
    token: 'guidanceSection',
    category: 'wizard',
    description: 'Author-provided guidance for the opening scene',
  },
  {
    id: 'opening-instruction',
    name: 'Opening Instruction',
    token: 'openingInstruction',
    category: 'wizard',
    description: 'Additional opening constraints/instructions',
  },
  {
    id: 'current-opening',
    name: 'Current Opening',
    token: 'currentOpening',
    category: 'wizard',
    description: 'Full current opening snapshot (title, scene, initial location)',
  },
  {
    id: 'current-character',
    name: 'Current Character',
    token: 'currentCharacter',
    category: 'wizard',
    description:
      'Full current character snapshot (name, description, background, traits, appearance)',
  },
  {
    id: 'character-name',
    name: 'Character Name',
    token: 'characterName',
    category: 'wizard',
    description: 'Name of the character being elaborated',
  },
  {
    id: 'character-description',
    name: 'Character Description',
    token: 'characterDescription',
    category: 'wizard',
    description: 'Description of the character',
  },
  {
    id: 'character-background',
    name: 'Character Background',
    token: 'characterBackground',
    category: 'wizard',
    description: 'Background story of the character',
  },
  {
    id: 'protagonist-description',
    name: 'Protagonist Description',
    token: 'protagonistDescription',
    category: 'wizard',
    description: 'Description of the protagonist',
  },
  {
    id: 'count',
    name: 'Count',
    token: 'count',
    category: 'wizard',
    description: 'Number of items to generate (e.g., supporting characters)',
  },
  {
    id: 'title',
    name: 'Title',
    token: 'title',
    category: 'wizard',
    description: 'Story or scene title',
  },
  {
    id: 'atmosphere-section',
    name: 'Atmosphere Section',
    token: 'atmosphereSection',
    category: 'wizard',
    description: 'Atmosphere and mood description',
  },
  {
    id: 'supporting-characters-section',
    name: 'Supporting Characters',
    token: 'supportingCharactersSection',
    category: 'wizard',
    description: 'Information about supporting characters',
  },
  {
    id: 'setting-themes',
    name: 'Setting Themes',
    token: 'settingThemes',
    category: 'wizard',
    description: 'Formatted list of story themes from the wizard setting',
  },

  // ============================================================================
  // Service placeholders
  // ============================================================================
  {
    id: 'lorebook-name',
    name: 'Lorebook Name',
    token: 'lorebookName',
    category: 'service',
    description: 'Name of the lorebook being edited',
  },
  {
    id: 'entry-count',
    name: 'Entry Count',
    token: 'entryCount',
    category: 'service',
    description: 'Number of entries in the lorebook',
  },
  {
    id: 'entry-summaries',
    name: 'Entry Summaries',
    token: 'entrySummaries',
    category: 'service',
    description: 'Numbered list of available lorebook entries for Tier 3 selection',
  },
  {
    id: 'entries-json',
    name: 'Entries JSON',
    token: 'entriesJson',
    category: 'service',
    description: 'JSON array of lorebook entries to classify (with index, name, content, keywords)',
  },
  {
    id: 'style-guidance',
    name: 'Style Guidance',
    token: 'styleGuidance',
    category: 'service',
    description: "Instructions for matching the user's writing style based on their recent actions",
  },
  {
    id: 'npcs-present',
    name: 'NPCs Present',
    token: 'npcsPresent',
    category: 'service',
    description: 'List of NPC names currently present in the scene',
  },
  {
    id: 'inventory',
    name: 'Inventory',
    token: 'inventory',
    category: 'service',
    description: "List of items in the protagonist's inventory",
  },
  {
    id: 'active-quests',
    name: 'Active Quests',
    token: 'activeQuests',
    category: 'service',
    description: 'List of currently active quests/story beats',
  },
  {
    id: 'length-instruction',
    name: 'Length Instruction',
    token: 'lengthInstruction',
    category: 'service',
    description: "Instructions for action choice length based on user's writing patterns",
  },
  {
    id: 'content',
    name: 'Content',
    token: 'content',
    category: 'service',
    description: 'Text content to translate',
  },
  {
    id: 'elements-json',
    name: 'Elements JSON',
    token: 'elementsJson',
    category: 'service',
    description: 'JSON array of UI elements to translate (with id, text, type)',
  },
  {
    id: 'suggestions-json',
    name: 'Suggestions JSON',
    token: 'suggestionsJson',
    category: 'service',
    description: 'JSON array of plot suggestions to translate',
  },
  {
    id: 'choices-json',
    name: 'Choices JSON',
    token: 'choicesJson',
    category: 'service',
    description: 'JSON array of action choices to translate',
  },

  // ============================================================================
  // Other placeholders
  // ============================================================================
  {
    id: 'passage-count',
    name: 'Passage Count',
    token: 'passageCount',
    category: 'other',
    description: 'Number of passages being analyzed',
  },
  {
    id: 'passages',
    name: 'Passages',
    token: 'passages',
    category: 'other',
    description: 'The narrative passages to analyze for style issues',
  },
  {
    id: 'max-images',
    name: 'Max Images',
    token: 'maxImages',
    category: 'other',
    description: 'Maximum number of images to generate (0 = unlimited)',
  },
  {
    id: 'image-style-prompt',
    name: 'Image Style Prompt',
    token: 'imageStylePrompt',
    category: 'other',
    description: 'Style guidelines for image generation (anime, photorealistic, etc.)',
  },
  {
    id: 'character-descriptors',
    name: 'Character Descriptors',
    token: 'characterDescriptors',
    category: 'other',
    description: 'Visual appearance descriptors for characters in the scene',
  },
  {
    id: 'characters-with-portraits',
    name: 'Characters With Portraits',
    token: 'charactersWithPortraits',
    category: 'other',
    description: 'List of character names that have portrait images available for reference',
  },
  {
    id: 'characters-without-portraits',
    name: 'Characters Without Portraits',
    token: 'charactersWithoutPortraits',
    category: 'other',
    description:
      'List of character names that need portrait generation before they can appear in scene images',
  },
  {
    id: 'visual-descriptors',
    name: 'Visual Descriptors',
    token: 'visualDescriptors',
    category: 'other',
    description:
      'Comma-separated visual appearance details for a single character (hair, eyes, clothing, etc.)',
  },
  {
    id: 'translated-narrative-block',
    name: 'Translated Narrative Block',
    token: 'translatedNarrativeBlock',
    category: 'other',
    description:
      'Optional translated narrative block for image analysis (includes language label and translated text)',
  },
  // SillyTavern character card placeholder conventions
  // These appear in prompt instructions telling the AI how to handle these tokens
  {
    id: 'char-placeholder',
    name: 'Char Placeholder',
    token: 'char',
    category: 'wizard',
    description:
      'SillyTavern placeholder for the AI character - used in character card import instructions',
  },
  {
    id: 'user-placeholder',
    name: 'User Placeholder',
    token: 'user',
    category: 'wizard',
    description:
      'SillyTavern placeholder for the human user - used in character card import instructions',
  },
]

/**
 * Get a context placeholder by its token
 */
export function getPlaceholderByToken(token: string): ContextPlaceholder | undefined {
  return CONTEXT_PLACEHOLDERS.find((p) => p.token === token)
}
