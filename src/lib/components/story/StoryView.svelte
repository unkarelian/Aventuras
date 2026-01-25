<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { Loader2 } from 'lucide-svelte';
  import StoryEntry from './StoryEntry.svelte';
  import StreamingEntry from './StreamingEntry.svelte';
  import ActionInput from './ActionInput.svelte';
  import ActionChoices from './ActionChoices.svelte';

  let storyContainer: HTMLDivElement;

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

  // Check if container is scrolled near bottom
  function isNearBottom(): boolean {
    if (!storyContainer) return true;
    const threshold = 100; // pixels from bottom
    return storyContainer.scrollHeight - storyContainer.scrollTop - storyContainer.clientHeight < threshold;
  }

  // Handle scroll events during streaming
  function handleScroll() {
    // Only track scroll during streaming
    if (!ui.isStreaming) return;

    // If user scrolled away from bottom, break auto-scroll until next user message
    if (!isNearBottom()) {
      ui.setScrollBreak(true);
    }
  }

  // Auto-scroll to bottom when new entries are added or streaming content changes
  // Use requestAnimationFrame to batch scroll updates and avoid layout thrashing
  let scrollRAF: number | null = null;

  $effect(() => {
    // Track both entries and streaming state for scroll
    const _ = story.entries.length;
    const __ = ui.streamingContent;

    // Skip auto-scroll if user has scrolled up (persists until next user message)
    if (ui.userScrolledUp) return;

    // Cancel any pending scroll to avoid redundant operations
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
  });

  // Scroll to bottom when returning from gallery or other panels
  $effect(() => {
    if (ui.activePanel === 'story' && storyContainer) {
      requestAnimationFrame(() => {
        if (storyContainer) {
          storyContainer.scrollTop = storyContainer.scrollHeight;
        }
      });
    }
  });
</script>

<div class="flex h-full flex-col">
  <!-- Story entries container -->
  <div
    bind:this={storyContainer}
    class="flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-4"
    onscroll={handleScroll}
  >
    <div class="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      {#if story.entries.length === 0 && !ui.isStreaming}
        <div class="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-2">
          <p class="text-base sm:text-lg text-surface-400">Your adventure begins here...</p>
          <p class="mt-2 text-sm text-surface-500">
            Type an action below to start your story
          </p>
        </div>
      {:else}
        <!-- Show collapsed entries indicator if there are hidden entries -->
        {#if displayedEntries.hiddenCount > 0}
          <div class="flex flex-col items-center gap-2 py-3 mb-3 border-b border-surface-700">
            <p class="text-sm text-surface-400">
              {displayedEntries.hiddenCount} earlier entries hidden for performance
            </p>
            <div class="flex gap-2">
              <button
                onclick={showMoreEntries}
                class="px-3 py-1.5 text-xs font-medium text-surface-300 bg-surface-700 hover:bg-surface-600 rounded-md transition-colors"
              >
                Show {Math.min(LOAD_MORE_BATCH, displayedEntries.hiddenCount)} more
              </button>
              <button
                onclick={showAllEntries}
                class="px-3 py-1.5 text-xs font-medium text-surface-400 hover:text-surface-300 transition-colors"
              >
                Show all
              </button>
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
           <div class="flex items-center justify-center py-2 text-surface-400 gap-2 animate-fade-in">
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
  </div>

  <!-- Action input area -->
  <div class="border-t border-surface-700 bg-surface-800 px-3 sm:pl-6 sm:pr-8 pt-2 pb-1 sm:py-4 pb-safe">
    <div class="mx-auto max-w-[48rem]">
      <ActionInput />
    </div>
  </div>
</div>
