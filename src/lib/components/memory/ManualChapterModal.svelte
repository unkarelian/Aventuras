<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal';
  import { Button } from '$lib/components/ui/button';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils/cn';

  interface Props {
    onConfirm: (endEntryIndex: number) => void;
    onClose: () => void;
  }

  let { onConfirm, onClose }: Props = $props();

  // Get entries available for chapter creation
  // These are entries after the last chapter
  const availableEntries = $derived(() => {
    const lastChapterEndIndex = story.lastChapterEndIndex;
    return story.entries.slice(lastChapterEndIndex);
  });

  const entries = $derived(availableEntries());

  // Selected entry index (relative to available entries)
  let selectedIndex = $state(Math.max(0, entries.length - 1));

  // Ensure selectedIndex stays in bounds
  $effect(() => {
    if (selectedIndex >= entries.length) {
      selectedIndex = Math.max(0, entries.length - 1);
    }
  });

  function truncate(text: string, maxLength: number = 80): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trim() + '...';
  }

  function handleConfirm() {
    if (entries.length === 0) return;
    // Convert to absolute index
    const absoluteIndex = story.lastChapterEndIndex + selectedIndex + 1;
    onConfirm(absoluteIndex);
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => !open && onClose()}>
  <ResponsiveModal.Content class="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-4 py-4 border-b">
      <ResponsiveModal.Title>Create Chapter</ResponsiveModal.Title>
      <ResponsiveModal.Description>
        Select where to end this chapter. All entries up to and including the selected entry
        will be summarized.
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 min-h-0">
      {#if entries.length === 0}
        <div class="flex items-center justify-center h-40 text-muted-foreground">
          No entries available for chapter creation.
        </div>
      {:else}
        <ScrollArea class="h-[50vh] p-4">
          <div class="space-y-1">
            {#each entries as entry, idx}
              <button
                class={cn(
                  "w-full text-left p-3 rounded-lg transition-colors border",
                  selectedIndex === idx 
                    ? "bg-primary/10 border-primary/50 ring-1 ring-primary/20" 
                    : "hover:bg-muted/50 border-transparent"
                )}
                onclick={() => selectedIndex = idx}
              >
                <div class="flex items-start gap-3">
                  <Badge variant={entry.type === 'user_action' ? 'secondary' : 'outline'} class="shrink-0 mt-0.5 text-[10px] px-1.5 h-5">
                    {entry.type === 'user_action' ? 'ACTION' : 'NARRATIVE'}
                  </Badge>
                  <span class="text-sm text-foreground/80 leading-relaxed line-clamp-2">
                    {entry.content}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        </ScrollArea>
        
        <div class="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/20">
          Chapter will include {selectedIndex + 1} of {entries.length} entries
        </div>
      {/if}
    </div>

    <ResponsiveModal.Footer class="px-4 py-4 border-t mt-auto">
      <Button variant="outline" onclick={onClose}>
        Cancel
      </Button>
      <Button 
        onclick={handleConfirm}
        disabled={entries.length === 0 || ui.memoryLoading}
      >
        {#if ui.memoryLoading}
          Creating...
        {:else}
          Create Chapter
        {/if}
      </Button>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

