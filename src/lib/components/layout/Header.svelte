<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { exportService } from '$lib/services/export';
  import { PanelLeft, Settings, BookOpen, Library, Feather, Download, FileJson, FileText, ChevronDown, Bug } from 'lucide-svelte';

  let showExportMenu = $state(false);

  async function exportAventura() {
    if (!story.currentStory) return;
    showExportMenu = false;
    await exportService.exportToAventura(
      story.currentStory,
      story.entries,
      story.characters,
      story.locations,
      story.items,
      story.storyBeats
    );
  }

  async function exportMarkdown() {
    if (!story.currentStory) return;
    showExportMenu = false;
    await exportService.exportToMarkdown(
      story.currentStory,
      story.entries,
      story.characters,
      story.locations,
      true
    );
  }

  async function exportText() {
    if (!story.currentStory) return;
    showExportMenu = false;
    await exportService.exportToText(story.currentStory, story.entries);
  }
</script>

<header class="flex h-14 items-center justify-between border-b border-surface-700 bg-surface-800 px-4">
  <!-- Left side: Menu toggle and story title -->
  <div class="flex items-center gap-3">
    {#if story.currentStory}
      <button
        class="btn-ghost rounded-lg p-2"
        onclick={() => ui.toggleSidebar()}
        title={ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <PanelLeft class="h-5 w-5" />
      </button>
    {/if}

    <div class="flex items-center gap-2">
      <Feather class="h-5 w-5 text-accent-500" />
      <span class="font-semibold text-surface-100">Aventura</span>
    </div>

    {#if story.currentStory}
      <span class="text-surface-500 hidden sm:inline">|</span>
      <span class="text-surface-300 truncate max-w-[150px] sm:max-w-none">{story.currentStory.title}</span>
      {#if settings.uiSettings.showWordCount}
        <span class="text-sm text-surface-500 hidden sm:inline">({story.wordCount} words)</span>
      {/if}
    {/if}
  </div>

  <!-- Center: Navigation tabs -->
  <div class="flex items-center gap-1">
    <button
      class="btn-ghost flex items-center gap-2 rounded-lg px-3 py-1.5"
      class:bg-surface-700={ui.activePanel === 'library' || !story.currentStory}
      onclick={() => ui.setActivePanel('library')}
      title="Library"
    >
      <Library class="h-4 w-4" />
      <span class="text-sm hidden sm:inline">Library</span>
    </button>

    {#if story.currentStory}
      <button
        class="btn-ghost flex items-center gap-2 rounded-lg px-3 py-1.5"
        class:bg-surface-700={ui.activePanel === 'story'}
        onclick={() => ui.setActivePanel('story')}
        title="Story"
      >
        <BookOpen class="h-4 w-4" />
        <span class="text-sm hidden sm:inline">Story</span>
      </button>
    {/if}
  </div>

  <!-- Right side: Export and Settings -->
  <div class="flex items-center gap-2">
    {#if ui.isGenerating}
      <div class="flex items-center gap-2 text-sm text-accent-400">
        <div class="h-2 w-2 animate-pulse rounded-full bg-accent-500"></div>
        <span class="hidden sm:inline">Generating...</span>
      </div>
    {/if}

    {#if story.currentStory}
      <div class="relative">
        <button
          class="btn-ghost flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm"
          onclick={() => showExportMenu = !showExportMenu}
          title="Export story"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">Export</span>
          <ChevronDown class="h-3 w-3 hidden sm:inline" />
        </button>

        {#if showExportMenu}
          <div
            class="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-surface-600 bg-surface-800 py-1 shadow-lg"
          >
            <button
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-surface-300 hover:bg-surface-700"
              onclick={exportAventura}
            >
              <FileJson class="h-4 w-4 text-accent-400" />
              Aventura (.avt)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-surface-300 hover:bg-surface-700"
              onclick={exportMarkdown}
            >
              <FileText class="h-4 w-4 text-blue-400" />
              Markdown (.md)
            </button>
            <button
              class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-surface-300 hover:bg-surface-700"
              onclick={exportText}
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
        class="btn-ghost rounded-lg p-2 relative"
        onclick={() => ui.toggleLorebookDebug()}
        title="View active lorebook entries"
      >
        <Bug class="h-5 w-5" />
        {#if ui.lastLorebookRetrieval && ui.lastLorebookRetrieval.all.length > 0}
          <span class="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-accent-500 text-[10px] font-medium flex items-center justify-center text-white">
            {ui.lastLorebookRetrieval.all.length}
          </span>
        {/if}
      </button>
    {/if}

    <button
      class="btn-ghost rounded-lg p-2"
      onclick={() => ui.openSettings()}
      title="Settings"
    >
      <Settings class="h-5 w-5" />
    </button>
  </div>
</header>

<!-- Click outside to close export menu -->
{#if showExportMenu}
  <div
    class="fixed inset-0 z-40"
    onclick={() => showExportMenu = false}
    onkeydown={(e) => e.key === 'Escape' && (showExportMenu = false)}
    role="button"
    tabindex="-1"
    aria-label="Close export menu"
  ></div>
{/if}
