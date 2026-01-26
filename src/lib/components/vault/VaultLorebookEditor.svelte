<script lang="ts">
  import type {
    VaultLorebook,
    VaultLorebookEntry,
    EntryType,
    EntryInjectionMode,
  } from "$lib/types";
  import { lorebookVault } from "$lib/stores/lorebookVault.svelte";
  import {
    X,
    Plus,
    Search,
    Trash2,
    Save,
    ArrowLeft,
    Users,
    MapPin,
    Box,
    Flag,
    Brain,
    Calendar,
    MoreVertical,
    AlertCircle,
    Eye,
    EyeOff,
    Bot,
    BookOpen,
    Settings,
    List,
  } from "lucide-svelte";
  import { fade } from "svelte/transition";
  import InteractiveLorebookChat from "./InteractiveLorebookChat.svelte";
  import TagInput from "$lib/components/tags/TagInput.svelte";

  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import { cn } from "$lib/utils/cn";

  interface Props {
    lorebook: VaultLorebook;
    onClose: () => void;
  }

  let { lorebook, onClose }: Props = $props();

  // Local state for editing
  let name = $state(lorebook.name);
  let description = $state(lorebook.description ?? "");
  let tags = $state<string[]>([...lorebook.tags]);
  let entries = $state<VaultLorebookEntry[]>(
    JSON.parse(JSON.stringify(lorebook.entries)),
  ); // Deep copy

  // UI State
  let searchQuery = $state("");
  let selectedIndex = $state<number | null>(null);
  let showDeleteConfirm = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let activeTab = $state("editor");
  let showInteractiveChat = $state(false);

  // Filtered entries
  const filteredEntries = $derived.by(() => {
    if (!searchQuery.trim())
      return entries.map((e, i) => ({ entry: e, index: i }));
    const q = searchQuery.toLowerCase();
    return entries
      .map((e, i) => ({ entry: e, index: i }))
      .filter(
        ({ entry }) =>
          entry.name.toLowerCase().includes(q) ||
          entry.keywords.some((k) => k.toLowerCase().includes(q)),
      );
  });

  const selectedEntry = $derived(
    selectedIndex !== null ? entries[selectedIndex] : null,
  );

  // Type options
  const entryTypes: EntryType[] = [
    "character",
    "location",
    "item",
    "faction",
    "concept",
    "event",
  ];
  const injectionModes: EntryInjectionMode[] = [
    "always",
    "keyword",
    "relevant",
    "never",
  ];

  const typeIcons: Record<EntryType, any> = {
    character: Users,
    location: MapPin,
    item: Box,
    faction: Flag,
    concept: Brain,
    event: Calendar,
  };

  function handleSave() {
    if (!name.trim()) {
      error = "Lorebook name is required";
      return;
    }

    saving = true;
    error = null;

    // Update metadata entry breakdown
    const breakdown: Record<EntryType, number> = {
      character: 0,
      location: 0,
      item: 0,
      faction: 0,
      concept: 0,
      event: 0,
    };
    entries.forEach((e) => {
      if (breakdown[e.type] !== undefined) breakdown[e.type]++;
    });

    lorebookVault
      .update(lorebook.id, {
        name,
        description: description || null,
        entries,
        tags,
        metadata: {
          ...lorebook.metadata,
          format: lorebook.metadata?.format ?? "aventura",
          totalEntries: entries.length,
          entryBreakdown: breakdown,
        },
      })
      .then(() => {
        saving = false;
        onClose(); // Ideally close on save if it's the main save button, or just show success
      })
      .catch((e) => {
        error = e instanceof Error ? e.message : "Failed to save lorebook";
        saving = false;
      });
  }

  // Silent save function for auto-saving (doesn't close editor)
  async function handleSilentSave(): Promise<void> {
    if (!name.trim()) {
      throw new Error("Lorebook name is required");
    }

    // Update metadata entry breakdown
    const breakdown: Record<EntryType, number> = {
      character: 0,
      location: 0,
      item: 0,
      faction: 0,
      concept: 0,
      event: 0,
    };
    entries.forEach((e) => {
      if (breakdown[e.type] !== undefined) breakdown[e.type]++;
    });

    await lorebookVault.update(lorebook.id, {
      name,
      description: description || null,
      entries,
      tags,
      metadata: {
        ...lorebook.metadata,
        format: lorebook.metadata?.format ?? "aventura",
        totalEntries: entries.length,
        entryBreakdown: breakdown,
      },
    });
  }

  function handleAddEntry() {
    const newEntry: VaultLorebookEntry = {
      name: "New Entry",
      type: "character",
      description: "",
      keywords: [],
      injectionMode: "keyword",
      priority: 10,
      disabled: false,
      group: null,
    };
    entries.push(newEntry);
    entries = entries; // Trigger update
    selectedIndex = entries.length - 1;
    activeTab = "editor";
    // Ensure search doesn't hide the new entry
    searchQuery = "";
  }

  function handleDeleteEntry(index: number) {
    entries.splice(index, 1);
    entries = entries; // Trigger update
    if (selectedIndex === index) {
      selectedIndex = null;
    } else if (selectedIndex !== null && selectedIndex > index) {
      selectedIndex--;
    }
  }

  function handleDuplicateEntry(index: number) {
    const entry = entries[index];
    const newEntry = JSON.parse(JSON.stringify(entry));
    newEntry.name = `${newEntry.name} (Copy)`;
    entries.push(newEntry);
    entries = entries;
    selectedIndex = entries.length - 1;
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <ResponsiveModal.Content
    class="sm:max-w-6xl w-full h-[100dvh] sm:h-[90vh] flex flex-col overflow-hidden p-0 rounded-none sm:rounded-lg"
  >
    <ResponsiveModal.Header
      class="px-6 py-4 border-b flex-shrink-0 flex items-center justify-center relative"
    >
      <ResponsiveModal.Title class="text-center"
        >Edit Lorebook</ResponsiveModal.Title
      >
      {#if error}
        <div
          class="absolute top-full left-0 w-full text-center text-destructive text-sm bg-background/95 backdrop-blur py-1 border-b"
        >
          {error}
        </div>
      {/if}
    </ResponsiveModal.Header>

    <Tabs.Root
      bind:value={activeTab}
      class="flex-1 flex flex-col overflow-hidden"
    >
      <div
        class="border-b bg-muted/20 shrink-0 flex items-center justify-between"
      >
        <Tabs.List class="justify-start h-12 bg-transparent p-0">
          <Tabs.Trigger
            value="editor"
            class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4"
          >
            <List class="h-4 w-4 mr-2" />
            Entries ({entries.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="settings"
            class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4"
          >
            <Settings class="h-4 w-4 mr-2" />
            Settings
          </Tabs.Trigger>
        </Tabs.List>

        <div class="flex items-center gap-2 pr-2">
          {#if name.trim()}
            <Button
              variant={showInteractiveChat ? "secondary" : "ghost"}
              size="sm"
              class="gap-2"
              onclick={() => (showInteractiveChat = !showInteractiveChat)}
            >
              {#if showInteractiveChat}
                <X class="h-4 w-4" />
              {:else}
                <Bot class="h-4 w-4" />
              {/if}
              <span class="hidden sm:inline"
                >{showInteractiveChat ? "Close Chat" : "AI Assistant"}</span
              >
            </Button>
          {/if}
        </div>
      </div>

      <!-- Main Content Area -->
      <div class="flex-1 flex overflow-hidden bg-background relative">
        <!-- Tab Contents Wrapper -->
        <div class="flex-1 flex flex-col overflow-hidden min-w-0">
          <Tabs.Content value="settings" class="flex-1 overflow-y-auto m-0 p-6">
            <div class="max-w-2xl mx-auto space-y-6">
              <div class="space-y-4">
                <div class="space-y-2">
                  <Label for="name">Lorebook Name</Label>
                  <Input
                    id="name"
                    bind:value={name}
                    placeholder="Lorebook Name"
                  />
                </div>

                <div class="space-y-2">
                  <Label for="description">Description</Label>
                  <Textarea
                    id="description"
                    bind:value={description}
                    rows={4}
                    placeholder="Describe what this lorebook contains..."
                    class="resize-none"
                  />
                </div>

                <div class="space-y-2">
                  <Label>Tags</Label>
                  <TagInput
                    value={tags}
                    type="lorebook"
                    onChange={(newTags) => (tags = newTags)}
                    placeholder="Add tags..."
                  />
                </div>

                <div class="rounded-lg border bg-muted/30 p-4">
                  <h4 class="text-sm font-medium mb-3">Statistics</h4>
                  <div class="grid grid-cols-2 gap-4 text-sm">
                    <div
                      class="flex justify-between p-2 rounded bg-background border"
                    >
                      <span class="text-muted-foreground">Total Entries</span>
                      <span>{entries.length}</span>
                    </div>
                    <div
                      class="flex justify-between p-2 rounded bg-background border"
                    >
                      <span class="text-muted-foreground">Active Entries</span>
                      <span>{entries.filter((e) => !e.disabled).length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content
            value="editor"
            class="flex-1 flex flex-col sm:flex-row overflow-hidden m-0 h-full"
          >
            <!-- Sidebar (List) -->
            <div
              class={cn(
                "w-full sm:w-80 flex flex-col sm:border-r sm:bg-muted/10",
                selectedIndex !== null && "hidden sm:flex", // Hide on mobile if selected
              )}
            >
              <div class="p-4 border-b space-y-3">
                <div class="relative">
                  <Input
                    bind:value={searchQuery}
                    placeholder="Search entries..."
                    class="pl-9 bg-background"
                    leftIcon={Search}
                  />
                </div>
                <Button class="w-full" onclick={handleAddEntry}>
                  <Plus class="h-4 w-4 " /> Add Entry
                </Button>
              </div>

              <div class="flex-1 overflow-y-auto p-2 space-y-1 flex flex-col">
                {#if filteredEntries.length === 0}
                  <div
                    class="flex-1 flex flex-col items-center justify-center text-center text-sm text-muted-foreground min-h-[200px]"
                  >
                    {#if searchQuery}
                      No matches found
                    {:else}
                      No entries yet
                    {/if}
                  </div>
                {:else}
                  {#each filteredEntries as { entry, index }}
                    {@const Icon = typeIcons[entry.type]}
                    <button
                      class={cn(
                        "w-full flex items-center gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-muted/50",
                        selectedIndex === index &&
                          "bg-accent text-accent-foreground",
                      )}
                      onclick={() => (selectedIndex = index)}
                    >
                      <div
                        class={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md border bg-background/50",
                          selectedIndex === index &&
                            "bg-background/20 border-transparent",
                        )}
                      >
                        <Icon class="h-4 w-4" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <div class="truncate font-medium text-sm">
                          {entry.name}
                        </div>
                        <div class="flex items-center gap-2 text-xs opacity-70">
                          <span class="capitalize">{entry.type}</span>
                          {#if entry.disabled}
                            <span class="flex items-center gap-0.5 ml-auto">
                              <EyeOff class="h-3 w-3" />
                            </span>
                          {/if}
                        </div>
                      </div>
                    </button>
                  {/each}
                {/if}
              </div>
            </div>

            <!-- Editor Area -->
            <div
              class={cn(
                "flex-1 flex flex-col overflow-hidden bg-background",
                selectedIndex === null && "hidden sm:flex",
              )}
            >
              {#if selectedEntry !== null && selectedIndex !== null}
                <div
                  class="flex items-center justify-between border-b px-6 py-4 flex-shrink-0"
                >
                  <div class="flex items-center gap-3 min-w-0 flex-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="sm:hidden -ml-2"
                      onclick={() => (selectedIndex = null)}
                    >
                      <ArrowLeft class="h-5 w-5" />
                    </Button>
                    <Input
                      bind:value={selectedEntry.name}
                      class="text-lg font-semibold h-auto px-2 py-1 border-transparent hover:border-input focus:border-input transition-colors w-full sm:w-auto min-w-[200px]"
                    />
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => handleDuplicateEntry(selectedIndex!)}
                    >
                      <span class="hidden sm:inline">Duplicate</span>
                      <Plus class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onclick={() => handleDeleteEntry(selectedIndex!)}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div class="flex-1 overflow-y-auto p-6">
                  <div class="max-w-3xl mx-auto space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div class="space-y-2">
                        <Label>Entry Type</Label>
                        <select
                          bind:value={selectedEntry.type}
                          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {#each entryTypes as type}
                            <option value={type}
                              >{type.charAt(0).toUpperCase() +
                                type.slice(1)}</option
                            >
                          {/each}
                        </select>
                      </div>

                      <div class="space-y-2">
                        <Label>Group (Optional)</Label>
                        <Input
                          bind:value={selectedEntry.group}
                          placeholder="e.g. Main Cast, Kingdom A"
                        />
                      </div>
                    </div>

                    <div class="space-y-2">
                      <Label>Keywords</Label>
                      <Input
                        value={selectedEntry.keywords.join(", ")}
                        oninput={(e) =>
                          (selectedEntry!.keywords = e.currentTarget.value
                            .split(",")
                            .map((k) => k.trim())
                            .filter(Boolean))}
                        placeholder="Comma-separated keywords..."
                      />
                      <p class="text-[0.8rem] text-muted-foreground">
                        Terms that trigger this entry when using 'Keyword'
                        injection mode.
                      </p>
                    </div>

                    <div class="space-y-2 flex-1 flex flex-col">
                      <Label>Description / Content</Label>
                      <Textarea
                        bind:value={selectedEntry.description}
                        class="font-mono text-sm leading-relaxed min-h-[200px]"
                        placeholder="Enter the lore content here..."
                      />
                    </div>

                    <div class="rounded-lg border bg-muted/30 p-4 space-y-4">
                      <h4 class="text-sm font-medium">Injection Settings</h4>

                      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="space-y-2">
                          <Label class="text-xs">Injection Mode</Label>
                          <select
                            bind:value={selectedEntry.injectionMode}
                            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {#each injectionModes as mode}
                              <option value={mode}
                                >{mode.charAt(0).toUpperCase() +
                                  mode.slice(1)}</option
                              >
                            {/each}
                          </select>
                        </div>

                        <div class="space-y-2">
                          <Label class="text-xs">Priority</Label>
                          <Input
                            type="number"
                            bind:value={selectedEntry.priority}
                            class="h-9"
                          />
                        </div>

                        <div class="flex items-end pb-1">
                          <label
                            class="flex items-center gap-2 cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            <input
                              type="checkbox"
                              checked={!selectedEntry.disabled}
                              onchange={() =>
                                (selectedEntry!.disabled =
                                  !selectedEntry!.disabled)}
                              class="h-4 w-4 rounded border-primary text-primary shadow focus:ring-1 focus:ring-ring"
                            />
                            <span>Enabled</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              {:else}
                <div
                  class="flex-1 flex flex-col items-center justify-center text-muted-foreground"
                >
                  <div class="bg-muted/30 p-6 rounded-full mb-4">
                    <Search class="h-8 w-8 opacity-50" />
                  </div>
                  <p class="text-lg font-medium">Select an entry to edit</p>
                  <p class="text-sm mt-2">Or click "Add Entry" to create one</p>
                </div>
              {/if}
            </div>
          </Tabs.Content>
        </div>

        <!-- Interactive Chat Sidebar -->
        {#if showInteractiveChat && name.trim()}
          <div
            class="absolute inset-0 z-50 bg-background md:static md:w-[400px] md:border-l md:border-border flex flex-col"
          >
            <InteractiveLorebookChat
              {lorebook}
              {entries}
              onEntriesChange={(newEntries) => {
                entries = newEntries;
              }}
              onClose={() => (showInteractiveChat = false)}
              onSave={handleSilentSave}
            />
          </div>
        {/if}
      </div>
    </Tabs.Root>

    <ResponsiveModal.Footer
      class="border-t bg-muted/40 px-6 py-4 flex-shrink-0"
    >
      <div class="flex w-full items-center gap-2 sm:justify-end">
        <Button
          variant="outline"
          class="w-10 p-0 sm:w-auto sm:px-4"
          onclick={onClose}
          disabled={saving}
        >
          <X class="h-4 w-4" />
          <span class="hidden sm:inline">Cancel</span>
        </Button>
        <Button
          class="flex-1 sm:flex-none"
          onclick={handleSave}
          disabled={saving || !name.trim()}
        >
          {#if saving}
            <div
              class=" h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></div>
          {:else}
            <Save class=" h-4 w-4" />
          {/if}
          Save Changes
        </Button>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
