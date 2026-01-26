<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import {
    parseLorebook,
    classifyEntriesWithLLM,
    convertToEntries,
    type ImportedEntry,
    type LorebookImportResult,
  } from "$lib/services/lorebookImporter";
  import { database } from "$lib/services/database";
  import { open } from '@tauri-apps/plugin-dialog';
  import { readTextFile } from '@tauri-apps/plugin-fs';
  import {
    Upload,
    FileJson,
    Loader2,
    Check,
    AlertCircle,
  } from "lucide-svelte";
  import type { Entry } from "$lib/types";
  
  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import { Progress } from "$lib/components/ui/progress";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils/cn";

  let dragOver = $state(false);
  let parseResult = $state<LorebookImportResult | null>(null);
  let useAIClassification = $state(true);
  let classifying = $state(false);
  let classificationProgress = $state(0);
  let importing = $state(false);

  const previewCount = $derived(parseResult?.entries.length ?? 0);

  // Type counts for preview
  const typeCounts = $derived.by(() => {
    if (!parseResult) return {};
    return parseResult.entries.reduce(
      (acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  });

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

  async function processContent(text: string, filename: string) {
    parseResult = null;

    const fileName = filename.toLowerCase();
    if (!fileName.endsWith(".json") && !fileName.endsWith(".avt")) {
      ui.showToast("Please select a JSON or Aventuras file (.json or .avt)", "error");
      return;
    }

    try {
      const result = parseLorebook(text);

      if (!result.success) {
        ui.showToast(
          result.errors.length > 0
            ? result.errors.join(", ")
            : "Invalid lorebook file format",
          "error"
        );
        return;
      }

      if (result.entries.length === 0) {
        ui.showToast("No valid entries found in this lorebook file", "error");
        return;
      }

      parseResult = result;
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : "Failed to read file", "error");
    }
  }

  async function processFile(file: File) {
    try {
      const text = await file.text();
      await processContent(text, file.name);
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : "Failed to read file", "error");
    }
  }

  async function handleBrowse() {
    try {
      const filePath = await open({
        filters: [
          { name: 'Aventura Lorebook', extensions: ['json', 'avt'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!filePath || typeof filePath !== 'string') {
        return;
      }

      const content = await readTextFile(filePath);
      const filename = filePath.split(/[/\\]/).pop() ?? 'lorebook.json';
      await processContent(content, filename);
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : "Failed to open file", "error");
    }
  }

  async function handleClassify() {
    if (!parseResult) return;

    classifying = true;
    classificationProgress = 0;

    try {
      const classified = await classifyEntriesWithLLM(
        parseResult.entries,
        (progress) => {
          classificationProgress = progress;
        },
        story.currentStory?.mode ?? "adventure",
      );
      parseResult = {
        ...parseResult,
        entries: classified,
      };
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : "Classification failed", "error");
    } finally {
      classifying = false;
    }
  }

  async function handleImport() {
    if (!parseResult || !story.currentStory) return;

    importing = true;

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
          },
          story.currentStory?.mode ?? "adventure",
        );
        classifying = false;
      }

      // Convert to Entry format
      const entries = convertToEntries(entriesToImport, "import");

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

      ui.showToast(`Successfully imported ${entries.length} entries`, "info");

      // Close modal
      ui.closeLorebookImport();
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : "Import failed", "error");
    } finally {
      importing = false;
      classifying = false;
    }
  }

  function close() {
    ui.closeLorebookImport();
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => !open && close()}>
  <ResponsiveModal.Content class="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-6 py-4 border-b">
      <div class="flex items-center gap-2">
        <Upload class="h-5 w-5 text-primary" />
        <ResponsiveModal.Title>Import Lorebook</ResponsiveModal.Title>
      </div>
      <ResponsiveModal.Description>
        Import entries from a JSON or Aventuras file.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 overflow-y-auto px-6 py-6 space-y-4">
      {#if !parseResult}
        <!-- File upload area -->
        <div
          class={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
            dragOver
              ? "border-primary bg-primary/10"
              : "border-muted hover:border-muted-foreground/50"
          )}
          ondrop={handleDrop}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          role="button"
          tabindex="0"
          onclick={handleBrowse}
          onkeydown={(e) => e.key === "Enter" && handleBrowse()}
        >
          <FileJson class="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p class="text-foreground mb-1">Drop a lorebook file here</p>
          <p class="text-sm text-muted-foreground">or click to browse</p>
        </div>

        <p class="text-xs text-muted-foreground text-center">
          Supports Aventuras (.avt, .json) and SillyTavern lorebook formats
        </p>
      {:else}
        <!-- Preview -->
        <div class="p-4 rounded-lg bg-muted/50 border">
          <div class="flex items-center gap-2 mb-3">
            <Check class="h-5 w-5 text-green-500" />
            <span class="text-foreground font-medium">Found {previewCount} entries</span>
          </div>

          <!-- Entry type breakdown -->
          <div class="text-sm text-muted-foreground space-y-1">
            {#each Object.entries(typeCounts) as [type, count]}
              <div class="flex items-center justify-between">
                <span class="capitalize">{type}</span>
                <span>{count}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- AI Classification toggle -->
        <div class="flex items-start space-x-2 p-3 rounded-lg border">
          <Checkbox 
            id="ai-classification" 
            bind:checked={useAIClassification} 
            class="mt-1"
          />
          <div class="grid gap-1.5 leading-none">
            <Label
              for="ai-classification"
              class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              AI-powered classification
            </Label>
            <p class="text-xs text-muted-foreground">
              Use AI to better categorize entry types based on their content
            </p>
          </div>
        </div>

        {#if classifying}
          <div class="space-y-2 p-3 rounded-lg bg-muted/30 border">
            <div class="flex items-center gap-2">
              <Loader2 class="h-4 w-4 text-primary animate-spin" />
              <span class="text-sm text-foreground">Classifying entries...</span>
            </div>
            <Progress value={classificationProgress} class="h-2" />
          </div>
        {/if}

        <!-- Change file button -->
        <Button
          variant="link"
          class="h-auto p-0 text-xs"
          onclick={() => {
            parseResult = null;
          }}
        >
          Choose a different file
        </Button>
      {/if}
    </div>

    <ResponsiveModal.Footer class="px-6 py-4 border-t mt-auto">
      <Button variant="outline" onclick={close} disabled={importing}>
        Cancel
      </Button>
      <Button 
        onclick={handleImport} 
        disabled={!parseResult || importing || classifying}
        class="gap-2"
      >
        {#if importing || classifying}
          <Loader2 class="h-4 w-4 animate-spin" />
          {classifying ? "Classifying..." : "Importing..."}
        {:else}
          Import {previewCount} Entries
        {/if}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

