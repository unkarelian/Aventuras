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
    ChevronDown,
  } from "lucide-svelte";
  import LorebookEntryCard from "./LorebookEntryCard.svelte";

  interface Props {
    onNewEntry?: () => void;
  }

  let { onNewEntry }: Props = $props();

  let searchDebounceTimer: ReturnType<typeof setTimeout>;
  let showTypeFilter = $state(false);
  let showSortMenu = $state(false);
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

  function handleTypeFilter(type: EntryType | "all") {
    ui.setLorebookTypeFilter(type);
    showTypeFilter = false;
  }

  function handleSort(sort: "name" | "type" | "updated") {
    ui.setLorebookSortBy(sort);
    showSortMenu = false;
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
    } catch (error) {
      console.error('[LorebookList] Failed to delete entries:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete entries');
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
  <div class="pt-0 px-3 pb-3 sm:pt-3 border-b border-surface-700">
    <div class="relative">
      <Search
        class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500"
      />
      <input
        type="text"
        placeholder="Search entries..."
        value={ui.lorebookSearchQuery}
        oninput={handleSearchInput}
        class="input w-full pl-9 pr-8"
      />
      {#if ui.lorebookSearchQuery}
        <button
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-300"
          onclick={() => ui.setLorebookSearchQuery("")}
        >
          <X class="h-4 w-4" />
        </button>
      {/if}
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mt-2">
      <!-- Type filter -->
      <div class="relative flex-1">
        <button
          class="btn-ghost w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-surface-600 text-sm"
          onclick={() => {
            showTypeFilter = !showTypeFilter;
            showSortMenu = false;
          }}
        >
          <span class="capitalize"
            >{ui.lorebookTypeFilter === "all"
              ? "All Types"
              : ui.lorebookTypeFilter}</span
          >
          <ChevronDown class="h-4 w-4" />
        </button>
        {#if showTypeFilter}
          <div
            class="absolute top-full left-0 right-0 z-10 mt-1 bg-surface-800 border border-surface-600 rounded-lg shadow-lg py-1"
          >
            {#each entryTypes as type}
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-surface-700 capitalize
                  {type === ui.lorebookTypeFilter
                  ? 'text-accent-400'
                  : 'text-surface-300'}"
                onclick={() => handleTypeFilter(type)}
              >
                {type === "all" ? "All Types" : type}
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Sort -->
      <div class="relative flex-1">
        <button
          class="btn-ghost w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-surface-600 text-sm"
          onclick={() => {
            showSortMenu = !showSortMenu;
            showTypeFilter = false;
          }}
        >
          <span
            >{sortOptions.find((s) => s.value === ui.lorebookSortBy)
              ?.label}</span
          >
          <ChevronDown class="h-4 w-4" />
        </button>
        {#if showSortMenu}
          <div
            class="absolute top-full left-0 right-0 z-10 mt-1 bg-surface-800 border border-surface-600 rounded-lg shadow-lg py-1"
          >
            {#each sortOptions as option}
              <button
                class="w-full px-3 py-2 text-left text-sm hover:bg-surface-700
                  {option.value === ui.lorebookSortBy
                  ? 'text-accent-400'
                  : 'text-surface-300'}"
                onclick={() => handleSort(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Action buttons -->
  <div class="flex gap-2 p-3 border-b border-surface-700">
    <button
      class="btn-primary flex-1 flex items-center justify-center gap-2 py-2"
      onclick={onNewEntry}
      disabled={isLoreManagementActive}
      title={isLoreManagementActive
        ? "Editing disabled during lore management"
        : undefined}
    >
      <Plus class="h-4 w-4" />
      <span class="hidden xs:inline">New Entry</span>
    </button>
    <button
      class="btn-ghost flex items-center justify-center gap-2 px-3 py-2 border border-surface-600 rounded-lg"
      onclick={() => ui.openLorebookImport()}
      disabled={isLoreManagementActive}
      title={isLoreManagementActive
        ? "Import disabled during lore management"
        : "Import"}
    >
      <Upload class="h-4 w-4" />
    </button>
    <button
      class="btn-ghost flex items-center justify-center gap-2 px-3 py-2 border border-surface-600 rounded-lg"
      onclick={() => ui.openLorebookExport()}
      title="Export"
    >
      <Download class="h-4 w-4" />
    </button>
  </div>

  <!-- Bulk selection header -->
  {#if hasBulkSelection}
    <div
      class="flex items-center justify-between gap-2 p-3 bg-surface-700/50 border-b border-surface-700"
    >
      <div class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={allSelected}
          onchange={toggleSelectAll}
          class="h-4 w-4 rounded border-surface-600 bg-surface-800 text-accent-500 focus:ring-accent-500 focus:ring-offset-0"
        />
        <span class="text-sm text-surface-300"
          >{ui.lorebookBulkSelection.size} selected</span
        >
      </div>
      <div class="flex items-center gap-2">
        {#if confirmingBulkDelete}
          <button
            class="rounded px-2 py-1 text-xs bg-surface-700 text-surface-300 hover:bg-surface-600"
            onclick={handleCancelBulkDelete}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            class="rounded px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
            onclick={handleBulkDelete}
            disabled={isDeleting}
          >
            Confirm Delete {ui.lorebookBulkSelection.size} entr{ui.lorebookBulkSelection.size === 1 ? "y" : "ies"}
          </button>
        {:else}
          <button
            class="btn-ghost flex items-center gap-1.5 px-2 py-1 text-sm text-red-400 hover:text-red-300"
            onclick={handleConfirmBulkDelete}
          >
            <Trash2 class="h-4 w-4" />
            <span class="hidden xs:inline">Delete</span>
          </button>
          <button
            class="btn-ghost px-2 py-1 text-sm text-surface-400 hover:text-surface-300"
            onclick={handleClearSelection}
          >
            Cancel
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Entry count -->
  <div class="px-3 py-2 text-xs text-surface-500 border-b border-surface-700">
    {filteredEntries.length} entr{filteredEntries.length === 1 ? "y" : "ies"}
    {#if ui.lorebookTypeFilter !== "all" || ui.lorebookSearchQuery}
      <span class="text-surface-600">
        (filtered from {story.lorebookEntries.length})
      </span>
    {/if}
  </div>

  <!-- Entry list -->
  <div class="flex-1 overflow-y-auto p-3 space-y-2 pb-16 sm:pb-20">
    {#if filteredEntries.length === 0}
      {#if story.lorebookEntries.length === 0}
        <div class="text-center py-8 text-surface-500">
          <p>No lorebook entries yet.</p>
          <p class="text-sm mt-1">
            Create one or import a lorebook to get started.
          </p>
        </div>
      {:else}
        <div class="text-center py-8 text-surface-500">
          <p>No entries match your filters.</p>
          <button
            class="text-accent-400 hover:text-accent-300 text-sm mt-1"
            onclick={() => {
              ui.setLorebookSearchQuery("");
              ui.setLorebookTypeFilter("all");
            }}
          >
            Clear filters
          </button>
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
</div>

<!-- Click outside to close dropdowns -->
{#if showTypeFilter || showSortMenu}
  <div
    class="fixed inset-0 z-0"
    onclick={() => {
      showTypeFilter = false;
      showSortMenu = false;
    }}
    onkeydown={(e) =>
      e.key === "Escape" && ((showTypeFilter = false), (showSortMenu = false))}
    role="button"
    tabindex="-1"
    aria-label="Close dropdown"
  ></div>
{/if}
