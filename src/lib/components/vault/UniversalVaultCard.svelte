<script lang="ts">
  import type {
    VaultCharacter,
    VaultLorebook,
    VaultScenario,
  } from "$lib/types";
  import { normalizeImageDataUrl } from "$lib/utils/image";
  import { Badge } from "$lib/components/ui/badge";
  import {
    User,
    Users,
    Book,
    MapPin,
    MessageSquare,
    Archive,
    Box,
    Flag,
    Brain,
    Calendar,
  } from "lucide-svelte";
  import TagBadge from "$lib/components/tags/TagBadge.svelte";
  import { tagStore } from "$lib/stores/tags.svelte";
  import VaultCard from "./shared/VaultCard.svelte";
  import * as Avatar from "$lib/components/ui/avatar";

  type VaultItem = VaultCharacter | VaultLorebook | VaultScenario;
  type VaultType = "character" | "lorebook" | "scenario";

  interface Props {
    item: VaultItem;
    type: VaultType;
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
    selectable?: boolean;
    onSelect?: () => void;
  }

  let {
    item,
    type,
    onEdit,
    onDelete,
    onToggleFavorite,
    selectable = false,
    onSelect,
  }: Props = $props();

  // Type Guards & Casters
  const asCharacter = $derived(
    type === "character" ? (item as VaultCharacter) : null,
  );
  const asLorebook = $derived(
    type === "lorebook" ? (item as VaultLorebook) : null,
  );
  const asScenario = $derived(
    type === "scenario" ? (item as VaultScenario) : null,
  );

  let isImporting = $derived(item.metadata?.importing === true);

  // Helper for Lorebook Entry Icons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entryTypeIcons: Record<string, any> = {
    character: Users,
    location: MapPin,
    item: Box,
    faction: Flag,
    concept: Brain,
    event: Calendar,
  };

  // Helper for Lorebook Entry Counts
  const lorebookEntryCounts = $derived.by(() => {
    if (!asLorebook?.metadata?.entryBreakdown) return [];
    return Object.entries(asLorebook.metadata.entryBreakdown)
      .filter(([_, count]) => count > 0)
      .map(([type, count]) => ({ type, count }));
  });
</script>

<VaultCard
  title={item.name}
  {isImporting}
  isFavorite={item.favorite}
  {selectable}
  {onEdit}
  {onDelete}
  {onToggleFavorite}
  {onSelect}
>
  {#snippet icon()}
    {#if asCharacter}
      {#if asCharacter.portrait}
        <img
          src={normalizeImageDataUrl(asCharacter.portrait) ?? ""}
          alt={asCharacter.name}
          class="h-32 w-24 rounded-md object-cover ring-1 ring-border"
        />
      {:else}
        <div
          class="flex h-32 w-24 items-center justify-center rounded-md bg-muted"
        >
          <User class="h-10 w-10 text-muted-foreground" />
        </div>
      {/if}
    {:else if asLorebook}
      <div
        class="flex h-24 w-24 items-center justify-center rounded-md bg-muted ring-1 ring-border/50"
      >
        <Book class="h-10 w-10 text-muted-foreground/50" />
      </div>
    {:else if asScenario}
      <div
        class="flex h-24 w-24 items-center justify-center rounded-md bg-muted ring-1 ring-border/50"
      >
        <MapPin class="h-10 w-10 text-muted-foreground/50" />
      </div>
    {/if}
  {/snippet}

  {#snippet badges()}
    {#if asLorebook}
      <span class="text-[10px] text-muted-foreground font-medium">
        {asLorebook.entries.length} entries
      </span>
      {#if asLorebook.source === "story" || asLorebook.source === "import"}
        <Badge variant="secondary" class="text-[10px] px-1.5 h-4 font-normal">
          {asLorebook.source === "story" ? "Story" : "Imported"}
        </Badge>
      {/if}
    {:else if asScenario}
      <div class="flex items-center gap-2 text-muted-foreground">
        {#if asScenario.npcs.length > 0}
          <span class="flex items-center gap-1 text-[10px]">
            <Users class="h-3 w-3" />
            {asScenario.npcs.length} NPCs
          </span>
        {/if}
        {#if asScenario.firstMessage}
          <span class="flex items-center gap-1 text-[10px]">
            <MessageSquare class="h-3 w-3" />
            Opening
          </span>
        {/if}
        {#if asScenario.source === "wizard"}
          <span class="text-[10px]">• Created</span>
        {:else if asScenario.source === "import"}
          <span class="text-[10px]">• Imported</span>
        {/if}
      </div>
    {/if}
  {/snippet}

  {#snippet description()}
    {#if item.description}
      <p class="text-xs text-muted-foreground line-clamp-4 leading-snug">
        {item.description}
      </p>
    {/if}
  {/snippet}

  {#snippet footer()}
    {#if asCharacter}
      {#if asCharacter.traits.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each asCharacter.traits.slice(0, 3) as trait}
            <Badge
              variant="outline"
              class="text-[10px] px-1.5 h-4 font-normal text-muted-foreground/80 border-muted-foreground/20"
            >
              {trait}
            </Badge>
          {/each}
          {#if asCharacter.traits.length > 3}
            <span class="text-[10px] text-muted-foreground self-center">
              +{asCharacter.traits.length - 3}
            </span>
          {/if}
        </div>
      {/if}
    {:else if asLorebook}
      {#if lorebookEntryCounts.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each lorebookEntryCounts.slice(0, 4) as { type, count }}
            {@const Icon = entryTypeIcons[type]}
            <div
              class="flex items-center gap-1 text-[10px] text-muted-foreground/80 bg-muted/50 px-1.5 py-0.5 rounded-sm border border-border/50"
              title={type}
            >
              {#if Icon}
                <Icon class="h-3 w-3 opacity-70" />
              {/if}
              <span>{count}</span>
            </div>
          {/each}
          {#if lorebookEntryCounts.length > 4}
            <span class="text-[10px] text-muted-foreground self-center">
              +{lorebookEntryCounts.length - 4}
            </span>
          {/if}
        </div>
      {/if}
    {:else if asScenario}
      {#if asScenario.tags.length > 0}
        <div class="flex flex-wrap gap-1">
          {#each asScenario.tags.slice(0, 3) as tag}
            <TagBadge name={tag} color={tagStore.getColor(tag, "scenario")} />
          {/each}
          {#if asScenario.tags.length > 3}
            <span class="text-[10px] text-muted-foreground self-center">
              +{asScenario.tags.length - 3}
            </span>
          {/if}
        </div>
      {/if}
    {/if}
  {/snippet}
</VaultCard>
