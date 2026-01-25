<script lang="ts">
  import { onMount } from "svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { exportService } from "$lib/services/export";
  import { database } from "$lib/services/database";
  import {
    eventBus,
    type ImageAnalysisStartedEvent,
    type ImageAnalysisCompleteEvent,
    type ImageQueuedEvent,
    type ImageReadyEvent,
  } from "$lib/services/events";
  import {
    PanelRight,
    Settings,
    BookOpen,
    Library,
    Download,
    FileJson,
    FileText,
    ChevronDown,
    Bug,
    BookMarked,
    Brain,
    ImageIcon,
  } from "lucide-svelte";

  let showExportMenu = $state(false);

  // Subscribe to image generation events
  onMount(() => {
    const unsubAnalysisStarted = eventBus.subscribe<ImageAnalysisStartedEvent>(
      "ImageAnalysisStarted",
      () => ui.setImageAnalysisInProgress(true),
    );

    const unsubAnalysisComplete =
      eventBus.subscribe<ImageAnalysisCompleteEvent>(
        "ImageAnalysisComplete",
        () => ui.setImageAnalysisInProgress(false),
      );

    const unsubImageQueued = eventBus.subscribe<ImageQueuedEvent>(
      "ImageQueued",
      () => ui.incrementImagesGenerating(),
    );

    const unsubImageReady = eventBus.subscribe<ImageReadyEvent>(
      "ImageReady",
      () => ui.decrementImagesGenerating(),
    );

    return () => {
      unsubAnalysisStarted();
      unsubAnalysisComplete();
      unsubImageQueued();
      unsubImageReady();
    };
  });

  async function handleExport(
    exportFn: () => Promise<boolean>,
    formatName: string,
  ) {
    if (!story.currentStory) return;
    showExportMenu = false;
    try {
      const success = await exportFn();
      if (success) {
        ui.showToast(`Exported story as ${formatName}`, "info");
      } else {
        ui.showToast("Export cancelled", "info");
      }
    } catch (error) {
      console.error("[Header] Export failed:", error);
      ui.showToast(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    }
  }

  async function exportAventuras() {
    if (!story.currentStory) return;
    const [
      entries,
      characters,
      locations,
      items,
      storyBeats,
      lorebookEntries,
      embeddedImages,
      checkpoints,
      branches,
      chapters,
    ] = await Promise.all([
      database.getStoryEntries(story.currentStory.id),
      database.getCharacters(story.currentStory.id),
      database.getLocations(story.currentStory.id),
      database.getItems(story.currentStory.id),
      database.getStoryBeats(story.currentStory.id),
      database.getEntries(story.currentStory.id),
      database.getEmbeddedImagesForStory(story.currentStory.id),
      database.getCheckpoints(story.currentStory.id),
      database.getBranches(story.currentStory.id),
      database.getChapters(story.currentStory.id),
    ]);
    await handleExport(
      () =>
        exportService.exportToAventura(
          story.currentStory,
          entries,
          characters,
          locations,
          items,
          storyBeats,
          lorebookEntries,
          embeddedImages,
          checkpoints,
          branches,
          chapters,
        ),
      "Aventuras (.avt)",
    );
  }

  async function exportMarkdown() {
    if (!story.currentStory) return;
    await handleExport(
      () =>
        exportService.exportToMarkdown(
          story.currentStory,
          story.entries,
          story.characters,
          story.locations,
          true,
        ),
      "Markdown (.md)",
    );
  }

  async function exportText() {
    if (!story.currentStory) return;
    await handleExport(
      () => exportService.exportToText(story.currentStory, story.entries),
      "Plain Text (.txt)",
    );
  }
</script>

<header
  class="relative z-10 flex h-12 sm:h-14 items-center justify-between border-b border-surface-700 bg-surface-800 px-1 sm:px-4"
>
  <!-- Left side: Story title -->
  <div class="flex items-center min-w-0">
    <div class="flex items-center gap-3 px-2.5 sm:px-1">
      {#if story.currentStory}
        <img src="/logo.png" alt="Aventuras" class="h-7 w-7 flex-shrink-0" />
        <span
          class="font-semibold text-surface-100 text-sm sm:text-base truncate max-w-[160px] sm:max-w-none"
        >
          {story.currentStory.title}
        </span>
        {#if settings.uiSettings.showWordCount}
          <span class="text-sm text-surface-500 hidden lg:inline"
            >({story.wordCount} words)</span
          >
        {/if}
      {:else}
        <!-- App Branding (Library Mode) -->
        <img src="/logo.png" alt="Aventuras" class="h-7 w-7 flex-shrink-0" />
        <span class="font-semibold text-surface-100 text-lg">Aventuras</span>
      {/if}
    </div>
  </div>

  <!-- Center: Navigation tabs (Removed) -->
  <div class="flex-1"></div>

  <!-- Right side: Export and Settings -->

  <div class="flex items-center gap-0 sm:gap-1">
    {#if ui.isGenerating}
      <div class="flex items-center gap-1.5 text-sm text-accent-400">
        <div class="h-2 w-2 animate-pulse rounded-full bg-accent-500"></div>
        <span class="hidden sm:inline">Generating...</span>
      </div>
    {/if}

    <!-- Back to Library Button (right side) -->
    {#if story.currentStory}
      <button
        class="btn-ghost flex items-center justify-center rounded-lg p-2 text-surface-400 hover:bg-surface-700 hover:text-surface-100 min-h-[44px] min-w-[44px]"
        onclick={() => {
          story.closeStory();
          ui.setActivePanel("library");
        }}
        title="Return to Library"
      >
        <Library class="h-5 w-5" />
      </button>
    {/if}

    <!-- Image generation status indicators -->
    {#if ui.imageAnalysisInProgress}
      <div
        class="flex items-center gap-1.5 text-sm text-blue-400"
        title="Analyzing scene for images"
      >
        <ImageIcon class="h-3.5 w-3.5 animate-pulse" />
        <span class="hidden sm:inline">Analyzing...</span>
      </div>
    {:else if ui.imagesGenerating > 0}
      <div
        class="flex items-center gap-1.5 text-sm text-emerald-400"
        title="Generating images"
      >
        <ImageIcon class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">
          {ui.imagesGenerating} image{ui.imagesGenerating > 1 ? "s" : ""}
        </span>
        <div class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
      </div>
    {/if}

    {#if story.currentStory}
      <!-- Gallery Button -->
      <button
        class="btn-ghost flex items-center gap-1 rounded-lg p-2 sm:px-2 sm:py-1.5 text-sm min-h-[44px] min-w-[44px] justify-center"
        onclick={() => ui.setActivePanel(ui.activePanel === 'gallery' ? 'story' : 'gallery')}
        title="View generated images"
      >
        <ImageIcon class="h-4 w-4" />
        <span class="hidden sm:inline">Gallery</span>
      </button>

      <!-- Export Button -->
      <div class="relative">
        <button
          class="btn-ghost flex items-center gap-1 rounded-lg p-2 sm:px-2 sm:py-1.5 text-sm min-h-[44px] min-w-[44px] justify-center"
          onclick={() => (showExportMenu = !showExportMenu)}
          title="Export story"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">Export</span>
          <ChevronDown class="h-3 w-3 hidden sm:inline" />
        </button>

        {#if showExportMenu}
          <div
            class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-surface-600 bg-surface-800 py-1 shadow-lg pointer-events-auto"
          >
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px] pointer-events-auto cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                exportAventuras();
              }}
            >
              <FileJson class="h-4 w-4 text-accent-400" />
              Aventuras (.avt)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px] pointer-events-auto cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                exportMarkdown();
              }}
            >
              <FileText class="h-4 w-4 text-blue-400" />
              Markdown (.md)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-3 sm:py-2 text-left text-sm text-surface-300 hover:bg-surface-700 min-h-[44px] pointer-events-auto cursor-pointer"
              onclick={(e) => {
                e.stopPropagation();
                exportText();
              }}
            >
              <FileText class="h-4 w-4 text-surface-400" />
              Plain Text (.txt)
            </button>
          </div>
        {/if}
      </div>
    {/if}

    {#if story.currentStory && story.lorebookEntries.length > 0}
      <button
        class="btn-ghost rounded-lg p-2 relative min-h-[44px] min-w-[44px] flex items-center justify-center hidden sm:flex"
        onclick={() => ui.toggleLorebookDebug()}
        title="View active lorebook entries"
      >
        <Bug class="h-5 w-5" />
        {#if ui.lastLorebookRetrieval && ui.lastLorebookRetrieval.all.length > 0}
          <span
            class="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent-500 text-[10px] font-medium flex items-center justify-center text-white"
          >
            {ui.lastLorebookRetrieval.all.length}
          </span>
        {/if}
      </button>
    {/if}

    {#if !story.currentStory}
      <a
        href="https://discord.gg/DqVzhSPC46"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-ghost rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center sm:hidden"
        title="Join our Discord community"
      >
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
          />
        </svg>
      </a>
    {/if}

    <button
      class="btn-ghost rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
      onclick={() => ui.openSettings()}
      title="Settings"
    >
      <Settings class="h-5 w-5" />
    </button>

    {#if story.currentStory}
      <button
        class="btn-ghost rounded-lg p-3 min-h-[48px] min-w-[48px] flex items-center justify-center"
        onclick={() => ui.toggleSidebar()}
        title={ui.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      >
        <PanelRight class="h-5 w-5" />
      </button>
    {/if}
  </div>
</header>

<!-- Click outside to close export menu -->
{#if showExportMenu}
  <div
    class="fixed inset-0 z-40 pointer-events-none"
    onclick={() => (showExportMenu = false)}
    onkeydown={(e) => e.key === "Escape" && (showExportMenu = false)}
    role="button"
    tabindex="-1"
    aria-label="Close export menu"
  ></div>
{/if}
