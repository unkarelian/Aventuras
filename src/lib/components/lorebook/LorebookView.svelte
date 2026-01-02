<script lang="ts">
  import type { Entry, EntryType } from '$lib/types';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { onMount, untrack } from 'svelte';
  import LorebookList from './LorebookList.svelte';
  import LorebookDetail from './LorebookDetail.svelte';
  import LorebookEntryForm from './LorebookEntryForm.svelte';
  import LorebookImportModal from './LorebookImportModal.svelte';
  import LorebookExportModal from './LorebookExportModal.svelte';
  import { BookOpen, Plus, ArrowLeft } from 'lucide-svelte';

  // Track if we're in "new entry" mode
  let creatingNew = $state(false);

  // Breakpoint for mobile/desktop
  let isMobile = $state(false);

  // Get selected entry - use untrack to avoid reactivity issues
  const selectedEntry = $derived.by(() => {
    const id = ui.selectedLorebookEntryId;
    if (!id) return null;
    return story.lorebookEntries.find(e => e.id === id) ?? null;
  });

  // Show detail panel on desktop when entry selected, or on mobile when showing detail
  const showDetail = $derived(
    (!isMobile && (selectedEntry || creatingNew)) ||
    (isMobile && ui.lorebookShowDetail)
  );

  // Show list on desktop always, or on mobile when not showing detail
  const showList = $derived(!isMobile || !ui.lorebookShowDetail);

  function handleResize() {
    isMobile = window.innerWidth < 768;
  }

  onMount(() => {
    handleResize();
    window.addEventListener('resize', handleResize);

    // Reset state when mounting - defer to avoid render cycle issues
    queueMicrotask(() => {
      ui.resetLorebookManager();
    });

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  function handleNewEntry() {
    creatingNew = true;
    ui.selectLorebookEntry(null);
    ui.setLorebookEditMode(true);
    if (isMobile) {
      ui.showLorebookDetail();
    }
  }

  async function handleSaveNew(entry: Entry) {
    const { id, storyId, createdAt, updatedAt, ...entryData } = entry;
    const newEntry = await story.addLorebookEntry(entryData);
    creatingNew = false;
    ui.setLorebookEditMode(false);
    ui.selectLorebookEntry(newEntry.id);
  }

  function handleCancelNew() {
    creatingNew = false;
    ui.setLorebookEditMode(false);
    if (isMobile) {
      ui.hideLorebookDetail();
    }
  }

  function handleMobileBack() {
    if (creatingNew) {
      handleCancelNew();
    } else {
      ui.hideLorebookDetail();
    }
  }
</script>

<div class="flex h-full bg-surface-900">
  <!-- List panel -->
  {#if showList}
    <div
      class="flex flex-col border-r border-surface-700
        {isMobile ? 'w-full' : 'w-72 lg:w-80 flex-shrink-0'}"
    >
      <LorebookList onNewEntry={handleNewEntry} />
    </div>
  {/if}

  <!-- Detail panel -->
  {#if showDetail}
    <div
      class="flex-1 flex flex-col
        {isMobile ? 'w-full absolute inset-0 bg-surface-900 z-10' : ''}"
    >
      {#if creatingNew}
        <!-- New entry form -->
        <div class="flex flex-col h-full">
          <div class="flex items-center gap-3 p-4 border-b border-surface-700">
            {#if isMobile}
              <button
                class="btn-ghost p-2 rounded-lg -ml-2"
                onclick={handleMobileBack}
              >
                <ArrowLeft class="h-5 w-5" />
              </button>
            {/if}
            <div class="p-2 rounded-lg bg-accent-500/20 text-accent-400">
              <Plus class="h-5 w-5" />
            </div>
            <h2 class="font-semibold text-surface-100">New Entry</h2>
          </div>
          <div class="flex-1 overflow-y-auto p-4">
            <LorebookEntryForm
              onSave={handleSaveNew}
              onCancel={handleCancelNew}
            />
          </div>
        </div>
      {:else if selectedEntry}
        <LorebookDetail entry={selectedEntry} {isMobile} />
      {:else}
        <!-- Empty state for desktop when no entry selected -->
        <div class="flex-1 flex items-center justify-center text-center p-8">
          <div>
            <BookOpen class="h-12 w-12 text-surface-600 mx-auto mb-4" />
            <h3 class="text-lg font-medium text-surface-400 mb-2">Select an Entry</h3>
            <p class="text-sm text-surface-500 max-w-xs mx-auto">
              Choose an entry from the list to view or edit its details, or create a new one.
            </p>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Import Modal -->
{#if ui.lorebookImportModalOpen}
  <LorebookImportModal />
{/if}

<!-- Export Modal -->
{#if ui.lorebookExportModalOpen}
  <LorebookExportModal />
{/if}
