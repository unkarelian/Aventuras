<script lang="ts">
  import { story } from "$lib/stores/story.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import {
    Plus,
    Package,
    Shield,
    Pencil,
    Trash2,
    ArrowUp,
    MapPin,
    ChevronDown,
    Save,
    X,
  } from "lucide-svelte";
  import type { Item } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import { Checkbox } from "$lib/components/ui/checkbox";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import IconRow from "$lib/components/ui/icon-row.svelte";
  import { cn } from "$lib/utils/cn";

  let showAddForm = $state(false);
  let newName = $state("");
  let newDescription = $state("");
  let newQuantity = $state(1);
  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editDescription = $state("");
  let editQuantity = $state(1);
  let editEquipped = $state(false);
  let confirmingDeleteId = $state<string | null>(null);
  let droppingItemId = $state<string | null>(null);
  let dropLocationId = $state<string>("");

  const worldItems = $derived(
    story.items.filter((item) => item.location !== "inventory"),
  );

  function toggleCollapse(itemId: string) {
    const isCollapsed = ui.isEntityCollapsed(itemId);
    ui.toggleEntityCollapsed(itemId, !isCollapsed);
  }

  async function addItem() {
    if (!newName.trim()) return;
    await story.addItem(
      newName.trim(),
      newDescription.trim() || undefined,
      newQuantity,
    );
    newName = "";
    newDescription = "";
    newQuantity = 1;
    showAddForm = false;
  }

  function startEdit(item: Item) {
    editingId = item.id;
    editName = item.name;
    editDescription = item.description ?? "";
    editQuantity = item.quantity;
    editEquipped = item.equipped;
    // Reset other modes
    droppingItemId = null;
    confirmingDeleteId = null;
  }

  function cancelEdit() {
    editingId = null;
    editName = "";
    editDescription = "";
    editQuantity = 1;
    editEquipped = false;
  }

  async function saveEdit(item: Item) {
    const name = editName.trim();
    if (!name) return;

    const quantity = Math.max(1, Number(editQuantity) || 1);
    await story.updateItem(item.id, {
      name,
      description: editDescription.trim() || null,
      quantity,
      equipped: item.location === "inventory" ? editEquipped : false,
    });

    cancelEdit();
  }

  async function deleteItem(item: Item) {
    await story.deleteItem(item.id);
    confirmingDeleteId = null;
  }

  function beginDrop(item: Item) {
    droppingItemId = item.id;
    const preferredLocation = story.locations.find(
      (loc) => loc.id === item.location,
    )?.id;
    dropLocationId =
      preferredLocation ||
      story.currentLocation?.id ||
      story.locations[0]?.id ||
      "";
    // Reset other modes
    editingId = null;
    confirmingDeleteId = null;
  }

  function cancelDrop() {
    droppingItemId = null;
    dropLocationId = "";
  }

  async function dropItem(item: Item) {
    if (!dropLocationId) return;
    await story.updateItem(item.id, {
      location: dropLocationId,
      equipped: false,
    });
    cancelDrop();
  }

  async function pickUpItem(item: Item) {
    await story.updateItem(item.id, {
      location: "inventory",
    });
  }

  async function moveItem(item: Item) {
    if (!dropLocationId) return;
    await story.updateItem(item.id, {
      location: dropLocationId,
    });
    cancelDrop();
  }

  function getLocationLabel(locationId: string) {
    if (locationId === "inventory") return "Inventory";
    const location = story.locations.find((loc) => loc.id === locationId);
    return location?.name || "Unknown location";
  }

  function hasDescription(item: Item): boolean {
    return !!(item.description || item.translatedDescription);
  }
</script>

<div class="flex flex-col gap-1 pb-12">
  <!-- Header -->
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-xl font-bold tracking-tight text-foreground">Inventory</h3>
    <Button
      variant="text"
      size="icon"
      class="h-6 w-6 text-muted-foreground hover:text-foreground"
      onclick={() => (showAddForm = !showAddForm)}
      title="Add item"
    >
      <Plus class="h-6! w-6!" />
    </Button>
  </div>

  {#if showAddForm}
    <div class="rounded-lg border border-border bg-card p-3 shadow-sm mb-2">
      <div class="space-y-3">
        <Input
          type="text"
          bind:value={newName}
          placeholder="Item name"
          class="h-8 text-sm"
        />
        <Textarea
          bind:value={newDescription}
          placeholder="Description (optional)"
          class="resize-none text-sm min-h-15"
          rows={2}
        />
        <div class="flex items-center justify-end gap-3">
          <div class="flex items-center gap-2">
            <Label class="text-xs text-muted-foreground">Quantity</Label>
            <Input
              type="number"
              bind:value={newQuantity}
              min="1"
              class="h-8 w-20 text-sm"
            />
          </div>
        </div>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <Button
          variant="text"
          size="sm"
          class="h-7"
          onclick={() => (showAddForm = false)}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          class="h-7"
          onclick={addItem}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  {/if}

  <!-- Equipped Items -->
  {#if story.equippedItems.length > 0}
    <div class="mb-4 space-y-2">
      <h4
        class="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1"
      >
        Equipped
      </h4>
      {#each story.equippedItems as item (item.id)}
        {@const isCollapsed = ui.isEntityCollapsed(item.id)}
        {@const isEditing = editingId === item.id}

        <div
          class={cn(
            "group rounded-lg border border-border bg-card shadow-sm transition-all pl-3 pr-2 pt-3 pb-2",
            "border-l-4 border-l-primary" /* Highlight equipped items */,
            isEditing ? "ring-1 ring-primary/20" : "",
          )}
        >
          {#if isEditing}
            <!-- EDIT MODE -->
            <div class="space-y-3">
              <div class="flex justify-between items-center mb-2">
                <h4
                  class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Editing {item.name}
                </h4>
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6"
                  onclick={cancelEdit}><X class="h-4 w-4" /></Button
                >
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Name</Label>
                  <Input
                    type="text"
                    bind:value={editName}
                    placeholder="Item name"
                    class="h-8 text-sm"
                  />
                </div>
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    bind:value={editQuantity}
                    min="1"
                    class="h-8 text-sm"
                  />
                </div>
              </div>

              <div
                class="flex items-center space-x-2 border rounded-md p-2 bg-muted/20"
              >
                <Checkbox
                  id="edit-equipped-{item.id}"
                  bind:checked={editEquipped}
                />
                <Label
                  for="edit-equipped-{item.id}"
                  class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Equipped
                </Label>
              </div>

              <div class="space-y-1">
                <Label class="text-xs">Description</Label>
                <Textarea
                  bind:value={editDescription}
                  placeholder="Description"
                  class="resize-none text-xs min-h-15"
                />
              </div>

              <div class="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => saveEdit(item)}
                  disabled={!editName.trim()}
                >
                  <Save class="mr-1.5 h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          {:else if droppingItemId === item.id}
            <!-- DROP MODE -->
            <div class="space-y-3">
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-2"
              >
                <MapPin class="h-3.5 w-3.5" />
                <span>Drop item at...</span>
              </div>

              <Select.Root type="single" bind:value={dropLocationId}>
                <Select.Trigger class="h-8 text-xs">
                  <div class="flex items-center gap-2 overflow-hidden">
                    <span class="truncate">
                      {story.locations.find((l) => l.id === dropLocationId)
                        ?.name || "Select location"}
                    </span>
                  </div>
                </Select.Trigger>
                <Select.Content class="max-h-50">
                  {#if story.locations.length === 0}
                    <Select.Item value="" disabled
                      >No locations available</Select.Item
                    >
                  {:else}
                    {#each story.locations as location (location.id)}
                      <Select.Item value={location.id} label={location.name}
                        >{location.name}</Select.Item
                      >
                    {/each}
                  {/if}
                </Select.Content>
              </Select.Root>

              <div class="flex justify-end gap-2">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelDrop}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => dropItem(item)}
                  disabled={!dropLocationId}
                >
                  Drop
                </Button>
              </div>
            </div>
          {:else}
            <!-- VIEW MODE -->
            <div class="flex items-start gap-3">
              <!-- Icon -->
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                <Shield class="h-5 w-5" />
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <p
                      class="font-medium leading-none text-foreground truncate"
                    >
                      {item.translatedName ?? item.name}
                    </p>
                    {#if item.quantity > 1}
                      <Badge variant="secondary" class="h-4 px-1.5 text-[10px]"
                        >x{item.quantity}</Badge
                      >
                    {/if}
                  </div>

                  <div class="flex items-center">
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground -my-1"
                      onclick={() => startEdit(item)}
                      title="Edit"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <!-- Description -->
                {#if hasDescription(item)}
                  <div class="text-xs text-muted-foreground mt-1.5">
                    {#if !isCollapsed}
                      <p class="leading-relaxed">
                        {item.translatedDescription ?? item.description}
                      </p>
                    {:else}
                      <button
                        type="button"
                        class="truncate cursor-pointer hover:text-foreground bg-transparent border-none p-0 text-left w-full"
                        onclick={() => toggleCollapse(item.id)}
                        aria-label="Toggle description"
                      >
                        {item.translatedDescription ?? item.description}
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Footer Actions -->
            <div
              class="flex items-center justify-between mt-1 border-t border-border/0 pt-1"
            >
              {#if (item.description?.length ?? 0) > 45 || (item.translatedDescription?.length ?? 0) > 45}
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6 -ml-2 text-muted-foreground hover:text-foreground"
                  onclick={() => toggleCollapse(item.id)}
                  title={isCollapsed
                    ? "Show full description"
                    : "Hide description"}
                >
                  <ChevronDown
                    class={cn(
                      "h-4 w-4 transition-transform duration-200",
                      !isCollapsed ? "rotate-180" : "",
                    )}
                  />
                </Button>
              {:else}
                <div></div>
              {/if}

              <div class="flex items-center gap-1 ml-auto">
                <IconRow onDelete={() => deleteItem(item)} showDelete={true}>
                  <Button
                    variant="text"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onclick={() => beginDrop(item)}
                    title="Drop item"
                  >
                    <ArrowUp class="h-3.5 w-3.5" />
                  </Button>
                </IconRow>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Inventory Items -->
  {#if story.inventoryItems.filter((item) => !item.equipped).length > 0}
    <div class="space-y-2">
      {#if story.equippedItems.length > 0}
        <h4
          class="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1 mt-4"
        >
          Backpack
        </h4>
      {/if}
      {#each story.inventoryItems.filter((item) => !item.equipped) as item (item.id)}
        {@const isCollapsed = ui.isEntityCollapsed(item.id)}
        {@const isEditing = editingId === item.id}

        <div
          class={cn(
            "group rounded-lg border border-border bg-card shadow-sm transition-all pl-3 pr-2 pt-3 pb-2",
            isEditing ? "ring-1 ring-primary/20" : "",
          )}
        >
          {#if isEditing}
            <!-- EDIT MODE (Same as above) -->
            <div class="space-y-3">
              <div class="flex justify-between items-center mb-2">
                <h4
                  class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Editing {item.name}
                </h4>
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6"
                  onclick={cancelEdit}><X class="h-4 w-4" /></Button
                >
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Name</Label>
                  <Input
                    type="text"
                    bind:value={editName}
                    placeholder="Item name"
                    class="h-8 text-sm"
                  />
                </div>
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    bind:value={editQuantity}
                    min="1"
                    class="h-8 text-sm"
                  />
                </div>
              </div>

              <div
                class="flex items-center space-x-2 border rounded-md p-2 bg-muted/20"
              >
                <Checkbox
                  id="edit-equipped-{item.id}"
                  bind:checked={editEquipped}
                />
                <Label
                  for="edit-equipped-{item.id}"
                  class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Equipped
                </Label>
              </div>

              <div class="space-y-1">
                <Label class="text-xs">Description</Label>
                <Textarea
                  bind:value={editDescription}
                  placeholder="Description"
                  class="resize-none text-xs min-h-[60px]"
                />
              </div>

              <div class="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => saveEdit(item)}
                  disabled={!editName.trim()}
                >
                  <Save class="mr-1.5 h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          {:else if droppingItemId === item.id}
            <!-- DROP MODE -->
            <div class="space-y-3">
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-2"
              >
                <MapPin class="h-3.5 w-3.5" />
                <span>Drop item at...</span>
              </div>

              <Select.Root type="single" bind:value={dropLocationId}>
                <Select.Trigger class="h-8 text-xs">
                  <div class="flex items-center gap-2 overflow-hidden">
                    <span class="truncate">
                      {story.locations.find((l) => l.id === dropLocationId)
                        ?.name || "Select location"}
                    </span>
                  </div>
                </Select.Trigger>
                <Select.Content class="max-h-[200px]">
                  {#if story.locations.length === 0}
                    <Select.Item value="" disabled
                      >No locations available</Select.Item
                    >
                  {:else}
                    {#each story.locations as location (location.id)}
                      <Select.Item value={location.id} label={location.name}
                        >{location.name}</Select.Item
                      >
                    {/each}
                  {/if}
                </Select.Content>
              </Select.Root>

              <div class="flex justify-end gap-2">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelDrop}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => dropItem(item)}
                  disabled={!dropLocationId}
                >
                  Drop
                </Button>
              </div>
            </div>
          {:else}
            <!-- VIEW MODE -->
            <div class="flex items-start gap-3">
              <!-- Icon -->
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground"
              >
                <Package class="h-5 w-5" />
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <p
                      class="font-medium leading-none text-foreground truncate"
                    >
                      {item.translatedName ?? item.name}
                    </p>
                    {#if item.quantity > 1}
                      <Badge variant="secondary" class="h-4 px-1.5 text-[10px]"
                        >x{item.quantity}</Badge
                      >
                    {/if}
                  </div>

                  <div class="flex items-center">
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground -my-1"
                      onclick={() => startEdit(item)}
                      title="Edit"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <!-- Description -->
                {#if hasDescription(item)}
                  <div class="text-xs text-muted-foreground mt-1.5">
                    {#if !isCollapsed}
                      <p class="leading-relaxed">
                        {item.translatedDescription ?? item.description}
                      </p>
                    {:else}
                      <p
                        class="truncate cursor-pointer hover:text-foreground"
                        onclick={() => toggleCollapse(item.id)}
                      >
                        {item.translatedDescription ?? item.description}
                      </p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Footer Actions -->
            <div
              class="flex items-center justify-between mt-1 border-t border-border/0 pt-1"
            >
              {#if (item.description?.length ?? 0) > 45 || (item.translatedDescription?.length ?? 0) > 45}
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6 -ml-2 text-muted-foreground hover:text-foreground"
                  onclick={() => toggleCollapse(item.id)}
                  title={isCollapsed
                    ? "Show full description"
                    : "Hide description"}
                >
                  <ChevronDown
                    class={cn(
                      "h-4 w-4 transition-transform duration-200",
                      !isCollapsed ? "rotate-180" : "",
                    )}
                  />
                </Button>
              {:else}
                <div></div>
              {/if}

              <div class="flex items-center gap-1 ml-auto">
                <IconRow onDelete={() => deleteItem(item)} showDelete={true}>
                  <Button
                    variant="text"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onclick={() => beginDrop(item)}
                    title="Drop item"
                  >
                    <ArrowUp class="h-3.5 w-3.5" />
                  </Button>
                </IconRow>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Empty State (Only if no equipped and no inventory) -->
  {#if story.inventoryItems.length === 0 && story.equippedItems.length === 0}
    <div
      class="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed border-border bg-muted/20"
    >
      <div class="mb-3 rounded-full bg-muted p-3">
        <Package class="h-6 w-6 text-muted-foreground" />
      </div>
      <p class="text-sm text-muted-foreground">Empty inventory</p>
      <Button
        variant="text"
        class="mt-1 h-auto p-0 text-xs text-primary"
        onclick={() => (showAddForm = true)}
      >
        <Plus class="h-3.5 w-3.5" />
        Add first item
      </Button>
    </div>
  {/if}

  <!-- World Items -->
  {#if worldItems.length > 0}
    <div class="space-y-2 mt-4">
      <h4
        class="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1"
      >
        World Items
      </h4>
      {#each worldItems as item (item.id)}
        {@const isCollapsed = ui.isEntityCollapsed(item.id)}
        {@const isEditing = editingId === item.id}

        <div
          class={cn(
            "group rounded-lg border border-border bg-card shadow-sm transition-all pl-3 pr-2 pt-3 pb-2",
            isEditing ? "ring-1 ring-primary/20" : "",
          )}
        >
          {#if isEditing}
            <!-- EDIT MODE (Same as above) -->
            <div class="space-y-3">
              <div class="flex justify-between items-center mb-2">
                <h4
                  class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  Editing {item.name}
                </h4>
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6"
                  onclick={cancelEdit}><X class="h-4 w-4" /></Button
                >
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Name</Label>
                  <Input
                    type="text"
                    bind:value={editName}
                    placeholder="Item name"
                    class="h-8 text-sm"
                  />
                </div>
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Quantity</Label>
                  <Input
                    type="number"
                    bind:value={editQuantity}
                    min="1"
                    class="h-8 text-sm"
                  />
                </div>
              </div>

              <!-- No Equipped checkbox for world items usually, but keeping it consistent with function logic -->
              <!-- The saveEdit function handles forcing equipped=false for non-inventory items -->

              <div class="space-y-1">
                <Label class="text-xs">Description</Label>
                <Textarea
                  bind:value={editDescription}
                  placeholder="Description"
                  class="resize-none text-xs min-h-15"
                />
              </div>

              <div class="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => saveEdit(item)}
                  disabled={!editName.trim()}
                >
                  <Save class="mr-1.5 h-3.5 w-3.5" />
                  Save
                </Button>
              </div>
            </div>
          {:else if droppingItemId === item.id}
            <!-- MOVE MODE -->
            <div class="space-y-3">
              <div
                class="flex items-center gap-2 text-sm text-muted-foreground mb-2"
              >
                <MapPin class="h-3.5 w-3.5" />
                <span>Move item to...</span>
              </div>

              <Select.Root type="single" bind:value={dropLocationId}>
                <Select.Trigger class="h-8 text-xs">
                  <div class="flex items-center gap-2 overflow-hidden">
                    <span class="truncate">
                      {story.locations.find((l) => l.id === dropLocationId)
                        ?.name || "Select location"}
                    </span>
                  </div>
                </Select.Trigger>
                <Select.Content class="max-h-[200px]">
                  {#if story.locations.length === 0}
                    <Select.Item value="" disabled
                      >No locations available</Select.Item
                    >
                  {:else}
                    {#each story.locations as location (location.id)}
                      <Select.Item value={location.id} label={location.name}
                        >{location.name}</Select.Item
                      >
                    {/each}
                  {/if}
                </Select.Content>
              </Select.Root>

              <div class="flex justify-end gap-2">
                <Button
                  variant="text"
                  size="sm"
                  class="h-7 text-xs"
                  onclick={cancelDrop}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  class="h-7 text-xs px-4"
                  onclick={() => moveItem(item)}
                  disabled={!dropLocationId}
                >
                  Move
                </Button>
              </div>
            </div>
          {:else}
            <!-- VIEW MODE -->
            <div class="flex items-start gap-3">
              <!-- Icon -->
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              >
                <Package class="h-5 w-5" />
              </div>

              <!-- Content -->
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <p
                      class="font-medium leading-none text-foreground truncate"
                    >
                      {item.translatedName ?? item.name}
                    </p>
                    {#if item.quantity > 1}
                      <Badge variant="secondary" class="h-4 px-1.5 text-[10px]"
                        >x{item.quantity}</Badge
                      >
                    {/if}
                  </div>

                  <div class="flex items-center">
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground -my-1"
                      onclick={() => startEdit(item)}
                      title="Edit"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <p class="mt-1 text-xs text-muted-foreground">
                  At {getLocationLabel(item.location)}
                </p>

                <!-- Description -->
                {#if hasDescription(item)}
                  <div class="text-xs text-muted-foreground mt-1.5">
                    {#if !isCollapsed}
                      <p class="leading-relaxed">
                        {item.translatedDescription ?? item.description}
                      </p>
                    {:else}
                      <p
                        class="truncate cursor-pointer hover:text-foreground"
                        onclick={() => toggleCollapse(item.id)}
                      >
                        {item.translatedDescription ?? item.description}
                      </p>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <!-- Footer Actions -->
            <div
              class="flex items-center justify-between mt-1 border-t border-border/0 pt-1"
            >
              {#if (item.description?.length ?? 0) > 45 || (item.translatedDescription?.length ?? 0) > 45}
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6 -ml-2 text-muted-foreground hover:text-foreground"
                  onclick={() => toggleCollapse(item.id)}
                  title={isCollapsed
                    ? "Show full description"
                    : "Hide description"}
                >
                  <ChevronDown
                    class={cn(
                      "h-4 w-4 transition-transform duration-200",
                      !isCollapsed ? "rotate-180" : "",
                    )}
                  />
                </Button>
              {:else}
                <div></div>
              {/if}

              <div class="flex items-center gap-1 ml-auto">
                <IconRow onDelete={() => deleteItem(item)} showDelete={true}>
                  <Button
                    variant="text"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onclick={() => pickUpItem(item)}
                    title="Pick up"
                  >
                    <ArrowUp class="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="text"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onclick={() => beginDrop(item)}
                    title="Move item"
                  >
                    <MapPin class="h-3.5 w-3.5" />
                  </Button>
                </IconRow>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
