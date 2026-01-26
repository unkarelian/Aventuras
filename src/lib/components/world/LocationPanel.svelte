<script lang="ts">
  import { story } from "$lib/stores/story.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import {
    Plus,
    MapPin,
    Navigation,
    Trash2,
    Pencil,
    ChevronDown,
    Save,
    X,
  } from "lucide-svelte";
  import type { Location } from "$lib/types";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils/cn";
  import IconRow from "$lib/components/ui/icon-row.svelte";

  let showAddForm = $state(false);
  let newName = $state("");
  let newDescription = $state("");
  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editDescription = $state("");

  function toggleCollapse(locationId: string) {
    const isCollapsed = ui.isEntityCollapsed(locationId);
    ui.toggleEntityCollapsed(locationId, !isCollapsed);
  }

  function hasDetails(location: Location): boolean {
    return !!location.description;
  }

  async function addLocation() {
    if (!newName.trim()) return;
    const makeCurrent = story.locations.length === 0;
    await story.addLocation(
      newName.trim(),
      newDescription.trim() || undefined,
      makeCurrent,
    );
    newName = "";
    newDescription = "";
    showAddForm = false;
  }

  async function goToLocation(locationId: string) {
    await story.setCurrentLocation(locationId);
  }

  async function toggleVisited(locationId: string) {
    await story.toggleLocationVisited(locationId);
  }

  async function deleteLocation(location: Location) {
    await story.deleteLocation(location.id);
  }

  function startEdit(location: Location) {
    editingId = location.id;
    editName = location.name;
    editDescription = location.description ?? "";
  }

  function cancelEdit() {
    editingId = null;
    editName = "";
    editDescription = "";
  }

  async function saveEdit(location: Location) {
    const name = editName.trim();
    if (!name) return;
    await story.updateLocation(location.id, {
      name,
      description: editDescription.trim() || null,
    });
    cancelEdit();
  }
</script>

<div class="flex flex-col gap-1 pb-12">
  <!-- Header -->
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-xl font-bold tracking-tight text-foreground">Locations</h3>
    <Button
      variant="text"
      size="icon"
      class="h-6 w-6 text-muted-foreground hover:text-foreground"
      onclick={() => (showAddForm = !showAddForm)}
      title="Add location"
    >
      <Plus class="h-6! w-6!" />
    </Button>
  </div>

  <!-- Add Form -->
  {#if showAddForm}
    <div class="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div class="space-y-3">
        <Input
          type="text"
          bind:value={newName}
          placeholder="Location name"
          class="h-8 text-sm"
        />
        <Textarea
          bind:value={newDescription}
          placeholder="Description (optional)"
          class="resize-none text-sm min-h-[60px]"
          rows={2}
        />
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
          onclick={addLocation}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  {/if}

  <!-- Current Location -->
  {#if story.currentLocation}
    {@const currentLocation = story.currentLocation}
    {@const isEditing = editingId === currentLocation.id}
    {@const isCollapsed = ui.isEntityCollapsed(currentLocation.id)}

    <div
      class="rounded-lg border border-accent-500/50 bg-accent-500/10 pl-3 pr-2 pt-3 pb-2 shadow-sm mb-2"
    >
      {#if isEditing}
        <!-- EDIT MODE (Current) -->
        <div class="space-y-3">
          <div class="flex justify-between items-center mb-2">
            <h4
              class="text-xs font-semibold text-accent-400 uppercase tracking-wider"
            >
              Editing Current Location
            </h4>
            <Button
              variant="text"
              size="icon"
              class="h-6 w-6"
              onclick={cancelEdit}><X class="h-4 w-4" /></Button
            >
          </div>

          <div class="space-y-1">
            <Input
              type="text"
              bind:value={editName}
              placeholder="Location name"
              class="h-8 text-sm"
            />
          </div>

          <div class="space-y-1">
            <Textarea
              bind:value={editDescription}
              placeholder="Description"
              class="resize-none text-xs min-h-[60px]"
            />
          </div>

          <div
            class="flex justify-end gap-2 pt-2 border-t border-accent-500/30"
          >
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
              onclick={() => saveEdit(currentLocation)}
              disabled={!editName.trim()}
            >
              <Save class="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          </div>
        </div>
      {:else}
        <!-- DISPLAY MODE (Current) -->
        <div class="flex items-center gap-2 text-accent-500 mb-1">
          <Navigation class="h-4 w-4" />
          <span class="text-xs font-bold uppercase tracking-wide"
            >Current Location</span
          >
        </div>

        <h4 class="font-medium text-foreground break-words">
          {currentLocation.translatedName ?? currentLocation.name}
        </h4>

        {#if currentLocation.description || currentLocation.translatedDescription}
          <div class="mt-2 text-sm text-muted-foreground">
            {#if !isCollapsed}
              <p class="leading-relaxed whitespace-pre-wrap">
                {currentLocation.translatedDescription ??
                  currentLocation.description}
              </p>
            {:else}
              <p
                class="truncate cursor-pointer hover:text-foreground"
                onclick={() => toggleCollapse(currentLocation.id)}
              >
                {currentLocation.translatedDescription ??
                  currentLocation.description}
              </p>
            {/if}
          </div>
        {/if}

        <div
          class="flex items-center justify-between mt-2 pt-2 border-t border-accent-500/20"
        >
          {#if (currentLocation.description?.length ?? 0) > 45 || (currentLocation.translatedDescription?.length ?? 0) > 45}
            <Button
              variant="text"
              size="icon"
              class="h-6 w-6 -ml-2 text-accent-500 hover:text-accent-700"
              onclick={() => toggleCollapse(currentLocation.id)}
              title={isCollapsed ? "Show full description" : "Hide description"}
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

          <div class="flex items-center">
            <Button
              variant="text"
              size="icon"
              class="h-6 w-6 text-accent-500 hover:text-accent-700"
              onclick={() => startEdit(currentLocation)}
              title="Edit location"
            >
              <Pencil class="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Location List -->
  {#if story.locations.filter((l) => !l.current).length === 0 && !story.currentLocation}
    <div
      class="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed border-border bg-muted/20"
    >
      <div class="mb-3 rounded-full bg-muted p-3">
        <MapPin class="h-6 w-6 text-muted-foreground" />
      </div>
      <p class="text-sm text-muted-foreground">No locations yet</p>
      <Button
        variant="link"
        class="mt-1 h-auto p-0 text-xs text-primary"
        onclick={() => (showAddForm = true)}
      >
        <Plus class="mr-1.5 h-3.5 w-3.5" />
        Add your first location
      </Button>
    </div>
  {:else}
    <div class="flex flex-col gap-3.5">
      {#each story.locations.filter((l) => !l.current) as location (location.id)}
        {@const isCollapsed = ui.isEntityCollapsed(location.id)}
        {@const isEditing = editingId === location.id}

        <div
          class={cn(
            "group rounded-lg border border-border bg-card shadow-sm transition-all pl-3 pr-2 pt-3 pb-2",
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
                  Editing {location.name}
                </h4>
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6"
                  onclick={cancelEdit}><X class="h-4 w-4" /></Button
                >
              </div>

              <div class="space-y-1">
                <Label class="text-xs">Name</Label>
                <Input
                  type="text"
                  bind:value={editName}
                  placeholder="Location name"
                  class="h-8 text-sm"
                />
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
                  onclick={() => saveEdit(location)}
                  disabled={!editName.trim()}
                >
                  <Save class="mr-1.5 h-3.5 w-3.5" />
                  Save Changes
                </Button>
              </div>
            </div>
          {:else}
            <!-- DISPLAY MODE -->
            <div class="flex items-start gap-3">
              <!-- Visited Status Icon -->
              <button
                class={cn(
                  "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
                  location.visited
                    ? "bg-muted ring-muted text-muted-foreground hover:bg-muted/80"
                    : "bg-primary/10 ring-primary/20 text-primary hover:bg-primary/20",
                )}
                onclick={() => toggleVisited(location.id)}
                title={location.visited
                  ? "Mark as unvisited"
                  : "Mark as visited"}
              >
                <MapPin class="h-4 w-4" />
              </button>

              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center justify-between">
                  <p
                    class="font-medium leading-none text-foreground truncate pr-2"
                  >
                    {location.translatedName ?? location.name}
                  </p>
                  <div class="flex items-center">
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground -my-1"
                      onclick={() => startEdit(location)}
                      title="Edit"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div class="mt-1 flex items-center gap-2">
                  <span
                    class={cn(
                      "text-[10px] font-medium uppercase tracking-wider",
                      location.visited
                        ? "text-muted-foreground"
                        : "text-primary",
                    )}
                  >
                    {location.visited ? "Visited" : "Unvisited"}
                  </span>
                </div>
              </div>
            </div>

            <!-- Description -->
            {#if location.description || location.translatedDescription}
              <div class="mt-2 text-xs text-muted-foreground">
                {#if !isCollapsed}
                  <p class="leading-relaxed whitespace-pre-wrap">
                    {location.translatedDescription ?? location.description}
                  </p>
                {:else}
                  <p
                    class="truncate cursor-pointer hover:text-foreground"
                    onclick={() => toggleCollapse(location.id)}
                  >
                    {location.translatedDescription ?? location.description}
                  </p>
                {/if}
              </div>
            {/if}

            <!-- Footer Actions -->
            <div
              class="flex items-center justify-between mt-2 pt-2 border-t border-border"
            >
              {#if (location.description?.length ?? 0) > 45 || (location.translatedDescription?.length ?? 0) > 45}
                <Button
                  variant="text"
                  size="icon"
                  class="h-6 w-6 -ml-2 text-muted-foreground hover:text-foreground"
                  onclick={() => toggleCollapse(location.id)}
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

              <div class="flex items-center gap-2">
                <IconRow
                  class="ml-0"
                  onDelete={() => deleteLocation(location)}
                  showDelete={true}
                >
                  <Button
                    variant="text"
                    size="sm"
                    class="h-6 text-xs text-muted-foreground hover:text-primary"
                    onclick={() => goToLocation(location.id)}
                    title="Travel to location"
                  >
                    <Navigation class="mr-1 h-3 w-3" />
                    Travel
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
