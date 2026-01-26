<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { Users, MapPin, Backpack, Scroll, Clock, GitBranch, BookOpen, BookMarked, Brain } from 'lucide-svelte';
  import CharacterPanel from '$lib/components/world/CharacterPanel.svelte';

  import LocationPanel from '$lib/components/world/LocationPanel.svelte';
  import InventoryPanel from '$lib/components/world/InventoryPanel.svelte';
  import QuestPanel from '$lib/components/world/QuestPanel.svelte';
  import TimePanel from '$lib/components/world/TimePanel.svelte';
  import BranchPanel from '$lib/components/branch/BranchPanel.svelte';
  import { swipe } from '$lib/utils/swipe';

  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";

  const tabs = [
    { id: 'characters' as const, icon: Users, label: 'Characters' },
    { id: 'locations' as const, icon: MapPin, label: 'Locations' },
    { id: 'inventory' as const, icon: Backpack, label: 'Inventory' },
    { id: 'quests' as const, icon: Scroll, label: 'Quests' },
    { id: 'time' as const, icon: Clock, label: 'Time' },
    { id: 'branches' as const, icon: GitBranch, label: 'Branches' },
  ];

  function handleSwipeLeft() {
    // Navigate to next tab
    const currentIndex = tabs.findIndex(t => t.id === ui.sidebarTab);
    if (currentIndex < tabs.length - 1) {
      ui.setSidebarTab(tabs[currentIndex + 1].id);
    }
  }

  function handleSwipeRight() {
    // Navigate to previous tab, or close sidebar if on first tab
    const currentIndex = tabs.findIndex(t => t.id === ui.sidebarTab);
    if (currentIndex > 0) {
      ui.setSidebarTab(tabs[currentIndex - 1].id);
    } else {
      // On first tab, swipe right closes sidebar (swiping towards the right edge)
      ui.toggleSidebar();
    }
  }
</script>

<aside
  class="flex h-full w-[calc(100vw-3rem)] max-w-72 flex-col border-l border-border bg-card/80 sm:w-72 backdrop-blur-[2px]"
  use:swipe={{ onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight, threshold: 50 }}
>
  <!-- Tab navigation -->
  <Tabs.Root
    value={ui.sidebarTab}
    onValueChange={(v) => ui.setSidebarTab(v as any)}
    class="flex flex-col flex-1 min-h-0"
  >
    <div class="border-b border-border px-0 flex-shrink-0 bg-muted/60">
        <Tabs.List class="w-full flex justify-start rounded-none bg-transparent p-0 h-auto">
        {#each tabs as tab}
            <Tabs.Trigger
                value={tab.id}
                class="flex-1 py-3 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-muted/30 bg-transparent hover:bg-muted/20 text-muted-foreground transition-colors"
                title={tab.label}
            >
                <svelte:component this={tab.icon} class="h-4 w-4" />
            </Tabs.Trigger>
        {/each}
        </Tabs.List>
    </div>

    <!-- Panel content -->
    <div class="flex-1 overflow-y-auto p-3 min-h-0">
        <Tabs.Content value="characters" class="mt-0 h-full space-y-4">
            <CharacterPanel />
        </Tabs.Content>
        <Tabs.Content value="locations" class="mt-0 h-full space-y-4">
            <LocationPanel />
        </Tabs.Content>
        <Tabs.Content value="inventory" class="mt-0 h-full space-y-4">
            <InventoryPanel />
        </Tabs.Content>
        <Tabs.Content value="quests" class="mt-0 h-full space-y-4">
            <QuestPanel />
        </Tabs.Content>
        <Tabs.Content value="time" class="mt-0 h-full space-y-4">
            <TimePanel />
        </Tabs.Content>
        <Tabs.Content value="branches" class="mt-0 h-full space-y-4">
            <BranchPanel />
        </Tabs.Content>
    </div>
  </Tabs.Root>

  <!-- Bottom Context Navigation -->
  <div class="flex-shrink-0 flex items-center gap-1 border-t border-border p-2 bg-muted">
    <Button
      variant="ghost"
      class="flex-1 flex-col h-auto py-2 gap-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground {ui.activePanel === 'story' ? '!bg-primary/10 !text-primary' : ''}"
      onclick={() => ui.setActivePanel('story')}
      title="Story"
    >
      <BookOpen class="h-4 w-4" />
      <span>Story</span>
    </Button>
    <Button
      variant="ghost"
      class="flex-1 flex-col h-auto py-2 gap-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground {ui.activePanel === 'lorebook' ? '!bg-primary/10 !text-primary' : ''}"
      onclick={() => ui.setActivePanel('lorebook')}
      title="Lorebook"
    >
      <BookMarked class="h-4 w-4" />
      <span>Lorebook</span>
    </Button>
    <Button
      variant="ghost"
      class="flex-1 flex-col h-auto py-2 gap-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground {ui.activePanel === 'memory' ? '!bg-primary/10 !text-primary' : ''}"
      onclick={() => ui.setActivePanel('memory')}
      title="Memory"
    >
      <Brain class="h-4 w-4" />
      <span>Memory</span>
    </Button>
  </div>
</aside>
