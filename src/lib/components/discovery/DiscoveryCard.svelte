<script lang="ts">
  import type { DiscoveryCard } from '$lib/services/discovery';
  import { Download, Loader2, Check, Eye } from 'lucide-svelte';
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";

  type NsfwMode = 'disable' | 'blur' | 'enable';

  interface Props {
    card: DiscoveryCard;
    onImport: (card: DiscoveryCard) => void;
    onViewDetails?: (card: DiscoveryCard) => void;
    isImported?: boolean;
    nsfwMode?: NsfwMode;
  }

  let { card, onImport, onViewDetails, isImported = false, nsfwMode = 'disable' }: Props = $props();

  // Hide card entirely if NSFW is disabled and card is NSFW
  let isHidden = $derived(nsfwMode === 'disable' && card.nsfw);
  let shouldBlur = $derived(nsfwMode === 'blur' && card.nsfw);

  let imageError = $state(false);

  function handleImageError() {
    imageError = true;
  }

  function handleImportClick(e: MouseEvent) {
    e.stopPropagation();
    if (!isImported) {
      onImport(card);
    }
  }

  function handleCardClick() {
    onViewDetails?.(card);
  }
</script>

{#if !isHidden}
<Card 
  class="group overflow-hidden transition-all hover:border-primary/50 hover:shadow-lg h-full flex flex-col cursor-pointer active:scale-[0.98] active:transition-none"
  onclick={handleCardClick}
>
  <!-- Image -->
  <div
    class="relative aspect-square w-full overflow-hidden bg-muted"
  >
    <div class="absolute inset-0 h-full w-full" class:blur-lg={shouldBlur}>
      {#if !imageError && (card.imageUrl || card.avatarUrl)}
        <img
          src={card.imageUrl || card.avatarUrl}
          alt={card.name}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
          onerror={handleImageError}
          loading="lazy"
        />
      {:else}
        <div class="flex h-full w-full items-center justify-center text-muted-foreground">
          <span class="text-4xl">?</span>
        </div>
      {/if}
    </div>

    <!-- NSFW Badge -->
    {#if card.nsfw}
      <Badge variant="destructive" class="absolute left-2 top-2 z-20">
        NSFW
      </Badge>
    {/if}

    <!-- Source Badge -->
    <Badge variant="secondary" class="absolute right-2 top-2 z-20 opacity-90">
      {card.source}
    </Badge>

    <!-- Imported Badge (Visible always if imported) -->
    {#if isImported}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 backdrop-blur-[1px] z-10">
        <Badge variant="outline" class="gap-1.5 border-green-500/50 bg-green-500/10 text-green-500">
          <Check class="h-3.5 w-3.5" />
          Imported
        </Badge>
      </div>
    {/if}

    <!-- Hover Actions (Only visible when NOT imported) -->
    {#if !isImported}
      <div class="absolute inset-0 hidden sm:flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 p-4">
        <Button
           size="icon"
           variant="secondary"
           onclick={(e) => { e.stopPropagation(); handleCardClick(); }}
           class="h-9 w-9 shrink-0"
           title="View Details"
        >
           <Eye class="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          onclick={handleImportClick}
          class="gap-1.5 min-w-[90px]"
        >
          <Download class="h-4 w-4" />
          Import
        </Button>
      </div>
    {/if}
  </div>

  <!-- Info -->
  <CardContent class="flex flex-1 flex-col gap-1 p-3">
    <h3 class="line-clamp-1 text-sm font-medium leading-none" title={card.name}>
      {card.name}
    </h3>
    {#if card.creator}
      <p class="line-clamp-1 text-xs text-muted-foreground">
        by {card.creator}
      </p>
    {/if}
    {#if card.description}
      <p class="mt-1 line-clamp-2 text-xs text-muted-foreground">
        {card.description}
      </p>
    {/if}

    <!-- Tags -->
    {#if card.tags.length > 0}
      <div class="mt-auto flex flex-wrap gap-1 pt-2">
        {#each card.tags.slice(0, 3) as tag}
          <Badge variant="outline" class="text-[10px] px-1 py-0 h-5 font-normal">
            {tag}
          </Badge>
        {/each}
        {#if card.tags.length > 3}
          <Badge variant="outline" class="text-[10px] px-1 py-0 h-5 font-normal">
            +{card.tags.length - 3}
          </Badge>
        {/if}
      </div>
    {/if}
  </CardContent>
</Card>
{/if}
