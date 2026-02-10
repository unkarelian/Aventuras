<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import type { APIProfile, ProviderType } from '$lib/types'
  import { fetchModelsFromProvider } from '$lib/services/ai/sdk/providers'
  import { PROVIDERS, hasDefaultEndpoint } from '$lib/services/ai/sdk/providers/config'
  import ProviderTypeSelector from '$lib/components/settings/ProviderTypeSelector.svelte'
  import {
    Plus,
    Edit2,
    ChevronRight,
    RefreshCw,
    Check,
    Key as KeyIcon,
    Box,
    AlertCircle,
    Star,
    RotateCcw,
    Search,
  } from 'lucide-svelte'

  import { Button } from '$lib/components/ui/button'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Badge } from '$lib/components/ui/badge'
  import { Separator } from '$lib/components/ui/separator'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { Alert, AlertDescription } from '$lib/components/ui/alert'
  import * as Dialog from '$lib/components/ui/dialog'
  import IconRow from '$lib/components/ui/icon-row.svelte'
  import X from '@lucide/svelte/icons/x'
  import { isMobileDevice } from '$lib/utils/swipe'
  import { SvelteSet } from 'svelte/reactivity'

  let editingProfileId = $state<string | null>(null)
  let isNewProfile = $state(false)

  // Form state
  let formName = $state('')
  let formProviderType = $state<ProviderType>('openrouter')
  let formBaseUrl = $state('')
  let formApiKey = $state('')
  let formCustomModels = $state<string[]>([])
  let formFetchedModels = $state<string[]>([])
  let formReasoningModels = $state<string[]>([])
  let formSetAsDefault = $state(false)
  let formHiddenModels = $state<string[]>([])
  let formFavoriteModels = $state<string[]>([])
  let showCustomModelDialog = $state(false)
  let customModelDialogInput = $state('')
  let showHiddenModels = $state(false)
  let modelFilterInput = $state('')
  let showBaseUrlCollapsible = $state(false)

  // Auto-save debounce state
  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  // UI state
  let isFetchingModels = $state(false)
  let fetchError = $state<string | null>(null)
  let openCollapsibles = $state<Set<string>>(new Set())

  function isSelfHostedUrl(url: string): boolean {
    if (!url) return false
    try {
      const u = new URL(url)
      const host = u.hostname
      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('192.168.')
      )
    } catch {
      return false
    }
  }

  // Sort models: favorites first, then rest alphabetically
  function sortedModels(models: string[]): string[] {
    const favSet = new Set(formFavoriteModels)
    const favs = models.filter((m) => favSet.has(m))
    const rest = models.filter((m) => !favSet.has(m))
    return [...favs, ...rest]
  }

  // Filter models by search input
  function filterModels(models: string[]): string[] {
    if (!modelFilterInput.trim()) return models
    const search = modelFilterInput.toLowerCase()
    return models.filter((m) => m.toLowerCase().includes(search))
  }

  function startEdit(profile: APIProfile) {
    if (editingProfileId && editingProfileId !== profile.id && !isNewProfile) {
      if (saveTimeout) clearTimeout(saveTimeout)
      autoSaveEdit()
    }

    editingProfileId = profile.id
    isNewProfile = false
    formName = profile.name
    formProviderType = profile.providerType
    formBaseUrl = profile.baseUrl ?? ''
    formApiKey = profile.apiKey
    formCustomModels = [...profile.customModels]
    formFetchedModels = [...profile.fetchedModels]
    formReasoningModels = [...(profile.reasoningModels ?? [])]
    formHiddenModels = [...(profile.hiddenModels ?? [])]
    formFavoriteModels = [...(profile.favoriteModels ?? [])]
    formSetAsDefault = false
    showHiddenModels = false
    modelFilterInput = ''
    showBaseUrlCollapsible = false
    fetchError = null
    openCollapsibles = new SvelteSet([...openCollapsibles, profile.id])
  }

  function startNewProfile() {
    editingProfileId = crypto.randomUUID()
    isNewProfile = true
    formName = ''
    formProviderType = 'openrouter'
    formBaseUrl = ''
    formApiKey = ''
    formCustomModels = []
    formFetchedModels = []
    formReasoningModels = []
    formHiddenModels = []
    formFavoriteModels = []
    formSetAsDefault = settings.apiSettings.profiles.length === 0
    fetchError = null
  }

  function cancelEdit() {
    editingProfileId = null
    isNewProfile = false
    fetchError = null
  }

  async function handleSave() {
    if (!formName.trim()) return

    const profile: APIProfile = {
      id: editingProfileId!,
      name: formName.trim(),
      providerType: formProviderType,
      baseUrl: formBaseUrl.trim().replace(/\/$/, '') || undefined,
      apiKey: formApiKey,
      customModels: formCustomModels,
      fetchedModels: formFetchedModels,
      reasoningModels: formReasoningModels,
      hiddenModels: formHiddenModels,
      favoriteModels: formFavoriteModels,
      createdAt: isNewProfile
        ? Date.now()
        : settings.apiSettings.profiles.find((p) => p.id === editingProfileId)?.createdAt ||
          Date.now(),
    }

    if (isNewProfile) {
      await settings.addProfile(profile)

      if (formSetAsDefault) {
        settings.setDefaultProfile(profile.id)
      }
    } else {
      await settings.updateProfile(profile.id, profile)
    }

    cancelEdit()
  }

  async function handleDelete(profileId: string) {
    await settings.deleteProfile(profileId)
    if (editingProfileId === profileId) cancelEdit()
  }

  async function handleFetchModels() {
    isFetchingModels = true
    fetchError = null
    formFetchedModels = []
    formReasoningModels = []

    try {
      const result = await fetchModelsFromProvider(formProviderType, formBaseUrl, formApiKey)
      formFetchedModels = result.models
      formReasoningModels = result.reasoningModels
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'Failed to fetch models'
    } finally {
      isFetchingModels = false
    }
  }

  function handleRemoveCustomModel(model: string) {
    formCustomModels = formCustomModels.filter((m) => m !== model)
  }

  function handleRemoveFetchedModel(model: string) {
    formFetchedModels = formFetchedModels.filter((m) => m !== model)
    if (!formHiddenModels.includes(model)) {
      formHiddenModels = [...formHiddenModels, model]
    }
    // Also remove from favorites if hidden
    formFavoriteModels = formFavoriteModels.filter((m) => m !== model)
  }

  function handleRestoreHiddenModel(model: string) {
    formHiddenModels = formHiddenModels.filter((m) => m !== model)
    if (!formFetchedModels.includes(model) && !formCustomModels.includes(model)) {
      formFetchedModels = [...formFetchedModels, model]
    }
  }

  function handleToggleFavorite(model: string) {
    if (formFavoriteModels.includes(model)) {
      formFavoriteModels = formFavoriteModels.filter((m) => m !== model)
    } else {
      formFavoriteModels = [...formFavoriteModels, model]
    }
  }

  function handleAddCustomModelFromDialog() {
    const model = customModelDialogInput.trim()
    if (model && !formCustomModels.includes(model)) {
      formCustomModels = [...formCustomModels, model]
      // Custom models are favorites by default
      if (!formFavoriteModels.includes(model)) {
        formFavoriteModels = [...formFavoriteModels, model]
      }
      customModelDialogInput = ''
      showCustomModelDialog = false
    }
  }

  function handleSetDefault(profileId: string) {
    const currentDefault = settings.apiSettings.defaultProfileId
    // Only allow setting a new default, not unsetting
    if (currentDefault !== profileId) {
      settings.setDefaultProfile(profileId)
    }
  }

  function handleOpenChange(open: boolean, profile: APIProfile) {
    if (open) {
      startEdit(profile)
    } else {
      openCollapsibles.delete(profile.id)
      openCollapsibles = new SvelteSet(openCollapsibles)

      if (editingProfileId === profile.id) {
        if (saveTimeout) clearTimeout(saveTimeout)
        autoSaveEdit()
        editingProfileId = null
      }
    }
  }

  function isProfileOpen(profileId: string): boolean {
    return openCollapsibles.has(profileId)
  }

  async function autoSaveEdit() {
    if (!editingProfileId || isNewProfile) return
    if (!formName.trim()) return

    const existingProfile = settings.apiSettings.profiles.find((p) => p.id === editingProfileId)
    if (!existingProfile) return

    const profile: APIProfile = {
      id: editingProfileId,
      name: formName.trim(),
      providerType: formProviderType,
      baseUrl: formBaseUrl.trim().replace(/\/$/, '') || undefined,
      apiKey: formApiKey,
      customModels: formCustomModels,
      fetchedModels: formFetchedModels,
      reasoningModels: formReasoningModels,
      hiddenModels: formHiddenModels,
      favoriteModels: formFavoriteModels,
      createdAt: existingProfile.createdAt,
    }

    await settings.updateProfile(profile.id, profile)
  }

  function triggerAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      autoSaveEdit()
      saveTimeout = null
    }, 500)
  }

  $effect(() => {
    if (editingProfileId && !isNewProfile) {
      const _ = [
        formName,
        formProviderType,
        formBaseUrl,
        formApiKey,
        formCustomModels,
        formFetchedModels,
        formHiddenModels,
        formFavoriteModels,
      ]
      triggerAutoSave()
    }
  })
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold">API Profiles</h3>
        <p class="text-muted-foreground text-sm">Setup your API endpoints</p>
      </div>
      <Button onclick={startNewProfile}>
        <Plus class="h-4 w-4" />
        Add Profile
      </Button>
    </div>
  </div>

  <!-- New Profile Form -->
  {#if isNewProfile && editingProfileId}
    <Card class="border-primary/50 bg-primary/5">
      <CardContent>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <Star class="text-primary h-4 w-4" />
            <span class="text-primary text-sm font-medium">New Profile</span>
          </div>

          <Input
            id="new-name"
            label="Profile Name"
            placeholder="e.g., OpenRouter, My Local LLM"
            bind:value={formName}
          />

          <ProviderTypeSelector
            value={formProviderType}
            onchange={(v) => {
              formProviderType = v
              formName = PROVIDERS[v].name
              formBaseUrl = ''
              formFetchedModels = []
              formReasoningModels = []
              formCustomModels = []
              formHiddenModels = []
              formFavoriteModels = []
              fetchError = null
              modelFilterInput = ''
              showBaseUrlCollapsible = false
            }}
          />

          {#if !PROVIDERS[formProviderType].services}
            <Alert class="border-yellow-500/50 bg-yellow-500/10">
              <AlertCircle class="h-4 w-4 text-yellow-500" />
              <AlertDescription class="text-xs">
                This provider requires manual model configuration. After creating this profile, go
                to the <strong>Generation</strong> tab to set models for each service.
              </AlertDescription>
            </Alert>
          {/if}

          {#if formProviderType === 'openai-compatible'}
            <div class="space-y-2">
              <Label for="new-url">
                Base URL <span class="text-muted-foreground">(required)</span>
              </Label>
              <Input
                id="new-url"
                placeholder="https://api.example.com/v1"
                bind:value={formBaseUrl}
                class="font-mono text-xs"
              />
            </div>
          {:else}
            <div class="space-y-1">
              <button
                class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
                onclick={() => (showBaseUrlCollapsible = !showBaseUrlCollapsible)}
              >
                <ChevronRight
                  class="h-3 w-3 transition-transform {showBaseUrlCollapsible || formBaseUrl
                    ? 'rotate-90'
                    : ''}"
                />
                Custom Base URL
                <span class="text-muted-foreground">(optional)</span>
              </button>
              {#if showBaseUrlCollapsible || formBaseUrl}
                <Input
                  id="new-url"
                  placeholder={PROVIDERS[formProviderType].baseUrl || 'https://api.example.com/v1'}
                  bind:value={formBaseUrl}
                  class="font-mono text-xs"
                />
                <p class="text-muted-foreground text-xs">Leave empty for default endpoint.</p>
              {/if}
            </div>
          {/if}

          <div class="space-y-2">
            <Input
              label={isSelfHostedUrl(formBaseUrl) ? 'API Key (optional)' : 'API Key'}
              id="new-key"
              type="password"
              placeholder="sk-..."
              bind:value={formApiKey}
              class="font-mono text-xs"
            />
          </div>
        </div>

        <Separator class="my-4" />

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <Label class="flex items-center gap-2">
              <Box class="h-4 w-4" />
              Models
            </Label>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onclick={() => {
                  showCustomModelDialog = true
                  customModelDialogInput = ''
                }}
              >
                <Plus class="h-3 w-3" />
                {isMobileDevice() ? '' : 'Custom'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onclick={handleFetchModels}
                disabled={isFetchingModels ||
                  (!formBaseUrl && !hasDefaultEndpoint(formProviderType))}
              >
                {#if isFetchingModels}
                  <RefreshCw class="h-4 w-4 animate-spin" />
                  Fetching...
                {:else}
                  <RefreshCw class="h-4 w-4" />
                  {isMobileDevice() ? '' : 'Fetch Models'}
                {/if}
              </Button>
            </div>
          </div>

          {#if fetchError}
            <Alert variant="destructive">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription class="text-xs">{fetchError}</AlertDescription>
            </Alert>
          {/if}

          <div class="mb-2 space-y-2">
            {#if formFetchedModels.length > 0}
              <div class="space-y-2">
                <p class="text-muted-foreground text-xs font-medium">
                  Fetched Models ({formFetchedModels.length})
                </p>
                <ScrollArea class="h-32 w-full rounded-md border">
                  <div class="flex flex-wrap gap-1 p-2">
                    {#each formFetchedModels as model (model)}
                      <Badge variant="secondary" class="gap-1 pr-1">
                        <span class="max-w-37.5 truncate">{model}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="hover:text-destructive h-4 w-4 p-0"
                          onclick={() => handleRemoveFetchedModel(model)}
                        >
                          <X class="h-3 w-3" />
                        </Button>
                      </Badge>
                    {/each}
                  </div>
                </ScrollArea>
              </div>
            {/if}

            {#if formCustomModels.length > 0}
              <div class="space-y-2">
                <p class="text-muted-foreground text-xs font-medium">
                  Custom Models ({formCustomModels.length})
                </p>
                <ScrollArea class="h-24 w-full rounded-md border">
                  <div class="flex flex-wrap gap-1 p-2">
                    {#each formCustomModels as model (model)}
                      <Badge variant="outline" class="gap-1 pr-1">
                        <span class="max-w-37.5 truncate">{model}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="hover:text-destructive h-4 w-4 p-0"
                          onclick={() => handleRemoveCustomModel(model)}
                        >
                          <X class="h-3 w-3" />
                        </Button>
                      </Badge>
                    {/each}
                  </div>
                </ScrollArea>
              </div>
            {/if}
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <Button variant="outline" onclick={cancelEdit} class="flex-1">Cancel</Button>
          <Button
            onclick={handleSave}
            disabled={!formName.trim() ||
              (formProviderType === 'openai-compatible' && !formBaseUrl.trim())}
            class="flex-1"
          >
            <Check class="h-4 w-4" />
            Create Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Profiles List -->
  <div class="space-y-3">
    {#each settings.apiSettings.profiles as profile (profile.id)}
      <div class="bg-card text-card-foreground group rounded-lg border shadow-sm">
        <Collapsible.Root
          open={isProfileOpen(profile.id)}
          onOpenChange={(open) => handleOpenChange(open, profile)}
        >
          <div class="flex items-center gap-3 p-3 pl-4">
            <Collapsible.Trigger class="group/trigger flex flex-1 items-center gap-2 text-left">
              <div
                class="bg-muted/50 group-hover/trigger:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
              >
                <ChevronRight
                  class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-xl font-medium md:text-sm">{profile.name}</span>
                  {#if profile.id === settings.getDefaultProfileIdForProvider()}
                    <Badge
                      variant="default"
                      class="hidden shrink-0 items-center justify-center md:flex"
                      title="Used when agent profiles don't specify an API profile"
                    >
                      <Star class="mr-1 h-3 w-3" />
                      Fallback
                    </Badge>
                  {/if}
                </div>
                <div class="mt-0.5 hidden items-center gap-2 md:flex">
                  <Badge variant="secondary" class="text-xs capitalize">
                    {profile.providerType}
                  </Badge>
                  <Badge variant="outline" class="text-muted-foreground text-xs">
                    {profile.customModels.length +
                      profile.fetchedModels.length -
                      (profile.hiddenModels?.length ?? 0)}
                    models
                  </Badge>
                </div>
              </div>
            </Collapsible.Trigger>
            <div class="flex shrink-0 items-center gap-1">
              <IconRow
                onDelete={() => handleDelete(profile.id)}
                size="icon"
                showDelete={settings.canDeleteProfile(profile.id)}
              >
                {#if profile.id === settings.getDefaultProfileIdForProvider()}
                  <Badge
                    variant="default"
                    class="shrink-0 text-xs md:hidden"
                    title="Used when agent profiles don't specify an API profile"
                  >
                    Fallback
                  </Badge>
                {/if}
                {#if settings.apiSettings.profiles.length > 1 && profile.id !== settings.apiSettings.defaultProfileId}
                  <Button
                    variant="text"
                    size="icon"
                    class="w-5"
                    onclick={() => handleSetDefault(profile.id)}
                    title="Set as fallback profile"
                  >
                    <Star class="h-4 w-4" />
                  </Button>
                {/if}
                <Button
                  variant="text"
                  size="icon"
                  class="w-5"
                  onclick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    startEdit(profile)
                  }}
                  title="Edit profile"
                >
                  <Edit2 class="h-4 w-4" />
                </Button>
              </IconRow>
            </div>
          </div>

          <Collapsible.Content>
            {#if editingProfileId === profile.id}
              <div class="bg-muted/10 mt-2 space-y-4 border-t p-4">
                <Input label="Profile Name" bind:value={formName} placeholder="Profile name" />

                <ProviderTypeSelector
                  value={formProviderType}
                  onchange={(v) => {
                    formProviderType = v
                    formName = PROVIDERS[v].name
                    formBaseUrl = ''
                    formFetchedModels = []
                    formCustomModels = []
                    formHiddenModels = []
                    formFavoriteModels = []
                    fetchError = null
                    modelFilterInput = ''
                    showBaseUrlCollapsible = false
                  }}
                />

                {#if !PROVIDERS[formProviderType].services}
                  <Alert class="border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle class="h-4 w-4 text-yellow-500" />
                    <AlertDescription class="text-xs">
                      This provider requires manual model configuration. Go to the <strong
                        >Generation</strong
                      > tab to set models for each service.
                    </AlertDescription>
                  </Alert>
                {/if}

                {#if formProviderType === 'openai-compatible'}
                  <div class="flex flex-col">
                    <Label class="mb-2">
                      Base URL <span class="text-muted-foreground text-xs">(required)</span>
                    </Label>
                    <Input
                      bind:value={formBaseUrl}
                      placeholder="https://api.example.com/v1"
                      class="font-mono text-xs"
                    />
                  </div>
                {:else}
                  <div class="flex flex-col">
                    <button
                      class="text-muted-foreground hover:text-foreground mb-1 flex items-center gap-1 text-xs font-medium transition-colors"
                      onclick={() => (showBaseUrlCollapsible = !showBaseUrlCollapsible)}
                    >
                      <ChevronRight
                        class="h-3 w-3 transition-transform {showBaseUrlCollapsible || formBaseUrl
                          ? 'rotate-90'
                          : ''}"
                      />
                      Custom Base URL
                      <span class="text-muted-foreground">(optional)</span>
                    </button>
                    {#if showBaseUrlCollapsible || formBaseUrl}
                      <Input
                        bind:value={formBaseUrl}
                        placeholder={PROVIDERS[formProviderType].baseUrl ||
                          'https://api.example.com/v1'}
                        class="font-mono text-xs"
                      />
                      <p class="text-muted-foreground mt-1 text-xs">
                        Leave empty for default endpoint.
                      </p>
                    {/if}
                  </div>
                {/if}

                <div class="space-y-2">
                  <Input
                    label={isSelfHostedUrl(formBaseUrl) ? 'API Key (optional)' : 'API Key'}
                    type="password"
                    placeholder="sk-..."
                    bind:value={formApiKey}
                    class="font-mono text-xs"
                  />
                </div>

                <div class="">
                  <div class="flex items-center justify-between">
                    <Label class="flex items-center gap-2">
                      <Box class="h-4 w-4" />
                      Models
                    </Label>
                    <div class="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={() => {
                          showCustomModelDialog = true
                          customModelDialogInput = ''
                        }}
                      >
                        <Plus class="h-3 w-3" />
                        {isMobileDevice() ? '' : 'Custom'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onclick={handleFetchModels}
                        disabled={isFetchingModels ||
                          (!formBaseUrl && !hasDefaultEndpoint(formProviderType))}
                      >
                        {#if isFetchingModels}
                          <RefreshCw class="h-3 w-3 animate-spin" />
                          Fetching...
                        {:else}
                          <RefreshCw class="h-3 w-3" />
                          {isMobileDevice() ? 'Fetch' : 'Fetch Models'}
                        {/if}
                      </Button>
                    </div>
                  </div>

                  {#if fetchError}
                    <Alert variant="destructive">
                      <AlertCircle class="h-4 w-4" />
                      <AlertDescription class="text-xs">{fetchError}</AlertDescription>
                    </Alert>
                  {/if}

                  <!-- Model filter -->
                  {#if formFetchedModels.length + formCustomModels.length > 10}
                    <div class="my-2">
                      <Input
                        placeholder="Filter models..."
                        bind:value={modelFilterInput}
                        leftIcon={Search}
                        class="text-xs"
                      />
                    </div>
                  {/if}

                  {#if formFetchedModels.length > 0}
                    <div class="mb-2 space-y-1">
                      <p class="text-muted-foreground text-xs font-medium">
                        Fetched Models ({formFetchedModels.length})
                      </p>
                      <ScrollArea class="h-32 w-full rounded-md border">
                        <div class="flex flex-wrap gap-1 p-2">
                          {#each filterModels(sortedModels(formFetchedModels)) as model (model)}
                            {@const isFav = formFavoriteModels.includes(model)}
                            <Badge variant="secondary" class="gap-1 pr-0.5">
                              <button
                                class="p-0 transition-colors hover:text-yellow-500 {isFav
                                  ? 'text-yellow-500'
                                  : 'text-muted-foreground'}"
                                onclick={() => handleToggleFavorite(model)}
                                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Star class="h-3 w-3" fill={isFav ? 'currentColor' : 'none'} />
                              </button>
                              <span class="max-w-48 truncate">{model}</span>
                              {#if !isFav}
                                <button
                                  class="hover:text-destructive text-muted-foreground p-0 transition-colors"
                                  onclick={() => handleRemoveFetchedModel(model)}
                                  title="Hide model"
                                >
                                  <X class="h-3 w-3" />
                                </button>
                              {/if}
                            </Badge>
                          {/each}
                        </div>
                      </ScrollArea>
                    </div>
                  {/if}

                  {#if formCustomModels.length > 0}
                    <div class="mb-2 space-y-1">
                      <p class="text-muted-foreground text-xs font-medium">
                        Custom Models ({formCustomModels.length})
                      </p>
                      <ScrollArea class="h-24 w-full rounded-md border">
                        <div class="flex flex-wrap gap-1 p-2">
                          {#each filterModels(sortedModels(formCustomModels)) as model (model)}
                            {@const isFav = formFavoriteModels.includes(model)}
                            <Badge variant="outline" class="gap-1 pr-0.5">
                              <button
                                class="p-0 transition-colors hover:text-yellow-500 {isFav
                                  ? 'text-yellow-500'
                                  : 'text-muted-foreground'}"
                                onclick={() => handleToggleFavorite(model)}
                                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Star class="h-3 w-3" fill={isFav ? 'currentColor' : 'none'} />
                              </button>
                              <span class="max-w-48 truncate">{model}</span>
                              {#if !isFav}
                                <button
                                  class="hover:text-destructive text-muted-foreground p-0 transition-colors"
                                  onclick={() => handleRemoveCustomModel(model)}
                                  title="Delete model"
                                >
                                  <X class="h-3 w-3" />
                                </button>
                              {/if}
                            </Badge>
                          {/each}
                        </div>
                      </ScrollArea>
                    </div>
                  {/if}

                  {#if formHiddenModels.length > 0}
                    <div class="space-y-1">
                      <button
                        class="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium transition-colors"
                        onclick={() => (showHiddenModels = !showHiddenModels)}
                      >
                        <ChevronRight
                          class="h-3 w-3 transition-transform {showHiddenModels ? 'rotate-90' : ''}"
                        />
                        Hidden Models ({formHiddenModels.length})
                      </button>
                      {#if showHiddenModels}
                        <ScrollArea class="h-24 w-full rounded-md border border-dashed">
                          <div class="flex flex-wrap gap-1 p-2">
                            {#each filterModels(formHiddenModels) as model (model)}
                              <Badge variant="outline" class="gap-1 pr-1 opacity-60">
                                <span class="max-w-48 truncate">{model}</span>
                                <button
                                  class="hover:text-primary text-muted-foreground p-0 transition-colors"
                                  onclick={() => handleRestoreHiddenModel(model)}
                                  title="Restore model"
                                >
                                  <RotateCcw class="h-3 w-3" />
                                </button>
                              </Badge>
                            {/each}
                          </div>
                        </ScrollArea>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Custom Model Dialog -->
                <Dialog.Root
                  open={showCustomModelDialog}
                  onOpenChange={(open) => (showCustomModelDialog = open)}
                >
                  <Dialog.Content class="sm:max-w-md">
                    <Dialog.Header>
                      <Dialog.Title>Add Custom Model</Dialog.Title>
                      <Dialog.Description>
                        Enter the model identifier (e.g., provider/model-name)
                      </Dialog.Description>
                    </Dialog.Header>
                    <div class="flex gap-2 py-4">
                      <Input
                        placeholder="model-name or provider/model"
                        bind:value={customModelDialogInput}
                        class="flex-1"
                        onkeydown={(e) => e.key === 'Enter' && handleAddCustomModelFromDialog()}
                      />
                    </div>
                    <Dialog.Footer>
                      <Button variant="outline" onclick={() => (showCustomModelDialog = false)}>
                        Cancel
                      </Button>
                      <Button
                        onclick={handleAddCustomModelFromDialog}
                        disabled={!customModelDialogInput.trim()}
                      >
                        Add
                      </Button>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Root>
              </div>
            {:else}
              <!-- Read-only View -->
              <div class="bg-muted/10 mt-2 space-y-4 border-t p-4">
                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">Profile Name</Label>
                  <div class="font-medium">{profile.name}</div>
                </div>

                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">Provider</Label>
                  <div class="font-medium capitalize">
                    {profile.providerType}
                  </div>
                </div>

                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">Base URL</Label>
                  <div class="bg-muted truncate rounded p-2 font-mono text-sm">
                    {profile.baseUrl || PROVIDERS[profile.providerType].baseUrl || '(default)'}
                  </div>
                </div>

                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">API Key</Label>
                  <div class="bg-muted truncate rounded p-2 font-mono text-sm">
                    {#if profile.apiKey}
                      {profile.apiKey.slice(0, 3)}...{profile.apiKey.slice(-4)}
                    {:else}
                      <span class="text-muted-foreground italic">No API key set</span>
                    {/if}
                  </div>
                </div>

                <div class="grid gap-2">
                  <Label class="text-muted-foreground text-xs">Models</Label>
                  <div class="flex flex-wrap gap-1">
                    {#each [...new Set( [...profile.fetchedModels, ...profile.customModels], )] as model (model)}
                      <Badge variant="secondary" class="font-mono text-xs">
                        {model}
                      </Badge>
                    {/each}
                    {#if profile.fetchedModels.length === 0 && profile.customModels.length === 0}
                      <span class="text-muted-foreground text-sm italic">No models configured</span>
                    {/if}
                  </div>
                </div>

                <div class="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onclick={() => startEdit(profile)}>
                    <Edit2 class="mr-2 h-3 w-3" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            {/if}
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    {/each}

    {#if settings.apiSettings.profiles.length === 0}
      <Card class="border-dashed">
        <CardContent class="p-8 text-center">
          <div
            class="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
          >
            <KeyIcon class="text-muted-foreground h-6 w-6" />
          </div>
          <h4 class="mb-2 font-medium">No API profiles yet</h4>
          <p class="text-muted-foreground mb-4 text-sm">
            Add an API profile to connect to your LLM provider
          </p>
          <Button onclick={startNewProfile}>
            <Plus class=" h-4 w-4" />
            Add Your First Profile
          </Button>
        </CardContent>
      </Card>
    {/if}
  </div>
</div>
