<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import {
    Server,
    Check,
    ChevronsUpDown,
    Plus,
    RefreshCw,
    Star,
    AlertTriangle,
  } from 'lucide-svelte'
  import VirtualList from '@tutorlatin/svelte-tiny-virtual-list'
  import * as Select from '$lib/components/ui/select'
  import * as Command from '$lib/components/ui/command'
  import * as Popover from '$lib/components/ui/popover'
  import { Button } from '$lib/components/ui/button'
  import { Label } from '$lib/components/ui/label'
  import { cn } from '$lib/utils/cn'

  const ITEM_HEIGHT = 32
  const MAX_LIST_HEIGHT = 300

  interface Props {
    profileId: string | null
    model: string
    onProfileChange: (profileId: string | null) => void
    onModelChange: (model: string) => void
    showProfileSelector?: boolean
    onManageProfiles?: () => void
    label?: string
    placeholder?: string
    class?: string
    onRefreshModels?: () => void
    isRefreshingModels?: boolean
  }

  let {
    profileId,
    model,
    onProfileChange,
    onModelChange,
    showProfileSelector = true,
    onManageProfiles,
    label = 'Model',
    placeholder = 'Select or type model...',
    class: className,
    onRefreshModels,
    isRefreshingModels = false,
  }: Props = $props()

  // Local state for model search/input
  let open = $state(false)
  let inputValue = $state('')

  // Resolve the effective profile ID (with fallback to default)
  let effectiveProfileId = $derived(profileId || settings.getDefaultProfileIdForProvider())

  // Get available models for the selected profile (excluding hidden, favorites first)
  let availableModels = $derived(settings.getAvailableModels(effectiveProfileId))

  // Number of favorite models (for separator)
  let favoriteCount = $derived.by(() => {
    if (!effectiveProfileId) return 0
    const profile = settings.getProfile(effectiveProfileId)
    if (!profile) return 0
    const favSet = new Set(profile.favoriteModels ?? [])
    const hidden = new Set(profile.hiddenModels ?? [])
    return [...new Set([...profile.fetchedModels, ...profile.customModels])].filter(
      (m) => !hidden.has(m) && favSet.has(m),
    ).length
  })

  // Check if currently selected model is missing from the profile
  let isModelMissing = $derived(
    model.length > 0 && availableModels.length > 0 && !availableModels.includes(model),
  )

  // Filter models based on search input
  let filteredModels = $derived.by(() => {
    if (!inputValue.trim()) return availableModels
    const search = inputValue.toLowerCase()
    return availableModels.filter((m) => m.toLowerCase().includes(search))
  })

  // Check if input matches an existing model exactly
  let inputMatchesExisting = $derived(
    availableModels.some((m) => m.toLowerCase() === inputValue.toLowerCase()),
  )

  // Should show "Use custom" option
  let showCustomOption = $derived(inputValue.length > 0 && !inputMatchesExisting)

  // Total item count for virtual list
  let totalItemCount = $derived(filteredModels.length + (showCustomOption ? 1 : 0))

  // Calculate list height (cap at MAX_LIST_HEIGHT)
  let listHeight = $derived(Math.min(totalItemCount * ITEM_HEIGHT, MAX_LIST_HEIGHT))

  // Get selected profile name
  let selectedProfileName = $derived.by(() => {
    if (!profileId) return 'Select Profile'
    const profile = settings.getProfile(profileId)
    return profile?.name || 'Unknown'
  })

  // Create framework options for Select
  let profileOptions = $derived(
    settings.apiSettings.profiles.map((p) => ({
      value: p.id,
      label: p.name + (settings.apiSettings.defaultProfileId === p.id ? ' (Default)' : ''),
    })),
  )

  function handleSelectProfile(val: string) {
    onProfileChange(val)
  }

  function handleSelectModel(modelName: string) {
    onModelChange(modelName)
    open = false
    inputValue = ''
  }
</script>

<div class={cn('grid gap-4', className)}>
  {#if showProfileSelector}
    <div class="grid gap-2">
      <Label>API Profile</Label>
      <div class="flex gap-2">
        <Select.Root
          type="single"
          value={profileId || settings.getDefaultProfileIdForProvider()}
          onValueChange={handleSelectProfile}
        >
          <Select.Trigger class="w-full">
            {selectedProfileName}
          </Select.Trigger>
          <Select.Content>
            {#each profileOptions as option, i (i)}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        {#if onManageProfiles}
          <Button
            variant="outline"
            size="icon"
            onclick={onManageProfiles}
            title="Manage API Profiles"
            class="shrink-0"
          >
            <Server class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="grid gap-2">
    <div class="flex items-center justify-between">
      <Label>{label}</Label>
      {#if onRefreshModels}
        <Button
          variant="text"
          size="sm"
          class="text-muted-foreground hover:text-primary h-auto p-0 text-xs no-underline"
          onclick={onRefreshModels}
          disabled={isRefreshingModels}
        >
          <RefreshCw class={cn('mr-1 h-3 w-3', isRefreshingModels && 'animate-spin')} />
          Refresh
        </Button>
      {/if}
    </div>
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            class="w-full justify-between {isModelMissing ? 'border-yellow-500/50' : ''}"
            {...props}
          >
            <span class="flex items-center gap-1.5 truncate">
              {#if isModelMissing}
                <AlertTriangle class="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              {/if}
              <span class="truncate">{model || placeholder}</span>
            </span>
            <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0">
        <Command.Root shouldFilter={false}>
          <Command.Input bind:value={inputValue} placeholder="Search or type model..." />
          <Command.List>
            {#if totalItemCount === 0}
              <Command.Empty>No models found.</Command.Empty>
            {:else}
              <Command.Group>
                <div class="virtual-list-container">
                  <VirtualList
                    height={listHeight}
                    itemCount={totalItemCount}
                    itemSize={ITEM_HEIGHT}
                  >
                    {#snippet item({ style, index })}
                      {#if showCustomOption && index === 0}
                        <div {style}>
                          <Command.Item
                            value={`__custom__${inputValue}`}
                            onSelect={() => handleSelectModel(inputValue)}
                          >
                            <Plus class="mr-2 h-4 w-4" />
                            Use "{inputValue}"
                          </Command.Item>
                        </div>
                      {:else}
                        {@const modelIndex = showCustomOption ? index - 1 : index}
                        {@const modelOption = filteredModels[modelIndex]}
                        <div {style}>
                          <Command.Item
                            value={modelOption}
                            onSelect={() => handleSelectModel(modelOption)}
                          >
                            {#if modelIndex < favoriteCount}
                              <Star class="mr-2 h-3 w-3 text-yellow-500" />
                            {:else}
                              <Check
                                class={cn(
                                  'mr-2 h-4 w-4',
                                  model === modelOption ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                            {/if}
                            {modelOption}
                          </Command.Item>
                        </div>
                      {/if}
                    {/snippet}
                  </VirtualList>
                </div>
              </Command.Group>
            {/if}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
    {#if isModelMissing}
      <p class="text-[0.8rem] text-yellow-500">Model not found in this profile's model list.</p>
    {:else if availableModels.length === 0}
      <p class="text-muted-foreground text-[0.8rem]">
        No models available. Add models to the profile.
      </p>
    {/if}
  </div>
</div>

<style>
  .virtual-list-container :global(.virtual-list-wrapper) {
    overflow-y: auto;
  }

  .virtual-list-container :global(.virtual-list-inner) {
    position: relative;
  }
</style>
