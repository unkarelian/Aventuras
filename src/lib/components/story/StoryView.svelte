<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { Loader2, BookOpen, ChevronDown } from 'lucide-svelte';
  import StoryEntry from './StoryEntry.svelte';
  import StreamingEntry from './StreamingEntry.svelte';
  import ActionInput from './ActionInput.svelte';
  import ActionChoices from './ActionChoices.svelte';
  import { Button } from '$lib/components/ui/button';
  import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte';

  let storyContainer: HTMLDivElement;
  let containerHeight = $state(0);
  let innerHeight = $state(0);

  // Virtualization: Only render recent entries by default for performance
  // This dramatically improves performance with large stories (80k+ words)
  const DEFAULT_VISIBLE_ENTRIES = 50;
  const LOAD_MORE_BATCH = 50;

  // Track how many entries to show (starts at DEFAULT_VISIBLE_ENTRIES)
  let visibleEntryCount = $state(DEFAULT_VISIBLE_ENTRIES);

  // Track the current story ID to detect story switches
  let lastStoryId = $state<string | null>(null);

  // Reset visible count when story changes
  $effect(() => {
    const currentStoryId = story.currentStory?.id ?? null;

    // If story changed, reset the visible count
    if (currentStoryId !== lastStoryId) {
      lastStoryId = currentStoryId;
      visibleEntryCount = DEFAULT_VISIBLE_ENTRIES;
    }
  });

  // Compute which entries to render (using $derived.by for complex logic)
  const displayedEntries = $derived.by(() => {
    const entries = story.entries;
    const total = entries.length;

    if (total <= visibleEntryCount) {
      return { entries, hiddenCount: 0, startIndex: 0 };
    }

    // Show the most recent entries
    const startIndex = total - visibleEntryCount;
    return {
      entries: entries.slice(startIndex),
      hiddenCount: startIndex,
      startIndex,
    };
  });

  function showMoreEntries() {
    visibleEntryCount = Math.min(
      visibleEntryCount + LOAD_MORE_BATCH,
      story.entries.length
    );
  }

  function showAllEntries() {
    visibleEntryCount = story.entries.length;
  }

  function scrollToBottom() {
    if (!storyContainer) return;

    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
    }
    
    // Batch scroll update with requestAnimationFrame for better performance
    scrollRAF = requestAnimationFrame(() => {
      if (storyContainer) {
        storyContainer.scrollTop = storyContainer.scrollHeight;
      }
      scrollRAF = null;
    });
  }

  // Check if container is scrolled near bottom
  function isNearBottom(): boolean {
    if (!storyContainer) return true;
    const threshold = 50; // pixels from bottom
    return storyContainer.scrollHeight - storyContainer.scrollTop - storyContainer.clientHeight < threshold;
  }
  // Handle scroll events during streaming
  function handleScroll() {
    if (!storyContainer) return;

    // Keep userScrolledUp in sync with actual scroll position
    // This allows re-engaging auto-scroll when the user scrolls back to bottom
    const nearBottom = isNearBottom();
    
    // Update the break state based on current scroll position
    // If we are near bottom, we are NOT "scrolled up"
    // If we are NOT near bottom, we ARE "scrolled up"
    if (nearBottom) {
      if (ui.userScrolledUp) ui.setScrollBreak(false);
    } else {
      if (!ui.userScrolledUp) ui.setScrollBreak(true);
    }
  }

  // Auto-scroll to bottom when new entries are added or streaming content changes
  // Use requestAnimationFrame to batch scroll updates and avoid layout thrashing
  let scrollRAF: number | null = null;
  let prevEntryCount = 0;


  $effect(() => {
    // Track primary scroll-inducing changes
    const currentCount = story.entries.length;
    const _ = innerHeight;
    const __ = containerHeight;

    // Detect if entries were added (vs deleted or unchanged)
    const wasAdded = currentCount > prevEntryCount;
    prevEntryCount = currentCount;

    // Detect if we should scroll: 
    // 1. We are NOT user-scrolled-up (pinned mode)
    // 2. OR on user action send message/retry
    const lastEntry = story.entries[story.entries.length - 1];
    const shouldScroll = !ui.userScrolledUp || (wasAdded && lastEntry && ['user_action', 'retry'].includes(lastEntry.type));
    
    if (!shouldScroll) return;

    scrollToBottom();
  });

  // Scroll to bottom when returning from gallery or other panels
  $effect(() => {
    if (ui.activePanel === 'story' && storyContainer) {
      scrollToBottom();
    }
  });
</script>

<div class="flex h-full flex-col">
  <!-- Story entries container -->
  <div
    bind:this={storyContainer}
    bind:clientHeight={containerHeight}
    class="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4"
    onscroll={handleScroll}
  >
    <div class="mx-auto max-w-3xl space-y-3 sm:space-y-4" bind:clientHeight={innerHeight}>
      {#if story.entries.length === 0 && !ui.isStreaming}
        <EmptyState
          icon={BookOpen}
          title="Your adventure begins here..."
          description="Type an action below to start your story."
          class="py-12 sm:py-20"
        />
      {:else}
        <!-- Show collapsed entries indicator if there are hidden entries -->
        {#if displayedEntries.hiddenCount > 0}
          <div class="flex flex-col items-center gap-2 py-3 mb-3 border-b border-border">
            <p class="text-sm text-muted-foreground">
              {displayedEntries.hiddenCount} earlier entries hidden for performance
            </p>
            <div class="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                class="h-7 text-xs"
                onclick={showMoreEntries}
              >
                Show {Math.min(LOAD_MORE_BATCH, displayedEntries.hiddenCount)} more
              </Button>
              <Button
                variant="text"
                size="sm"
                class="h-7 text-xs"
                onclick={showAllEntries}
              >
                Show all
              </Button>
            </div>
          </div>
        {/if}

        {#each displayedEntries.entries as entry (entry.id)}
          <StoryEntry {entry} />
        {/each}

        <!-- Show streaming entry while generating -->
        {#if ui.isStreaming}
          <StreamingEntry />
        {/if}

        <!-- Show post-generation status (e.g. Updating world...) -->
        {#if ui.isGenerating && !ui.isStreaming && ui.generationStatus}
           <div class="flex items-center justify-center py-2 text-muted-foreground gap-2 animate-fade-in">
             <Loader2 class="h-4 w-4 animate-spin" />
             <span class="text-sm">{ui.generationStatus}</span>
           </div>
        {/if}

        <!-- Show RPG-style action choices after narration (adventure mode only) -->
        {#if !ui.isStreaming && !ui.isGenerating && story.storyMode === 'adventure' && !settings.uiSettings.disableSuggestions}
          <ActionChoices />
        {/if}
      {/if}
    </div>

    <!-- Scroll to bottom button -->
    {#if ui.userScrolledUp}
      <div class="sticky bottom-2 flex justify-center w-full pointer-events-none pb-2">
        <Button
          variant="secondary"
          size="sm"
          class="h-9 w-9 rounded-full shadow-lg border border-border bg-background/80 backdrop-blur-sm pointer-events-auto hover:bg-accent animate-in fade-in slide-in-from-bottom-2"
          onclick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ChevronDown class="h-5 w-5" />
        </Button>
      </div>
    {/if}
  </div>

  <!-- Action input area -->
  <div class="border-t border-border bg-card px-3 sm:pl-6 sm:pr-8 pt-2 pb-1 sm:py-4 pb-safe">
    <div class="mx-auto max-w-3xl">
      <ActionInput />
    </div>
  </div>
</div>
