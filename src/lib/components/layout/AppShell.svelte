<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import Sidebar from './Sidebar.svelte';
  import Header from './Header.svelte';
  import StoryView from '$lib/components/story/StoryView.svelte';
  import LibraryView from '$lib/components/story/LibraryView.svelte';
  import LorebookView from '$lib/components/lorebook/LorebookView.svelte';
  import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
  import LorebookDebugPanel from '$lib/components/debug/LorebookDebugPanel.svelte';
  import { swipe } from '$lib/utils/swipe';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();

  // Swipe handlers for mobile sidebar toggle
  function handleSwipeRight() {
    if (story.currentStory && !ui.sidebarOpen) {
      ui.toggleSidebar();
    }
  }

  function handleSwipeLeft() {
    if (ui.sidebarOpen) {
      ui.toggleSidebar();
    }
  }
</script>

<div
  class="app-shell flex h-screen w-screen bg-surface-900"
  use:swipe={{ onSwipeRight: handleSwipeRight, onSwipeLeft: handleSwipeLeft, threshold: 50 }}
>
  <!-- Mobile sidebar overlay (tap to close) -->
  {#if ui.sidebarOpen && story.currentStory}
    <button
      class="mobile-sidebar-overlay"
      onclick={() => ui.toggleSidebar()}
      aria-label="Close sidebar"
    ></button>
  {/if}

  <!-- Sidebar -->
  {#if ui.sidebarOpen && story.currentStory}
    <div class="sidebar-container">
      <Sidebar />
    </div>
  {/if}

  <!-- Left edge swipe zone for opening sidebar (when closed) -->
  {#if !ui.sidebarOpen && story.currentStory}
    <div
      class="swipe-edge-zone"
      use:swipe={{ onSwipeRight: handleSwipeRight, threshold: 30 }}
    ></div>
  {/if}

  <!-- Main content area -->
  <div class="flex flex-1 flex-col overflow-hidden">
    <Header />

    <main class="flex-1 overflow-hidden">
      {#if ui.activePanel === 'story' && story.currentStory}
        <StoryView />
      {:else if ui.activePanel === 'lorebook' && story.currentStory}
        <LorebookView />
      {:else if ui.activePanel === 'library' || !story.currentStory}
        <LibraryView />
      {:else if children}
        {@render children()}
      {/if}
    </main>
  </div>

  <!-- Settings Modal -->
  {#if ui.settingsModalOpen}
    <SettingsModal />
  {/if}

  <!-- Lorebook Debug Panel -->
  <LorebookDebugPanel />
</div>

<style>
  /* App shell - add top padding for mobile status bar */
  .app-shell {
    padding-top: env(safe-area-inset-top, 0);
  }

  /* Mobile: add fallback padding for Android status bar */
  @media (max-width: 768px) {
    .app-shell {
      padding-top: max(env(safe-area-inset-top, 0px), 28px);
    }
  }

  /* Desktop: no top padding needed */
  @media (min-width: 769px) {
    .app-shell {
      padding-top: 0;
    }
  }

  /* Mobile sidebar overlay - visible only on touch devices */
  .mobile-sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 40;
    border: none;
    cursor: pointer;
  }

  /* Sidebar container for mobile positioning */
  .sidebar-container {
    z-index: 50;
  }

  /* Left edge swipe zone */
  .swipe-edge-zone {
    position: fixed;
    left: 0;
    top: 0;
    width: 20px;
    height: 100%;
    z-index: 30;
  }

  /* Mobile styles */
  @media (max-width: 768px) {
    .mobile-sidebar-overlay {
      display: block;
      top: max(env(safe-area-inset-top, 0px), 28px);
    }

    .sidebar-container {
      position: fixed;
      left: 0;
      top: max(env(safe-area-inset-top, 0px), 28px);
      height: calc(100% - max(env(safe-area-inset-top, 0px), 28px));
      animation: slide-in 0.2s ease-out;
    }

    .swipe-edge-zone {
      width: 30px;
      top: max(env(safe-area-inset-top, 0px), 28px);
    }
  }

  @keyframes slide-in {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(0);
    }
  }
</style>
