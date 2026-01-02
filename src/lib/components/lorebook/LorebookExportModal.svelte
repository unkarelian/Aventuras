<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { exportLorebook, getFormatInfo, type ExportFormat } from '$lib/services/lorebookExporter';
  import { X, Download, FileJson, FileText, Check, Loader2 } from 'lucide-svelte';

  let selectedFormat = $state<ExportFormat>('aventura');
  let exportSelected = $state(false);
  let exporting = $state(false);
  let error = $state<string | null>(null);

  const formats: ExportFormat[] = ['aventura', 'sillytavern', 'text'];

  const entriesToExport = $derived(() => {
    if (exportSelected && ui.lorebookBulkSelection.size > 0) {
      return story.lorebookEntries.filter(e => ui.lorebookBulkSelection.has(e.id));
    }
    return story.lorebookEntries;
  });

  const entryCount = $derived(entriesToExport().length);
  const hasSelection = $derived(ui.lorebookBulkSelection.size > 0);

  async function handleExport() {
    if (entryCount === 0) {
      error = 'No entries to export';
      return;
    }

    exporting = true;
    error = null;

    try {
      await exportLorebook({
        format: selectedFormat,
        entries: entriesToExport(),
        filename: story.currentStory?.title
          ? `${story.currentStory.title}-lorebook`
          : undefined,
      });
      ui.closeLorebookExport();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Export failed';
    } finally {
      exporting = false;
    }
  }

  function close() {
    ui.closeLorebookExport();
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60"
  onclick={close}
  onkeydown={(e) => e.key === 'Escape' && close()}
  role="dialog"
  aria-modal="true"
  tabindex="-1"
>
  <div
    class="card w-full max-w-md max-h-[90vh] overflow-hidden"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-4">
      <div class="flex items-center gap-2">
        <Download class="h-5 w-5 text-accent-400" />
        <h2 class="text-xl font-semibold text-surface-100">Export Lorebook</h2>
      </div>
      <button class="btn-ghost rounded-lg p-2" onclick={close}>
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="py-4 space-y-4">
      {#if error}
        <div class="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-sm">
          {error}
        </div>
      {/if}

      <!-- Export scope -->
      {#if hasSelection}
        <div class="space-y-2">
          <label class="text-sm font-medium text-surface-300">What to export</label>
          <div class="space-y-2">
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer
              {!exportSelected ? 'border-accent-500 bg-accent-500/20' : 'border-surface-600 bg-surface-800'}">
              <input
                type="radio"
                name="scope"
                checked={!exportSelected}
                onchange={() => exportSelected = false}
                class="h-4 w-4 text-accent-500 focus:ring-accent-500"
              />
              <div>
                <div class="text-surface-200">All entries</div>
                <div class="text-xs text-surface-500">{story.lorebookEntries.length} entries</div>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer
              {exportSelected ? 'border-accent-500 bg-accent-500/20' : 'border-surface-600 bg-surface-800'}">
              <input
                type="radio"
                name="scope"
                checked={exportSelected}
                onchange={() => exportSelected = true}
                class="h-4 w-4 text-accent-500 focus:ring-accent-500"
              />
              <div>
                <div class="text-surface-200">Selected only</div>
                <div class="text-xs text-surface-500">{ui.lorebookBulkSelection.size} entries</div>
              </div>
            </label>
          </div>
        </div>
      {:else}
        <div class="p-3 rounded-lg bg-surface-800/50 border border-surface-700">
          <div class="text-surface-200">{story.lorebookEntries.length} entries</div>
          <div class="text-xs text-surface-500">All lorebook entries will be exported</div>
        </div>
      {/if}

      <!-- Format selection -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-surface-300">Export format</label>
        <div class="space-y-2">
          {#each formats as format}
            {@const info = getFormatInfo(format)}
            <button
              class="w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors
                {selectedFormat === format
                  ? 'border-accent-500 bg-accent-500/20'
                  : 'border-surface-600 bg-surface-800 hover:bg-surface-700'}"
              onclick={() => selectedFormat = format}
            >
              <div class="flex-shrink-0 mt-0.5">
                {#if selectedFormat === format}
                  <Check class="h-5 w-5 text-accent-400" />
                {:else if format === 'text'}
                  <FileText class="h-5 w-5 text-surface-500" />
                {:else}
                  <FileJson class="h-5 w-5 text-surface-500" />
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium text-surface-200">{info.label}</div>
                <div class="text-xs text-surface-500">{info.description}</div>
              </div>
              <div class="text-xs text-surface-600">{info.extension}</div>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex gap-2 pt-4 border-t border-surface-700">
      <button
        class="btn-ghost flex-1 py-2 border border-surface-600 rounded-lg"
        onclick={close}
        disabled={exporting}
      >
        Cancel
      </button>
      <button
        class="btn-primary flex-1 py-2 flex items-center justify-center gap-2"
        onclick={handleExport}
        disabled={exporting || entryCount === 0}
      >
        {#if exporting}
          <Loader2 class="h-4 w-4 animate-spin" />
          Exporting...
        {:else}
          <Download class="h-4 w-4" />
          Export
        {/if}
      </button>
    </div>
  </div>
</div>
