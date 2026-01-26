<script lang="ts">
  import type { DiscoveryCard } from "$lib/services/discovery";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Download,
    ArrowLeft,
    Eye,
    Download as DownloadIcon,
    AlertTriangle,
    ChevronsUpDown,
  } from "lucide-svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { slide } from "svelte/transition";
  import { discoveryService } from "$lib/services/discovery";
  import { Loader2 } from "lucide-svelte";

  interface Props {
    card: DiscoveryCard;
    onBack: () => void;
    onImport: (card: DiscoveryCard) => void;
    isImported?: boolean;
    nsfwMode?: "disable" | "blur" | "enable";
  }

  let {
    card,
    onBack,
    onImport,
    isImported = false,
    nsfwMode = "disable",
  }: Props = $props();

  let shouldBlur = $derived(nsfwMode === "blur" && card.nsfw);
  let imageError = $state(false);
  let isRawDataOpen = $state(false);
  let detailedCard = $state<DiscoveryCard>(card);
  let isLoadingDetails = $state(false);

  function handleImageError() {
    imageError = true;
  }

  $effect(() => {
    // Reset detailed card when prop changes
    detailedCard = card;

    // Fetch details if available
    const loadDetails = async () => {
      isLoadingDetails = true;
      try {
        const fullCard = await discoveryService.getCardDetails(card);
        detailedCard = fullCard;
      } catch (e) {
        console.error("Failed to load card details", e);
      } finally {
        isLoadingDetails = false;
      }
    };

    loadDetails();
  });
</script>

<div class="flex flex-col h-full w-full bg-background">
  <!-- Header (Mobile: Back + Title) -->
  <div
    class="flex items-center gap-2 p-3 sm:p-4 border-b shrink-0 bg-background z-10 sticky top-0 -mt-2.5 sm:mt-0 pt-1.5 sm:pt-4"
  >
    <Button
      variant="ghost"
      size="icon"
      onclick={onBack}
      class="h-8 w-8 shrink-0 order-2 sm:order-1 sm:-ml-2"
    >
      <ArrowLeft class="h-5 w-5" />
      <span class="sr-only">Back</span>
    </Button>
    <h2
      class="font-semibold text-lg truncate flex-1 text-left order-1 sm:order-2"
    >
      {card.name}
    </h2>
    {#if isImported}
      <Badge
        variant="outline"
        class="border-green-500/50 text-green-500 bg-green-500/10 shrink-0 hidden sm:inline-flex order-3"
      >
        Imported
      </Badge>
    {/if}
  </div>

  <!-- Content Area - Native scrolling for better mobile behavior -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    <div class="flex flex-col md:flex-row gap-6 max-w-5xl mx-auto">
      <!-- Image Section -->
      <div class="w-full md:w-1/3 shrink-0 space-y-4">
        <div
          class="relative aspect-square w-full rounded-lg overflow-hidden bg-muted border shadow-sm"
        >
          <div
            class="absolute inset-0 h-full w-full"
            class:blur-xl={shouldBlur}
          >
            {#if !imageError && (card.imageUrl || card.avatarUrl)}
              <img
                src={card.imageUrl || card.avatarUrl}
                alt={card.name}
                class="w-full h-full object-cover"
                onerror={handleImageError}
              />
            {:else}
              <div
                class="flex h-full w-full items-center justify-center text-muted-foreground"
              >
                <span class="text-6xl">?</span>
              </div>
            {/if}
          </div>

          {#if card.nsfw}
            <Badge
              variant="destructive"
              class="absolute left-2 top-2 z-10 shadow-sm"
            >
              NSFW
            </Badge>
          {/if}

          <Badge
            variant="secondary"
            class="absolute right-2 top-2 z-10 opacity-90 shadow-sm"
          >
            {card.source}
          </Badge>
        </div>

        <!-- Mobile Import Button -->
        <div
          class="md:hidden sticky bottom-0 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60"
        >
          <Button
            size="lg"
            variant={isImported ? "secondary" : "default"}
            class="w-full gap-2 shadow-md"
            disabled={isImported}
            onclick={() => onImport(detailedCard)}
          >
            {#if isImported}
              Imported
            {:else}
              <Download class="h-5 w-5" />
              Import Card
            {/if}
          </Button>
        </div>
      </div>

      <!-- Info Section -->
      <div class="flex-1 space-y-6 pb-8 min-w-0">
        <!-- Metadata -->
        <div class="space-y-4">
          <div>
            <h1 class="text-2xl font-bold hidden md:block">{card.name}</h1>
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
            >
              {#if card.creator}
                <span class="font-medium text-foreground"
                  >By {card.creator}</span
                >
              {/if}
              {#if card.stats}
                <div class="flex items-center gap-3">
                  {#if card.stats.downloads}
                    <span class="flex items-center gap-1" title="Downloads">
                      <DownloadIcon class="h-3.5 w-3.5" />
                      {card.stats.downloads}
                    </span>
                  {/if}
                  {#if card.stats.views}
                    <span class="flex items-center gap-1" title="Views">
                      <Eye class="h-3.5 w-3.5" />
                      {card.stats.views}
                    </span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>

          <!-- Tags -->
          {#if card.tags.length > 0}
            <div class="flex flex-wrap gap-1.5">
              {#each card.tags as tag}
                <Badge
                  variant="secondary"
                  class="font-normal text-xs px-2 py-0.5"
                >
                  {tag}
                </Badge>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Description -->
        <div class="space-y-2">
          <h3
            class="text-sm font-semibold text-foreground/80 uppercase tracking-wider"
          >
            Description
          </h3>
          <div
            class="p-4 rounded-lg bg-muted/50 border text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed"
          >
            {card.description || "No description provided."}
          </div>
        </div>

        <!-- Raw Data Collapsible (Manual Implementation) -->
        <div class="space-y-2 border rounded-lg p-1">
          <button
            class="flex items-center justify-between w-full p-2 text-left hover:bg-muted/50 rounded-md transition-colors"
            onclick={() => (isRawDataOpen = !isRawDataOpen)}
          >
            <div class="flex items-center gap-2">
              <h3
                class="text-sm font-semibold text-foreground/80 uppercase tracking-wider pl-1"
              >
                Original Source Data
              </h3>
              {#if isLoadingDetails}
                <Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
              {/if}
            </div>
            <div class="p-1 text-muted-foreground">
              <ChevronsUpDown class="h-4 w-4" />
            </div>
          </button>

          {#if isRawDataOpen}
            <div
              transition:slide={{ duration: 200, axis: "y" }}
              class="px-3 pb-3 pt-1 space-y-4"
            >
              <Alert.Root variant="warning">
                <AlertTriangle class="h-4 w-4" />
                <Alert.Title>Import Context Warning</Alert.Title>
                <Alert.Description>
                  This is the raw data associated with the card. During import,
                  some fields might be remapped or formatted to fit the local
                  schema. This data serves as the source of truth for the import
                  process.
                </Alert.Description>
              </Alert.Root>

              <div
                class="rounded-md bg-muted p-4 overflow-x-auto max-h-[300px] overflow-y-auto"
              >
                {#if isLoadingDetails}
                  <div
                    class="flex items-center justify-center py-8 text-muted-foreground gap-2"
                  >
                    <Loader2 class="h-4 w-4 animate-spin" />
                    <span>Fetching full details...</span>
                  </div>
                {:else}
                  <pre
                    class="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">{JSON.stringify(
                      detailedCard,
                      null,
                      2,
                    )}</pre>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Desktop Footer Actions -->
  <div
    class="hidden md:flex p-4 border-t bg-muted/10 items-center justify-end gap-3 shrink-0"
  >
    <Button variant="outline" onclick={onBack}>Back</Button>
    <Button
      variant={isImported ? "secondary" : "default"}
      class="gap-2 min-w-[120px]"
      disabled={isImported}
      onclick={() => onImport(detailedCard)}
    >
      {#if isImported}
        Imported
      {:else}
        <Download class="h-4 w-4" />
        Import
      {/if}
    </Button>
  </div>
</div>
