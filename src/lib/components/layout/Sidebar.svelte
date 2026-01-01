<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { Users, MapPin, Backpack, Scroll } from 'lucide-svelte';
  import CharacterPanel from '$lib/components/world/CharacterPanel.svelte';
  import LocationPanel from '$lib/components/world/LocationPanel.svelte';
  import InventoryPanel from '$lib/components/world/InventoryPanel.svelte';
  import QuestPanel from '$lib/components/world/QuestPanel.svelte';
  import { swipe } from '$lib/utils/swipe';

  const tabs = [
    { id: 'characters' as const, icon: Users, label: 'Characters' },
    { id: 'locations' as const, icon: MapPin, label: 'Locations' },
    { id: 'inventory' as const, icon: Backpack, label: 'Inventory' },
    { id: 'quests' as const, icon: Scroll, label: 'Quests' },
  ];

  function handleSwipeLeft() {
    ui.toggleSidebar();
  }
</script>

<aside
  class="sidebar flex h-full w-72 flex-col border-r border-surface-700"
  use:swipe={{ onSwipeLeft: handleSwipeLeft, threshold: 50 }}
>
  <!-- Tab navigation -->
  <div class="flex border-b border-surface-700">
    {#each tabs as tab}
      <button
        class="flex flex-1 items-center justify-center gap-1.5 py-3 text-sm transition-colors"
        class:text-accent-400={ui.sidebarTab === tab.id}
        class:text-surface-400={ui.sidebarTab !== tab.id}
        class:border-b-2={ui.sidebarTab === tab.id}
        class:border-accent-500={ui.sidebarTab === tab.id}
        class:hover:text-surface-200={ui.sidebarTab !== tab.id}
        onclick={() => ui.setSidebarTab(tab.id)}
        title={tab.label}
      >
        <svelte:component this={tab.icon} class="h-4 w-4" />
      </button>
    {/each}
  </div>

  <!-- Panel content -->
  <div class="flex-1 overflow-y-auto p-3">
    {#if ui.sidebarTab === 'characters'}
      <CharacterPanel />
    {:else if ui.sidebarTab === 'locations'}
      <LocationPanel />
    {:else if ui.sidebarTab === 'inventory'}
      <InventoryPanel />
    {:else if ui.sidebarTab === 'quests'}
      <QuestPanel />
    {/if}
  </div>
</aside>

<style>
  .sidebar {
    background-color: rgb(20 27 37);
  }
</style>
