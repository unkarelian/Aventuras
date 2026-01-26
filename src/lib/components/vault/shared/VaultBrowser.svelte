<script lang="ts" generics="T">
  import { Search } from "lucide-svelte";
  import { Input } from "$lib/components/ui/input";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import EmptyState from "$lib/components/ui/empty-state/empty-state.svelte";
  import type { Snippet } from "svelte";

  interface Props {
    items: T[];
    isLoading?: boolean;
    searchPlaceholder?: string;

    // Empty State configuration
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emptyIcon: any;
    emptyTitle: string;
    emptyDescription?: string;
    onNavigateToVault?: () => void;

    // Logic
    filterItem: (item: T, query: string) => boolean;
    sortItems?: (a: T, b: T) => number;

    // Render
    renderItem: Snippet<[T]>;
    key: (item: T) => string;
  }

  let {
    items,
    isLoading = false,
    searchPlaceholder = "Search...",
    emptyIcon,
    emptyTitle,
    emptyDescription = "No items found in vault",
    onNavigateToVault,
    filterItem,
    sortItems,
    renderItem,
    key,
  }: Props = $props();

  let searchQuery = $state("");

  const filteredItems = $derived.by(() => {
    let result = items;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) => filterItem(item, query));
    }

    if (sortItems) {
      return [...result].sort(sortItems);
    }

    return result;
  });

  const hasItems = $derived(items.length > 0);
</script>

<div class="rounded-lg border border-muted-foreground/20 bg-muted/10 h-full flex flex-col min-h-0 overflow-hidden">
  <!-- Search -->
  {#if hasItems || isLoading}
    <div class="relative shrink-0 border-b border-muted-foreground/10 bg-background/50">
      <div class="absolute left-2.5 top-2.5 text-muted-foreground">
        <Search class="h-4 w-4" />
      </div>
      <input
        type="text"
        bind:value={searchQuery}
        placeholder={searchPlaceholder}
        class="w-full bg-transparent py-2.5 pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isLoading}
      />
    </div>
  {/if}

  <!-- List -->
  <ScrollArea class="flex-1 w-full">
    <div class="p-2">
      {#if isLoading}
        <div class="space-y-3 p-2">
          {#each Array(3) as _}
            <div class="flex items-center space-x-4">
              <Skeleton class="h-10 w-10 rounded-full" />
              <div class="space-y-2">
                <Skeleton class="h-4 w-[150px]" />
                <Skeleton class="h-3 w-[100px]" />
              </div>
            </div>
          {/each}
        </div>
      {:else if filteredItems.length === 0}
        <div class="flex h-full flex-col items-center justify-center p-4 py-8">
          <EmptyState
            icon={emptyIcon}
            title={searchQuery ? "No matches found" : emptyTitle}
            description={searchQuery
              ? "Try adjusting your search query"
              : emptyDescription}
            actionLabel={!searchQuery && onNavigateToVault
              ? "Go to Vault"
              : undefined}
            onAction={!searchQuery && onNavigateToVault
              ? onNavigateToVault
              : undefined}
            class="py-2"
            size="sm"
          />
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each filteredItems as item (key(item))}
            {@render renderItem(item)}
          {/each}
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
