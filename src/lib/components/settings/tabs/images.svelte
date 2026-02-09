<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Autocomplete } from '$lib/components/ui/autocomplete'
  import { Slider } from '$lib/components/ui/slider'
  import {
    RotateCcw,
    Info,
    Plus,
    Pencil,
    Trash2,
    Copy,
    Eye,
    EyeOff,
    ChevronRight,
    Check,
  } from 'lucide-svelte'
  import { listImageModelsByProvider, type ImageModelInfo } from '$lib/services/ai/image'
  import ImageModelSelect from '$lib/components/settings/ImageModelSelect.svelte'
  import type { ImageProfile, ImageProviderType, APIProfile } from '$lib/types'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Alert from '$lib/components/ui/alert'
  import { Card, CardContent } from '$lib/components/ui/card'
  import * as Collapsible from '$lib/components/ui/collapsible'
  import { SvelteSet } from 'svelte/reactivity'

  const imageStyles = [
    { value: 'image-style-soft-anime', label: 'Soft Anime' },
    { value: 'image-style-semi-realistic', label: 'Semi-realistic Anime' },
    { value: 'image-style-photorealistic', label: 'Photorealistic' },
  ] as const

  const imageSizes = [
    { value: '512x512', label: '512x512 (Faster)' },
    { value: '1024x1024', label: '1024x1024 (Higher Quality)' },
    { value: '2048x2048', label: '2048x2048 (Highest Quality)' },
  ] as const

  const backgroundSizes = [
    { value: '1280x720', label: '1280x720 (Widescreen)' },
    { value: '720x1280', label: '720x1280 (Portrait)' },
  ] as const

  const providerTypes: { value: ImageProviderType; label: string }[] = [
    { value: 'nanogpt', label: 'NanoGPT' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'chutes', label: 'Chutes' },
    { value: 'pollinations', label: 'Pollinations' },
    { value: 'google', label: 'Google Imagen' },
    { value: 'zhipu', label: 'Zhipu CogView' },
    { value: 'comfyui', label: 'ComfyUI' },
  ]

  // Tab state
  let activeTab = $state<'profiles' | 'general' | 'characters' | 'backgrounds'>('profiles')

  // Handle profile change
  function onProfileChange(
    profileId: string,
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ) {
    switch (type) {
      case 'standard':
        settings.systemServicesSettings.imageGeneration.profileId = profileId
        break
      case 'portrait':
        settings.systemServicesSettings.imageGeneration.portraitProfileId = profileId
        break
      case 'reference':
        settings.systemServicesSettings.imageGeneration.referenceProfileId = profileId
        break
      case 'background':
        settings.systemServicesSettings.imageGeneration.backgroundProfileId = profileId
        break
    }

    settings.saveSystemServicesSettings()
  }

  // Get the currently selected image profile for a type
  function getSelectedImageProfile(
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ): ImageProfile | undefined {
    let profileId: string | null
    switch (type) {
      case 'standard':
        profileId = settings.systemServicesSettings.imageGeneration.profileId
        break
      case 'portrait':
        profileId = settings.systemServicesSettings.imageGeneration.portraitProfileId
        break
      case 'reference':
        profileId = settings.systemServicesSettings.imageGeneration.referenceProfileId
        break
      case 'background':
        profileId = settings.systemServicesSettings.imageGeneration.backgroundProfileId
        break
    }
    return profileId ? settings.getImageProfile(profileId) : undefined
  }

  // ===== Image Profile CRUD =====
  let editingProfileId = $state<string | null>(null)
  let isNewProfile = $state(false)
  let profileName = $state('')
  let profileProviderType = $state<ImageProviderType>('nanogpt')
  let profileApiKey = $state('')
  let profileBaseUrl = $state('')
  let showApiKey = $state(false)
  let showCopyDropdown = $state(false)
  let openProfileIds = new SvelteSet<string>()

  // Profile form model state
  let profileModel = $state('')
  let profileModels = $state<ImageModelInfo[]>([])
  let isLoadingProfileModels = $state(false)
  let profileModelsError = $state<string | null>(null)

  // Load models for the profile form when provider/apiKey change
  async function loadProfileFormModels(providerType: ImageProviderType, apiKey: string) {
    isLoadingProfileModels = true
    profileModelsError = null
    try {
      const models = await listImageModelsByProvider(providerType, apiKey)
      profileModels = models
    } catch (error) {
      profileModelsError = error instanceof Error ? error.message : 'Failed to load models'
    } finally {
      isLoadingProfileModels = false
    }
  }

  // Reactively load models when provider or apiKey changes in profile form
  $effect(() => {
    if (editingProfileId && profileProviderType) {
      loadProfileFormModels(profileProviderType, profileApiKey)
    }
  })

  // Save current profile edits (called when collapsible closes)
  function saveEditingProfile() {
    if (isNewProfile || !editingProfileId || !profileName.trim()) return
    settings.updateImageProfile(editingProfileId, {
      name: profileName.trim(),
      providerType: profileProviderType,
      apiKey: profileApiKey,
      baseUrl: profileBaseUrl || undefined,
      model: profileModel,
    })
  }

  function startNewProfile() {
    editingProfileId = crypto.randomUUID()
    isNewProfile = true
    profileName = ''
    profileProviderType = 'nanogpt'
    profileApiKey = ''
    profileBaseUrl = ''
    profileModel = ''
    profileModels = []
    showApiKey = false
    showCopyDropdown = false
    openProfileIds.clear()
  }

  function startEditProfile(profile: ImageProfile) {
    editingProfileId = profile.id
    isNewProfile = false
    profileName = profile.name
    profileProviderType = profile.providerType
    profileApiKey = profile.apiKey
    profileBaseUrl = profile.baseUrl || ''
    profileModel = profile.model || ''
    profileModels = []
    showApiKey = false
    showCopyDropdown = false
    openProfileIds.add(profile.id)
  }

  function resetEditState() {
    editingProfileId = null
    isNewProfile = false
    showCopyDropdown = false
  }

  async function handleSaveProfile() {
    if (!profileName.trim()) return

    await settings.addImageProfile({
      name: profileName.trim(),
      providerType: profileProviderType,
      apiKey: profileApiKey,
      baseUrl: profileBaseUrl || undefined,
      model: profileModel,
      providerOptions: {},
    })

    resetEditState()
  }

  async function deleteProfile(id: string) {
    await settings.deleteImageProfile(id)
    if (editingProfileId === id) resetEditState()
  }

  function copyApiKeyFromProfile(apiProfile: APIProfile) {
    profileApiKey = apiProfile.apiKey
    showCopyDropdown = false
  }

  function handleProfileOpenChange(open: boolean, profile: ImageProfile) {
    if (open) {
      startEditProfile(profile)
    } else {
      if (editingProfileId === profile.id) {
        saveEditingProfile()
        resetEditState()
      }
      openProfileIds.delete(profile.id)
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-end">
    <Button variant="ghost" size="sm" onclick={() => settings.resetImageGenerationSettings()}>
      <RotateCcw class="mr-1 h-3 w-3" />
      Reset to Defaults
    </Button>
  </div>

  <Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)}>
    <Tabs.List class="grid w-full grid-cols-4">
      <Tabs.Trigger value="profiles">Profiles</Tabs.Trigger>
      <Tabs.Trigger value="general">Story Images</Tabs.Trigger>
      <Tabs.Trigger value="characters">Characters</Tabs.Trigger>
      <Tabs.Trigger value="backgrounds">Backgrounds</Tabs.Trigger>
    </Tabs.List>

    <div class="mt-4 min-h-[400px]">
      <!-- Profiles Tab -->
      <Tabs.Content value="profiles" class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-muted-foreground text-sm">
            Image profiles configure which provider and API key to use for image generation.
          </p>
          <Button size="sm" onclick={startNewProfile}>
            <Plus class="mr-1 h-3 w-3" />
            Add Profile
          </Button>
        </div>

        <!-- New Profile Form (inline) -->
        {#if isNewProfile && editingProfileId}
          <Card class="border-primary/50 bg-primary/5">
            <CardContent>
              {@render profileForm()}
              <div class="flex gap-2 pt-4">
                <Button variant="outline" onclick={resetEditState} class="flex-1">Cancel</Button>
                <Button onclick={handleSaveProfile} disabled={!profileName.trim()} class="flex-1">
                  <Check class="h-4 w-4" />
                  Create Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        {/if}

        {#if settings.imageProfiles.length === 0 && !isNewProfile}
          <Alert.Root>
            <Info class="h-4 w-4" />
            <Alert.Title>No Image Profiles</Alert.Title>
            <Alert.Description class="text-xs">
              Create an image profile to start generating images. You can have multiple profiles for
              different providers or use cases (e.g., portraits vs backgrounds).
            </Alert.Description>
          </Alert.Root>
        {:else}
          <div class="space-y-3">
            {#each settings.imageProfiles as profile (profile.id)}
              <div class="bg-card text-card-foreground rounded-lg border shadow-sm">
                <Collapsible.Root
                  open={openProfileIds.has(profile.id)}
                  onOpenChange={(open) => handleProfileOpenChange(open, profile)}
                >
                  <div class="flex items-center gap-3 p-3 pl-4">
                    <Collapsible.Trigger
                      class="group/trigger flex flex-1 items-center gap-2 text-left"
                    >
                      <ChevronRight
                        class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90"
                      />
                      <div class="min-w-0 flex-1">
                        <span class="text-sm font-medium">{profile.name}</span>
                        <p class="text-muted-foreground text-xs">
                          {providerTypes.find((p) => p.value === profile.providerType)?.label ||
                            profile.providerType}
                          {profile.model ? ` · ${profile.model}` : ''}
                          {profile.apiKey ? ' · Key configured' : ' · No API key'}
                        </p>
                      </div>
                    </Collapsible.Trigger>
                    <div class="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7"
                        onclick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          startEditProfile(profile)
                        }}
                        title="Edit profile"
                      >
                        <Pencil class="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-7 w-7 hover:text-red-500"
                        onclick={() => deleteProfile(profile.id)}
                        title="Delete profile"
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  <Collapsible.Content>
                    {#if editingProfileId === profile.id}
                      <div class="bg-muted/10 space-y-4 border-t p-4">
                        {@render profileForm()}
                      </div>
                    {/if}
                  </Collapsible.Content>
                </Collapsible.Root>
              </div>
            {/each}
          </div>
        {/if}
      </Tabs.Content>

      <!-- General Tab -->
      <Tabs.Content value="general" class="space-y-6">
        <section class="space-y-6">
          <div class="bg-muted/10 space-y-6 rounded-lg border p-4">
            <div class="space-y-3">
              <Alert.Root>
                <Info class="h-4 w-4" />
                <Alert.Title>Story Image Profile Selection</Alert.Title>
                <Alert.Description class="text-xs">
                  <ul class="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <strong>Reference Profile</strong>: Used when "Portrait Mode" is enabled in
                      your current story. Generates images based on the character portraits.
                    </li>
                    <li>
                      <strong>Regular Image Profile</strong>: Used when "Portrait Mode" is disabled
                      in your current story.
                    </li>
                  </ul>
                  <p class="mt-2">Models are configured in each profile on the Profiles tab.</p>
                </Alert.Description>
              </Alert.Root>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <!-- Standard Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Regular Image Profile</Label>
                  <Autocomplete
                    items={settings.imageProfiles}
                    selected={getSelectedImageProfile('standard')}
                    onSelect={(v) => onProfileChange((v as ImageProfile).id, 'standard')}
                    itemLabel={(p: ImageProfile) =>
                      `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
                    itemValue={(p: ImageProfile) => p.id}
                    placeholder="Select an image profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Regular Image Size</Label>
                    <Autocomplete
                      items={imageSizes}
                      selected={imageSizes.find(
                        (s) => s.value === settings.systemServicesSettings.imageGeneration.size,
                      ) ||
                        (settings.systemServicesSettings.imageGeneration.size
                          ? {
                              value: settings.systemServicesSettings.imageGeneration.size,
                              label: settings.systemServicesSettings.imageGeneration.size,
                            }
                          : undefined)}
                      onSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.size = (
                          v as { value: string }
                        ).value
                        settings.saveSystemServicesSettings()
                      }}
                      allowCustom={true}
                      onCustomSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.size = v
                        settings.saveSystemServicesSettings()
                      }}
                      itemLabel={(s: { label: string }) => s.label}
                      itemValue={(s: { value: string }) => s.value}
                      placeholder="Select size"
                    />
                  </div>
                {/if}
              </div>

              <!-- Reference Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Reference (Img2Img) Profile</Label>
                  <Autocomplete
                    items={settings.imageProfiles}
                    selected={getSelectedImageProfile('reference')}
                    onSelect={(v) => onProfileChange((v as ImageProfile).id, 'reference')}
                    itemLabel={(p: ImageProfile) =>
                      `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
                    itemValue={(p: ImageProfile) => p.id}
                    placeholder="Select an image profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.referenceProfileId || settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Reference Image Size</Label>
                    <Autocomplete
                      items={imageSizes}
                      selected={imageSizes.find(
                        (s) =>
                          s.value === settings.systemServicesSettings.imageGeneration.referenceSize,
                      ) ||
                        (settings.systemServicesSettings.imageGeneration.referenceSize
                          ? {
                              value: settings.systemServicesSettings.imageGeneration.referenceSize,
                              label: settings.systemServicesSettings.imageGeneration.referenceSize,
                            }
                          : undefined)}
                      onSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.referenceSize = (
                          v as { value: string }
                        ).value
                        settings.saveSystemServicesSettings()
                      }}
                      allowCustom={true}
                      onCustomSelect={(v) => {
                        settings.systemServicesSettings.imageGeneration.referenceSize = v
                        settings.saveSystemServicesSettings()
                      }}
                      itemLabel={(s: { label: string }) => s.label}
                      itemValue={(s: { value: string }) => s.value}
                      placeholder="Select size"
                    />
                  </div>
                {/if}
              </div>
            </div>
          </div>

          <!-- Image Style -->
          <div class="space-y-2">
            <Label>Story Image Style</Label>
            <Autocomplete
              items={imageStyles}
              selected={imageStyles.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.styleId,
              )}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.styleId = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select style"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for generated story images. Edit styles in the Prompts tab.
            </p>
          </div>

          <!-- Max Images Per Message -->
          <div class="space-y-2">
            <Label>
              Max Images Per Message: {settings.systemServicesSettings.imageGeneration
                .maxImagesPerMessage === 0
                ? 'Unlimited'
                : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.maxImagesPerMessage]}
              onValueChange={(v) => {
                settings.systemServicesSettings.imageGeneration.maxImagesPerMessage = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={5}
              step={1}
            />
          </div>
        </section>
      </Tabs.Content>

      <!-- Characters Tab -->
      <Tabs.Content value="characters" class="space-y-6">
        <section class="space-y-4">
          <div class="space-y-2">
            <Label>Character Portrait Profile</Label>
            <Autocomplete
              items={settings.imageProfiles}
              selected={getSelectedImageProfile('portrait')}
              onSelect={(v) => onProfileChange((v as ImageProfile).id, 'portrait')}
              itemLabel={(p: ImageProfile) =>
                `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
              itemValue={(p: ImageProfile) => p.id}
              placeholder="Select an image profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating character portraits. Model is configured in the profile.
            </p>
          </div>

          {#if settings.systemServicesSettings.imageGeneration.portraitProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <Label>Character Portrait Size</Label>
              <Autocomplete
                items={imageSizes}
                selected={imageSizes.find(
                  (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitSize,
                ) ||
                  (settings.systemServicesSettings.imageGeneration.portraitSize
                    ? {
                        value: settings.systemServicesSettings.imageGeneration.portraitSize,
                        label: settings.systemServicesSettings.imageGeneration.portraitSize,
                      }
                    : undefined)}
                onSelect={(v) => {
                  settings.systemServicesSettings.imageGeneration.portraitSize = (
                    v as { value: string }
                  ).value
                  settings.saveSystemServicesSettings()
                }}
                allowCustom={true}
                onCustomSelect={(v) => {
                  settings.systemServicesSettings.imageGeneration.portraitSize = v
                  settings.saveSystemServicesSettings()
                }}
                itemLabel={(s: { label: string }) => s.label}
                itemValue={(s: { value: string }) => s.value}
                placeholder="Select size"
              />
            </div>
          {/if}

          <div class="space-y-2">
            <Label>Character Portrait Style</Label>
            <Autocomplete
              items={imageStyles}
              selected={imageStyles.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitStyleId,
              )}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.portraitStyleId = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select style"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Visual style for character portraits. Edit styles in the Prompts tab.
            </p>
          </div>
        </section>
      </Tabs.Content>

      <!-- Backgrounds Tab -->
      <Tabs.Content value="backgrounds" class="space-y-6">
        <section class="space-y-4">
          <div class="space-y-2">
            <Label>Background Profile</Label>
            <Autocomplete
              items={settings.imageProfiles}
              selected={getSelectedImageProfile('background')}
              onSelect={(v) => onProfileChange((v as ImageProfile).id, 'background')}
              itemLabel={(p: ImageProfile) =>
                `${p.name} (${providerTypes.find((t) => t.value === p.providerType)?.label || p.providerType}${p.model ? ` · ${p.model}` : ''})`}
              itemValue={(p: ImageProfile) => p.id}
              placeholder="Select an image profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating background scenes. Model is configured in the profile.
            </p>
          </div>

          <div class="space-y-2">
            <Label>Background Size</Label>
            <Autocomplete
              items={backgroundSizes}
              selected={backgroundSizes.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.backgroundSize,
              ) ||
                (settings.systemServicesSettings.imageGeneration.backgroundSize
                  ? {
                      value: settings.systemServicesSettings.imageGeneration.backgroundSize,
                      label: settings.systemServicesSettings.imageGeneration.backgroundSize,
                    }
                  : undefined)}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.backgroundSize = (
                  v as { value: string }
                ).value
                settings.saveSystemServicesSettings()
              }}
              allowCustom={true}
              onCustomSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.backgroundSize = v
                settings.saveSystemServicesSettings()
              }}
              itemLabel={(s: { label: string }) => s.label}
              itemValue={(s: { value: string }) => s.value}
              placeholder="Select size"
            />
          </div>

          <div class="space-y-2">
            <Label>
              Background Blur: {settings.systemServicesSettings.imageGeneration.backgroundBlur}px
            </Label>
            <Slider
              type="multiple"
              value={[settings.systemServicesSettings.imageGeneration.backgroundBlur]}
              onValueChange={(v: number[]) => {
                settings.systemServicesSettings.imageGeneration.backgroundBlur = v[0]
                settings.saveSystemServicesSettings()
              }}
              min={0}
              max={20}
              step={1}
            />
            <p class="text-muted-foreground mt-1 text-xs">Blur amount for the background image.</p>
          </div>
        </section>
      </Tabs.Content>
    </div>
  </Tabs.Root>
</div>

{#snippet profileForm()}
  <div class="space-y-4">
    <div class="space-y-2">
      <Label>Name</Label>
      <Input bind:value={profileName} placeholder="e.g., NanoGPT Images" />
    </div>

    <div class="space-y-2">
      <Label>Provider</Label>
      <Autocomplete
        items={providerTypes}
        selected={providerTypes.find((p) => p.value === profileProviderType)}
        onSelect={(v) => {
          profileProviderType = (v as { value: ImageProviderType }).value
        }}
        itemLabel={(p: { label: string }) => p.label}
        itemValue={(p: { value: string }) => p.value}
        placeholder="Select provider"
      />
    </div>

    <!-- comfy doesnt use API keys -->
    {#if profileProviderType !== 'comfyui'}
      <div class="space-y-2">
        <Label>API Key</Label>
        <div class="flex gap-2">
          <div class="relative flex-1">
            <Input
              type={showApiKey ? 'text' : 'password'}
              bind:value={profileApiKey}
              placeholder="Enter API key"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center pr-3"
              onclick={() => (showApiKey = !showApiKey)}
            >
              {#if showApiKey}
                <EyeOff class="text-muted-foreground h-4 w-4" />
              {:else}
                <Eye class="text-muted-foreground h-4 w-4" />
              {/if}
            </button>
          </div>
        </div>

        {#if settings.apiSettings.profiles.length > 0}
          <div class="relative">
            <Button
              variant="outline"
              size="sm"
              onclick={() => (showCopyDropdown = !showCopyDropdown)}
            >
              <Copy class="mr-1 h-3 w-3" />
              Copy from API Profile
            </Button>
            {#if showCopyDropdown}
              <div class="bg-popover absolute z-10 mt-1 w-64 rounded-md border shadow-md">
                {#each settings.apiSettings.profiles as apiProfile (apiProfile.id)}
                  <button
                    type="button"
                    class="hover:bg-accent w-full px-3 py-2 text-left text-sm"
                    onclick={() => copyApiKeyFromProfile(apiProfile)}
                  >
                    {apiProfile.name}
                    <span class="text-muted-foreground text-xs">({apiProfile.providerType})</span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if profileProviderType === 'comfyui' || profileProviderType === 'openai' || profileProviderType === 'zhipu'}
      <div class="space-y-2">
        <Label>Base URL (optional)</Label>
        <Input bind:value={profileBaseUrl} placeholder="Custom base URL" />
      </div>
    {/if}

    <div class="space-y-2">
      <Label>Model</Label>
      <ImageModelSelect
        models={profileModels}
        selectedModelId={profileModel}
        onModelChange={(id) => {
          profileModel = id
        }}
        showCost={true}
        showImg2ImgIndicator={true}
        showDescription={false}
        isLoading={isLoadingProfileModels}
        errorMessage={profileModelsError}
        showRefreshButton={true}
        onRefresh={() => loadProfileFormModels(profileProviderType, profileApiKey)}
      />
      <p class="text-muted-foreground mt-1 text-xs">
        The image model this profile will use for generation.
      </p>
    </div>
  </div>
{/snippet}
