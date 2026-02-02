<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import Sidebar from './Sidebar.svelte';
  import Header from './Header.svelte';
  import StoryView from '$lib/components/story/StoryView.svelte';
  import LibraryView from '$lib/components/story/LibraryView.svelte';
  import GalleryTab from '$lib/components/story/GalleryTab.svelte';
  import LorebookView from '$lib/components/lorebook/LorebookView.svelte';
  import MemoryView from '$lib/components/memory/MemoryView.svelte';
  import VaultPanel from '$lib/components/vault/VaultPanel.svelte';
  import SettingsModal from '$lib/components/settings/SettingsModal.svelte';
  import LorebookDebugPanel from '$lib/components/debug/LorebookDebugPanel.svelte';
  import DebugLogModal from '$lib/components/debug/DebugLogModal.svelte';
  import SyncModal from '$lib/components/sync/SyncModal.svelte';
  import { swipe } from '$lib/utils/swipe';
  import { Bug } from 'lucide-svelte';
  import { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MAX_SIDEBAR_RATIO } from '$lib/constants/layout';
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();

  // Swipe handlers for mobile sidebar toggle
  function handleSwipeLeft() {
    if (story.currentStory && !ui.sidebarOpen) {
      ui.toggleSidebar();
    }
  }

  function handleSwipeRight() {
    if (ui.sidebarOpen) {
      ui.toggleSidebar();
    }
  }

  // Resizing logic
  let isResizing = $state(false);

  function startResizing(e: MouseEvent) {
    isResizing = true;
    e.preventDefault();
  }

  function stopResizing() {
    if (!isResizing) return;
    isResizing = false;
    // Persist the final width to the database now that resizing is complete.
    settings.setSidebarWidth(settings.uiSettings.sidebarWidth);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isResizing) return;
    
    // Sidebar is on the right, so width is window.innerWidth - mouseX
    const newWidth = window.innerWidth - e.clientX;
    
    // Constraints
    if (newWidth >= MIN_SIDEBAR_WIDTH && newWidth <= Math.min(MAX_SIDEBAR_WIDTH, window.innerWidth * MAX_SIDEBAR_RATIO)) {
      // For performance, update the reactive state directly without saving to the database on every mouse movement.
      settings.uiSettings.sidebarWidth = newWidth;
    }
  }

  // Global cursor and selection handling while resizing
  $effect(() => {
    if (typeof document === 'undefined') return;
    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
</script>

<svelte:window 
  onmousemove={handleMouseMove} 
  onmouseup={stopResizing} 
  onmouseleave={stopResizing}
/>

<div
  class="app-shell relative flex h-screen w-screen bg-surface-900"
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

  <!-- Right edge swipe zone for opening sidebar (when closed) -->
  {#if !ui.sidebarOpen && story.currentStory}
    <div
      class="swipe-edge-zone"
      use:swipe={{ onSwipeLeft: handleSwipeLeft, threshold: 30 }}
    ></div>
  {/if}

  <!-- Main content area -->
  <div class="flex flex-1 flex-col overflow-hidden">
    <Header />

    <main class="flex-1 overflow-hidden">
      {#if ui.activePanel === 'story' && story.currentStory}
        <StoryView />
      {:else if ui.activePanel === 'gallery' && story.currentStory}
        <GalleryTab />
      {:else if ui.activePanel === 'lorebook' && story.currentStory}
        <LorebookView />
      {:else if ui.activePanel === 'memory' && story.currentStory}
        <MemoryView />
      {:else if ui.activePanel === 'vault'}
        <VaultPanel />
      {:else if ui.activePanel === 'library' || !story.currentStory}
        <LibraryView />
      {:else if children}
        {@render children()}
      {/if}
    </main>
  </div>

  <!-- Sidebar (Right aligned) -->
  {#if ui.sidebarOpen && story.currentStory}
    <div class="sidebar-container relative flex h-full">
      <!-- Resizer Handle (Desktop only) -->
      <button 
        type="button"
        class="resizer-handle hidden h-full sm:block" 
        onmousedown={startResizing}
        aria-label="Sidebar Resizer"
      ></button>
      <Sidebar />
    </div>
  {/if}

  <!-- Settings Modal -->
  {#if ui.settingsModalOpen}
    <SettingsModal />
  {/if}

  <!-- Lorebook Debug Panel -->
  <LorebookDebugPanel />

  <!-- Debug Log Modal -->
  <DebugLogModal />

  <!-- Sync Modal -->
  <SyncModal />

  <!-- Floating Debug Button (when debug mode enabled) -->
  {#if settings.uiSettings.debugMode}
    <button
      class="fixed bottom-safe-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-amber-600 text-white shadow-lg hover:bg-amber-500 transition-colors sm:bottom-4"
      onclick={() => ui.toggleDebugModal()}
      title="View API Debug Logs"
    >
      <Bug class="h-5 w-5" />
      {#if ui.debugLogs.length > 0}
        <span class="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium">
          {ui.debugLogs.length > 99 ? '99+' : ui.debugLogs.length}
        </span>
      {/if}
    </button>
  {/if}
</div>

<style>
  /* App shell - add top padding for mobile status bar */
  .app-shell {
    padding-top: env(safe-area-inset-top, 0);
  }

  /* Safe area background filler - matches header color (bg-surface-800) */
  .app-shell::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: env(safe-area-inset-top, 0);
    background-color: var(--color-surface-800);
    z-index: 0;
  }

  /* Mobile: add fallback padding for Android status bar */
  @media (max-width: 768px) {
    .app-shell {
      padding-top: max(env(safe-area-inset-top, 0px), 28px);
    }

    .app-shell::before {
      height: max(env(safe-area-inset-top, 0px), 28px);
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
    flex-shrink: 0;
  }

  .resizer-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    cursor: col-resize;
    z-index: 60;
    transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
    background-color: transparent;
    border: none;
    padding: 0;
    outline: none;
  }

  .resizer-handle:hover, .resizer-handle:focus-visible {
    background-color: var(--color-primary-500, #3b82f6);
    opacity: 0.5;
  }

  .resizer-handle:focus-visible {
    outline: 2px solid var(--color-primary-500, #3b82f6);
    outline-offset: -2px;
  }

  /* Right edge swipe zone */
  .swipe-edge-zone {
    position: fixed;
    right: 0;
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
      right: 0;
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
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }
</style>
