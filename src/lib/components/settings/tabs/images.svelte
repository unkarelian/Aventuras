<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { Label } from '$lib/components/ui/label'
  import { Button } from '$lib/components/ui/button'
  import { Autocomplete } from '$lib/components/ui/autocomplete'
  import { Slider } from '$lib/components/ui/slider'
  import { RotateCcw, Info } from 'lucide-svelte'
  import {
    listImageModels,
    clearModelsCache,
    type ImageModelInfo,
  } from '$lib/services/ai/image/modelListing'
  import { PROVIDERS } from '$lib/services/ai/sdk/providers/config'
  import ImageModelSelect from '$lib/components/settings/ImageModelSelect.svelte'
  import type { APIProfile } from '$lib/types'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Alert from '$lib/components/ui/alert'

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

  // Helper to get available sizes for a model
  function getSizesForModel(
    profileId: string | null,
    modelId: string | null,
    models: ImageModelInfo[],
    defaults: ReadonlyArray<{ value: string; label: string }>,
  ) {
    if (!profileId || !modelId) return defaults

    const profile = settings.getProfile(profileId)
    // Only use API-provided sizes for nanoGpt for now
    if (profile?.providerType !== 'nanogpt') return defaults

    const modelInfo = models.find((m) => m.id === modelId)
    if (!modelInfo || !modelInfo.supportsSizes || modelInfo.supportsSizes.length === 0) {
      return defaults
    }

    return modelInfo.supportsSizes.map((size) => ({
      value: size,
      label: size,
    }))
  }

  // Tab state
  let activeTab = $state<'general' | 'characters' | 'backgrounds'>('general')

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

  let backgroundModels = $state<ImageModelInfo[]>([])
  let isLoadingBackgroundModels = $state(false)
  let backgroundModelsError = $state<string | null>(null)

  // Derived available sizes based on selected models
  const availableStandardSizes = $derived(
    getSizesForModel(
      settings.systemServicesSettings.imageGeneration.profileId,
      settings.systemServicesSettings.imageGeneration.model,
      standardModels,
      imageSizes,
    ),
  )

  const availableReferenceSizes = $derived(
    getSizesForModel(
      settings.systemServicesSettings.imageGeneration.referenceProfileId ||
        settings.systemServicesSettings.imageGeneration.profileId,
      settings.systemServicesSettings.imageGeneration.referenceModel,
      referenceModels.length > 0 ? referenceModels : standardModels,
      imageSizes,
    ),
  )

  const availablePortraitSizes = $derived(
    getSizesForModel(
      settings.systemServicesSettings.imageGeneration.portraitProfileId ||
        settings.systemServicesSettings.imageGeneration.profileId,
      settings.systemServicesSettings.imageGeneration.portraitModel,
      portraitModels.length > 0 ? portraitModels : standardModels,
      imageSizes,
    ),
  )

  const availableBackgroundSizes = $derived(
    getSizesForModel(
      settings.systemServicesSettings.imageGeneration.backgroundProfileId ||
        settings.systemServicesSettings.imageGeneration.profileId,
      settings.systemServicesSettings.imageGeneration.backgroundModel,
      backgroundModels.length > 0 ? backgroundModels : standardModels,
      backgroundSizes,
    ),
  )

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
    if (profileId && portraitModels.length === 0 && !isLoadingPortraitModels) {
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
    if (profileId && referenceModels.length === 0 && !isLoadingReferenceModels) {
      loadModelsForProfile(
        profileId,
        (m) => (referenceModels = m),
        (l) => (isLoadingReferenceModels = l),
        (e) => (referenceModelsError = e),
      )
    }
  })

  // Load background models when profile changes (only if background mode enabled)
  $effect(() => {
    const profileId = settings.systemServicesSettings.imageGeneration.backgroundProfileId
    if (profileId && backgroundModels.length === 0 && !isLoadingBackgroundModels) {
      loadModelsForProfile(
        profileId,
        (m) => (backgroundModels = m),
        (l) => (isLoadingBackgroundModels = l),
        (e) => (backgroundModelsError = e),
      )
    }
  })

  // Handle profile change - reload models
  function onProfileChange(
    profileId: string,
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ) {
    const profile = settings.getProfile(profileId)
    if (!profile) return

    switch (type) {
      case 'standard':
        settings.systemServicesSettings.imageGeneration.profileId = profileId
        standardModels = []
        loadModelsForProfile(
          profileId,
          (m) => (standardModels = m),
          (l) => (isLoadingStandardModels = l),
          (e) => (standardModelsError = e),
        )
        break
      case 'portrait':
        settings.systemServicesSettings.imageGeneration.portraitProfileId = profileId
        portraitModels = []
        loadModelsForProfile(
          profileId,
          (m) => (portraitModels = m),
          (l) => (isLoadingPortraitModels = l),
          (e) => (portraitModelsError = e),
        )
        break
      case 'reference':
        settings.systemServicesSettings.imageGeneration.referenceProfileId = profileId
        referenceModels = []
        loadModelsForProfile(
          profileId,
          (m) => (referenceModels = m),
          (l) => (isLoadingReferenceModels = l),
          (e) => (referenceModelsError = e),
        )
        break
      case 'background':
        settings.systemServicesSettings.imageGeneration.backgroundProfileId = profileId
        backgroundModels = []
        loadModelsForProfile(
          profileId,
          (m) => (backgroundModels = m),
          (l) => (isLoadingBackgroundModels = l),
          (e) => (backgroundModelsError = e),
        )
        break
    }

    settings.saveSystemServicesSettings()
  }

  // Get the currently selected profile for a type
  function getSelectedProfile(
    type: 'standard' | 'portrait' | 'reference' | 'background',
  ): APIProfile | undefined {
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
    return profileId ? settings.getProfile(profileId) : undefined
  }

  const imageCapableProfiles = $derived(getImageCapableProfiles())
</script>

<div class="space-y-4">
  <div class="flex items-center justify-end">
    <Button variant="ghost" size="sm" onclick={() => settings.resetImageGenerationSettings()}>
      <RotateCcw class="mr-1 h-3 w-3" />
      Reset to Defaults
    </Button>
  </div>

  <Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v as any)}>
    <Tabs.List class="grid w-full grid-cols-3">
      <Tabs.Trigger value="general">Story Images</Tabs.Trigger>
      <Tabs.Trigger value="characters">Characters</Tabs.Trigger>
      <Tabs.Trigger value="backgrounds">Backgrounds</Tabs.Trigger>
    </Tabs.List>

    <div class="mt-4 min-h-[400px]">
      <!-- General Tab -->
      <Tabs.Content value="general" class="space-y-6">
        <section class="space-y-6">
          <div class="bg-muted/10 space-y-6 rounded-lg border p-4">
            <div class="space-y-3">
              <Alert.Root>
                <Info class="h-4 w-4" />
                <Alert.Title>Story Image Model Selection</Alert.Title>
                <Alert.Description class="text-xs">
                  <ul class="mt-2 list-inside list-disc space-y-1">
                    <li>
                      <strong>Reference Model</strong>: Used when "Portrait Mode" is enabled in your
                      current story. Generates images based on the character portraits.
                    </li>
                    <li>
                      <strong>Regular Image Model</strong>: Used when "Portrait Mode" is disabled in
                      your current story.
                    </li>
                  </ul>
                </Alert.Description>
              </Alert.Root>
            </div>

            <div class="grid gap-6 md:grid-cols-2">
              <!-- Standard Image Configuration -->
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label>Regular Image Profile</Label>
                  <Autocomplete
                    items={imageCapableProfiles}
                    selected={getSelectedProfile('standard')}
                    onSelect={(v) => onProfileChange((v as APIProfile).id, 'standard')}
                    itemLabel={(p: APIProfile) => `${p.name} (${p.providerType})`}
                    itemValue={(p: APIProfile) => p.id}
                    placeholder="Select a profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Regular Image Model</Label>
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
                  </div>
                  <div class="space-y-2">
                    <Label>Regular Image Size</Label>
                    <Autocomplete
                      items={availableStandardSizes}
                      selected={availableStandardSizes.find(
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
                          v as {
                            value: string
                          }
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
                    items={imageCapableProfiles}
                    selected={getSelectedProfile('reference')}
                    onSelect={(v) => onProfileChange((v as APIProfile).id, 'reference')}
                    itemLabel={(p: APIProfile) => `${p.name} (${p.providerType})`}
                    itemValue={(p: APIProfile) => p.id}
                    placeholder="Select a profile"
                  />
                </div>

                {#if settings.systemServicesSettings.imageGeneration.referenceProfileId || settings.systemServicesSettings.imageGeneration.profileId}
                  <div class="space-y-2">
                    <Label>Reference Model</Label>
                    <ImageModelSelect
                      models={referenceImg2ImgModels.length > 0
                        ? referenceImg2ImgModels
                        : referenceModels.length > 0
                          ? referenceModels
                          : standardModels.filter((m) => m.supportsImg2Img)}
                      selectedModelId={settings.systemServicesSettings.imageGeneration
                        .referenceModel}
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
                  </div>
                  <div class="space-y-2">
                    <Label>Reference Image Size</Label>
                    <Autocomplete
                      items={availableReferenceSizes}
                      selected={availableReferenceSizes.find(
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
                          v as {
                            value: string
                          }
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
          <!-- Portrait Profile -->
          <div class="space-y-2">
            <Label>Character Portrait Profile</Label>
            <Autocomplete
              items={imageCapableProfiles}
              selected={getSelectedProfile('portrait')}
              onSelect={(v) => onProfileChange((v as APIProfile).id, 'portrait')}
              itemLabel={(p: APIProfile) => `${p.name} (${p.providerType})`}
              itemValue={(p: APIProfile) => p.id}
              placeholder="Select a profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating character portraits.
            </p>
          </div>

          <!-- Portrait Model -->
          {#if settings.systemServicesSettings.imageGeneration.portraitProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <Label>Character Portrait Model</Label>
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
            <div class="space-y-2">
              <Label>Character Portrait Size</Label>
              <Autocomplete
                items={availablePortraitSizes}
                selected={availablePortraitSizes.find(
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
                    v as {
                      value: string
                    }
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

          <!-- Portrait Style -->
          <div class="space-y-2">
            <Label>Character Portrait Style</Label>
            <Autocomplete
              items={imageStyles}
              selected={imageStyles.find(
                (s) => s.value === settings.systemServicesSettings.imageGeneration.portraitStyleId,
              )}
              onSelect={(v) => {
                settings.systemServicesSettings.imageGeneration.portraitStyleId = (
                  v as {
                    value: string
                  }
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
          <!-- Background Profile -->
          <div class="space-y-2">
            <Label>Background Profile</Label>
            <Autocomplete
              items={imageCapableProfiles}
              selected={getSelectedProfile('background')}
              onSelect={(v) => onProfileChange((v as APIProfile).id, 'background')}
              itemLabel={(p: APIProfile) => `${p.name} (${p.providerType})`}
              itemValue={(p: APIProfile) => p.id}
              placeholder="Select a profile"
            />
            <p class="text-muted-foreground mt-1 text-xs">
              Profile used for generating background scenes.
            </p>
          </div>

          <!-- Background Model -->
          {#if settings.systemServicesSettings.imageGeneration.backgroundProfileId || settings.systemServicesSettings.imageGeneration.profileId}
            <div class="space-y-2">
              <Label>Background Model</Label>
              <ImageModelSelect
                models={backgroundModels.length > 0 ? backgroundModels : standardModels}
                selectedModelId={settings.systemServicesSettings.imageGeneration.backgroundModel}
                onModelChange={(id) => {
                  settings.systemServicesSettings.imageGeneration.backgroundModel = id
                  settings.saveSystemServicesSettings()
                }}
                showCost={true}
                showImg2ImgIndicator={false}
                isLoading={isLoadingBackgroundModels || isLoadingStandardModels}
                errorMessage={backgroundModelsError || standardModelsError}
                showRefreshButton={true}
                onRefresh={() => {
                  const profileId =
                    settings.systemServicesSettings.imageGeneration.backgroundProfileId ||
                    settings.systemServicesSettings.imageGeneration.profileId
                  loadModelsForProfile(
                    profileId,
                    (m) => (backgroundModels = m),
                    (l) => (isLoadingBackgroundModels = l),
                    (e) => (backgroundModelsError = e),
                    true,
                  )
                }}
              />
              <p class="text-muted-foreground mt-1 text-xs">
                Model used for generating background scenes.
              </p>
            </div>
          {/if}

          <!-- Background Size -->
          <div class="space-y-2">
            <Label>Background Size</Label>
            <Autocomplete
              items={availableBackgroundSizes}
              selected={availableBackgroundSizes.find(
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
                  v as {
                    value: string
                  }
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

          <!-- Background Blur -->
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
