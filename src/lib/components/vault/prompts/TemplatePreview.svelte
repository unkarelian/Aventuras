<script lang="ts">
  import { templateEngine } from '$lib/services/templates/engine'
  import { variableRegistry } from '$lib/services/templates/variables'
  import type { CustomVariable } from '$lib/services/packs/types'
  import type { TemplateContext } from '$lib/services/templates/types'
  import { AlertTriangle } from 'lucide-svelte'

  interface Props {
    content: string
    customVariables: CustomVariable[]
    hideHeader?: boolean
    testValues?: Record<string, string>
  }

  let { content, customVariables, hideHeader = false, testValues }: Props = $props()

  // Sample values for system variables
  const systemSamples: Record<string, string> = {
    protagonistName: 'Aria',
    currentLocation: 'The Whispering Woods',
    storyTime: 'Year 1, Day 15, 14:30',
    genre: 'Fantasy',
    tone: 'Mysterious',
    settingDescription: 'A vast magical realm where ancient forests conceal forgotten ruins.',
    themes: 'courage, discovery, friendship',
    mode: 'adventure',
    pov: 'second',
    tense: 'present',
  }

  // Descriptive placeholder values for runtime variables
  const runtimeSamples: Record<string, string> = {
    // Narrative Service
    recentContent: '[Recent story content would appear here...]',
    tieredContextBlock: '[Lorebook entries injected by tiered retrieval...]',
    chapterSummaries: '[Formatted chapter summaries from memory system...]',
    styleGuidance: '[Style guidance from repetition analysis...]',
    retrievedChapterContext: '[Retrieved chapter context from memory...]',
    inlineImageInstructions: '[Instructions for inline image generation...]',
    visualProseInstructions: '[Instructions for visual prose mode...]',
    visualProseMode: 'false',
    inlineImageMode: 'false',

    // Classifier Service
    entityCounts: 'Characters: 3, Locations: 5, Items: 4',
    currentTimeInfo: 'Year 1, Day 15, 14:30',
    chatHistoryBlock: '[Formatted chat history...]',
    inputLabel: 'Player Action',
    userAction: 'I want to explore the ancient ruins to the north.',
    narrativeResponse: '[The narrative response text...]',
    existingCharacters: 'Aria (protagonist), Theron (companion), Lyra (antagonist)',
    existingLocations: 'The Whispering Woods, Crystal Caverns, Thornhold Castle',
    existingItems: 'Enchanted Compass, Shadow Cloak, Moonstone Pendant',
    existingBeats: 'Discovered the hidden map, Met the wandering sage',
    storyBeatTypes: 'discovery, encounter, revelation, conflict, resolution',
    itemLocationOptions: 'inventory, equipped, location, npc',
    defaultItemLocation: 'location',

    // Memory Service
    chapterContent: '[Chapter entries to summarize...]',
    previousContext: '[Previous chapter summaries for context...]',
    messagesInRange: '[Messages in range for chapter analysis...]',
    firstValidId: '1',
    lastValidId: '25',
    recentContext: '[Recent narrative context for retrieval...]',
    maxChaptersPerRetrieval: '3',

    // Suggestions Service
    activeThreads: 'Finding the lost artifact, Resolving the conflict with Lyra',

    // Action Choices Service
    npcsPresent: 'Theron the Ranger, Old Sage Maren',
    inventory: 'Enchanted Compass, Shadow Cloak, Healing Potion x2',
    activeQuests: 'Find the Moonstone Pendant, Explore the Crystal Caverns',
    lorebookContext: '[Relevant lorebook entries injected by context system...]',
    protagonistDescription: 'A young woman with silver hair and violet eyes',
    povInstruction: 'Write in second person perspective.',
    lengthInstruction: 'Write 2-3 paragraphs.',

    // Shared / Common
    userInput: 'I want to explore the ancient ruins to the north.',

    // Style Reviewer
    passageCount: '5',
    passages: '[Formatted passages for style review...]',

    // Lore Management
    entrySummary: '[Summary of lorebook entries...]',
    recentStorySection: '[Recent story content for lore analysis...]',
    chapterSummary: '[Chapter summary for lore context...]',

    // Agentic Retrieval
    chaptersCount: '8',
    chapterList: '[Formatted chapter list for retrieval...]',
    entriesCount: '15',
    entryList: '[Formatted lorebook entry list...]',

    // Entry Retrieval (Tier 3)
    entrySummaries: '[Formatted entry summaries for LLM selection...]',

    // Timeline Fill
    chapterHistory: '[Chapter history for timeline fill...]',
    timeline: '[Timeline data for gap filling...]',
    query: 'What happened between the forest encounter and arriving at the castle?',

    // Translation
    targetLanguage: 'Spanish',
    sourceLanguage: 'English',
    content: '[Content to translate or process...]',
    elementsJson: '[JSON of UI elements for translation...]',
    suggestionsJson: '[JSON of suggestions for translation...]',
    choicesJson: '[JSON of action choices for translation...]',

    // Image Services
    imageStylePrompt: '[Style prompt for image generation...]',
    characterDescriptors: 'Silver hair, violet eyes, leather armor, elven features',
    charactersWithPortraits: 'Aria, Theron',
    charactersWithoutPortraits: 'Lyra, Old Sage Maren',
    maxImages: '3',
    chatHistory: '[Chat history for image context...]',
    translatedNarrativeBlock: '[Translated narrative for image analysis...]',
    previousResponse: '[Previous narrative response...]',
    currentResponse: '[Current narrative response...]',
    visualDescriptors: '[Visual descriptors for portrait generation...]',

    // Wizard Service
    genreLabel: 'Fantasy',
    seed: 'A world where magic flows through ancient ley lines...',
    customInstruction: 'Make it feel epic and mysterious.',
    currentSetting: '[Current setting data for refinement...]',
    toneInstruction: 'Maintain a mysterious and wonder-filled tone.',
    settingInstruction: 'Set in a high fantasy world with elemental magic.',
    characterName: 'Aria',
    characterDescription: 'A young woman with silver hair and violet eyes',
    characterBackground: 'Raised in the hidden village of Thornhollow...',
    settingContext: 'A high fantasy world with elemental magic and feudal kingdoms.',
    currentCharacter: '[Current character data for refinement...]',
    settingName: 'The Shattered Realms',
    count: '3',
    outputFormat: 'JSON',
    title: 'Echoes of the Forgotten',
    atmosphereSection: 'A sense of ancient mystery pervades the land...',
    supportingCharactersSection: 'Theron: A loyal ranger. Lyra: A rival mage.',
    tenseInstruction: 'Write in present tense.',
    povPerspective: 'second person',
    povPerspectiveInstructions: 'Address the reader as "you".',
    currentOpening: '[Current opening text for refinement...]',
    openingInstruction: 'Begin with the protagonist arriving at the forest edge.',
    guidanceSection: '[Guidance section for opening refinement...]',
    cardContent: '[Character card content for import...]',
    lorebookName: 'The Shattered Realms Lore',
    entriesJson: '[Lorebook entries JSON for vault import...]',
    entryCount: '12',

    // Interactive Lorebook
    userMessage: 'Tell me about the Crystal Caverns.',
    conversationHistory: '[Conversation history for interactive lorebook...]',
  }

  function buildSampleContext(vars: CustomVariable[], overrides?: Record<string, string>): TemplateContext {
    const context: TemplateContext = {}

    for (const v of variableRegistry.getByCategory('system')) {
      context[v.name] = systemSamples[v.name] ?? `[${v.name}]`
    }
    for (const v of variableRegistry.getByCategory('runtime')) {
      context[v.name] = runtimeSamples[v.name] ?? `[${v.name}]`
    }
    for (const v of vars) {
      context[v.variableName] = v.defaultValue ?? `[${v.displayName}]`
    }

    // Apply test value overrides for ANY variable (system, runtime, or custom)
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (value !== '') {
          context[key] = value
        }
      }
    }

    return context
  }

  // Debounced rendering
  let previewOutput = $state('')
  let previewError = $state('')
  let renderTimer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    // Track dependencies
    const currentContent = content
    const currentVars = customVariables
    const currentTestValues = testValues

    clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      if (!currentContent.trim()) {
        previewOutput = ''
        previewError = ''
        return
      }

      const context = buildSampleContext(currentVars, currentTestValues)
      const result = templateEngine.render(currentContent, context)

      if (result === '' && currentContent.trim() !== '') {
        // Empty result from non-empty template likely means render error
        // The engine logs errors internally; show a user-friendly message
        previewError = 'Template could not be rendered. Check for syntax errors.'
        previewOutput = ''
      } else {
        previewOutput = result
        previewError = ''
      }
    }, 300)

    return () => clearTimeout(renderTimer)
  })
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#if !hideHeader}
    <div class="border-b px-4 py-2">
      <h4 class="text-muted-foreground text-xs font-medium tracking-wide uppercase">Preview</h4>
    </div>
  {/if}

  <div class="flex-1 overflow-auto bg-[hsl(var(--muted)/0.3)] p-4">
    {#if previewError}
      <div class="flex items-start gap-2 text-sm text-yellow-500">
        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{previewError}</span>
      </div>
    {:else if previewOutput}
      <pre
        class="font-mono text-sm leading-relaxed break-words whitespace-pre-wrap text-[hsl(var(--foreground)/0.9)]">{previewOutput}</pre>
    {:else}
      <p class="text-muted-foreground text-sm italic">
        Start typing in the editor to see a preview...
      </p>
    {/if}
  </div>
</div>
