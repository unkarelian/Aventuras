<script lang="ts">
  import type { ImageModelInfo } from "$lib/services/ai/imageProvider";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Loader2 } from "lucide-svelte";

  interface Props {
    // Model data
    models: ImageModelInfo[];
    selectedModelId: string;

    // Callbacks
    onModelChange: (modelId: string) => void;

    // Cost calculation
    includeImageInputCost?: boolean;

    // UI enhancements
    showLoadingState?: boolean;
    isLoading?: boolean;
    errorMessage?: string | null;
    showRefreshButton?: boolean;
    onRefresh?: () => void;
    showDescription?: boolean;

    // Accessibility
    disabled?: boolean;
    class?: string;
  }

  let {
    models,
    selectedModelId,
    onModelChange,
    includeImageInputCost = false,
    showLoadingState = false,
    isLoading = false,
    errorMessage = null,
    showRefreshButton = false,
    onRefresh,
    showDescription = false,
    disabled = false,
    class: className = "",
  }: Props = $props();

  // Cost formatting
  const AVG_PROMPT_TOKENS = 100;
  const AVG_IMAGE_TOKENS = 1000;

  function formatCost(model: ImageModelInfo, includeImageInput: boolean): string | null {
    let cost =
      (model.costPerImage || 0) +
      (model.costPerTextToken || 0) * AVG_PROMPT_TOKENS;
    if (includeImageInput) {
      cost += (model.costPerImageToken || 0) * AVG_IMAGE_TOKENS;
    }
    if (cost <= 0) return null;
    const imagesPerPollen = Math.round(1 / cost);
    if (imagesPerPollen >= 1000) {
      return `${(imagesPerPollen / 1000).toFixed(imagesPerPollen >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
    }
    return String(imagesPerPollen);
  }

  function getModelSuffix(model: ImageModelInfo): string {
    const cost = formatCost(model, includeImageInputCost);
    const costSuffix = cost ? ` ~${cost}/day` : "";
    const img2img = model.supportsImg2Img ? " (+img2img)" : "";
    return `${img2img}${costSuffix}`;
  }

  function getModelLabel(model: ImageModelInfo): string {
    return `${model.name}${getModelSuffix(model)}`;
  }

  let selectedModel = $derived(models.find(m => m.id === selectedModelId));
</script>

<div class="relative {className}">
  <Select.Root
    type="single"
    value={selectedModelId}
    onValueChange={onModelChange}
    disabled={disabled || isLoading}
  >
    <Select.Trigger class="w-full">
      {#if showLoadingState && isLoading}
        <Loader2 class="mr-2 h-4 w-4 animate-spin" />
        Loading models...
      {:else}
        {selectedModel?.name ?? selectedModelId}
      {/if}
    </Select.Trigger>
    <Select.Content>
      {#each models as model}
        <Select.Item value={model.id} label={getModelLabel(model)}>
          <div class="flex flex-col items-start gap-0.5">
            <span>{model.name}</span>
            <span class="text-xs text-muted-foreground">
              {getModelSuffix(model)}
            </span>
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  {#if errorMessage}
    <p class="text-xs text-destructive mt-1">{errorMessage}</p>
  {/if}

  {#if showRefreshButton && onRefresh}
    <Button
      variant="ghost"
      size="sm"
      class="h-6 text-[10px] absolute -top-7 right-0"
      onclick={onRefresh}
    >
      Refresh
    </Button>
  {/if}
</div>

{#if showDescription && selectedModel?.description}
  <p class="mt-1 text-xs text-muted-foreground italic">
    {selectedModel.description}
  </p>
{/if}
