<script lang="ts">
  import { story } from '$lib/stores/story.svelte'
  import { ui } from '$lib/stores/ui.svelte'
  import { settings } from '$lib/stores/settings.svelte'
  import { Loader2, BookOpen, ChevronDown, ChevronUp } from 'lucide-svelte'
  import { fade } from 'svelte/transition'
  import StoryEntry from './StoryEntry.svelte'
  import StreamingEntry from './StreamingEntry.svelte'
  import ActionInput from './ActionInput.svelte'
  import ActionChoices from './ActionChoices.svelte'
  import { Button } from '$lib/components/ui/button'
  import EmptyState from '$lib/components/ui/empty-state/empty-state.svelte'

  let storyContainer: HTMLDivElement
  let containerHeight = $state(0)
  let innerHeight = $state(0)

  // Virtualization: Only render recent entries by default for performance
  // This dramatically improves performance with large stories (80k+ words)
  const DEFAULT_VISIBLE_ENTRIES = 50
  const LOAD_MORE_BATCH = 50
  const SCROLL_THRESHOLD = 50 // pixels from top/bottom to trigger state changes

  // Track how many entries to show (starts at DEFAULT_VISIBLE_ENTRIES)
  let visibleEntryCount = $state(DEFAULT_VISIBLE_ENTRIES)

  // Track if user has scrolled away from top (for showing scroll-to-top button)
  let userScrolledDown = $state(false)

  // Track the current story ID to detect story switches
  let lastStoryId = $state<string | null>(null)

  // Auto-scroll to bottom when new entries are added or streaming content changes
  // Use requestAnimationFrame to batch scroll updates and avoid layout thrashing
  let scrollRAF: number | null = null
  let prevEntryCount = 0

  // Reset visible count when story changes
  $effect(() => {
    const currentStoryId = story.currentStory?.id ?? null

    // If story changed, reset the visible count
    if (currentStoryId !== lastStoryId) {
      lastStoryId = currentStoryId
      visibleEntryCount = DEFAULT_VISIBLE_ENTRIES
    }
  })

  // Compute which entries to render (using $derived.by for complex logic)
  const displayedEntries = $derived.by(() => {
    const entries = story.entries
    const total = entries.length

    if (total <= visibleEntryCount) {
      return { entries, hiddenCount: 0, startIndex: 0 }
    }

    // Show the most recent entries
    const startIndex = total - visibleEntryCount
    return {
      entries: entries.slice(startIndex),
      hiddenCount: startIndex,
      startIndex,
    }
  })

  function showMoreEntries() {
    visibleEntryCount = Math.min(visibleEntryCount + LOAD_MORE_BATCH, story.entries.length)
  }

  function showAllEntries() {
    visibleEntryCount = story.entries.length
  }

  // Helper function to perform smooth scroll with RAF batching
  function performScroll(scrollPosition: number) {
    if (!storyContainer) return

    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF)
    }

    scrollRAF = requestAnimationFrame(() => {
      if (storyContainer) {
        storyContainer.scrollTop = scrollPosition
      }
      scrollRAF = null
    })
  }

  function scrollToBottom() {
    performScroll(storyContainer?.scrollHeight ?? 0)
  }

  function scrollToTop() {
    showAllEntries()
  }

  // Check if container is scrolled near a specific edge
  function isNearEdge(edge: 'top' | 'bottom'): boolean {
    if (!storyContainer) return true
    
    if (edge === 'top') {
      return storyContainer.scrollTop < SCROLL_THRESHOLD
    }
    
    return (
      storyContainer.scrollHeight - storyContainer.scrollTop - storyContainer.clientHeight <
      SCROLL_THRESHOLD
    )
  }
  // Handle scroll events during streaming
  function handleScroll() {
    if (!storyContainer) return

    const nearBottom = isNearEdge('bottom')
    const nearTop = isNearEdge('top')

    // Update scroll break state - if near bottom, re-engage auto-scroll
    if (nearBottom) {
      if (ui.userScrolledUp) ui.setScrollBreak(false)
    } else {
      if (!ui.userScrolledUp) ui.setScrollBreak(true)
    }

    // Track if user has scrolled down from top (for scroll-to-top button)
    userScrolledDown = !nearTop
  }

  // Auto-scroll to bottom when new entries are added or streaming content changes
  $effect(() => {
    // Track primary scroll-inducing changes
    const currentCount = story.entries.length
    const _ = innerHeight
    const __ = containerHeight

    // Detect if entries were added (vs deleted or unchanged)
    const wasAdded = currentCount > prevEntryCount
    prevEntryCount = currentCount

    // Detect if we should scroll:
    // 1. We are NOT user-scrolled-up (pinned mode)
    // 2. OR on user action send message/retry
    const lastEntry = story.entries[story.entries.length - 1]
    const shouldScroll =
      !ui.userScrolledUp ||
      (wasAdded && lastEntry && ['user_action', 'retry'].includes(lastEntry.type))

    if (!shouldScroll) return

    scrollToBottom()
  })

  // Scroll to bottom when returning from gallery or other panels
  $effect(() => {
    if (ui.activePanel === 'story' && storyContainer) {
      scrollToBottom()
    }
  })

  // Format background image URL (handling raw base64 vs data URL)
  const bgImageUrl = $derived.by(() => {
    const raw = story.currentBgImage
    if (!raw) return null
    if (raw.startsWith('data:')) return `url(${raw})`
    return `url(data:image/png;base64,${raw})`
  })
</script>

<div class="relative flex h-full flex-col overflow-hidden">
  <!-- Background Image Layer -->
  {#if story.currentBgImage}
    {#key story.currentBgImage}
      <div
        class="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-all duration-300"
        style="background-image: {bgImageUrl}; filter: blur({settings.systemServicesSettings
          .imageGeneration.backgroundBlur}px); transform: scale({settings.systemServicesSettings
          .imageGeneration.backgroundBlur > 0
          ? 1.05
          : 1});"
        in:fade={{ duration: 800 }}
        out:fade={{ duration: 800 }}
      ></div>
    {/key}
    <!-- Overlay to improve readability -->
    <div class="bg-background/40 pointer-events-none absolute inset-0 z-0"></div>
  {/if}

  <!-- Story entries container -->
  <div
    bind:this={storyContainer}
    bind:clientHeight={containerHeight}
    class="relative z-10 flex-1 overflow-y-auto px-3 pt-3 pb-1 sm:px-6 sm:pt-4 sm:pb-2"
    onscroll={handleScroll}
  >
    <div class="mx-auto max-w-3xl space-y-2.5 sm:space-y-3" bind:clientHeight={innerHeight}>
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
          <div class="border-border mb-3 flex flex-col items-center gap-2 border-b py-3">
            <p class="text-muted-foreground text-sm">
              {displayedEntries.hiddenCount} earlier entries hidden for performance
            </p>
            <div class="flex gap-2">
              <Button variant="secondary" size="sm" class="h-7 text-xs" onclick={showMoreEntries}>
                Show {Math.min(LOAD_MORE_BATCH, displayedEntries.hiddenCount)} more
              </Button>
              <Button variant="text" size="sm" class="h-7 text-xs" onclick={showAllEntries}>
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
          <div
            class="text-muted-foreground animate-fade-in flex items-center justify-center gap-2 py-2"
          >
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

    <!-- Scroll navigation buttons (floating at bottom of scroll container) -->
    {#if story.entries.length > 0}
      {@const buttonClasses = 'h-8 w-8 rounded-full shadow-lg disabled:opacity-50 sm:h-9 sm:w-9'}
      {@const iconClasses = 'h-4 w-4 sm:h-5 sm:w-5'}
      
      <div class="pointer-events-none sticky bottom-0 left-0 right-0 z-20 flex justify-center py-2">
        <div class="pointer-events-auto flex gap-2">
          <!-- Scroll to top button -->
          <Button
            variant="secondary"
            size="sm"
            class={buttonClasses}
            onclick={scrollToTop}
            disabled={!userScrolledDown}
            aria-label="Scroll to first message"
          >
            <ChevronUp class={iconClasses} />
          </Button>

          <!-- Scroll to bottom button -->
          <Button
            variant="secondary"
            size="sm"
            class={buttonClasses}
            onclick={scrollToBottom}
            disabled={!ui.userScrolledUp}
            aria-label="Scroll to bottom"
          >
            <ChevronDown class={iconClasses} />
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Action input area -->
  <div
    class="border-border relative z-10 border-t px-3 pt-2 pb-1 sm:pt-3 sm:pb-2 sm:pr-8 sm:pl-6 {story.currentBgImage
      ? 'bg-background/60 backdrop-blur-md'
      : 'bg-card'}"
  >
    <div class="mx-auto max-w-3xl">
      <ActionInput />
    </div>
  </div>
</div>
