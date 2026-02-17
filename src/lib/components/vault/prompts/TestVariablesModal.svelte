<script lang="ts">
  import type { CustomVariable } from '$lib/services/packs/types'
  import type { VariableDefinition } from '$lib/services/templates/types'
  import { variableRegistry } from '$lib/services/templates/variables'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import * as Select from '$lib/components/ui/select'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Switch } from '$lib/components/ui/switch'
  import { Badge } from '$lib/components/ui/badge'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { RotateCcw, Search, ChevronRight } from 'lucide-svelte'
  import { cn } from '$lib/utils/cn'

  interface Props {
    open: boolean
    customVariables: CustomVariable[]
    testValues: Record<string, string>
    onOpenChange: (open: boolean) => void
    onTestValuesChange: (values: Record<string, string>) => void
  }

  let { open, customVariables, testValues, onOpenChange, onTestValuesChange }: Props = $props()

  let draft = $state<Record<string, string>>({})
  let searchQuery = $state('')

  // Build the categorized variable lists
  const systemVars = variableRegistry.getByCategory('system')
  const runtimeVars = variableRegistry.getByCategory('runtime')

  // Group runtime variables by service (derived from the comment structure in variables.ts)
  interface RuntimeGroup {
    name: string
    variables: VariableDefinition[]
  }

  const runtimeGroups: RuntimeGroup[] = $derived.by(() => {
    const groups: { name: string; varNames: string[] }[] = [
      {
        name: 'Narrative',
        varNames: [
          'recentContent',
          'tieredContextBlock',
          'chapterSummaries',
          'styleGuidance',
          'retrievedChapterContext',
          'inlineImageInstructions',
          'visualProseInstructions',
          'visualProseMode',
          'inlineImageMode',
        ],
      },
      {
        name: 'Classifier',
        varNames: [
          'entityCounts',
          'currentTimeInfo',
          'chatHistoryBlock',
          'inputLabel',
          'userAction',
          'narrativeResponse',
          'existingCharacters',
          'existingLocations',
          'existingItems',
          'existingBeats',
          'storyBeatTypes',
          'itemLocationOptions',
          'defaultItemLocation',
        ],
      },
      {
        name: 'Memory',
        varNames: [
          'chapterContent',
          'previousContext',
          'messagesInRange',
          'firstValidId',
          'lastValidId',
          'recentContext',
          'maxChaptersPerRetrieval',
        ],
      },
      {
        name: 'Suggestions & Actions',
        varNames: [
          'activeThreads',
          'npcsPresent',
          'inventory',
          'activeQuests',
          'lorebookContext',
          'protagonistDescription',
          'povInstruction',
          'lengthInstruction',
          'userInput',
        ],
      },
      {
        name: 'Style & Lore',
        varNames: [
          'passageCount',
          'passages',
          'entrySummary',
          'recentStorySection',
          'chapterSummary',
        ],
      },
      {
        name: 'Retrieval',
        varNames: ['chaptersCount', 'chapterList', 'entriesCount', 'entryList', 'entrySummaries'],
      },
      {
        name: 'Translation',
        varNames: [
          'targetLanguage',
          'sourceLanguage',
          'content',
          'elementsJson',
          'suggestionsJson',
          'choicesJson',
        ],
      },
      {
        name: 'Image',
        varNames: [
          'imageStylePrompt',
          'characterDescriptors',
          'charactersWithPortraits',
          'charactersWithoutPortraits',
          'maxImages',
          'chatHistory',
          'translatedNarrativeBlock',
          'previousResponse',
          'currentResponse',
          'visualDescriptors',
        ],
      },
      {
        name: 'Wizard',
        varNames: [
          'genreLabel',
          'seed',
          'customInstruction',
          'currentSetting',
          'toneInstruction',
          'settingInstruction',
          'characterName',
          'characterDescription',
          'characterBackground',
          'settingContext',
          'currentCharacter',
          'settingName',
          'count',
          'outputFormat',
          'title',
          'atmosphereSection',
          'supportingCharactersSection',
          'tenseInstruction',
          'povPerspective',
          'povPerspectiveInstructions',
          'currentOpening',
          'openingInstruction',
          'guidanceSection',
          'cardContent',
          'lorebookName',
          'entriesJson',
          'entryCount',
          'userMessage',
          'conversationHistory',
        ],
      },
      {
        name: 'Timeline',
        varNames: ['chapterHistory', 'timeline', 'query'],
      },
    ]

    const runtimeNameSet = new Set(runtimeVars.map((v) => v.name))
    return groups
      .map((g) => ({
        name: g.name,
        variables: g.varNames
          .map((name) => runtimeVars.find((v) => v.name === name))
          .filter((v): v is VariableDefinition => v != null),
      }))
      .filter((g) => g.variables.length > 0)
  })

  // Sync draft from testValues when modal opens
  $effect(() => {
    if (open) {
      draft = { ...testValues }
    }
  })

  function updateDraft(variableName: string, value: string) {
    draft = { ...draft, [variableName]: value }
  }

  function handleResetDefaults() {
    draft = {}
  }

  function handleApply() {
    // Only send non-empty overrides
    const cleaned = Object.fromEntries(Object.entries(draft).filter(([_, v]) => v !== ''))
    onTestValuesChange(cleaned)
    onOpenChange(false)
  }

  function matchesSearch(name: string, description: string): boolean {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return name.toLowerCase().includes(q) || description.toLowerCase().includes(q)
  }

  // Filtered lists (reactive to search)
  let filteredSystem = $derived(systemVars.filter((v) => matchesSearch(v.name, v.description)))
  let filteredCustom = $derived(
    customVariables.filter((v) =>
      matchesSearch(v.variableName, v.displayName + ' ' + (v.description ?? '')),
    ),
  )
  let filteredRuntimeGroups = $derived(
    runtimeGroups
      .map((g) => ({
        ...g,
        variables: g.variables.filter((v) => matchesSearch(v.name, v.description)),
      }))
      .filter((g) => g.variables.length > 0),
  )

  // Count of overrides set
  let overrideCount = $derived(Object.values(draft).filter((v) => v !== '').length)
</script>

{#snippet variableField(name: string, description: string, placeholder: string, type?: string, enumValues?: string[])}
  <div class="space-y-1">
    <div class="flex items-center gap-2">
      <Label for="test-{name}" class="text-xs font-medium">{description}</Label>
      <Badge variant="outline" class="font-mono text-[10px] leading-none">{name}</Badge>
    </div>
    {#if type === 'enum' && enumValues}
      <Select.Root
        type="single"
        value={draft[name] ?? ''}
        onValueChange={(v) => updateDraft(name, v)}
      >
        <Select.Trigger class="h-8 w-full text-xs">
          {draft[name] || placeholder || 'Select...'}
        </Select.Trigger>
        <Select.Content>
          {#each enumValues as opt (opt)}
            <Select.Item value={opt} label={opt}>{opt}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
    {:else if type === 'boolean'}
      <Switch
        id="test-{name}"
        checked={(draft[name] ?? '') === 'true'}
        onCheckedChange={(v) => updateDraft(name, v ? 'true' : 'false')}
      />
    {:else if placeholder && placeholder.length > 80}
      <Textarea
        id="test-{name}"
        value={draft[name] ?? ''}
        oninput={(e) => updateDraft(name, e.currentTarget.value)}
        rows={2}
        placeholder={placeholder}
        class="text-xs"
      />
    {:else}
      <Input
        id="test-{name}"
        value={draft[name] ?? ''}
        oninput={(e) => updateDraft(name, e.currentTarget.value)}
        placeholder={placeholder}
        class="h-8 text-xs"
      />
    {/if}
  </div>
{/snippet}

{#snippet sectionHeader(title: string, count: number, badgeVariant?: 'default' | 'secondary' | 'outline')}
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium">{title}</span>
    <Badge variant={badgeVariant ?? 'secondary'} class="text-[10px]">{count}</Badge>
    <ChevronRight
      class="text-muted-foreground ml-auto h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-90"
    />
  </div>
{/snippet}

<ResponsiveModal.Root {open} {onOpenChange}>
  <ResponsiveModal.Content class="flex max-h-[90vh] flex-col p-0 sm:max-w-2xl">
    <ResponsiveModal.Header class="shrink-0 border-b px-6 py-4">
      <ResponsiveModal.Title class="flex items-center gap-2">
        Test Variables
        {#if overrideCount > 0}
          <Badge variant="default" class="text-[10px]">{overrideCount} override{overrideCount === 1 ? '' : 's'}</Badge>
        {/if}
      </ResponsiveModal.Title>
      <ResponsiveModal.Description>
        Override variable values to test how your templates render. Empty fields use default sample
        values.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <!-- Search -->
    <div class="shrink-0 border-b px-6 py-3">
      <div class="relative">
        <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search variables..."
          class="h-8 pl-9 text-xs"
          value={searchQuery}
          oninput={(e) => (searchQuery = e.currentTarget.value)}
        />
      </div>
    </div>

    <!-- Scrollable content -->
    <ScrollArea class="min-h-0 flex-1 px-6 py-4">
      <div class="space-y-1">
        <!-- System Variables -->
        {#if filteredSystem.length > 0}
          <Collapsible.Root open={true}>
            <Collapsible.Trigger class="hover:bg-muted flex w-full items-center rounded-md px-2 py-2 transition-colors">
              {@render sectionHeader('System', filteredSystem.length, 'default')}
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="space-y-3 px-2 pb-3">
                {#each filteredSystem as v (v.name)}
                  {@render variableField(v.name, v.description, `[${v.name}]`, v.type, v.enumValues)}
                {/each}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        {/if}

        <!-- Custom Variables -->
        {#if filteredCustom.length > 0}
          <Collapsible.Root open={true}>
            <Collapsible.Trigger class="hover:bg-muted flex w-full items-center rounded-md px-2 py-2 transition-colors">
              {@render sectionHeader('Custom', filteredCustom.length, 'default')}
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="space-y-3 px-2 pb-3">
                {#each filteredCustom as v (v.id)}
                  {@render variableField(
                    v.variableName,
                    v.displayName + (v.description ? ` — ${v.description}` : ''),
                    v.defaultValue ?? `[${v.displayName}]`,
                    v.variableType,
                    v.enumOptions?.map((o) => o.value),
                  )}
                {/each}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        {/if}

        <!-- Runtime Variable Groups -->
        {#each filteredRuntimeGroups as group (group.name)}
          <Collapsible.Root>
            <Collapsible.Trigger class="hover:bg-muted flex w-full items-center rounded-md px-2 py-2 transition-colors">
              {@render sectionHeader(group.name, group.variables.length)}
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="space-y-3 px-2 pb-3">
                {#each group.variables as v (v.name)}
                  {@render variableField(v.name, v.description, `[${v.name}]`, v.type, v.enumValues)}
                {/each}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        {/each}
      </div>
    </ScrollArea>

    <ResponsiveModal.Footer class="px-6">
      <div class="flex w-full items-center justify-between gap-2">
        <Button variant="outline" size="sm" class="gap-1.5" onclick={handleResetDefaults}>
          <RotateCcw class="h-3.5 w-3.5" />
          Clear All
        </Button>
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onclick={handleApply}>Apply</Button>
        </div>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
