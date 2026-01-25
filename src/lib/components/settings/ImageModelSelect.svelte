<script lang="ts">
  import type { ImageModelInfo } from "$lib/services/ai/imageProvider";
  import { Loader2 } from "lucide-svelte";

  interface Props {
    models: ImageModelInfo[];
    value: string;
    onchange: (value: string) => void;
    loading?: boolean;
    error?: string | null;
    showDescription?: boolean;
    showCost?: boolean;
    showImg2Img?: boolean;
    includeImageInputCost?: boolean;
    placeholder?: string;
    disabled?: boolean;
    onRefresh?: () => void;
  }

  let {
    models,
    value,
    onchange,
    loading = false,
    error = null,
    showDescription = true,
    showCost = true,
    showImg2Img = false,
    includeImageInputCost = false,
    placeholder = "Select model...",
    disabled = false,
    onRefresh,
  }: Props = $props();

  const AVG_PROMPT_TOKENS = 100;
  const AVG_IMAGE_TOKENS = 1000; // Approximate tokens for a reference image

  function formatCost(model: ImageModelInfo): string | null {
    let cost =
      (model.costPerImage || 0) +
      (model.costPerTextToken || 0) * AVG_PROMPT_TOKENS;
    if (includeImageInputCost) {
      cost += (model.costPerImageToken || 0) * AVG_IMAGE_TOKENS;
    }
    if (cost <= 0) return null;
    const perPollen = Math.round(1 / cost);
    if (perPollen >= 1000) {
      return `${(perPollen / 1000).toFixed(perPollen >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
    }
    return String(perPollen);
  }

  const selectedModel = $derived(models.find((m) => m.id === value));
</script>

<div class="space-y-1">
  <div class="relative">
    <select
      class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
      {value}
      disabled={disabled || loading}
      onchange={(e) => onchange(e.currentTarget.value)}
    >
      {#if models.length === 0 && !loading}
        <option {value}>{value || placeholder}</option>
      {:else}
        {#each models as model}
          {@const cost = showCost ? formatCost(model) : null}
          <option value={model.id}>
            {model.name}{showImg2Img && model.supportsImg2Img
              ? " (+img2img)"
              : ""}{cost ? ` ~${cost}/day` : ""}
          </option>
        {/each}
      {/if}
    </select>
    {#if loading}
      <div class="absolute right-8 top-1/2 -translate-y-1/2">
        <Loader2 class="h-4 w-4 animate-spin text-surface-400" />
      </div>
    {/if}
  </div>

  {#if showDescription && selectedModel?.description}
    <p class="text-xs text-surface-400 italic">{selectedModel.description}</p>
  {/if}

  {#if error}
    <p class="text-xs text-red-400">{error}</p>
  {/if}

  {#if onRefresh}
    <button
      type="button"
      class="text-xs text-accent-400 hover:text-accent-300"
      onclick={onRefresh}
      disabled={loading}
    >
      {#if loading}Loading...{:else}Refresh models{/if}
    </button>
  {/if}
</div>
