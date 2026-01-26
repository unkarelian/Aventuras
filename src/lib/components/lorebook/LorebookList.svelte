<script lang="ts">
  import type { Entry, EntryType } from "$lib/types";
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import {
    Search,
    Plus,
    Download,
    Upload,
    Trash2,
    X,
    Filter,
    ArrowUpDown,
  } from "lucide-svelte";
  import LorebookEntryCard from "./LorebookEntryCard.svelte";

  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { cn } from "$lib/utils/cn";

  interface Props {
    onNewEntry?: () => void;
  }

  let { onNewEntry }: Props = $props();

  let searchDebounceTimer: ReturnType<typeof setTimeout>;
  let confirmingBulkDelete = $state(false);
  let isDeleting = $state(false);

  const entryTypes: Array<EntryType | "all"> = [
    "all",
    "character",
    "location",
    "item",
    "faction",
    "concept",
    "event",
  ];
  const sortOptions: Array<{
    value: "name" | "type" | "updated";
    label: string;
  }> = [
    { value: "name", label: "Name" },
    { value: "type", label: "Type" },
    { value: "updated", label: "Recently Updated" },
  ];

  // Lore management active state - disable editing actions
  const isLoreManagementActive = $derived(ui.loreManagementActive);

  // Filtered and sorted entries
  const filteredEntries = $derived.by(() => {
    let result = [...story.lorebookEntries]; // Create a copy to avoid mutating original

    // Filter by type
    if (ui.lorebookTypeFilter !== "all") {
      result = result.filter((e) => e.type === ui.lorebookTypeFilter);
    }

    // Filter by search query
    if (ui.lorebookSearchQuery.trim()) {
      const query = ui.lorebookSearchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.description.toLowerCase().includes(query) ||
          e.aliases.some((a) => a.toLowerCase().includes(query)) ||
          e.injection.keywords.some((k) => k.toLowerCase().includes(query)),
      );
    }

    // Sort (safe since we already created a copy)
    return result.sort((a, b) => {
      switch (ui.lorebookSortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "type":
          return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
        case "updated":
          return b.updatedAt - a.updatedAt;
        default:
          return 0;
      }
    });
  });

  const hasBulkSelection = $derived(ui.lorebookBulkSelection.size > 0);
  const allSelected = $derived(
    filteredEntries.length > 0 &&
      filteredEntries.every((e) => ui.lorebookBulkSelection.has(e.id)),
  );

  function handleSearchInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      ui.setLorebookSearchQuery(value);
    }, 300);
  }

  function toggleSelectAll() {
    if (allSelected) {
      ui.clearBulkSelection();
    } else {
      ui.selectAllForBulk(filteredEntries.map((e) => e.id));
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(ui.lorebookBulkSelection);
    isDeleting = true;
    try {
      await story.deleteLorebookEntries(ids);
      ui.clearBulkSelection();
      ui.showToast(`Deleted ${ids.length} entries`, "info");
    } catch (error) {
      console.error("[LorebookList] Failed to delete entries:", error);
      ui.showToast(
        error instanceof Error ? error.message : "Failed to delete entries",
        "error",
      );
    } finally {
      isDeleting = false;
      confirmingBulkDelete = false;
    }
  }

  function handleConfirmBulkDelete() {
    if (ui.lorebookBulkSelection.size === 0) return;
    confirmingBulkDelete = true;
  }

  function handleCancelBulkDelete() {
    confirmingBulkDelete = false;
  }

  function handleClearSelection() {
    ui.clearBulkSelection();
  }

  function selectEntry(entry: Entry) {
    ui.selectLorebookEntry(entry.id);
  }
</script>

<div class="flex flex-col h-full">
  <!-- Search -->
  <div class="pt-0 px-3 pb-3 sm:pt-3 border-b">
    <div class="relative">
      <Input
        type="text"
        placeholder="Search entries..."
        value={ui.lorebookSearchQuery}
        oninput={handleSearchInput}
        class="w-full pl-9 pr-8"
        leftIcon={Search}
      />
      {#if ui.lorebookSearchQuery}
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          onclick={() => ui.setLorebookSearchQuery("")}
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mt-2">
      <!-- Type filter -->
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet children({ builder })}
            <Button
              builders={[builder]}
              variant="outline"
              class="w-full justify-between font-normal"
            >
              <span class="capitalize flex items-center gap-2">
                <Filter class="h-4 w-4 text-muted-foreground" />
                {ui.lorebookTypeFilter === "all"
                  ? "All Types"
                  : ui.lorebookTypeFilter}
              </span>
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-50" align="start">
          <DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            value={ui.lorebookTypeFilter}
            onValueChange={(val) =>
              ui.setLorebookTypeFilter(val as EntryType | "all")}
          >
            {#each entryTypes as type}
              <DropdownMenuRadioItem value={type} class="capitalize">
                {type === "all" ? "All Types" : type}
              </DropdownMenuRadioItem>
            {/each}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Sort -->
      <div class="flex-1">
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet children({ builder })}
              <Button
                builders={[builder]}
                variant="outline"
                class="w-full justify-between font-normal"
              >
                <span class="flex items-center gap-2">
                  <ArrowUpDown class="h-4 w-4 text-muted-foreground" />
                  {sortOptions.find((s) => s.value === ui.lorebookSortBy)
                    ?.label}
                </span>
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent class="w-[200px]" align="start">
            <DropdownMenuLabel>Sort Entries</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={ui.lorebookSortBy}
              onValueChange={(val) =>
                ui.setLorebookSortBy(val as "name" | "type" | "updated")}
            >
              {#each sortOptions as option}
                <DropdownMenuRadioItem value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              {/each}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>

  <!-- Action buttons -->
  <div class="flex gap-2 p-3 border-b">
    <Button
      class="flex-1 gap-2"
      onclick={onNewEntry}
      disabled={isLoreManagementActive}
      title={isLoreManagementActive
        ? "Editing disabled during lore management"
        : undefined}
    >
      <Plus class="h-4 w-4" />
      <span class="hidden xs:inline">New Entry</span>
    </Button>
    <Button
      variant="outline"
      size="icon"
      onclick={() => ui.openLorebookImport()}
      disabled={isLoreManagementActive}
      title={isLoreManagementActive
        ? "Import disabled during lore management"
        : "Import"}
    >
      <Upload class="h-4 w-4" />
    </Button>
    <Button
      variant="outline"
      size="icon"
      onclick={() => ui.openLorebookExport()}
      title="Export"
    >
      <Download class="h-4 w-4" />
    </Button>
  </div>

  <!-- Bulk selection header -->
  {#if hasBulkSelection}
    <div
      class="flex items-center justify-between gap-2 p-3 bg-muted/30 border-b"
    >
      <div class="flex items-center gap-2">
        <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
        <span class="text-sm text-muted-foreground"
          >{ui.lorebookBulkSelection.size} selected</span
        >
      </div>
      <div class="flex items-center gap-2">
        {#if confirmingBulkDelete}
          <Button
            variant="secondary"
            size="sm"
            class="h-7 px-2 text-xs"
            onclick={handleCancelBulkDelete}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="h-7 px-2 text-xs"
            onclick={handleBulkDelete}
            disabled={isDeleting}
          >
            Confirm Delete
          </Button>
        {:else}
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
            onclick={handleConfirmBulkDelete}
          >
            <Trash2 class="h-3.5 w-3.5" />
            <span class="hidden xs:inline">Delete</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs"
            onclick={handleClearSelection}
          >
            Cancel
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Entry count -->
  <div class="px-3 py-2 text-xs text-muted-foreground border-b bg-muted/10">
    {filteredEntries.length} entr{filteredEntries.length === 1 ? "y" : "ies"}
    {#if ui.lorebookTypeFilter !== "all" || ui.lorebookSearchQuery}
      <span class="opacity-70">
        (filtered from {story.lorebookEntries.length})
      </span>
    {/if}
  </div>

  <!-- Entry list -->
  <ScrollArea class="flex-1 pb-16 sm:pb-10">
    <div class="p-3 space-y-2">
      {#if filteredEntries.length === 0}
        {#if story.lorebookEntries.length === 0}
          <div class="text-center py-8 text-muted-foreground">
            <p>No lorebook entries yet.</p>
            <p class="text-sm mt-1">
              Create one or import a lorebook to get started.
            </p>
          </div>
        {:else}
          <div class="text-center py-8 text-muted-foreground">
            <p>No entries match your filters.</p>
            <Button
              variant="link"
              class="h-auto p-0 text-sm mt-1"
              onclick={() => {
                ui.setLorebookSearchQuery("");
                ui.setLorebookTypeFilter("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        {/if}
      {:else}
        {#each filteredEntries as entry (entry.id)}
          <LorebookEntryCard
            {entry}
            selected={ui.selectedLorebookEntryId === entry.id}
            showCheckbox={hasBulkSelection}
            onSelect={() => selectEntry(entry)}
          />
        {/each}
      {/if}
    </div>
  </ScrollArea>
</div>
