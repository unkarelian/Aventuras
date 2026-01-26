<script lang="ts">
  import { Card, CardContent } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import IconRow from "$lib/components/ui/icon-row.svelte";
  import { Star, Pencil, Loader2 } from "lucide-svelte";
  import { cn } from "$lib/utils/cn";
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    isImporting?: boolean;
    isFavorite?: boolean;
    selectable?: boolean;
    selected?: boolean;

    // Actions
    onEdit?: () => void;
    onDelete?: () => void;
    onToggleFavorite?: () => void;
    onSelect?: () => void;

    // Styling
    class?: string;

    // Slots
    icon?: Snippet;
    badges?: Snippet;
    description?: Snippet;
    footer?: Snippet;
  }

  let {
    title,
    isImporting = false,
    isFavorite = false,
    selectable = false,
    selected = false,
    onEdit,
    onDelete,
    onToggleFavorite,
    onSelect,
    class: className,
    icon,
    badges,
    description,
    footer,
  }: Props = $props();

  function handleCardClick() {
    if (isImporting) return;
    if (selectable && onSelect) {
      onSelect();
    }
  }
</script>

<Card
  class={cn(
    "relative overflow-hidden transition-all group h-full flex flex-col",
    selectable &&
      !isImporting &&
      "cursor-pointer hover:border-primary/50 hover:shadow-sm",
    selectable &&
      !isImporting &&
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected && "border-primary ring-1 ring-primary bg-primary/5",
    className,
  )}
  onclick={handleCardClick}
  role={selectable && !isImporting ? "button" : undefined}
  tabindex={selectable && !isImporting ? 0 : undefined}
  onkeydown={selectable && !isImporting
    ? (e) => {
        if (e.key === "Enter" || e.key === " ") handleCardClick();
      }
    : undefined}
>
  {#if isImporting}
    <div
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm"
    >
      <Loader2 class="h-8 w-8 animate-spin text-primary" />
      <span class="text-sm font-medium text-muted-foreground"
        >Processing...</span
      >
    </div>
  {/if}

  <CardContent class="p-3 flex-1 flex flex-col">
    <div class="flex gap-3 flex-1">
      <!-- Icon/Image Slot -->
      {#if icon}
        <div class="shrink-0">
          {@render icon()}
        </div>
      {/if}

      <!-- Main Content -->
      <div class="flex-1 min-w-0 flex flex-col">
        <div class="flex justify-between items-start gap-2">
          <!-- Header info -->
          <div class="min-w-0 flex-1">
            <h3
              class="font-bold text-base leading-normal truncate pr-1"
              {title}
            >
              {title}
            </h3>

            <div class="flex items-center gap-2 mt-1 flex-wrap">
              {#if badges}
                {@render badges()}
              {/if}

              {#if selectable && isFavorite}
                <Star
                  class="h-3 w-3 text-yellow-500 fill-yellow-500 shrink-0"
                />
              {/if}
            </div>
          </div>

          <!-- Actions -->
          {#if !selectable && (onEdit || onDelete || onToggleFavorite)}
            <IconRow class="-mt-2" size="icon" {onDelete}>
              {#if onToggleFavorite}
                <Button
                  icon={Star}
                  variant="ghost"
                  size="icon"
                  class="transition-all hover:bg-transparent hover:text-foreground text-muted-foreground w-5"
                  iconClass={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isFavorite
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-muted-foreground hover:text-yellow-500",
                  )}
                  onclick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.();
                  }}
                  title={isFavorite
                    ? "Remove from favorites"
                    : "Add to favorites"}
                />
              {/if}
              {#if onEdit}
                <Button
                  icon={Pencil}
                  variant="ghost"
                  size="icon"
                  class="transition-all hover:bg-transparent hover:text-foreground text-muted-foreground w-5"
                  iconClass="h-3.5 w-3.5"
                  onclick={(e) => {
                    e.stopPropagation();
                    onEdit?.();
                  }}
                  title="Edit"
                />
              {/if}
            </IconRow>
          {/if}
        </div>

        {#if description}
          <div class="mt-1">
            {@render description()}
          </div>
        {/if}

        {#if footer}
          <div class="mt-auto pt-2">
            {@render footer()}
          </div>
        {/if}
      </div>
    </div>
  </CardContent>
</Card>
