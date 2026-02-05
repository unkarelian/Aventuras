<script lang="ts">
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
  import { scenarioVault } from '$lib/stores/scenarioVault.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import type { VaultCharacter, VaultLorebook, VaultScenario } from '$lib/types'
  import {
    Plus,
    Search as SearchIcon,
    Star,
    Users,
    ChevronLeft,
    Upload,
    Archive,
    Book,
    Globe,
    MapPin,
    Tags,
  } from 'lucide-svelte'
  import UniversalVaultCard from './UniversalVaultCard.svelte'
  import VaultCharacterForm from './VaultCharacterForm.svelte'
  import VaultLorebookEditor from './VaultLorebookEditor.svelte'
  import VaultScenarioEditor from './VaultScenarioEditor.svelte'
  import DiscoveryModal from '$lib/components/discovery/DiscoveryModal.svelte'
  import TagFilter from './TagFilter.svelte'
  import TagManager from '$lib/components/tags/TagManager.svelte'
  import { tagStore } from '$lib/stores/tags.svelte'
  import { fade } from 'svelte/transition'

  // Shared Components
  import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte'

  // Shadcn Components
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { cn } from '$lib/utils/cn'

  // Types
  type VaultTab = 'characters' | 'lorebooks' | 'scenarios'
  type VaultType = 'character' | 'lorebook' | 'scenario'

  type AnyVaultItem = VaultCharacter | VaultLorebook | VaultScenario

  // State
  let activeTab = $state<VaultTab>(ui.vaultTab)
  let searchQuery = $state('')
  let showFavoritesOnly = $state(false)
  let selectedTags = $state<string[]>([])
  let filterLogic = $state<'AND' | 'OR'>('OR')
  let showTagManager = $state(false)

  // Modal States
  let showCharForm = $state(false)
  let editingCharacter = $state<VaultCharacter | null>(null)
  let editingLorebook = $state<VaultLorebook | null>(null)
  let editingScenario = $state<VaultScenario | null>(null)

  let showDiscoveryModal = $state(false)
  let discoveryMode = $state<VaultType>('character')

  // Configuration
  interface VaultSectionConfig {
    id: VaultTab
    label: string
    icon: typeof Users
    type: VaultType
    store: typeof characterVault | typeof lorebookVault | typeof scenarioVault
    singularLabel: string
    emptyIcon: typeof Users
    emptyTitle: string
    emptyDesc: string
    createLabel?: string
    createAction?: () => void
    importLabel: string
    importAction: (e: Event) => void
  }

  const sections: VaultSectionConfig[] = [
    {
      id: 'characters',
      label: 'Characters',
      icon: Users,
      type: 'character',
      store: characterVault,
      singularLabel: 'Character',
      emptyIcon: Users,
      emptyTitle: 'No characters in vault yet',
      emptyDesc: 'Create your first character to get started.',
      createLabel: 'New Character',
      createAction: openCreateCharForm,
      importLabel: 'Import Card',
      importAction: handleImportCard,
    },
    {
      id: 'lorebooks',
      label: 'Lorebooks',
      icon: Book,
      type: 'lorebook',
      store: lorebookVault,
      singularLabel: 'Lorebook',
      emptyIcon: Book,
      emptyTitle: 'No lorebooks in vault yet',
      emptyDesc: 'Create a new lorebook or import one from a file.',
      createLabel: 'New Lorebook',
      createAction: handleCreateLorebook,
      importLabel: 'Import Lorebook',
      importAction: handleImportLorebook,
    },
    {
      id: 'scenarios',
      label: 'Scenarios',
      icon: MapPin,
      type: 'scenario',
      store: scenarioVault,
      singularLabel: 'Scenario',
      emptyIcon: MapPin,
      emptyTitle: 'No scenarios in vault yet',
      emptyDesc: 'Import character cards to extract scenario settings.',
      // No create action for scenarios currently
      importLabel: 'Import Card',
      importAction: handleImportScenario,
    },
  ]

  // Helper function to filter items
  function getFilteredItems<
    T extends {
      tags: string[]
      favorite: boolean
      name: string
      description: string | null
      traits?: string[]
    },
  >(items: T[]): T[] {
    let result = items

    if (showFavoritesOnly) {
      result = result.filter((item) => item.favorite)
    }

    if (selectedTags.length > 0) {
      if (filterLogic === 'AND') {
        result = result.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)))
      } else {
        result = result.filter((item) => selectedTags.some((tag) => item.tags.includes(tag)))
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.tags.some((t) => t.toLowerCase().includes(query)) ||
          item.traits?.some((t) => t.toLowerCase().includes(query)),
      )
    }

    return result
  }

  // Load on mount
  $effect(() => {
    if (!characterVault.isLoaded) characterVault.load()
    if (!lorebookVault.isLoaded) lorebookVault.load()
    if (!scenarioVault.isLoaded) scenarioVault.load()
    if (!tagStore.isLoaded) tagStore.load()
  })

  // Sync with UI store
  $effect(() => {
    activeTab = ui.vaultTab
    selectedTags = []
  })

  $effect(() => {
    ui.setVaultTab(activeTab)
    selectedTags = []
  })

  // Handlers
  function openCreateCharForm() {
    editingCharacter = null
    showCharForm = true
  }

  function openEditCharForm(character: VaultCharacter) {
    editingCharacter = character
    showCharForm = true
  }

  function handleImportCard(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    characterVault.importFromFile(file)
    input.value = ''
  }

  function handleImportLorebook(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    lorebookVault.importFromFile(file)
    input.value = ''
  }

  async function handleCreateLorebook() {
    const newLorebook = await lorebookVault.add({
      name: '',
      description: null,
      entries: [],
      tags: [],
      favorite: false,
      source: 'manual',
      originalFilename: null,
      originalStoryId: null,
      metadata: {
        format: 'aventura',
        totalEntries: 0,
        entryBreakdown: {
          character: 0,
          location: 0,
          item: 0,
          faction: 0,
          concept: 0,
          event: 0,
        },
      },
    })
    editingLorebook = newLorebook
  }

  function handleImportScenario(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    scenarioVault.importFromFile(file)
    input.value = ''
  }

  function openBrowseOnline(mode: VaultType) {
    discoveryMode = mode
    showDiscoveryModal = true
  }

  // Generic Edit/Delete handlers
  function handleEdit(item: AnyVaultItem, type: VaultType) {
    if (type === 'character') openEditCharForm(item as VaultCharacter)
    else if (type === 'lorebook') editingLorebook = item as VaultLorebook
    else if (type === 'scenario') editingScenario = item as VaultScenario
  }

  async function handleDelete(id: string, store: any) {
    await store.delete(id)
  }

  async function handleToggleFavorite(id: string, store: any) {
    await store.toggleFavorite(id)
  }
</script>

<Tabs
  value={activeTab}
  onValueChange={(v) => (activeTab = v as VaultTab)}
  class="bg-background flex h-full flex-col"
>
  <!-- Header -->
  <div class="bg-muted/20 flex flex-col border-b">
    <!-- Top Bar -->
    <div class="flex items-center justify-between px-4 py-3">
      <div class="flex items-center gap-1">
        <Button
          variant="link"
          size="icon"
          class="text-muted-foreground hover:text-foreground -ml-2 h-9 w-9"
          onclick={() => ui.setActivePanel('library')}
          title="Back to Library"
        >
          <ChevronLeft class="h-5 w-5" />
        </Button>
        <div class="flex items-center gap-2">
          <Archive class="text-muted-foreground h-5 w-5" />
          <h2 class="text-lg font-semibold tracking-tight">Vault</h2>
        </div>
      </div>

      <!-- Right Side Actions -->
      <div class="flex items-center gap-2">
        <Button
          icon={Tags}
          label="Tags"
          variant="outline"
          size="sm"
          class="h-9"
          onclick={() => (showTagManager = true)}
        />

        {#each sections as section (section.id)}
          {#if activeTab === section.id}
            <Button
              icon={Globe}
              label="Browse Online"
              variant="outline"
              size="sm"
              class="h-9"
              onclick={() => openBrowseOnline(section.type)}
            />

            <div class="relative">
              <Button
                icon={Upload}
                label={section.importLabel}
                variant="outline"
                size="sm"
                class="h-9 cursor-pointer"
              />
              <input
                type="file"
                accept={section.id === 'lorebooks' ? '.json,application/json' : '.json,.png'}
                class="absolute inset-0 cursor-pointer opacity-0"
                onchange={section.importAction}
              />
            </div>

            {#if section.createAction}
              <Button
                icon={Plus}
                label={section.createLabel!}
                size="sm"
                class="h-9"
                onclick={section.createAction}
              />
            {/if}
          {/if}
        {/each}
      </div>
    </div>

    <!-- Tab Bar -->
    <div class="px-4 pb-2">
      <TabsList class="bg-muted/50 grid w-full max-w-md grid-cols-3">
        {#each sections as section (section.id)}
          <TabsTrigger value={section.id} class="flex items-center gap-2">
            <section.icon class="h-4 w-4" />
            <span class="hidden sm:inline">{section.label}</span>
            <Badge variant="secondary" class="ml-1 h-5 px-1 py-0 text-[10px]">
              {section.store.items.length}
            </Badge>
          </TabsTrigger>
        {/each}
      </TabsList>
    </div>
  </div>

  <!-- Search and Filters -->
  <div
    class="bg-background/95 supports-[backdrop-filter]:bg-background/60 flex flex-col gap-3 p-4 backdrop-blur"
  >
    <div class="flex items-center gap-2">
      <Input
        type="text"
        bind:value={searchQuery}
        placeholder={`Search ${activeTab}...`}
        class="bg-muted/40 flex-1"
        leftIcon={SearchIcon}
      />

      <div class="flex shrink-0 items-center gap-2">
        <TagFilter
          {selectedTags}
          logic={filterLogic}
          type={sections.find((s) => s.id === activeTab)?.type || 'character'}
          onUpdate={(tags, logic) => {
            selectedTags = tags
            filterLogic = logic
          }}
        />

        <Button
          icon={Star}
          label="Favorites"
          variant="outline"
          size="default"
          class={cn(
            'transition-all',
            showFavoritesOnly &&
              'border-yellow-500/50 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 hover:text-yellow-700',
          )}
          iconClass={cn('h-3 w-3', showFavoritesOnly && 'fill-yellow-500 text-yellow-500')}
          onclick={() => (showFavoritesOnly = !showFavoritesOnly)}
        />
      </div>
    </div>
  </div>

  <!-- Content -->
  {#each sections as section (section.id)}
    <TabsContent
      value={section.id}
      class="m-0 flex-1 overflow-hidden p-0 outline-none data-[state=inactive]:hidden"
    >
      <ScrollArea class="h-full">
        <div class="flex min-h-full flex-col px-4 pb-36 sm:pb-16">
          {#if !section.store.isLoaded}
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {#each Array(6) as _, i (i)}
                <div class="space-y-3">
                  <Skeleton class="h-[200px] w-full rounded-xl" />
                  <div class="space-y-2">
                    <Skeleton class="h-4 w-[250px]" />
                    <Skeleton class="h-4 w-[200px]" />
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            {@const filteredItems = getFilteredItems(section.store.items as AnyVaultItem[])}

            {#if filteredItems.length === 0}
              <div in:fade class="flex flex-1 flex-col items-center justify-center">
                <EmptyState
                  icon={section.emptyIcon}
                  title={searchQuery || showFavoritesOnly
                    ? `No ${section.label.toLowerCase()} match your filters`
                    : section.emptyTitle}
                  description={searchQuery || showFavoritesOnly
                    ? 'Try adjusting your search terms or filters.'
                    : section.emptyDesc}
                >
                  {#if !searchQuery && !showFavoritesOnly}
                    <div class="flex flex-col items-center gap-3 sm:flex-row">
                      {#if section.createAction}
                        <Button onclick={section.createAction}>
                          <Plus class="h-4 w-4" />
                          {section.createLabel}
                        </Button>
                      {/if}
                      <Button variant="outline" onclick={() => openBrowseOnline(section.type)}>
                        <Globe class="h-4 w-4" />
                        Browse Online
                      </Button>
                    </div>
                  {/if}
                </EmptyState>
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" in:fade>
                {#each filteredItems as item, i (i)}
                  <UniversalVaultCard
                    item={item as AnyVaultItem}
                    type={section.type}
                    onEdit={() => handleEdit(item, section.type)}
                    onDelete={() => handleDelete(item.id, section.store)}
                    onToggleFavorite={() => handleToggleFavorite(item.id, section.store)}
                  />
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </ScrollArea>
    </TabsContent>
  {/each}
</Tabs>

<!-- Character Form Modal -->
{#if showCharForm}
  <VaultCharacterForm
    character={editingCharacter}
    onClose={() => {
      showCharForm = false
      editingCharacter = null
    }}
  />
{/if}

<!-- Lorebook Editor Modal -->
{#if editingLorebook}
  <VaultLorebookEditor lorebook={editingLorebook} onClose={() => (editingLorebook = null)} />
{/if}

<!-- Scenario Editor Modal -->
{#if editingScenario}
  <VaultScenarioEditor scenario={editingScenario} onClose={() => (editingScenario = null)} />
{/if}

<!-- Discovery Modal -->
<DiscoveryModal
  isOpen={showDiscoveryModal}
  mode={discoveryMode}
  onClose={() => (showDiscoveryModal = false)}
/>

<!-- Tag Manager Modal -->
{#if showTagManager}
  <TagManager open={showTagManager} onOpenChange={(v) => (showTagManager = v)} />
{/if}
