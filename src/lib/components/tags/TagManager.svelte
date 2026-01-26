<script lang="ts">
  import { tagStore } from "$lib/stores/tags.svelte";
  import type { VaultTag, VaultType } from "$lib/types";
  import { Trash2, Edit2, Check, Plus } from "lucide-svelte";
  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils/cn";
  import { fade } from "svelte/transition";

  interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }

  let { open, onOpenChange }: Props = $props();

  let activeTab = $state<VaultType>("character");
  let searchQuery = $state("");
  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editColor = $state("");

  const colors = [
    "red-500",
    "orange-500",
    "amber-500",
    "yellow-500",
    "lime-500",
    "green-500",
    "emerald-500",
    "teal-500",
    "cyan-500",
    "sky-500",
    "blue-500",
    "indigo-500",
    "violet-500",
    "purple-500",
    "fuchsia-500",
    "pink-500",
    "rose-500",
  ];

  const filteredTags = $derived.by(() => {
    let tags = tagStore.getTagsForType(activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      tags = tags.filter((t) => t.name.toLowerCase().includes(q));
    }
    return tags;
  });

  const canCreate = $derived(
    searchQuery.trim() &&
      !filteredTags.some(
        (t) => t.name.toLowerCase() === searchQuery.toLowerCase(),
      ),
  );

  function startEdit(tag: VaultTag) {
    editingId = tag.id;
    editName = tag.name;
    editColor = tag.color;
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    await tagStore.update(editingId, {
      name: editName.trim(),
      color: editColor,
    });
    editingId = null;
  }

  async function handleDelete(id: string) {
    if (
      confirm(
        "Are you sure you want to delete this tag? It will be removed from all vault items.",
      )
    ) {
      await tagStore.delete(id);
    }
  }

  async function handleCreate() {
    if (!searchQuery.trim()) return;
    await tagStore.add(searchQuery.trim(), activeTab);
    searchQuery = "";
  }
</script>

<ResponsiveModal.Root bind:open {onOpenChange}>
  <ResponsiveModal.Content class="max-w-2xl flex flex-col" style="height: 500px;">
    <ResponsiveModal.Header title="Manage Tags" />

    <div class="flex flex-col gap-4 p-4 flex-1 overflow-hidden">
      <!-- Tabs -->
      <Tabs
        value={activeTab}
        onValueChange={(v) => (activeTab = v as VaultType)}
      >
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="character">Characters</TabsTrigger>
          <TabsTrigger value="lorebook">Lorebooks</TabsTrigger>
          <TabsTrigger value="scenario">Scenarios</TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- Search/Add Bar -->
      <div class="flex gap-2 flex-shrink-0">
        <div class="relative flex-1">
          <Input
            bind:value={searchQuery}
            placeholder={`Search or add ${activeTab} tags...`}
            onkeydown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
        <Button
          icon={Plus}
          label="Add"
          disabled={!canCreate}
          onclick={handleCreate}
        />
      </div>

      <!-- Tag List -->
      <div class="overflow-y-auto pr-2 flex-1">
        {#if filteredTags.length > 0}
          <div class="space-y-2 pb-4">
          {#each filteredTags as tag (tag.id)}
            <div
              class={cn(
                "group flex items-center justify-between rounded-lg border bg-muted/40 p-2 hover:bg-muted/60 transition-colors",
                editingId === tag.id && "border-primary",
              )}
              in:fade={{ duration: 150 }}
            >
              {#if editingId === tag.id}
                <!-- Edit Mode -->
                <div class="flex flex-1 items-center gap-3">
                  <!-- Color Picker -->
                  <div class="relative">
                    <div
                      class={`h-6 w-6 rounded-full bg-${editColor} cursor-pointer ring-2 ring-muted`}
                    ></div>
                    <div
                      class="absolute left-0 top-full z-10 mt-2 hidden w-48 flex-wrap gap-1 rounded-lg border bg-background p-2 shadow-xl group-hover:flex"
                    >
                      {#each colors as color}
                        <button
                          class={`h-5 w-5 rounded-full bg-${color} hover:ring-2 ring-white`}
                          onclick={() => (editColor = color)}
                          title={color}
                        ></button>
                      {/each}
                    </div>
                  </div>

                  <Input
                    bind:value={editName}
                    class="flex-1 h-8"
                    onkeydown={(e) => e.key === "Enter" && saveEdit()}
                  />

                  <div class="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                      onclick={saveEdit}
                    >
                      <Check class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8"
                      onclick={() => (editingId = null)}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              {:else}
                <!-- View Mode -->
                <div class="flex items-center gap-3">
                  <div class={`h-3 w-3 rounded-full bg-${tag.color}`}></div>
                  <span class="font-medium">{tag.name}</span>
                </div>

                <div
                  class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8"
                    onclick={() => startEdit(tag)}
                  >
                    <Edit2 class="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onclick={() => handleDelete(tag.id)}
                  >
                    <Trash2 class="h-4 w-4" />
                  </Button>
                </div>
              {/if}
            </div>
          {/each}
          </div>
        {:else}
          <div class="flex h-full flex-col items-center justify-center -mt-2 text-muted-foreground">
            <p>No tags found.</p>
            <p class="text-sm">Create one above to get started.</p>
          </div>
        {/if}
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
