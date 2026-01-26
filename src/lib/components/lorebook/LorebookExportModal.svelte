<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { exportLorebook, getFormatInfo, type ExportFormat } from '$lib/services/lorebookExporter';
  import { Download, FileJson, FileText, Check, Loader2 } from 'lucide-svelte';
  
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal';
  import { Button } from '$lib/components/ui/button';
  import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group';
  import { Label } from '$lib/components/ui/label';
  import { cn } from '$lib/utils/cn';

  let selectedFormat = $state<ExportFormat>('aventura');
  let exportSelected = $state(false);
  let exporting = $state(false);

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
      ui.showToast('No entries to export', 'error');
      return;
    }

    exporting = true;

    try {
      await exportLorebook({
        format: selectedFormat,
        entries: entriesToExport(),
        filename: story.currentStory?.title
          ? `${story.currentStory.title}-lorebook`
          : undefined,
      });
      ui.showToast('Export successful', 'info');
      ui.closeLorebookExport();
    } catch (err) {
      ui.showToast(err instanceof Error ? err.message : 'Export failed', 'error');
    } finally {
      exporting = false;
    }
  }

  function close() {
    ui.closeLorebookExport();
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => !open && close()}>
  <ResponsiveModal.Content class="max-w-md max-h-[90vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-6 py-4 border-b">
      <div class="flex items-center gap-2">
        <Download class="h-5 w-5 text-primary" />
        <ResponsiveModal.Title>Export Lorebook</ResponsiveModal.Title>
      </div>
    </ResponsiveModal.Header>

    <div class="py-6 px-6 space-y-6">
      <!-- Export scope -->
      {#if hasSelection}
        <div class="space-y-3">
          <Label>What to export</Label>
          <RadioGroup value={exportSelected ? 'selected' : 'all'} onValueChange={(v) => exportSelected = v === 'selected'}>
            <div class={cn("flex items-center space-x-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50", !exportSelected && "border-primary bg-primary/5")}>
              <RadioGroupItem value="all" id="scope-all" />
              <Label for="scope-all" class="flex-1 cursor-pointer">
                <div class="font-medium">All entries</div>
                <div class="text-xs text-muted-foreground">{story.lorebookEntries.length} entries</div>
              </Label>
            </div>
            
            <div class={cn("flex items-center space-x-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50", exportSelected && "border-primary bg-primary/5")}>
              <RadioGroupItem value="selected" id="scope-selected" />
              <Label for="scope-selected" class="flex-1 cursor-pointer">
                <div class="font-medium">Selected only</div>
                <div class="text-xs text-muted-foreground">{ui.lorebookBulkSelection.size} entries</div>
              </Label>
            </div>
          </RadioGroup>
        </div>
      {:else}
        <div class="p-3 rounded-lg bg-muted/50 border">
          <div class="font-medium text-foreground">{story.lorebookEntries.length} entries</div>
          <div class="text-xs text-muted-foreground">All lorebook entries will be exported</div>
        </div>
      {/if}

      <!-- Format selection -->
      <div class="space-y-3">
        <Label>Export format</Label>
        <RadioGroup value={selectedFormat} onValueChange={(v) => selectedFormat = v as ExportFormat}>
          {#each formats as format}
            {@const info = getFormatInfo(format)}
            <div class={cn(
              "flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors",
              selectedFormat === format && "border-primary bg-primary/5"
            )}>
              <RadioGroupItem value={format} id={`format-${format}`} class="mt-1" />
              <div class="flex-1 space-y-1">
                <Label for={`format-${format}`} class="font-medium cursor-pointer flex items-center gap-2">
                  {info.label}
                  <span class="text-xs font-normal text-muted-foreground ml-auto">{info.extension}</span>
                </Label>
                <p class="text-xs text-muted-foreground">{info.description}</p>
              </div>
              <div class="mt-0.5 text-muted-foreground">
                {#if format === 'text'}
                  <FileText class="h-4 w-4" />
                {:else}
                  <FileJson class="h-4 w-4" />
                {/if}
              </div>
            </div>
          {/each}
        </RadioGroup>
      </div>
    </div>

    <ResponsiveModal.Footer class="px-6 py-4 border-t mt-auto">
      <Button variant="outline" onclick={close} disabled={exporting}>
        Cancel
      </Button>
      <Button 
        onclick={handleExport} 
        disabled={exporting || entryCount === 0}
        class="gap-2"
      >
        {#if exporting}
          <Loader2 class="h-4 w-4 animate-spin" />
          Exporting...
        {:else}
          <Download class="h-4 w-4" />
          Export
        {/if}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

