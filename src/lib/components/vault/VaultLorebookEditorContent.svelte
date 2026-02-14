<script lang="ts">
  import type { VaultLorebook, VaultLorebookEntry, EntryType, EntryInjectionMode } from '$lib/types'
  import type { VaultPendingChange } from '$lib/services/ai/sdk/schemas/vault'
  import {
    X,
    Plus,
    Search,
    Trash2,
    Save,
    ArrowLeft,
    List,
    Maximize2,
    Minimize2,
    Users,
    MapPin,
    Box,
    Flag,
    Brain,
    Calendar,
    EyeOff,
    Settings,
    Check,
    Pencil,
  } from 'lucide-svelte'
  import TagInput from '$lib/components/tags/TagInput.svelte'
  import VaultLorebookEntryFields from './VaultLorebookEntryFields.svelte'

  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import * as Tabs from '$lib/components/ui/tabs'
  import { cn } from '$lib/utils/cn'

  interface Props {
    lorebook: VaultLorebook
    onSave: (updatedLorebook: VaultLorebook) => Promise<void> | void
    onSaveAndClose?: (updatedLorebook: VaultLorebook) => Promise<void> | void
    onClose: () => void
    initialEntryIndex?: number | null
    isEmbedded?: boolean
    isPendingApproval?: boolean
    onApprove?: () => void
    pendingEntries?: VaultPendingChange[]
    onApproveEntry?: (change: VaultPendingChange) => void
    onUpdatePendingChange?: (change: VaultPendingChange, newData: VaultLorebookEntry) => void
  }

  let {
    lorebook,
    onSave,
    onSaveAndClose,
    onClose,
    initialEntryIndex = null,
    isEmbedded = false,
    isPendingApproval = false,
    onApprove,
    pendingEntries = [],
    onApproveEntry,
    onUpdatePendingChange,
  }: Props = $props()

  // Local state for editing - initialized from props but mutable
  let name = $derived(lorebook.name)
  let description = $derived(lorebook.description ?? '')
  let tags = $derived<string[]>([...lorebook.tags])
  // svelte-ignore state_referenced_locally
  let entries = $state<VaultLorebookEntry[]>(JSON.parse(JSON.stringify(lorebook.entries))) // Deep copy — $state so manual adds persist

  // New-entry draft: not in entries[] until user clicks Save
  let newEntryDraft = $state<VaultLorebookEntry | null>(null)

  // Track locally deleted entry names so the sync effect won't re-add them
  let locallyDeleted = $state<Set<string>>(new Set())

  // Inline delete confirmation
  let confirmingDeleteIndex = $state<number | null>(null)

  // Sync entries from the lorebook prop when vault updates add or remove entries
  // (e.g. after pending creates are approved and saved, or deletes are applied).
  // Only needed in embedded mode where the AI can add entries concurrently.
  $effect(() => {
    if (!isEmbedded) return

    const localNames = new Set(entries.map((e) => e.name))

    // Only add entries that are new in the prop and not locally deleted
    const newFromVault = lorebook.entries.filter(
      (e) => !localNames.has(e.name) && !locallyDeleted.has(e.name),
    )

    if (newFromVault.length > 0) {
      entries = [...entries, ...newFromVault.map((e) => JSON.parse(JSON.stringify(e)))]
    }
  })

  // UI State
  let searchQuery = $state('')
  // -1 = new entry draft, null = nothing selected, >=0 = existing entry
  // svelte-ignore state_referenced_locally
  let selectedIndex = $state<number | null>(initialEntryIndex)
  let saving = $state(false)
  let error = $state<string | null>(null)
  let activeTab = $derived(isPendingApproval && entries.length === 0 ? 'settings' : 'editor')
  let isMaximized = $state(false)

  // Dirty tracking & save feedback
  let settingsDirty = $state(false)
  let entriesDirty = $state(false)
  let savedFeedback = $state<'settings' | 'entry' | null>(null)
  let savedFeedbackTimer: ReturnType<typeof setTimeout> | null = null

  function showSavedFeedback(type: 'settings' | 'entry') {
    savedFeedback = type
    if (savedFeedbackTimer) clearTimeout(savedFeedbackTimer)
    savedFeedbackTimer = setTimeout(() => {
      savedFeedback = null
    }, 2000)
  }

  // Sync settings when prop changes (one-way binding from parent)
  // Note: we intentionally do NOT re-sync `entries` here — manual entries would be lost.
  $effect(() => {
    name = lorebook.name
    description = lorebook.description ?? ''
    tags = [...lorebook.tags]
    settingsDirty = false
  })

  // Filtered entries (Combines existing + pending, overlays edits/deletes on existing entries)
  type CombinedEntry = {
    entry: VaultLorebookEntry
    index: number
    isPending: boolean
    pendingChange: import('$lib/services/ai/sdk/schemas/vault').VaultPendingChange | null
    pendingAction?: 'create' | 'edit' | 'delete'
  }

  const combinedEntries = $derived.by((): CombinedEntry[] => {
    // Build a map of pending changes that target existing entries (by entryIndex)
    const editMap = new Map<number, VaultPendingChange>()
    const deleteMap = new Map<number, VaultPendingChange>()
    const creates: VaultPendingChange[] = []
    const mergeDeletedIndices = new Set<number>()
    const mergeCreates: VaultPendingChange[] = []

    for (const change of pendingEntries) {
      if (change.entityType !== 'lorebook-entry') continue
      if (change.status !== 'pending') continue
      switch (change.action) {
        case 'create':
          creates.push(change)
          break
        case 'update':
          if ('entryIndex' in change && typeof change.entryIndex === 'number') {
            editMap.set(change.entryIndex, change)
          }
          break
        case 'delete':
          if ('entryIndex' in change && typeof change.entryIndex === 'number') {
            deleteMap.set(change.entryIndex, change)
          }
          break
        case 'merge':
          if ('entryIndices' in change && Array.isArray(change.entryIndices)) {
            for (const idx of change.entryIndices) {
              mergeDeletedIndices.add(idx)
              deleteMap.set(idx, change)
            }
          }
          mergeCreates.push(change)
          break
      }
    }

    // Regular entries with overlaid pending state
    const regular: CombinedEntry[] = entries.map((e, i) => {
      if (deleteMap.has(i) || mergeDeletedIndices.has(i)) {
        return {
          entry: e,
          index: i,
          isPending: true,
          pendingChange: deleteMap.get(i) ?? null,
          pendingAction: 'delete' as const,
        }
      }
      if (editMap.has(i)) {
        return {
          entry: e,
          index: i,
          isPending: true,
          pendingChange: editMap.get(i)!,
          pendingAction: 'edit' as const,
        }
      }
      return {
        entry: e,
        index: i,
        isPending: false,
        pendingChange: null,
      }
    })

    // New entries (creates + merge results)
    const newEntries: CombinedEntry[] = []
    const allCreates = [...creates, ...mergeCreates]
    for (let i = 0; i < allCreates.length; i++) {
      const change = allCreates[i]
      const data = 'data' in change ? (change.data as VaultLorebookEntry) : null
      if (data) {
        newEntries.push({
          entry: data,
          index: -100 - i,
          isPending: true,
          pendingChange: change,
          pendingAction: 'create',
        })
      }
    }

    const all = [...regular, ...newEntries]

    if (!searchQuery.trim()) return all

    const q = searchQuery.toLowerCase()
    return all.filter(
      ({ entry }) =>
        entry.name.toLowerCase().includes(q) ||
        (entry.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false),
    )
  })

  // Ensure selectedIndex is valid when entries change
  // Note: negative indices (< 0) are valid — they encode pending entries (-100 - i)
  // -1 is reserved for the new entry draft
  $effect(() => {
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex >= entries.length) {
      selectedIndex = null
    }
  })

  const selectedEntry = $derived.by((): VaultLorebookEntry | null => {
    if (selectedIndex === null) return null

    // New entry draft
    if (selectedIndex === -1) return newEntryDraft

    // Find the matching combined entry to get merged/overlaid data
    const combined = combinedEntries.find((c) => c.index === selectedIndex)
    if (!combined) return null

    // For edits: merge partial update data onto the full existing entry
    if (combined.pendingAction === 'edit' && combined.pendingChange) {
      const updateData =
        'data' in combined.pendingChange
          ? (combined.pendingChange.data as Partial<VaultLorebookEntry>)
          : {}
      return { ...combined.entry, ...updateData }
    }

    return combined.entry
  })

  const selectedCombined = $derived.by(() => {
    if (selectedIndex === null || selectedIndex === -1) return null
    return combinedEntries.find((c) => c.index === selectedIndex) ?? null
  })

  const selectedPendingChange = $derived(selectedCombined?.pendingChange ?? null)
  const selectedPendingAction = $derived(selectedCombined?.pendingAction ?? null)

  const typeIcons: Record<EntryType, any> = {
    character: Users,
    location: MapPin,
    item: Box,
    faction: Flag,
    concept: Brain,
    event: Calendar,
  }

  async function handleSaveClick(
    saveHandler: (updatedLorebook: VaultLorebook) => Promise<void> | void = onSave,
  ) {
    if (!name.trim()) {
      error = 'Lorebook name is required'
      return
    }

    saving = true
    error = null

    try {
      // Update metadata entry breakdown
      const breakdown: Record<EntryType, number> = {
        character: 0,
        location: 0,
        item: 0,
        faction: 0,
        concept: 0,
        event: 0,
      }
      entries.forEach((e) => {
        if (breakdown[e.type] !== undefined) breakdown[e.type]++
      })

      const updatedLorebook: VaultLorebook = {
        ...lorebook,
        name,
        description: description || null,
        entries,
        tags,
        metadata: {
          ...lorebook.metadata,
          format: lorebook.metadata?.format ?? 'aventura',
          totalEntries: entries.length,
          entryBreakdown: breakdown,
        },
      }

      await saveHandler(updatedLorebook)
      saving = false
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save lorebook'
      saving = false
    }
  }

  function handleAddEntry() {
    newEntryDraft = {
      name: '',
      type: 'character',
      description: '',
      keywords: [],
      aliases: [],
      injectionMode: 'keyword',
      priority: 10,
    }
    selectedIndex = -1
    activeTab = 'editor'
    searchQuery = ''
    confirmingDeleteIndex = null
  }

  function handleSaveNewEntry() {
    if (!newEntryDraft) return
    if (!newEntryDraft.name.trim()) {
      error = 'Entry name is required'
      return
    }
    entries = [...entries, newEntryDraft]
    selectedIndex = entries.length - 1
    newEntryDraft = null
    entriesDirty = true
    if (isEmbedded) handleSaveClick()
  }

  function handleDeleteEntry(index: number) {
    if (index < 0 || index >= entries.length) return
    const deletedName = entries[index].name
    locallyDeleted = new Set([...locallyDeleted, deletedName])
    entries.splice(index, 1)
    entries = [...entries]
    entriesDirty = true
    confirmingDeleteIndex = null
    if (selectedIndex === index) {
      selectedIndex = null
    } else if (selectedIndex !== null && selectedIndex > index) {
      selectedIndex--
    }
    if (isEmbedded) handleSaveClick()
  }

  function handleDuplicateEntry(index: number) {
    const entry = entries[index]
    const newEntry = JSON.parse(JSON.stringify(entry))
    newEntry.name = `${newEntry.name} (Copy)`
    entries.push(newEntry)
    entries = [...entries]
    selectedIndex = entries.length - 1
  }

  /** Approve a pending entry change and optimistically update local state */
  function handleApproveEntry(change: VaultPendingChange) {
    if (!onApproveEntry) return

    if (change.entityType === 'lorebook-entry') {
      switch (change.action) {
        case 'update': {
          const idx = change.entryIndex
          if (idx >= 0 && idx < entries.length) {
            entries[idx] = { ...entries[idx], ...(change.data as Partial<VaultLorebookEntry>) }
            entries = [...entries]
          }
          break
        }
        case 'delete': {
          const idx = change.entryIndex
          if (idx >= 0 && idx < entries.length) {
            const deletedName = entries[idx].name
            locallyDeleted = new Set([...locallyDeleted, deletedName])
            entries.splice(idx, 1)
            entries = [...entries]
            if (selectedIndex === idx) selectedIndex = null
            else if (selectedIndex !== null && selectedIndex > idx) selectedIndex--
          }
          break
        }
        case 'merge': {
          if (change.entryIndices) {
            const sorted = [...change.entryIndices].sort((a, b) => b - a)
            for (const idx of sorted) {
              if (idx >= 0 && idx < entries.length) {
                locallyDeleted = new Set([...locallyDeleted, entries[idx].name])
                entries.splice(idx, 1)
              }
            }
            entries = [...entries]
            selectedIndex = null
          }
          break
        }
      }
    }

    onApproveEntry(change)
  }
</script>

<div class="bg-background flex h-full w-full flex-col overflow-hidden">
  <!-- Header -->
  {#if !isEmbedded}
    <div class="relative flex flex-shrink-0 items-center justify-center border-b px-6 py-4">
      <div class="absolute top-1/2 left-4 -translate-y-1/2">
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-foreground h-8 w-8"
          onclick={() => (isMaximized = !isMaximized)}
        >
          {#if isMaximized}
            <Minimize2 class="h-4 w-4" />
          {:else}
            <Maximize2 class="h-4 w-4" />
          {/if}
          <span class="sr-only">{isMaximized ? 'Minimize' : 'Maximize'}</span>
        </Button>
      </div>
      <h2 class="text-lg font-semibold tracking-tight">Edit Lorebook</h2>
      {#if error}
        <div
          class="bg-background/95 text-destructive absolute top-full left-0 w-full border-b py-1 text-center text-sm backdrop-blur"
        >
          {error}
        </div>
      {/if}
    </div>
  {:else if error}
    <div class="bg-destructive/10 text-destructive w-full border-b py-1 text-center text-sm">
      {error}
    </div>
  {/if}

  <Tabs.Root bind:value={activeTab} class="flex flex-1 flex-col overflow-hidden">
    <div class="bg-muted/20 flex shrink-0 items-center justify-between border-b">
      <Tabs.List class="h-12 justify-start bg-transparent p-0">
        <Tabs.Trigger
          value="editor"
          class="data-[state=active]:border-primary h-full rounded-none px-4 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <List class="mr-2 h-4 w-4" />
          Entries ({entries.length})
        </Tabs.Trigger>
        <Tabs.Trigger
          value="settings"
          class="data-[state=active]:border-primary h-full rounded-none px-4 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
        >
          <Settings class="mr-2 h-4 w-4" />
          Settings
        </Tabs.Trigger>
      </Tabs.List>
    </div>

    <!-- Main Content Area -->
    <div class="bg-background relative flex flex-1 overflow-hidden">
      <!-- Tab Contents Wrapper -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Tabs.Content value="settings" class="m-0 flex-1 overflow-y-auto p-6">
          <div class="mx-auto max-w-2xl space-y-6">
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="name">Lorebook Name</Label>
                <Input
                  id="name"
                  bind:value={name}
                  oninput={() => (settingsDirty = true)}
                  placeholder="Lorebook Name"
                />
              </div>

              <div class="space-y-2">
                <Label for="description">Description</Label>
                <Textarea
                  id="description"
                  bind:value={description}
                  oninput={() => (settingsDirty = true)}
                  rows={4}
                  placeholder="Describe what this lorebook contains..."
                  class="resize-none"
                />
              </div>

              <div class="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  value={tags}
                  type="lorebook"
                  onChange={(newTags) => {
                    tags = newTags
                    settingsDirty = true
                  }}
                  placeholder="Add tags..."
                />
              </div>

              <div class="bg-muted/30 rounded-lg border p-4">
                <h4 class="mb-3 text-sm font-medium">Statistics</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div class="bg-background flex justify-between rounded border p-2">
                    <span class="text-muted-foreground">Total Entries</span>
                    <span>{entries.length}</span>
                  </div>
                  <div class="bg-background flex justify-between rounded border p-2">
                    <span class="text-muted-foreground">Active Entries</span>
                    <span>{entries.filter((e) => e.injectionMode !== 'never').length}</span>
                  </div>
                </div>
              </div>

              <!-- Inline save/approve for embedded mode (settings only) -->
              {#if isEmbedded && (settingsDirty || savedFeedback === 'settings')}
                <Button
                  class={cn(
                    'w-full gap-1.5',
                    savedFeedback === 'settings' &&
                      'bg-emerald-600 text-white hover:bg-emerald-700',
                  )}
                  onclick={() => {
                    handleSaveClick()
                    settingsDirty = false
                    showSavedFeedback('settings')
                  }}
                  disabled={saving || !name.trim() || savedFeedback === 'settings'}
                >
                  {#if savedFeedback === 'settings'}
                    <Check class="h-4 w-4" />
                    Saved
                  {:else if saving}
                    <div
                      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    ></div>
                    Saving...
                  {:else}
                    <Save class="h-4 w-4" />
                    Save Settings
                  {/if}
                </Button>
              {/if}
            </div>
          </div>
        </Tabs.Content>

        <Tabs.Content
          value="editor"
          class={cn(
            'm-0 flex h-full flex-1 flex-col overflow-hidden',
            // If embedded, we might want a different layout, but for now stick to responsive
            'sm:flex-row',
          )}
        >
          <!-- Sidebar (List) -->
          <div
            class={cn(
              'sm:bg-muted/10 flex w-full flex-col sm:w-80 sm:border-r',
              selectedIndex !== null && 'hidden sm:flex', // Hide on mobile if selected
            )}
          >
            <div class="space-y-3 border-b p-4">
              <div class="relative">
                <Input
                  bind:value={searchQuery}
                  placeholder="Search entries..."
                  class="bg-background pl-9"
                  leftIcon={Search}
                />
              </div>
              <Button class="w-full" onclick={handleAddEntry}>
                <Plus class="h-4 w-4 " /> Add Entry
              </Button>
            </div>

            <div class="flex flex-1 flex-col space-y-1 overflow-y-auto p-2">
              {#if combinedEntries.length === 0}
                <div
                  class="text-muted-foreground flex min-h-[200px] flex-1 flex-col items-center justify-center text-center text-sm"
                >
                  {#if searchQuery}
                    No matches found
                  {:else}
                    No entries yet
                  {/if}
                </div>
              {:else}
                {#each combinedEntries as { entry, index, isPending, pendingChange, pendingAction } (isPending ? `pending-${pendingChange?.id ?? index}` : index)}
                  {@const Icon = typeIcons[entry.type]}
                  <button
                    class={cn(
                      'hover:bg-muted/50 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors',
                      selectedIndex === index && 'bg-accent text-accent-foreground',
                      pendingAction === 'create' &&
                        'border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10',
                      pendingAction === 'edit' &&
                        'border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10',
                      pendingAction === 'delete' &&
                        'border border-red-500/30 bg-red-500/5 opacity-60 hover:bg-red-500/10',
                    )}
                    onclick={() => {
                      selectedIndex = index
                      newEntryDraft = null
                      confirmingDeleteIndex = null
                    }}
                  >
                    <div
                      class={cn(
                        'bg-background/50 flex h-8 w-8 items-center justify-center rounded-md border',
                        selectedIndex === index && 'bg-background/20 border-transparent',
                        pendingAction === 'create' && 'border-emerald-500/30 text-emerald-500',
                        pendingAction === 'edit' && 'border-blue-500/30 text-blue-500',
                        pendingAction === 'delete' && 'border-red-500/30 text-red-500',
                      )}
                    >
                      <Icon class="h-4 w-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2 text-sm font-medium">
                        <span
                          class={cn(
                            'truncate',
                            pendingAction === 'delete' && 'line-through opacity-70',
                          )}>{entry.name}</span
                        >
                        {#if pendingAction === 'create'}
                          <span
                            class="ml-auto shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500 uppercase"
                            >New</span
                          >
                        {:else if pendingAction === 'edit'}
                          <span
                            class="ml-auto shrink-0 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-500 uppercase"
                            >Edited</span
                          >
                        {:else if pendingAction === 'delete'}
                          <span
                            class="ml-auto shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500 uppercase"
                            >Delete</span
                          >
                        {/if}
                      </div>
                      <div class="flex items-center gap-2 text-xs opacity-70">
                        <span class="capitalize">{entry.type}</span>
                        {#if entry.injectionMode === 'never'}
                          <span class="ml-auto flex items-center gap-0.5">
                            <EyeOff class="h-3 w-3" />
                          </span>
                        {/if}
                      </div>
                    </div>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          <!-- Editor Area -->
          <div
            class={cn(
              'bg-background flex flex-1 flex-col overflow-hidden',
              selectedIndex === null && 'hidden sm:flex',
            )}
          >
            {#if selectedEntry !== null && selectedIndex !== null}
              <div class="flex flex-shrink-0 items-center justify-between border-b px-6 py-4">
                <div class="flex min-w-0 flex-1 items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    class="-ml-2 sm:hidden"
                    onclick={() => {
                      selectedIndex = null
                      newEntryDraft = null
                    }}
                  >
                    <ArrowLeft class="h-5 w-5" />
                  </Button>
                  <Input
                    bind:value={selectedEntry.name}
                    class="hover:border-input focus:border-input h-auto w-full min-w-[200px] border-transparent px-2 py-1 text-lg font-semibold transition-colors sm:w-auto"
                  />
                </div>
                <div class="flex items-center gap-2">
                  {#if selectedIndex === -1}
                    <!-- New entry draft: Save button -->
                    <Button
                      size="sm"
                      class="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                      onclick={handleSaveNewEntry}
                      disabled={saving}
                    >
                      <Save class="h-3.5 w-3.5" />
                      Save Entry
                    </Button>
                  {:else if selectedPendingChange}
                    <Button
                      size="sm"
                      class={cn(
                        'gap-1.5 text-white',
                        selectedPendingAction === 'delete'
                          ? 'bg-red-600 hover:bg-red-700'
                          : selectedPendingAction === 'edit'
                            ? 'bg-blue-600 hover:bg-blue-700'
                            : 'bg-emerald-600 hover:bg-emerald-700',
                      )}
                      onclick={() => handleApproveEntry(selectedPendingChange!)}
                    >
                      {#if selectedPendingAction === 'delete'}
                        <Trash2 class="h-3.5 w-3.5" />
                        Approve Delete
                      {:else if selectedPendingAction === 'edit'}
                        <Pencil class="h-3.5 w-3.5" />
                        Approve Edit
                      {:else}
                        <Save class="h-3.5 w-3.5" />
                        Approve & Save
                      {/if}
                    </Button>
                  {:else if isEmbedded && (entriesDirty || savedFeedback === 'entry')}
                    <Button
                      size="sm"
                      class={cn(
                        'gap-1.5',
                        savedFeedback === 'entry' &&
                          'bg-emerald-600 text-white hover:bg-emerald-700',
                      )}
                      onclick={() => {
                        handleSaveClick()
                        entriesDirty = false
                        showSavedFeedback('entry')
                      }}
                      disabled={saving || savedFeedback === 'entry'}
                    >
                      {#if savedFeedback === 'entry'}
                        <Check class="h-3.5 w-3.5" />
                        Saved
                      {:else}
                        <Save class="h-3.5 w-3.5" />
                        Save Entry
                      {/if}
                    </Button>
                  {/if}
                  {#if selectedIndex >= 0}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => handleDuplicateEntry(selectedIndex!)}
                      disabled={!!selectedPendingChange}
                    >
                      <span class="hidden sm:inline">Duplicate</span>
                      <Plus class="h-4 w-4" />
                    </Button>
                    {#if confirmingDeleteIndex === selectedIndex}
                      <Button
                        size="sm"
                        class="gap-1.5 bg-red-600 text-white hover:bg-red-700"
                        onclick={() => handleDeleteEntry(selectedIndex!)}
                      >
                        <Trash2 class="h-3.5 w-3.5" />
                        Confirm
                      </Button>
                    {:else}
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onclick={() => (confirmingDeleteIndex = selectedIndex)}
                        disabled={!!selectedPendingChange}
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    {/if}
                  {/if}
                </div>
              </div>

              <div class="flex-1 overflow-y-auto p-6">
                <div class="mx-auto max-w-3xl">
                  <VaultLorebookEntryFields
                    data={selectedEntry}
                    onUpdate={(newData) => {
                      entriesDirty = true
                      if (selectedIndex === -1) {
                        // Editing the new entry draft
                        newEntryDraft = newData
                      } else if (selectedIndex !== null) {
                        if (selectedIndex >= 0) {
                          entries[selectedIndex] = newData
                          entries = [...entries]
                        } else if (selectedPendingChange && onUpdatePendingChange) {
                          onUpdatePendingChange(selectedPendingChange, newData)
                        }
                      }
                    }}
                  />
                </div>
              </div>
            {:else}
              <div class="text-muted-foreground flex flex-1 flex-col items-center justify-center">
                <div class="bg-muted/30 mb-4 rounded-full p-6">
                  <Search class="h-8 w-8 opacity-50" />
                </div>
                <p class="text-lg font-medium">Select an entry to edit</p>
                <p class="mt-2 text-sm">Or click "Add Entry" to create one</p>
              </div>
            {/if}
          </div>
        </Tabs.Content>
      </div>
    </div>
  </Tabs.Root>

  <!-- Footer -->
  {#if !isEmbedded}
    <div
      class="bg-muted/40 flex flex-shrink-0 items-center gap-2 border-t px-6 py-4 sm:justify-end"
    >
      <Button
        variant="outline"
        class="w-10 p-0 sm:w-auto sm:px-4"
        onclick={onClose}
        disabled={saving}
      >
        <X class="h-4 w-4" />
        <span class="hidden sm:inline">Cancel</span>
      </Button>
      <Button
        class="flex-1 sm:flex-none"
        onclick={() => handleSaveClick(onSaveAndClose ?? onSave)}
        disabled={saving || !name.trim()}
      >
        {#if saving}
          <div
            class=" h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          ></div>
        {:else}
          <Save class=" h-4 w-4" />
        {/if}
        Save Changes
      </Button>
    </div>
  {/if}
</div>
