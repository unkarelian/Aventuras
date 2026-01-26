<script lang="ts">
  import type { Entry } from "$lib/types";
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import { onMount } from "svelte";
  import LorebookList from "./LorebookList.svelte";
  import LorebookDetail from "./LorebookDetail.svelte";
  import LorebookEntryForm from "./LorebookEntryForm.svelte";
  import LorebookImportModal from "./LorebookImportModal.svelte";
  import LorebookExportModal from "./LorebookExportModal.svelte";
  import { BookOpen, Plus, ArrowLeft, Loader2, Bot } from "lucide-svelte";
  
  import { Button } from "$lib/components/ui/button";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";
  import { EmptyState } from "$lib/components/ui/empty-state";
  import { cn } from "$lib/utils/cn";

  // Lore management active state
  const isLoreManagementActive = $derived(ui.loreManagementActive);

  // Track if we're in "new entry" mode
  let creatingNew = $state(false);

  // Breakpoint for mobile/desktop
  let isMobile = $state(false);

  // Get selected entry
  const selectedEntry = $derived.by(() => {
    const id = ui.selectedLorebookEntryId;
    if (!id) return null;
    return story.lorebookEntries.find((e) => e.id === id) ?? null;
  });

  // Show detail panel on desktop when entry selected, or on mobile when showing detail
  const showDetail = $derived(
    (!isMobile && (selectedEntry || creatingNew)) ||
      (isMobile && ui.lorebookShowDetail),
  );

  // Show list on desktop always, or on mobile when not showing detail
  const showList = $derived(!isMobile || !ui.lorebookShowDetail);

  function handleResize() {
    isMobile = window.innerWidth < 768;
  }

  onMount(() => {
    handleResize();
    window.addEventListener("resize", handleResize);

    // Reset state when mounting - defer to avoid render cycle issues
    queueMicrotask(() => {
      ui.resetLorebookManager();
    });

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  function handleNewEntry() {
    // Block during lore management
    if (isLoreManagementActive) return;

    creatingNew = true;
    ui.selectLorebookEntry(null);
    ui.setLorebookEditMode(true);
    if (isMobile) {
      ui.showLorebookDetail();
    }
  }

  async function handleSaveNew(entry: Entry) {
    const { id, storyId, createdAt, updatedAt, ...entryData } = entry;
    const newEntry = await story.addLorebookEntry(entryData);
    creatingNew = false;
    ui.setLorebookEditMode(false);
    ui.selectLorebookEntry(newEntry.id);
  }

  function handleCancelNew() {
    creatingNew = false;
    ui.setLorebookEditMode(false);
    if (isMobile) {
      ui.hideLorebookDetail();
    }
  }

  function handleMobileBack() {
    if (creatingNew) {
      handleCancelNew();
    } else {
      ui.hideLorebookDetail();
    }
  }
</script>

<div class="flex flex-col h-full bg-background">
  <!-- Lore Management Active Banner -->
  {#if isLoreManagementActive}
    <div class="p-4 border-b bg-accent/20">
      <Alert variant="default" class="bg-transparent border-none p-0">
        <div class="flex items-center gap-2 text-primary">
          <Bot class="h-5 w-5" />
          {#if ui.loreManagementProgress}
            <Loader2 class="h-4 w-4 animate-spin" />
          {/if}
          <AlertTitle class="mb-0">AI Lore Management Active</AlertTitle>
        </div>
        <AlertDescription class="mt-1 text-muted-foreground flex items-center gap-2">
          <span class="truncate">
            {ui.loreManagementProgress || "Reviewing story content..."}
          </span>
          {#if ui.loreManagementChanges > 0}
            <span class="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {ui.loreManagementChanges} changes
            </span>
          {/if}
        </AlertDescription>
      </Alert>
    </div>
  {/if}

  <div class="flex flex-1 min-h-0 relative">
    <!-- List panel -->
    {#if showList}
      <div
        class={cn(
          "flex flex-col border-r",
          isMobile ? "w-full" : "w-72 lg:w-80 flex-shrink-0"
        )}
      >
        <!-- Back to Story Header -->
        <div class="px-2 pt-0 sm:pt-3">
          <Button
            variant="ghost"
            class="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground pl-2 h-8"
            onclick={() => ui.setActivePanel("story")}
          >
            <ArrowLeft class="h-3.5 w-3.5" />
            <span>Back to Story</span>
          </Button>
        </div>

        <LorebookList onNewEntry={handleNewEntry} />
      </div>
    {/if}

    <!-- Detail panel -->
    {#if showDetail}
      <div
        class={cn(
          "flex-1 flex flex-col bg-background",
          isMobile && "w-full absolute top-0 left-0 right-0 bottom-0 z-10"
        )}
      >
        {#if creatingNew}
          <!-- New entry form -->
          <div class="flex flex-col h-full">
            <div class="flex items-center gap-3 p-3 sm:p-4 border-b">
              {#if isMobile}
                <Button
                  variant="ghost"
                  size="icon"
                  class="-ml-2"
                  onclick={handleMobileBack}
                >
                  <ArrowLeft class="h-5 w-5" />
                </Button>
              {/if}
              <div class="p-2 rounded-lg bg-primary/10 text-primary">
                <Plus class="h-5 w-5" />
              </div>
              <h2 class="font-semibold text-foreground">New Entry</h2>
            </div>
            <div class="flex-1 overflow-y-auto p-4 pb-safe">
              <LorebookEntryForm
                onSave={handleSaveNew}
                onCancel={handleCancelNew}
              />
            </div>
          </div>
        {:else if selectedEntry}
          <LorebookDetail entry={selectedEntry} {isMobile} />
        {:else}
          <!-- Empty state for desktop when no entry selected -->
          <div class="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={BookOpen}
              title="Select an Entry"
              description="Choose an entry from the list to view or edit its details, or create a new one."
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Import Modal -->
{#if ui.lorebookImportModalOpen}
  <LorebookImportModal />
{/if}

<!-- Export Modal -->
{#if ui.lorebookExportModalOpen}
  <LorebookExportModal />
{/if}

