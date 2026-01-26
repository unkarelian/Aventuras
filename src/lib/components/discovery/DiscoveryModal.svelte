<script lang="ts">
  import {
    X,
    Search,
    Loader2,
    Filter,
    Check,
    EyeOff,
    Eye,
    Blend,
    Globe,
    Tag,
  } from "lucide-svelte";
  import {
    discoveryService,
    type DiscoveryCard,
    type SearchResult,
  } from "$lib/services/discovery";
  import DiscoveryCardComponent from "./DiscoveryCard.svelte";
  import DiscoveryCardDetails from "./DiscoveryCardDetails.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import { lorebookVault } from "$lib/stores/lorebookVault.svelte";
  import { scenarioVault } from "$lib/stores/scenarioVault.svelte";

  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Badge } from "$lib/components/ui/badge";
  import * as Select from "$lib/components/ui/select";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import * as Popover from "$lib/components/ui/popover";
  import * as Command from "$lib/components/ui/command";
  import { cn } from "$lib/utils/cn";

  interface Props {
    isOpen: boolean;
    mode: "character" | "lorebook" | "scenario";
    onClose: () => void;
  }

  let { isOpen, mode, onClose }: Props = $props();

  type NsfwMode = "disable" | "blur" | "enable";
  const NSFW_MODE_STORAGE_KEY = "aventura:discovery:nsfwMode";

  function loadNsfwMode(): NsfwMode {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(NSFW_MODE_STORAGE_KEY);
      if (stored === "blur" || stored === "enable") {
        return stored;
      }
    }
    return "disable";
  }

  let searchQuery = $state("");
  let activeProviderId = $state("all");
  let results = $state<DiscoveryCard[]>([]);
  let isLoading = $state(false);
  let hasMore = $state(false);
  let currentPage = $state(1);
  let errorMessage = $state<string | null>(null);
  let nsfwMode = $state<NsfwMode>(loadNsfwMode());
  let hasInitialSearched = $state(false);
  let selectedCard = $state<DiscoveryCard | null>(null);

  let importedUrls = $derived.by(() => {
    const urls = new Set<string>();
    if (mode === "character") {
      for (const c of characterVault.characters) {
        if (c.metadata?.sourceUrl) urls.add(String(c.metadata.sourceUrl));
      }
    } else if (mode === "lorebook") {
      for (const lb of lorebookVault.lorebooks) {
        if (lb.metadata?.sourceUrl) urls.add(String(lb.metadata.sourceUrl));
      }
    } else if (mode === "scenario") {
      for (const s of scenarioVault.scenarios) {
        if (s.metadata?.sourceUrl) urls.add(String(s.metadata.sourceUrl));
      }
    }
    return urls;
  });

  $effect(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(NSFW_MODE_STORAGE_KEY, nsfwMode);
    }
  });

  let selectedTags = $state<string[]>([]);
  let tagInput = $state("");
  let showTagDropdown = $state(false);
  let availableTags = $state<string[]>([]);
  let isLoadingTags = $state(false);

  let providers = $derived(discoveryService.getProviders(mode));

  let tagSuggestions = $derived(
    tagInput.trim()
      ? availableTags
          .filter(
            (t) =>
              t.toLowerCase().includes(tagInput.toLowerCase()) &&
              !selectedTags.includes(t),
          )
          .slice(0, 30)
      : [],
  );

  let popularTags = $derived(
    availableTags.slice(0, 20).filter((t) => !selectedTags.includes(t)),
  );

  async function loadTags() {
    isLoadingTags = true;
    try {
      if (activeProviderId === "all") {
        availableTags = await discoveryService.getAllTags(mode);
      } else {
        availableTags = await discoveryService.getTags(activeProviderId);
      }
      console.log(`[Discovery] Loaded ${availableTags.length} tags`);
    } catch (error) {
      console.error("[Discovery] Failed to load tags:", error);
      availableTags = [];
    } finally {
      isLoadingTags = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      loadTags();
      if (!hasInitialSearched) {
        hasInitialSearched = true;
        handleSearch();
      }
    } else {
      hasInitialSearched = false;
    }
  });

  $effect(() => {
    const _providerId = activeProviderId;
    if (isOpen) {
      loadTags();
    }
  });

  $effect(() => {
    const _mode = mode;
    results = [];
    currentPage = 1;
    hasMore = false;
    errorMessage = null;
    selectedTags = [];
  });

  async function handleSearch() {
    isLoading = true;
    errorMessage = null;
    currentPage = 1;

    try {
      let result: SearchResult;
      const searchOptions = {
        query: searchQuery,
        page: 1,
        limit: 48,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
      };

      if (activeProviderId === "all") {
        result = await discoveryService.searchAll(searchOptions, mode);
      } else {
        result = await discoveryService.search(
          activeProviderId,
          searchOptions,
          mode,
        );
      }

      results = result.cards;
      hasMore = result.hasMore;
      currentPage = result.nextPage || 1;
    } catch (error) {
      console.error("[Discovery] Search error:", error);
      errorMessage = error instanceof Error ? error.message : "Search failed";
      results = [];
    } finally {
      isLoading = false;
    }
  }

  async function loadMore() {
    if (!hasMore || isLoading) return;

    isLoading = true;

    try {
      let result: SearchResult;

      if (activeProviderId === "all") {
        result = await discoveryService.loadMoreAll(mode, 48);
      } else {
        const searchOptions = {
          query: searchQuery,
          page: currentPage,
          limit: 48,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
        };
        result = await discoveryService.search(
          activeProviderId,
          searchOptions,
          mode,
        );
        currentPage = result.nextPage || currentPage + 1;
      }

      results = [...results, ...result.cards];
      hasMore = result.hasMore;
    } catch (error) {
      console.error("[Discovery] Load more error:", error);
      errorMessage =
        error instanceof Error ? error.message : "Failed to load more";
    } finally {
      isLoading = false;
    }
  }

  async function handleImport(card: DiscoveryCard) {
    const sourceId = card.imageUrl || card.avatarUrl;
    if (sourceId && importedUrls.has(sourceId)) return;

    errorMessage = null;

    try {
      if (mode === "character") {
        await characterVault.importFromDiscovery(card);
      } else if (mode === "lorebook") {
        await lorebookVault.importFromDiscovery(card);
      } else if (mode === "scenario") {
        await scenarioVault.importFromDiscovery(card);
      }
      console.log("[Discovery] Started background import:", card.name);
    } catch (error) {
      console.error("[Discovery] Import error:", error);
      errorMessage = error instanceof Error ? error.message : "Import failed";
    }
  }

  function toggleTag(tag: string) {
    if (selectedTags.includes(tag)) {
      selectedTags = selectedTags.filter((t) => t !== tag);
    } else {
      selectedTags = [...selectedTags, tag];
    }
  }

  function addCustomTag() {
    const tag = tagInput.trim();
    if (tag && !selectedTags.includes(tag)) {
      selectedTags = [...selectedTags, tag];
    }
    tagInput = "";
  }

  function removeTag(tag: string) {
    selectedTags = selectedTags.filter((t) => t !== tag);
  }

  function clearTags() {
    selectedTags = [];
  }

  function handleViewDetails(card: DiscoveryCard) {
    selectedCard = card;
  }
</script>

<ResponsiveModal.Root open={isOpen} onOpenChange={(v) => !v && onClose()}>
  <ResponsiveModal.Content
    class="w-full sm:w-[calc(100%-2rem)] max-w-7xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden"
  >
    {#if selectedCard}
      <DiscoveryCardDetails
        card={selectedCard}
        onBack={() => (selectedCard = null)}
        onImport={handleImport}
        isImported={selectedCard &&
          importedUrls.has(selectedCard.imageUrl || selectedCard.avatarUrl)}
        {nsfwMode}
      />
    {:else}
      <ResponsiveModal.Header
        class="px-4 py-3 border-b shrink-0 text-center sm:text-left"
      >
        <ResponsiveModal.Title
          class="flex items-center mt-2 sm:mt-0 gap-2 justify-center sm:justify-start"
        >
          Browse {mode === "character"
            ? "Characters"
            : mode === "lorebook"
              ? "Lorebooks"
              : "Scenarios"}
        </ResponsiveModal.Title>
        <ResponsiveModal.Description class="sr-only">
          Find and import new {mode}s from online sources.
        </ResponsiveModal.Description>
      </ResponsiveModal.Header>

      <div class="flex flex-col border-b bg-muted/20">
        <div class="flex flex-col gap-4 p-4">
          <div
            class="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between"
          >
            <div
              class="flex items-center gap-2 w-full sm:w-auto overflow-x-auto sm:overflow-visible pb-1 sm:pb-0 scrollbar-hide sm:flex-1 justify-between sm:justify-normal"
            >
              <div class="min-w-[140px] sm:w-[180px] flex-shrink-0">
                <Select.Root type="single" bind:value={activeProviderId}>
                  <Select.Trigger class="h-9 w-full">
                    {#if activeProviderId === "all"}
                      <div
                        class="flex items-center gap-2 text-muted-foreground min-w-0"
                      >
                        <Globe class="h-4 w-4 shrink-0" />
                        <span class="text-foreground truncate">All Sources</span
                        >
                      </div>
                    {:else}
                      {@const p = providers.find(
                        (p) => p.id === activeProviderId,
                      )}
                      <div class="flex items-center gap-2 min-w-0">
                        {#if p?.icon}
                          <img
                            src={p.icon}
                            alt=""
                            class="h-4 w-4 rounded shrink-0"
                          />
                        {:else}
                          <Globe class="h-4 w-4 shrink-0" />
                        {/if}
                        <span class="truncate">{p?.name || "Unknown"}</span>
                      </div>
                    {/if}
                  </Select.Trigger>
                  <Select.Content>
                    <Select.Item value="all">
                      <Globe class="mr-2 h-4 w-4" />
                      All Sources
                    </Select.Item>
                    {#each providers as provider}
                      <Select.Item value={provider.id}>
                        {#if provider.icon}
                          <img
                            src={provider.icon}
                            alt=""
                            class="mr-2 h-4 w-4 rounded"
                          />
                        {:else}
                          <Globe class="mr-2 h-4 w-4" />
                        {/if}
                        {provider.name}
                      </Select.Item>
                    {/each}
                  </Select.Content>
                </Select.Root>
              </div>

              <div class="flex-shrink-0">
                <Popover.Root bind:open={showTagDropdown}>
                  <Popover.Trigger>
                    {#snippet child({ props })}
                      <Button
                        variant="outline"
                        size="sm"
                        {...props}
                        class={cn(
                          "h-9 px-3",
                          selectedTags.length > 0 &&
                            "border-primary text-primary bg-primary/5",
                        )}
                      >
                        <Filter class="h-4 w-4" />
                        {#if selectedTags.length > 0}
                          <span class="ml-1.5 text-xs font-medium tabular-nums">
                            {selectedTags.length}
                          </span>
                        {/if}
                      </Button>
                    {/snippet}
                  </Popover.Trigger>
                  <Popover.Content class="p-0 w-[300px]" align="start">
                    <Command.Root shouldFilter={false}>
                      <Command.Input
                        placeholder="Search tags..."
                        bind:value={tagInput}
                        onkeydown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (tagSuggestions.length > 0) {
                              toggleTag(tagSuggestions[0]);
                              tagInput = "";
                            } else {
                              addCustomTag();
                            }
                          }
                        }}
                      />
                      <Command.List>
                        <Command.Empty>
                          {#if tagInput}
                            <button
                              class="w-full text-left px-4 py-2 text-sm"
                              onclick={addCustomTag}
                            >
                              Add "{tagInput}"
                            </button>
                          {:else}
                            No tags found.
                          {/if}
                        </Command.Empty>
                        {#if tagSuggestions.length > 0}
                          <Command.Group heading="Suggestions">
                            {#each tagSuggestions as tag}
                              <Command.Item
                                value={tag}
                                onSelect={() => {
                                  toggleTag(tag);
                                  tagInput = "";
                                }}
                              >
                                <div
                                  class="mr-2 flex h-4 w-4 items-center justify-center opacity-0"
                                  class:opacity-100={selectedTags.includes(tag)}
                                >
                                  <Check class="h-4 w-4" />
                                </div>
                                {tag}
                              </Command.Item>
                            {/each}
                          </Command.Group>
                        {/if}

                        {#if popularTags.length > 0 && !tagInput}
                          <Command.Group heading="Popular">
                            {#each popularTags as tag}
                              <Command.Item
                                value={tag}
                                onSelect={() => toggleTag(tag)}
                              >
                                <div
                                  class="mr-2 flex h-4 w-4 items-center justify-center opacity-0"
                                  class:opacity-100={selectedTags.includes(tag)}
                                >
                                  <Check class="h-4 w-4" />
                                </div>
                                {tag}
                              </Command.Item>
                            {/each}
                          </Command.Group>
                        {/if}
                      </Command.List>
                    </Command.Root>
                  </Popover.Content>
                </Popover.Root>
              </div>

              <div
                class="hidden sm:block w-px h-6 bg-border mx-1 shrink-0"
              ></div>

              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-medium text-muted-foreground"
                  >NSFW:</span
                >
                <ToggleGroup.Root
                  type="single"
                  bind:value={nsfwMode}
                  class="bg-muted p-1 rounded-lg gap-0 h-9 border"
                  variant="default"
                >
                  <ToggleGroup.Item
                    value="disable"
                    class="h-7 rounded-md px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm text-muted-foreground hover:bg-transparent hover:text-foreground transition-all flex items-center gap-1.5"
                    title="Hide NSFW"
                  >
                    <EyeOff class="h-3.5 w-3.5" />
                    <span class="hidden lg:inline">Hide</span>
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    value="blur"
                    class="h-7 rounded-md px-2 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm text-muted-foreground hover:bg-transparent hover:text-foreground transition-all flex items-center gap-1.5"
                    title="Blur NSFW"
                  >
                    <Blend class="h-3.5 w-3.5" />
                    <span class="hidden lg:inline">Blur</span>
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    value="enable"
                    class="h-7 rounded-md px-2 text-xs data-[state=on]:bg-red-500/10 data-[state=on]:text-red-600 data-[state=on]:shadow-sm text-muted-foreground hover:bg-transparent hover:text-red-500 transition-all flex items-center gap-1.5"
                    title="Show NSFW"
                  >
                    <Eye class="h-3.5 w-3.5" />
                    <span class="hidden lg:inline">Show</span>
                  </ToggleGroup.Item>
                </ToggleGroup.Root>
              </div>
            </div>

            <div
              class="hidden sm:flex items-center w-[250px] lg:w-[300px] shrink-0"
            >
              <Input
                placeholder="Search..."
                bind:value={searchQuery}
                onkeydown={(e) => e.key === "Enter" && handleSearch()}
                class="h-9 rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-primary focus-visible:z-10"
              />
              <Button
                onclick={handleSearch}
                disabled={isLoading}
                size="icon"
                variant="outline"
                class="h-9 w-9 rounded-l-none border-l bg-muted/50 hover:bg-muted shrink-0"
              >
                {#if isLoading}
                  <Loader2 class="h-4 w-4 animate-spin" />
                {:else}
                  <Search class="h-4 w-4" />
                {/if}
              </Button>
            </div>
          </div>

          <div class="flex gap-2 sm:hidden">
            <div class="flex flex-1 items-center">
              <Input
                placeholder="Search..."
                bind:value={searchQuery}
                onkeydown={(e) => e.key === "Enter" && handleSearch()}
                class="h-9 rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:border-primary focus-visible:z-10"
              />
              <Button
                onclick={handleSearch}
                disabled={isLoading}
                size="icon"
                variant="outline"
                class="h-9 w-9 rounded-l-none border-l bg-muted/50 hover:bg-muted shrink-0"
              >
                {#if isLoading}
                  <Loader2 class="h-4 w-4 animate-spin" />
                {:else}
                  <Search class="h-4 w-4" />
                {/if}
              </Button>
            </div>
          </div>

          {#if selectedTags.length > 0}
            <div
              class="flex flex-wrap items-center gap-2 text-sm pt-3 border-t"
            >
              {#each selectedTags as tag}
                <Badge
                  variant="secondary"
                  class="gap-1.5 pl-2 pr-1.5 h-7 items-center font-normal"
                >
                  {tag}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-4 w-4 hover:bg-transparent hover:text-destructive p-0"
                    onclick={() => removeTag(tag)}
                  >
                    <X class="h-3 w-3" />
                  </Button>
                </Badge>
              {/each}
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs px-2 hover:text-destructive"
                onclick={clearTags}
              >
                Clear all
              </Button>
            </div>
          {/if}
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 bg-muted/5">
        {#if errorMessage}
          <div
            class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4"
          >
            {errorMessage}
          </div>
        {/if}

        {#if results.length === 0 && !isLoading}
          <div
            class="flex h-full flex-col items-center justify-center text-muted-foreground p-8"
          >
            <Search class="mb-4 h-12 w-12 opacity-20" />
            <p class="text-lg font-medium">No results found</p>
            <p class="text-sm opacity-70">
              Try adjusting your search terms or filters.
            </p>
          </div>
        {:else}
          <div
            class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
          >
            {#each results as card (card.id)}
              <DiscoveryCardComponent
                {card}
                onImport={handleImport}
                onViewDetails={handleViewDetails}
                isImported={importedUrls.has(card.imageUrl || card.avatarUrl)}
                {nsfwMode}
              />
            {/each}
          </div>

          {#if hasMore}
            <div class="mt-8 flex justify-center pb-4">
              <Button
                variant="outline"
                onclick={loadMore}
                disabled={isLoading}
                class="min-w-[150px]"
              >
                {#if isLoading}
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                {/if}
                Load More
              </Button>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
