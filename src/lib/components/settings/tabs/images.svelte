<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import * as Select from "$lib/components/ui/select";
  import { Slider } from "$lib/components/ui/slider";
  import { RotateCcw, Loader2 } from "lucide-svelte";
  import { PollinationsImageProvider } from "$lib/services/ai/pollinationsImageProvider";
  import type { ImageModelInfo } from "$lib/services/ai/imageProvider";

  const imageProviders = [
    { value: "nanogpt", label: "NanoGPT" },
    { value: "chutes", label: "Chutes" },
    { value: "pollinations", label: "Pollinations.ai" },
  ] as const;

  const imageStyles = [
    { value: "image-style-soft-anime", label: "Soft Anime" },
    { value: "image-style-semi-realistic", label: "Semi-realistic Anime" },
    { value: "image-style-photorealistic", label: "Photorealistic" },
  ] as const;

  const imageSizes = [
    { value: "512x512", label: "512x512 (Faster)" },
    { value: "1024x1024", label: "1024x1024 (Higher Quality)" },
  ] as const;

  // Pollinations models state
  let pollinationsModels = $state<ImageModelInfo[]>([]);
  let isLoadingPollinationsModels = $state(false);
  let pollinationsModelsError = $state<string | null>(null);

  // Filtered models: only include models that output images (exclude video models)
  const filteredPollinationsModels = $derived(
    pollinationsModels.filter(model => model.outputModalities?.includes('image'))
  );

  // Models that support img2img (for reference image generation)
  const pollinationsImg2ImgModels = $derived(
    filteredPollinationsModels.filter(model => model.supportsImg2Img)
  );

  // Load Pollinations models when provider is selected
  async function loadPollinationsModels() {
    const apiKey = settings.systemServicesSettings.imageGeneration.pollinationsApiKey;
    isLoadingPollinationsModels = true;
    pollinationsModelsError = null;

    try {
      const provider = new PollinationsImageProvider(apiKey, false);
      pollinationsModels = await provider.listModels();
    } catch (error) {
      pollinationsModelsError = error instanceof Error ? error.message : 'Failed to load models';
      console.error('[Settings] Failed to load Pollinations models:', error);
    } finally {
      isLoadingPollinationsModels = false;
    }
  }

  // Ensure selected model is valid for current filtered list
  $effect(() => {
    if (settings.systemServicesSettings.imageGeneration.imageProvider !== 'pollinations') return;
    if (filteredPollinationsModels.length === 0) return;

    const currentModel = settings.systemServicesSettings.imageGeneration.model;
    const modelExists = filteredPollinationsModels.some(m => m.id === currentModel);
    if (!modelExists) {
      // Prefer "zimage" if available, otherwise use first model
      const zimageModel = filteredPollinationsModels.find(m => m.id === 'zimage');
      settings.systemServicesSettings.imageGeneration.model = zimageModel ? 'zimage' : filteredPollinationsModels[0].id;
      settings.saveSystemServicesSettings();
    }
  });

  // Auto-load models when Pollinations is selected
  $effect(() => {
    if (settings.systemServicesSettings.imageGeneration.imageProvider === 'pollinations') {
      loadPollinationsModels();
    }
  });

  // --- Cost Formatting Logic ---
  const AVG_PROMPT_TOKENS = 100;
  const AVG_IMAGE_TOKENS = 1000;

  function formatCost(model: ImageModelInfo, includeImageInputCost = false): string | null {
    let cost =
      (model.costPerImage || 0) +
      (model.costPerTextToken || 0) * AVG_PROMPT_TOKENS;
    if (includeImageInputCost) {
      cost += (model.costPerImageToken || 0) * AVG_IMAGE_TOKENS;
    }
    if (cost <= 0) return null;
    const imagesPerPollen = Math.round(1 / cost);
    if (imagesPerPollen >= 1000) {
      return `${(imagesPerPollen / 1000).toFixed(imagesPerPollen >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
    }
    return String(imagesPerPollen);
  }

  function getModelLabel(model: ImageModelInfo, includeImageInputCost = false): string {
    const cost = formatCost(model, includeImageInputCost);
    const suffix = cost ? ` ~${cost}/day` : "";
    const img2img = model.supportsImg2Img ? " (+img2img)" : "";
    // Only show img2img flag if we aren't already in the "img2img only" list (context dependent, but safe to show)
    return `${model.name}${img2img}${suffix}`;
  }
</script>

<div class="space-y-4">
  <!-- Image Provider Selection -->
  <div>
    <Label class="mb-2 block">Image Provider</Label>
    <Select.Root
      type="single"
      value={settings.systemServicesSettings.imageGeneration.imageProvider ??
        "nanogpt"}
      onValueChange={(v) => {
        const provider = v as "nanogpt" | "chutes" | "pollinations";
        settings.systemServicesSettings.imageGeneration.imageProvider =
          provider;
        if (provider === "chutes") {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            "qwen-image-edit-2511";
        } else if (provider === "pollinations") {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            "kontext";
          settings.systemServicesSettings.imageGeneration.model =
            "zimage";
        } else {
          settings.systemServicesSettings.imageGeneration.referenceModel =
            "qwen-image";
        }
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageProviders.find(
          (p) =>
            p.value ===
            settings.systemServicesSettings.imageGeneration.imageProvider,
        )?.label ?? "Select provider"}
      </Select.Trigger>
      <Select.Content>
        {#each imageProviders as provider}
          <Select.Item value={provider.value} label={provider.label}>
            {provider.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
      Configure your image generation service. Enable image generation for
      specific stories in the Writing Style settings.
    </p>
  </div>

  <!-- NanoGPT API Key -->
  {#if (settings.systemServicesSettings.imageGeneration.imageProvider ?? "nanogpt") === "nanogpt"}
    <div>
      <Label class="mb-2 block">NanoGPT API Key</Label>
      <div class="flex gap-2">
        <Input
          type="password"
          class="flex-1"
          value={settings.systemServicesSettings.imageGeneration.nanoGptApiKey}
          oninput={(e) => {
            settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
              e.currentTarget.value;
            settings.saveSystemServicesSettings();
          }}
          placeholder="Enter your NanoGPT API key"
        />
        {#if settings.apiSettings.profiles.some((p) => p.baseUrl?.includes("nano-gpt.com") && p.apiKey)}
          <Button
            variant="outline"
            onclick={() => {
              const nanoProfile = settings.apiSettings.profiles.find(
                (p) => p.baseUrl?.includes("nano-gpt.com") && p.apiKey,
              );
              if (nanoProfile?.apiKey) {
                settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
                  nanoProfile.apiKey;
                settings.saveSystemServicesSettings();
              }
            }}
          >
            Autofill
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chutes API Key -->
  {#if settings.systemServicesSettings.imageGeneration.imageProvider === "chutes"}
    <div>
      <Label class="mb-2 block">Chutes API Key</Label>
      <Input
        type="password"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.chutesApiKey}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.chutesApiKey =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="Enter your Chutes API key"
      />
    </div>
  {/if}

  <!-- Pollinations API Key -->
  {#if settings.systemServicesSettings.imageGeneration.imageProvider === "pollinations"}
    <div>
      <Label class="mb-2 block">Pollinations.ai API Key</Label>
      <Input
        type="password"
        class="w-full"
        value={settings.systemServicesSettings.imageGeneration.pollinationsApiKey}
        oninput={(e) => {
          settings.systemServicesSettings.imageGeneration.pollinationsApiKey =
            e.currentTarget.value;
          settings.saveSystemServicesSettings();
        }}
        placeholder="sk_..."
      />
      <p class="mt-1 text-xs text-muted-foreground">
        API key for Pollinations.ai image generation. Get one at <a href="https://enter.pollinations.ai" target="_blank" class="text-primary hover:underline">enter.pollinations.ai</a>
      </p>
    </div>
  {/if}

  <!-- Image Model -->
  {#if !settings.systemServicesSettings.imageGeneration.portraitMode}
    <div>
      <Label class="mb-2 block">Image Model</Label>
      {#if settings.systemServicesSettings.imageGeneration.imageProvider === 'pollinations'}
        <!-- Pollinations Model Select -->
        <div class="relative">
          <Select.Root
            type="single"
            value={settings.systemServicesSettings.imageGeneration.model}
            onValueChange={(v) => {
              settings.systemServicesSettings.imageGeneration.model = v;
              settings.saveSystemServicesSettings();
            }}
            disabled={isLoadingPollinationsModels}
          >
            <Select.Trigger class="w-full">
              {#if isLoadingPollinationsModels}
                 <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                 Loading models...
              {:else}
                {filteredPollinationsModels.find(m => m.id === settings.systemServicesSettings.imageGeneration.model)?.name ?? settings.systemServicesSettings.imageGeneration.model}
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each filteredPollinationsModels as model}
                <Select.Item value={model.id} label={getModelLabel(model)}>
                   <div class="flex flex-col items-start gap-0.5">
                    <span>{model.name}</span>
                    <span class="text-xs text-muted-foreground">{getModelLabel(model).replace(model.name, '')}</span>
                   </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
          {#if pollinationsModelsError}
             <p class="text-xs text-destructive mt-1">{pollinationsModelsError}</p>
          {/if}
           <Button variant="ghost" size="sm" class="h-6 text-[10px] absolute -top-7 right-0" onclick={loadPollinationsModels}>
             Refresh
           </Button>
        </div>
        {#if settings.systemServicesSettings.imageGeneration.model}
             {@const selected = filteredPollinationsModels.find(m => m.id === settings.systemServicesSettings.imageGeneration.model)}
             {#if selected?.description}
                 <p class="mt-1 text-xs text-muted-foreground italic">{selected.description}</p>
             {/if}
        {/if}
      {:else}
        <Input
          type="text"
          class="w-full"
          value={settings.systemServicesSettings.imageGeneration.model}
          oninput={(e) => {
            settings.systemServicesSettings.imageGeneration.model =
              e.currentTarget.value;
            settings.saveSystemServicesSettings();
          }}
          placeholder="z-image-turbo"
        />
      {/if}
      <p class="mt-1 text-xs text-muted-foreground">
        The image model to use for generation.
      </p>
    </div>
  {/if}

  <!-- Image Style -->
  <div>
    <Label class="mb-2 block">Image Style</Label>
    <Select.Root
      type="single"
      value={settings.systemServicesSettings.imageGeneration.styleId}
      onValueChange={(v) => {
        settings.systemServicesSettings.imageGeneration.styleId = v;
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageStyles.find(
          (s) =>
            s.value === settings.systemServicesSettings.imageGeneration.styleId,
        )?.label ?? "Select style"}
      </Select.Trigger>
      <Select.Content>
        {#each imageStyles as style}
          <Select.Item value={style.value} label={style.label}>
            {style.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
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
          | "512x512"
          | "1024x1024";
        settings.saveSystemServicesSettings();
      }}
    >
      <Select.Trigger class="h-10 w-full">
        {imageSizes.find(
          (s) =>
            s.value === settings.systemServicesSettings.imageGeneration.size,
        )?.label ?? "Select size"}
      </Select.Trigger>
      <Select.Content>
        {#each imageSizes as size}
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
        ? "Unlimited"
        : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
    </Label>
    <Slider
      value={[
        settings.systemServicesSettings.imageGeneration.maxImagesPerMessage,
      ]}
      onValueChange={(v) => {
        settings.systemServicesSettings.imageGeneration.maxImagesPerMessage =
          v[0];
        settings.saveSystemServicesSettings();
      }}
      min={0}
      max={5}
      step={1}
      class="w-full"
    />
    <p class="mt-1 text-xs text-muted-foreground">
      Maximum images per narrative (0 = unlimited).
    </p>
  </div>

  <!-- Portrait Reference Mode -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Portrait Reference Mode</Label>
      <p class="text-xs text-muted-foreground">
        Use character portraits as reference images when generating story
        images.
      </p>
    </div>
    <Switch
      checked={settings.systemServicesSettings.imageGeneration.portraitMode}
      onCheckedChange={(v) => {
        settings.systemServicesSettings.imageGeneration.portraitMode = v;
        settings.saveSystemServicesSettings();
      }}
    />
  </div>

  {#if settings.systemServicesSettings.imageGeneration.portraitMode}
    <!-- Portrait Generation Model -->
    <div>
      <Label class="mb-2 block">Portrait Generation Model</Label>
      {#if settings.systemServicesSettings.imageGeneration.imageProvider === 'pollinations'}
         <!-- Re-use the same select logic or keep it simpler -->
         <Select.Root
            type="single"
            value={settings.systemServicesSettings.imageGeneration.portraitModel}
            onValueChange={(v) => {
              settings.systemServicesSettings.imageGeneration.portraitModel = v;
              settings.saveSystemServicesSettings();
            }}
            disabled={isLoadingPollinationsModels}
          >
            <Select.Trigger class="w-full">
               {filteredPollinationsModels.find(m => m.id === settings.systemServicesSettings.imageGeneration.portraitModel)?.name ?? settings.systemServicesSettings.imageGeneration.portraitModel}
            </Select.Trigger>
            <Select.Content>
              {#each filteredPollinationsModels as model}
                <Select.Item value={model.id} label={getModelLabel(model)}>
                   <div class="flex flex-col items-start gap-0.5">
                    <span>{model.name}</span>
                   </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
      {:else}
        <Input
          type="text"
          class="w-full"
          value={settings.systemServicesSettings.imageGeneration.portraitModel}
          oninput={(e) => {
            settings.systemServicesSettings.imageGeneration.portraitModel =
              e.currentTarget.value;
            settings.saveSystemServicesSettings();
          }}
          placeholder="z-image-turbo"
        />
      {/if}
      <p class="mt-1 text-xs text-muted-foreground">
        Model used when generating character portraits from visual descriptors.
      </p>
    </div>

    <!-- Reference Image Model -->
    <div>
      <Label class="mb-2 block">Reference Image Model</Label>
      {#if settings.systemServicesSettings.imageGeneration.imageProvider === 'pollinations'}
         <Select.Root
            type="single"
            value={settings.systemServicesSettings.imageGeneration.referenceModel}
            onValueChange={(v) => {
              settings.systemServicesSettings.imageGeneration.referenceModel = v;
              settings.saveSystemServicesSettings();
            }}
            disabled={isLoadingPollinationsModels}
          >
            <Select.Trigger class="w-full">
               {pollinationsImg2ImgModels.find(m => m.id === settings.systemServicesSettings.imageGeneration.referenceModel)?.name ?? settings.systemServicesSettings.imageGeneration.referenceModel}
            </Select.Trigger>
            <Select.Content>
              {#each pollinationsImg2ImgModels as model}
                <Select.Item value={model.id} label={getModelLabel(model, true)}>
                   <div class="flex flex-col items-start gap-0.5">
                    <span>{model.name}</span>
                    <span class="text-xs text-muted-foreground">{getModelLabel(model, true).replace(model.name, '')}</span>
                   </div>
                </Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
      {:else}
        <Input
          type="text"
          class="w-full"
          value={settings.systemServicesSettings.imageGeneration.referenceModel}
          oninput={(e) => {
            settings.systemServicesSettings.imageGeneration.referenceModel =
              e.currentTarget.value;
            settings.saveSystemServicesSettings();
          }}
          placeholder="qwen-image"
        />
      {/if}
      <p class="mt-1 text-xs text-muted-foreground">
        Model used for story images when a character portrait is attached as
        reference.
      </p>
    </div>
  {/if}

  <!-- Reset Button -->
  <Button
    variant="outline"
    size="sm"
    onclick={() => settings.resetImageGenerationSettings()}
  >
    <RotateCcw class="h-3 w-3 mr-1" />
    Reset to Defaults
  </Button>
</div>