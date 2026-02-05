<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { Switch } from '$lib/components/ui/switch'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import * as Select from '$lib/components/ui/select'
  import { Slider } from '$lib/components/ui/slider'
  import { RotateCcw } from 'lucide-svelte'
  import {
    listImageModels,
    clearModelsCache,
    type ImageModelInfo,
  } from '$lib/services/ai/image/modelListing'
  import { PROVIDERS } from '$lib/services/ai/sdk/providers/config'
  import ImageModelSelect from '$lib/components/settings/ImageModelSelect.svelte'
  import type { APIProfile } from '$lib/types'

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

  // Get profiles that support image generation
  function getImageCapableProfiles(): APIProfile[] {
    return settings.apiSettings.profiles.filter(
      (p) => PROVIDERS[p.providerType]?.capabilities.imageGeneration,
    )
  }

  // Models state for each profile type
  let standardModels = $state<ImageModelInfo[]>([])
  let isLoadingStandardModels = $state(false)
  let standardModelsError = $state<string | null>(null)

  let portraitModels = $state<ImageModelInfo[]>([])
  let isLoadingPortraitModels = $state(false)
  let portraitModelsError = $state<string | null>(null)

  let referenceModels = $state<ImageModelInfo[]>([])
  let isLoadingReferenceModels = $state(false)
  let referenceModelsError = $state<string | null>(null)

  // Filtered models for img2img (reference)
  const referenceImg2ImgModels = $derived(referenceModels.filter((m) => m.supportsImg2Img))

  // Load models for a profile
  async function loadModelsForProfile(
    profileId: string | null,
    setModels: (models: ImageModelInfo[]) => void,
    setLoading: (loading: boolean) => void,
    setError: (error: string | null) => void,
    forceRefresh = false,
  ) {
    if (!profileId) {
      setModels([])
      return
    }

    const profile = settings.getProfile(profileId)
    if (!profile) {
      setModels([])
      return
    }

    if (forceRefresh) {
      clearModelsCache(profile.providerType)
    }

    setLoading(true)
    setError(null)

    try {
      const models = await listImageModels(profile.providerType, profile.apiKey)
      setModels(models)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load models')
    } finally {
      setLoading(false)
    }
  }

  // Auto-select first image-capable profile if enabled but no profile selected
  $effect(() => {
    const imgSettings = settings.systemServicesSettings.imageGeneration
    if (imgSettings.enabled && !imgSettings.profileId) {
      const profiles = getImageCapableProfiles()
      if (profiles.length > 0) {
        settings.systemServicesSettings.imageGeneration.profileId = profiles[0].id
        settings.saveSystemServicesSettings()
      }
    }
  })

  // Load standard models when profile changes
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.profileId
    if (profileId && standardModels.length === 0 && !isLoadingStandardModels) {
      loadModelsForProfile(
        profileId,
        (m) => (standardModels = m),
        (l) => (isLoadingStandardModels = l),
        (e) => (standardModelsError = e),
      )
    }
  })

  // Load portrait models when profile changes (only if portrait mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.portraitProfileId
    const portraitMode = settings.systemServicesSettings.imageGeneration.portraitMode
    if (portraitMode && profileId && portraitModels.length === 0 && !isLoadingPortraitModels) {
      loadModelsForProfile(
        profileId,
        (m) => (portraitModels = m),
        (l) => (isLoadingPortraitModels = l),
        (e) => (portraitModelsError = e),
      )
    }
  })

  // Load reference models when profile changes (only if portrait mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.referenceProfileId
    const portraitMode = settings.systemServicesSettings.imageGeneration.portraitMode
    if (portraitMode && profileId && referenceModels.length === 0 && !isLoadingReferenceModels) {
      loadModelsForProfile(
        profileId,
        (m) => (referenceModels = m),
        (l) => (isLoadingReferenceModels = l),
        (e) => (referenceModelsError = e),
      )
    }
  })

  // Handle profile change - reload models
  function onProfileChange(profileId: string, type: 'standard' | 'portrait' | 'reference') {
    const profile = settings.getProfile(profileId)
    if (!profile) return

    if (type === 'standard') {
      settings.systemServicesSettings.imageGeneration.profileId = profileId
      standardModels = []
      loadModelsForProfile(
        profileId,
        (m) => (standardModels = m),
        (l) => (isLoadingStandardModels = l),
        (e) => (standardModelsError = e),
      )
    } else if (type === 'portrait') {
      settings.systemServicesSettings.imageGeneration.portraitProfileId = profileId
      portraitModels = []
      loadModelsForProfile(
        profileId,
        (m) => (portraitModels = m),
        (l) => (isLoadingPortraitModels = l),
        (e) => (portraitModelsError = e),
      )
    } else {
      settings.systemServicesSettings.imageGeneration.referenceProfileId = profileId
      referenceModels = []
      loadModelsForProfile(
        profileId,
        (m) => (referenceModels = m),
        (l) => (isLoadingReferenceModels = l),
        (e) => (referenceModelsError = e),
      )
    }
    settings.saveSystemServicesSettings()
  }

  // Get the currently selected profile for a type
  function getSelectedProfile(type: 'standard' | 'portrait' | 'reference'): APIProfile | undefined {
    const profileId =
      type === 'standard'
        ? settings.systemServicesSettings.imageGeneration.profileId
        : type === 'portrait'
          ? settings.systemServicesSettings.imageGeneration.portraitProfileId
          : settings.systemServicesSettings.imageGeneration.referenceProfileId
    return profileId ? settings.getProfile(profileId) : undefined
  }

  const imageCapableProfiles = $derived(getImageCapableProfiles())
</script>

<div class="space-y-4">
  <!-- Enable Image Generation Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Enable Image Generation</Label>
      <p class="text-muted-foreground text-xs">
        Enable AI-powered image generation for stories and portraits.
      </p>
    </div>
    <Switch
      checked={settings.systemServicesSettings.imageGeneration.enabled}
      onCheckedChange={(v) => {
        settings.systemServicesSettings.imageGeneration.enabled = v
        // Auto-select first image-capable profile when enabling if none selected
        if (v && !settings.systemServicesSettings.imageGeneration.profileId) {
          const profiles = getImageCapableProfiles()
          if (profiles.length > 0) {
            settings.systemServicesSettings.imageGeneration.profileId = profiles[0].id
          }
        }
        settings.saveSystemServicesSettings()
      }}
    />
  </div>

  {#if settings.systemServicesSettings.imageGeneration.enabled}
    <!-- No profiles warning -->
    {#if imageCapableProfiles.length === 0}
      <div class="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-4">
        <p class="text-sm text-yellow-600 dark:text-yellow-400">
          No API profiles with image generation support found. Create a profile for OpenAI, NanoGPT,
          Chutes, Pollinations, or Google in the API Profiles tab.
        </p>
      </div>
    {:else}
      <!-- Standard Image Profile -->
      <div>
        <Label class="mb-2 block">Image Generation Profile</Label>
        <Select.Root
          type="single"
          value={settings.systemServicesSettings.imageGeneration.profileId ?? ''}
          onValueChange={(v) => onProfileChange(v, 'standard')}
        >
          <Select.Trigger class="h-10 w-full">
            {#if getSelectedProfile('standard')}
              {getSelectedProfile('standard')?.name} ({getSelectedProfile('standard')
                ?.providerType})
            {:else}
              Select a profile
            {/if}
          </Select.Trigger>
          <Select.Content>
            {#each imageCapableProfiles as profile (profile.id)}
              <Select.Item value={profile.id} label={`${profile.name} (${profile.providerType})`}>
                {profile.name} <span class="text-muted-foreground">({profile.providerType})</span>
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground mt-1 text-xs">
          Select the API profile to use for image generation.
        </p>
      </div>

      <!-- Image Model (only show when not in portrait mode) -->
      {#if settings.systemServicesSettings.imageGeneration.profileId && !settings.systemServicesSettings.imageGeneration.portraitMode}
        <div>
          <Label class="mb-2 block">Image Model</Label>
          <ImageModelSelect
            models={standardModels}
            selectedModelId={settings.systemServicesSettings.imageGeneration.model}
            onModelChange={(id) => {
              settings.systemServicesSettings.imageGeneration.model = id
              settings.saveSystemServicesSettings()
            }}
            showCost={true}
            showImg2ImgIndicator={true}
            showDescription={false}
            isLoading={isLoadingStandardModels}
            errorMessage={standardModelsError}
            showRefreshButton={true}
            onRefresh={() =>
              loadModelsForProfile(
                settings.systemServicesSettings.imageGeneration.profileId,
                (m) => (standardModels = m),
                (l) => (isLoadingStandardModels = l),
                (e) => (standardModelsError = e),
                true,
              )}
          />
          <p class="text-muted-foreground mt-1 text-xs">The image model to use for generation.</p>
        </div>
      {/if}

      <!-- Image Style -->
      <div>
        <Label class="mb-2 block">Image Style</Label>
        <Select.Root
          type="single"
          value={settings.systemServicesSettings.imageGeneration.styleId}
          onValueChange={(v) => {
            settings.systemServicesSettings.imageGeneration.styleId = v
            settings.saveSystemServicesSettings()
          }}
        >
          <Select.Trigger class="h-10 w-full">
            {imageStyles.find(
              (s) => s.value === settings.systemServicesSettings.imageGeneration.styleId,
            )?.label ?? 'Select style'}
          </Select.Trigger>
          <Select.Content>
            {#each imageStyles as style (style.value)}
              <Select.Item value={style.value} label={style.label}>
                {style.label}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="text-muted-foreground mt-1 text-xs">
          Visual style for generated images. Edit styles in the Prompts tab.
        </p>
      </div>

      <!-- Image Size -->
      <div>
        <Label class="mb-2 block">Image Size</Label>
        <Select.Root
          type="single"
          value={settings.systemServicesSettings.imageGeneration.size}
          onValueChange={(v) => {
            settings.systemServicesSettings.imageGeneration.size = v as
              | '512x512'
              | '1024x1024'
              | '2048x2048'
            settings.saveSystemServicesSettings()
          }}
        >
          <Select.Trigger class="h-10 w-full">
            {imageSizes.find(
              (s) => s.value === settings.systemServicesSettings.imageGeneration.size,
            )?.label ?? 'Select size'}
          </Select.Trigger>
          <Select.Content>
            {#each imageSizes as size (size.value)}
              <Select.Item value={size.value} label={size.label}>
                {size.label}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <!-- Max Images Per Message -->
      <div>
        <Label class="mb-2 block">
          Max Images Per Message: {settings.systemServicesSettings.imageGeneration
            .maxImagesPerMessage === 0
            ? 'Unlimited'
            : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
        </Label>
        <Slider
          type="multiple"
          value={[settings.systemServicesSettings.imageGeneration.maxImagesPerMessage]}
          onValueChange={(v: number[]) => {
            settings.systemServicesSettings.imageGeneration.maxImagesPerMessage = v[0]
            settings.saveSystemServicesSettings()
          }}
          min={0}
          max={5}
          step={1}
          class="w-full"
        />
        <p class="text-muted-foreground mt-1 text-xs">
          Maximum images per narrative (0 = unlimited).
        </p>
      </div>

      <!-- Portrait Reference Mode -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Portrait Reference Mode</Label>
          <p class="text-muted-foreground text-xs">
            Use character portraits as reference images when generating story images.
          </p>
        </div>
        <Switch
          checked={settings.systemServicesSettings.imageGeneration.portraitMode}
          onCheckedChange={(v) => {
            settings.systemServicesSettings.imageGeneration.portraitMode = v
            settings.saveSystemServicesSettings()
          }}
        />
      </div>

      {#if settings.systemServicesSettings.imageGeneration.portraitMode}
        <!-- Portrait Generation Profile -->
        <div>
          <Label class="mb-2 block">Portrait Generation Profile</Label>
          <Select.Root
            type="single"
            value={settings.systemServicesSettings.imageGeneration.portraitProfileId ??
              settings.systemServicesSettings.imageGeneration.profileId ??
              ''}
            onValueChange={(v) => onProfileChange(v, 'portrait')}
          >
            <Select.Trigger class="h-10 w-full">
              {#if getSelectedProfile('portrait') || getSelectedProfile('standard')}
                {(getSelectedProfile('portrait') || getSelectedProfile('standard'))?.name}
                ({(getSelectedProfile('portrait') || getSelectedProfile('standard'))?.providerType})
              {:else}
                Select a profile
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each imageCapableProfiles as profile (profile.id)}
                <Select.Item value={profile.id} label={`${profile.name} (${profile.providerType})`}>
                  {profile.name} <span class="text-muted-foreground">({profile.providerType})</span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-muted-foreground mt-1 text-xs">
            Profile used for generating character portraits.
          </p>
        </div>

        <!-- Portrait Model -->
        {#if settings.systemServicesSettings.imageGeneration.portraitProfileId || settings.systemServicesSettings.imageGeneration.profileId}
          <div>
            <Label class="mb-2 block">Portrait Generation Model</Label>
            <ImageModelSelect
              models={portraitModels.length > 0 ? portraitModels : standardModels}
              selectedModelId={settings.systemServicesSettings.imageGeneration.portraitModel}
              onModelChange={(id) => {
                settings.systemServicesSettings.imageGeneration.portraitModel = id
                settings.saveSystemServicesSettings()
              }}
              showCost={true}
              showImg2ImgIndicator={true}
              isLoading={isLoadingPortraitModels || isLoadingStandardModels}
              errorMessage={portraitModelsError || standardModelsError}
              showRefreshButton={true}
              onRefresh={() => {
                const profileId =
                  settings.systemServicesSettings.imageGeneration.portraitProfileId ||
                  settings.systemServicesSettings.imageGeneration.profileId
                loadModelsForProfile(
                  profileId,
                  (m) => (portraitModels = m),
                  (l) => (isLoadingPortraitModels = l),
                  (e) => (portraitModelsError = e),
                  true,
                )
              }}
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Model used when generating character portraits from visual descriptors.
            </p>
          </div>
        {/if}

        <!-- Reference Image Profile -->
        <div>
          <Label class="mb-2 block">Reference Image Profile</Label>
          <Select.Root
            type="single"
            value={settings.systemServicesSettings.imageGeneration.referenceProfileId ??
              settings.systemServicesSettings.imageGeneration.profileId ??
              ''}
            onValueChange={(v) => onProfileChange(v, 'reference')}
          >
            <Select.Trigger class="h-10 w-full">
              {#if getSelectedProfile('reference') || getSelectedProfile('standard')}
                {(getSelectedProfile('reference') || getSelectedProfile('standard'))?.name}
                ({(getSelectedProfile('reference') || getSelectedProfile('standard'))
                  ?.providerType})
              {:else}
                Select a profile
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each imageCapableProfiles as profile (profile.id)}
                <Select.Item value={profile.id} label={`${profile.name} (${profile.providerType})`}>
                  {profile.name} <span class="text-muted-foreground">({profile.providerType})</span>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          <p class="text-muted-foreground mt-1 text-xs">
            Profile used for image-to-image generation with portrait references.
          </p>
        </div>

        <!-- Reference Model -->
        {#if settings.systemServicesSettings.imageGeneration.referenceProfileId || settings.systemServicesSettings.imageGeneration.profileId}
          <div>
            <Label class="mb-2 block">Reference Image Model</Label>
            <ImageModelSelect
              models={referenceImg2ImgModels.length > 0
                ? referenceImg2ImgModels
                : referenceModels.length > 0
                  ? referenceModels
                  : standardModels.filter((m) => m.supportsImg2Img)}
              selectedModelId={settings.systemServicesSettings.imageGeneration.referenceModel}
              onModelChange={(id) => {
                settings.systemServicesSettings.imageGeneration.referenceModel = id
                settings.saveSystemServicesSettings()
              }}
              showCost={true}
              showImg2ImgIndicator={false}
              isLoading={isLoadingReferenceModels || isLoadingStandardModels}
              errorMessage={referenceModelsError || standardModelsError}
              showRefreshButton={true}
              onRefresh={() => {
                const profileId =
                  settings.systemServicesSettings.imageGeneration.referenceProfileId ||
                  settings.systemServicesSettings.imageGeneration.profileId
                loadModelsForProfile(
                  profileId,
                  (m) => (referenceModels = m),
                  (l) => (isLoadingReferenceModels = l),
                  (e) => (referenceModelsError = e),
                  true,
                )
              }}
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Model used for story images when a character portrait is attached as reference.
            </p>
          </div>
        {/if}
      {/if}

      <!-- Reset Button -->
      <Button variant="outline" size="sm" onclick={() => settings.resetImageGenerationSettings()}>
        <RotateCcw class="mr-1 h-3 w-3" />
        Reset to Defaults
      </Button>
    {/if}
  {/if}
</div>
