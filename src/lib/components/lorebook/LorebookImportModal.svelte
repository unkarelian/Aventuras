<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import {
    parseSillyTavernLorebook,
    classifyEntriesWithLLM,
    convertToEntries,
    type ImportedEntry,
    type LorebookImportResult
  } from '$lib/services/lorebookImporter';
  import { database } from '$lib/services/database';
  import { X, Upload, FileJson, Loader2, Check, AlertCircle } from 'lucide-svelte';
  import type { Entry } from '$lib/types';

  let fileInput: HTMLInputElement;
  let dragOver = $state(false);
  let parseResult = $state<LorebookImportResult | null>(null);
  let useAIClassification = $state(true);
  let classifying = $state(false);
  let classificationProgress = $state(0);
  let importing = $state(false);
  let error = $state<string | null>(null);

  const previewCount = $derived(parseResult?.entries.length ?? 0);

  // Type counts for preview
  const typeCounts = $derived.by(() => {
    if (!parseResult) return {};
    return parseResult.entries.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  });

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) {
      processFile(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function processFile(file: File) {
    error = null;
    parseResult = null;

    if (!file.name.endsWith('.json')) {
      error = 'Please select a JSON file';
      return;
    }

    try {
      const text = await file.text();
      const result = parseSillyTavernLorebook(text);

      if (!result.success || result.entries.length === 0) {
        error = result.errors.length > 0
          ? result.errors.join(', ')
          : 'No entries found in this lorebook';
        return;
      }

      parseResult = result;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to parse file';
    }
  }

  async function handleClassify() {
    if (!parseResult) return;

    classifying = true;
    classificationProgress = 0;
    error = null;

    try {
      const classified = await classifyEntriesWithLLM(
        parseResult.entries,
        (progress) => {
          classificationProgress = progress;
        }
      );
      parseResult = {
        ...parseResult,
        entries: classified,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Classification failed';
    } finally {
      classifying = false;
    }
  }

  async function handleImport() {
    if (!parseResult || !story.currentStory) return;

    importing = true;
    error = null;

    try {
      // Run AI classification first if enabled
      let entriesToImport = parseResult.entries;
      if (useAIClassification) {
        classifying = true;
        classificationProgress = 0;
        entriesToImport = await classifyEntriesWithLLM(
          parseResult.entries,
          (progress) => {
            classificationProgress = progress;
          }
        );
        classifying = false;
      }

      // Convert to Entry format
      const entries = convertToEntries(entriesToImport, 'import');

      // Add each entry to the database
      const storyId = story.currentStory.id;
      for (const entryData of entries) {
        const entry: Entry = {
          ...entryData,
          id: crypto.randomUUID(),
          storyId,
        };
        await database.addEntry(entry);
      }

      // Reload entries into store
      const allEntries = await database.getEntries(storyId);
      story.lorebookEntries = allEntries;

      // Close modal
      ui.closeLorebookImport();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Import failed';
    } finally {
      importing = false;
      classifying = false;
    }
  }

  function close() {
    ui.closeLorebookImport();
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
    class="card w-full max-w-lg max-h-[90vh] overflow-hidden"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-4">
      <div class="flex items-center gap-2">
        <Upload class="h-5 w-5 text-accent-400" />
        <h2 class="text-xl font-semibold text-surface-100">Import Lorebook</h2>
      </div>
      <button class="btn-ghost rounded-lg p-2" onclick={close}>
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Content -->
    <div class="py-4 space-y-4 max-h-[60vh] overflow-y-auto">
      {#if error}
        <div class="p-3 rounded-lg bg-red-500/20 border border-red-500/50 flex items-start gap-2">
          <AlertCircle class="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p class="text-red-300 text-sm">{error}</p>
        </div>
      {/if}

      {#if !parseResult}
        <!-- File upload area -->
        <div
          class="border-2 border-dashed rounded-lg p-8 text-center transition-colors
            {dragOver ? 'border-accent-500 bg-accent-500/10' : 'border-surface-600 hover:border-surface-500'}"
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="button"
          tabindex="0"
          onclick={() => fileInput.click()}
          onkeydown={(e) => e.key === 'Enter' && fileInput.click()}
        >
          <FileJson class="h-12 w-12 text-surface-500 mx-auto mb-3" />
          <p class="text-surface-300 mb-1">Drop a SillyTavern lorebook here</p>
          <p class="text-sm text-surface-500">or click to browse</p>
        </div>
        <input
          type="file"
          accept=".json"
          class="hidden"
          bind:this={fileInput}
          onchange={handleFileSelect}
        />

        <p class="text-xs text-surface-500">
          Supports SillyTavern lorebook format (.json)
        </p>
      {:else}
        <!-- Preview -->
        <div class="p-4 rounded-lg bg-surface-800/50 border border-surface-700">
          <div class="flex items-center gap-2 mb-3">
            <Check class="h-5 w-5 text-green-400" />
            <span class="text-surface-200">Found {previewCount} entries</span>
          </div>

          <!-- Entry type breakdown -->
          <div class="text-sm text-surface-400 space-y-1">
            {#each Object.entries(typeCounts) as [type, count]}
              <div class="flex items-center justify-between">
                <span class="capitalize">{type}</span>
                <span>{count}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- AI Classification toggle -->
        <label class="flex items-center justify-between p-3 rounded-lg bg-surface-800/50 border border-surface-700 cursor-pointer">
          <div>
            <div class="text-surface-200">AI-powered classification</div>
            <div class="text-xs text-surface-500">Use AI to better categorize entry types</div>
          </div>
          <input
            type="checkbox"
            bind:checked={useAIClassification}
            class="h-5 w-5 rounded border-surface-600 bg-surface-800 text-accent-500 focus:ring-accent-500"
          />
        </label>

        {#if classifying}
          <div class="p-3 rounded-lg bg-surface-800/50 border border-surface-700">
            <div class="flex items-center gap-2 mb-2">
              <Loader2 class="h-4 w-4 text-accent-400 animate-spin" />
              <span class="text-sm text-surface-300">Classifying entries...</span>
            </div>
            <div class="w-full h-2 bg-surface-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-accent-500 transition-all"
                style="width: {classificationProgress}%"
              ></div>
            </div>
          </div>
        {/if}

        <!-- Change file button -->
        <button
          class="text-sm text-accent-400 hover:text-accent-300"
          onclick={() => { parseResult = null; error = null; }}
        >
          Choose a different file
        </button>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex gap-2 pt-4 border-t border-surface-700">
      <button
        class="btn-ghost flex-1 py-2 border border-surface-600 rounded-lg"
        onclick={close}
        disabled={importing}
      >
        Cancel
      </button>
      <button
        class="btn-primary flex-1 py-2 flex items-center justify-center gap-2"
        onclick={handleImport}
        disabled={!parseResult || importing || classifying}
      >
        {#if importing || classifying}
          <Loader2 class="h-4 w-4 animate-spin" />
          {classifying ? 'Classifying...' : 'Importing...'}
        {:else}
          Import {previewCount} Entries
        {/if}
      </button>
    </div>
  </div>
</div>
