<script lang="ts">
  import { story } from "$lib/stores/story.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import {
    Plus,
    User,
    Skull,
    UserX,
    Pencil,
    Star,
    ImageUp,
    Wand2,
    X,
    Loader2,
    ChevronDown,
    Archive,
    UserPlus,
    Save,
  } from "lucide-svelte";
  import type { Character } from "$lib/types";
  import { NanoGPTImageProvider } from "$lib/services/ai/nanoGPTImageProvider";
  import { promptService } from "$lib/services/prompts";
  import { normalizeImageDataUrl } from "$lib/utils/image";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Badge } from "$lib/components/ui/badge";
  import * as Avatar from "$lib/components/ui/avatar";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils/cn";
  import IconRow from "$lib/components/ui/icon-row.svelte";

  let showAddForm = $state(false);
  let newName = $state("");
  let newDescription = $state("");
  let newRelationship = $state("");
  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editDescription = $state("");
  let editRelationship = $state("");
  let editStatus = $state<Character["status"]>("active");
  let editTraits = $state("");
  let editVisualDescriptors = $state("");
  let pendingProtagonistId = $state<string | null>(null);
  let previousRelationshipLabel = $state("");
  let swapError = $state<string | null>(null);

  // Portrait state
  let uploadingPortraitId = $state<string | null>(null);
  let generatingPortraitId = $state<string | null>(null);
  let portraitError = $state<string | null>(null);
  let editPortrait = $state<string | null>(null);
  let expandedPortrait = $state<{ src: string; name: string } | null>(null);
  let savedToVaultId = $state<string | null>(null);
  const currentProtagonistName = $derived.by(
    () =>
      story.characters.find((c) => c.relationship === "self")?.name ??
      "current",
  );

  async function addCharacter() {
    if (!newName.trim()) return;
    await story.addCharacter(
      newName.trim(),
      newDescription.trim() || undefined,
      newRelationship.trim() || undefined,
    );
    newName = "";
    newDescription = "";
    newRelationship = "";
    showAddForm = false;
  }

  async function saveCharacterToVault(character: Character) {
    if (!story.currentStory) return;

    // Ensure vault is loaded
    if (!characterVault.isLoaded) {
      await characterVault.load();
    }

    await characterVault.saveFromStory(character, story.currentStory.id);

    savedToVaultId = character.id;
    setTimeout(() => (savedToVaultId = null), 2000);
  }

  function startEdit(character: Character) {
    editingId = character.id;
    editName = character.name;
    editDescription = character.description ?? "";
    editRelationship = character.relationship ?? "";
    editStatus = character.status;
    editTraits = character.traits.join(", ");
    editVisualDescriptors = (character.visualDescriptors ?? []).join(", ");
    editPortrait = character.portrait;
    portraitError = null;
  }

  function cancelEdit() {
    editingId = null;
    editName = "";
    editDescription = "";
    editRelationship = "";
    editTraits = "";
    editVisualDescriptors = "";
    editStatus = "active";
    editPortrait = null;
    portraitError = null;
  }

  async function saveEdit(character: Character) {
    const name = editName.trim();
    if (!name) return;

    const relationship = editRelationship.trim();
    const traits = editTraits
      .split(",")
      .map((trait) => trait.trim())
      .filter(Boolean);
    const visualDescriptors = editVisualDescriptors
      .split(",")
      .map((desc) => desc.trim())
      .filter(Boolean);

    await story.updateCharacter(character.id, {
      name,
      description: editDescription.trim() || null,
      relationship:
        character.relationship === "self" ? "self" : relationship || null,
      status: editStatus,
      traits,
      visualDescriptors,
      portrait: editPortrait,
    });

    cancelEdit();
  }

  async function deleteCharacter(character: Character) {
    await story.deleteCharacter(character.id);
  }

  function beginSwap(character: Character) {
    pendingProtagonistId = character.id;
    previousRelationshipLabel = "";
    swapError = null;
  }

  function cancelSwap() {
    pendingProtagonistId = null;
    previousRelationshipLabel = "";
    swapError = null;
  }

  async function confirmSwap(character: Character) {
    swapError = null;
    try {
      const label = previousRelationshipLabel.trim();
      if (!label || label.toLowerCase() === "self") {
        swapError = "Enter a custom label for the previous protagonist.";
        return;
      }
      await story.setProtagonist(character.id, label);
      cancelSwap();
    } catch (error) {
      swapError =
        error instanceof Error ? error.message : "Failed to swap protagonists.";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "active":
        return User;
      case "inactive":
        return UserX;
      case "deceased":
        return Skull;
      default:
        return User;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "active":
        return "text-green-500";
      case "inactive":
        return "text-muted-foreground";
      case "deceased":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  }

  function getStatusBgColor(status: string) {
    switch (status) {
      case "active":
        return "bg-green-500/10 ring-green-500/20";
      case "inactive":
        return "bg-muted ring-muted";
      case "deceased":
        return "bg-destructive/10 ring-destructive/20";
      default:
        return "bg-muted ring-muted";
    }
  }

  // Portrait handling functions
  async function handlePortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !editingId) return;

    uploadingPortraitId = editingId;
    portraitError = null;

    try {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image must be smaller than 5MB");
      }

      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string" || !result.startsWith("data:image/")) {
            reject(new Error("Failed to read image data"));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      editPortrait = dataUrl;
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to upload portrait";
    } finally {
      uploadingPortraitId = null;
      // Reset input
      input.value = "";
    }
  }

  async function generatePortrait(character: Character) {
    const imageSettings = settings.systemServicesSettings.imageGeneration;

    // Validate requirements
    if (!imageSettings.nanoGptApiKey) {
      portraitError = "NanoGPT API key required for portrait generation";
      return;
    }

    // Get visual descriptors from current edit state or character
    const descriptors = editVisualDescriptors
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

    if (descriptors.length === 0) {
      portraitError = "Add appearance descriptors first";
      return;
    }

    generatingPortraitId = character.id;
    portraitError = null;

    try {
      // Get the style prompt
      const styleId = imageSettings.styleId;
      let stylePrompt = "";
      try {
        const promptContext = {
          mode: "adventure" as const,
          pov: "second" as const,
          tense: "present" as const,
          protagonistName: "",
        };
        stylePrompt = promptService.getPrompt(styleId, promptContext) || "";
      } catch {
        // Use default style
        stylePrompt =
          "Soft cel-shaded anime illustration. Muted pastel color palette with low saturation. Dreamy, airy atmosphere.";
      }

      // Build the portrait generation prompt using the template
      const promptContext = {
        mode: "adventure" as const,
        pov: "second" as const,
        tense: "present" as const,
        protagonistName: "",
      };

      const portraitPrompt = promptService.renderPrompt(
        "image-portrait-generation",
        promptContext,
        {
          imageStylePrompt: stylePrompt,
          visualDescriptors: descriptors.join(", "),
          characterName: editName || character.name,
        },
      );

      // Create the image provider
      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);

      // Generate the image
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || "z-image-turbo",
        size: "1024x1024",
        response_format: "b64_json",
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error("No image data returned");
      }

      editPortrait = `data:image/png;base64,${response.images[0].b64_json}`;
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to generate portrait";
    } finally {
      generatingPortraitId = null;
    }
  }

  function removePortrait() {
    editPortrait = null;
    portraitError = null;
  }

  function toggleCollapse(characterId: string) {
    const isCollapsed = ui.isEntityCollapsed(characterId);
    ui.toggleEntityCollapsed(characterId, !isCollapsed);
  }

  function hasDetails(character: Character): boolean {
    return (
      character.traits.length > 0 ||
      (character.visualDescriptors && character.visualDescriptors.length > 0) ||
      !!character.description
    );
  }
</script>

<div class="flex flex-col gap-1 pb-12">
  <!-- Header -->
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-xl font-bold tracking-tight text-foreground">Characters</h3>
    <Button
      variant="text"
      size="icon"
      class="h-6 w-6 text-muted-foreground hover:text-foreground"
      onclick={() => (showAddForm = !showAddForm)}
      title="Add character"
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
          placeholder="Name"
          class="h-8 text-sm"
        />
        <Input
          type="text"
          bind:value={newRelationship}
          placeholder="Relationship (ally, enemy...)"
          class="h-8 text-sm"
        />
        <Textarea
          bind:value={newDescription}
          placeholder="Description (optional)"
          class="resize-none text-sm min-h-15"
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
          onclick={addCharacter}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  {/if}

  <!-- Empty State -->
  {#if story.characters.length === 0}
    <div
      class="flex flex-col items-center justify-center py-8 text-center rounded-lg border border-dashed border-border bg-muted/20"
    >
      <div class="mb-3 rounded-full bg-muted p-3">
        <UserPlus class="h-6 w-6 text-muted-foreground" />
      </div>
      <p class="text-sm text-muted-foreground">No characters yet</p>
      <Button
        variant="link"
        class="mt-1 h-auto p-0 text-xs text-primary"
        onclick={() => (showAddForm = true)}
      >
        <Plus class="mr-1.5 h-3.5 w-3.5" />
        Add your first character
      </Button>
    </div>
  {:else}
    <!-- Character List -->
    <div class="flex flex-col gap-2">
      {#each story.characters as character (character.id)}
        {@const StatusIcon = getStatusIcon(character.status)}
        {@const isProtagonist = character.relationship === "self"}
        {@const isCollapsed = ui.isEntityCollapsed(character.id)}
        {@const showDetails = hasDetails(character) && !isCollapsed}
        {@const isEditing = editingId === character.id}

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
                  Editing {character.name}
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
                    placeholder="Name"
                    class="h-8 text-sm"
                  />
                </div>
                <div class="col-span-2 sm:col-span-1 space-y-1">
                  <Label class="text-xs">Relationship</Label>
                  <Input
                    type="text"
                    bind:value={editRelationship}
                    placeholder={isProtagonist ? "Protagonist" : "Relationship"}
                    class="h-8 text-sm"
                    disabled={isProtagonist}
                  />
                </div>
              </div>

              <div class="space-y-1">
                <Label class="text-xs">Status</Label>
                <ToggleGroup.Root
                  type="single"
                  value={editStatus}
                  onValueChange={(v) => {
                    if (v) editStatus = v as Character["status"];
                  }}
                  class="w-full justify-start border rounded-md p-1 gap-1"
                >
                  <ToggleGroup.Item
                    value="active"
                    class="flex-1 h-7 text-xs data-[state=on]:bg-green-500/10 data-[state=on]:text-green-600"
                  >
                    <!-- <User class="h-3 w-3" /> -->
                    Active
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    value="inactive"
                    class="flex-1 h-7 text-xs data-[state=on]:bg-muted data-[state=on]:text-foreground"
                  >
                    <!-- <UserX class="h-3 w-3" /> -->
                    Inactive
                  </ToggleGroup.Item>
                  <ToggleGroup.Item
                    value="deceased"
                    class="flex-1 h-7 text-xs data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive"
                  >
                    <!-- <Skull class="h-3 w-3" /> -->
                    Deceased
                  </ToggleGroup.Item>
                </ToggleGroup.Root>
              </div>

              <div class="space-y-1">
                <Label class="text-xs">Traits & Appearance</Label>
                <Input
                  type="text"
                  bind:value={editTraits}
                  placeholder="Traits (comma separated)"
                  class="h-8 text-xs mb-2"
                />
                <Input
                  type="text"
                  bind:value={editVisualDescriptors}
                  placeholder="Appearance (comma separated)"
                  class="h-8 text-xs"
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

              <!-- Portrait Section -->
              <div class="rounded-md border border-border bg-muted/20 p-2">
                <div
                  class="mb-2 text-xs font-medium text-muted-foreground flex items-center justify-between"
                >
                  <span>Portrait</span>
                  {#if editPortrait}
                    <Button
                      variant="destructive"
                      size="sm"
                      class="h-5 px-1.5 text-xs"
                      onclick={removePortrait}
                    >
                      Remove
                    </Button>
                  {/if}
                </div>
                <div class="flex items-start gap-3">
                  {#if editPortrait}
                    <img
                      src={normalizeImageDataUrl(editPortrait) ?? ""}
                      alt="Portrait preview"
                      class="h-16 w-16 rounded-md object-cover ring-1 ring-border bg-background"
                    />
                  {:else}
                    <div
                      class="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border bg-background/50"
                    >
                      <User class="h-6 w-6 text-muted-foreground" />
                    </div>
                  {/if}
                  <div class="flex flex-1 flex-col gap-2">
                    <label
                      class={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "h-7 cursor-pointer text-xs w-full justify-start bg-background",
                      )}
                    >
                      {#if uploadingPortraitId === character.id}
                        <Loader2 class="mr-2 h-3.5 w-3.5 animate-spin" />
                        <span>Uploading...</span>
                      {:else}
                        <ImageUp class="mr-2 h-3.5 w-3.5" />
                        <span>Upload Image</span>
                      {/if}
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={handlePortraitUpload}
                        disabled={uploadingPortraitId !== null ||
                          generatingPortraitId !== null}
                      />
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      class="h-7 text-xs w-full justify-start bg-background"
                      onclick={() => generatePortrait(character)}
                      disabled={generatingPortraitId !== null ||
                        uploadingPortraitId !== null ||
                        !editVisualDescriptors.trim()}
                      title={!editVisualDescriptors.trim()
                        ? "Add appearance first"
                        : "Generate from appearance"}
                    >
                      {#if generatingPortraitId === character.id}
                        <Loader2 class="mr-2 h-3.5 w-3.5 animate-spin" />
                        <span>Generating...</span>
                      {:else}
                        <Wand2 class="mr-2 h-3.5 w-3.5" />
                        <span>Generate AI Portrait</span>
                      {/if}
                    </Button>
                  </div>
                </div>
                {#if portraitError}
                  <p class="mt-2 text-xs text-destructive">{portraitError}</p>
                {/if}
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
                  onclick={() => saveEdit(character)}
                  disabled={!editName.trim()}
                >
                  <Save class="mr-1.5 h-3.5 w-3.5" />
                  Save Changes
                </Button>
              </div>
            </div>
          {:else}
            <!-- DISPLAY MODE -->

            <!-- Row 1: Portrait + Name -->
            <div class="flex items-start gap-3">
              <!-- Portrait / Avatar -->
              {#if character.portrait}
                <button
                  class="shrink-0 focus:outline-none"
                  onclick={() =>
                    (expandedPortrait = {
                      src: normalizeImageDataUrl(character.portrait) ?? "",
                      name: character.name,
                    })}
                >
                  <Avatar.Root
                    class="h-10 w-10 ring-1 ring-border transition-all hover:ring-2 hover:ring-primary"
                  >
                    <Avatar.Image
                      src={normalizeImageDataUrl(character.portrait) ?? ""}
                      alt={character.name}
                      class="object-cover"
                    />
                    <Avatar.Fallback
                      class="bg-muted text-muted-foreground text-xs"
                    >
                      {character.name.slice(0, 2).toUpperCase()}
                    </Avatar.Fallback>
                  </Avatar.Root>
                </button>
              {:else}
                <div
                  class={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1",
                    getStatusBgColor(character.status),
                  )}
                >
                  <StatusIcon
                    class={cn("h-4 w-4", getStatusColor(character.status))}
                  />
                </div>
              {/if}

              <!-- Name & Role -->
              <div class="min-w-0 flex-1 pt-0.5">
                <div class="flex items-center justify-between">
                  <p
                    class="font-medium leading-none text-foreground truncate pr-2"
                  >
                    {character.translatedName ?? character.name}
                  </p>
                  <div class="flex items-center">
                    {#if !isProtagonist}
                      <Button
                        variant="text"
                        size="icon"
                        class="h-6 w-6 text-muted-foreground hover:text-amber-500 -my-1"
                        onclick={() => beginSwap(character)}
                        title="Make protagonist"
                      >
                        <Star class="h-3.5 w-3.5" />
                      </Button>
                    {/if}
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground -my-1"
                      onclick={() => startEdit(character)}
                      title="Edit"
                    >
                      <Pencil class="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div class="mt-1.5 flex flex-wrap items-center gap-2">
                  {#if isProtagonist}
                    <Badge
                      variant="default"
                      class="px-1.5 py-0 text-[10px] uppercase tracking-wide h-4"
                    >
                      <Star class="mr-1 h-2.5 w-2.5" />
                      Protagonist
                    </Badge>
                  {:else if character.relationship || character.translatedRelationship}
                    <Badge
                      variant="secondary"
                      class="px-1.5 py-0 text-[10px] font-normal text-muted-foreground h-4"
                    >
                      {character.translatedRelationship ??
                        character.relationship}
                    </Badge>
                  {/if}
                </div>
              </div>
            </div>

            <!-- Row 2: Actions (Only visible if needed or for extra actions) -->
            {#if pendingProtagonistId === character.id}
              <div class="mt-3 rounded-md border border-border bg-muted/40 p-3">
                <p class="mb-2 text-xs text-muted-foreground">
                  New role for <span class="text-foreground font-medium"
                    >{currentProtagonistName}</span
                  >:
                </p>
                <div class="flex gap-2">
                  <Input
                    type="text"
                    bind:value={previousRelationshipLabel}
                    placeholder="e.g., former protagonist, ally"
                    class="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    class="h-8 text-xs"
                    onclick={() => confirmSwap(character)}
                    disabled={!previousRelationshipLabel.trim()}
                  >
                    Swap
                  </Button>
                </div>
                {#if swapError}
                  <p class="mt-1.5 text-xs text-destructive">{swapError}</p>
                {/if}
                <div class="mt-2 flex justify-end">
                  <Button
                    variant="text"
                    size="sm"
                    class="h-6 text-xs"
                    onclick={cancelSwap}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            {/if}

            <!-- Details Section - Collapsible -->
            {#if hasDetails(character)}
              <div class="mt-3 border-t border-border pt-2">
                <div class="flex flex-col gap-2">
                  {#if character.traits.length > 0 || (character.translatedTraits && character.translatedTraits.length > 0)}
                    <div class="flex flex-wrap gap-1">
                      {#each character.translatedTraits ?? character.traits as trait}
                        <span
                          class="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {trait}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  {#if character.visualDescriptors.length > 0 || (character.translatedVisualDescriptors && character.translatedVisualDescriptors.length > 0)}
                    <div class="flex flex-wrap gap-1">
                      {#each character.translatedVisualDescriptors ?? character.visualDescriptors as descriptor}
                        <span
                          class="inline-flex items-center rounded-sm bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-medium text-pink-600 dark:text-pink-400"
                        >
                          {descriptor}
                        </span>
                      {/each}
                    </div>
                  {/if}
                  {#if character.description || character.translatedDescription}
                    <div class="text-xs text-muted-foreground mt-1">
                      {#if !isCollapsed}
                        <p class="leading-relaxed">
                          {character.translatedDescription ??
                            character.description}
                        </p>
                      {:else}
                        <button
                          type="button"
                          class="truncate cursor-pointer hover:text-foreground bg-transparent border-none p-0 text-left w-full"
                          onclick={() => toggleCollapse(character.id)}
                          onkeydown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleCollapse(character.id);
                            }
                          }}
                          aria-label="Toggle character description"
                        >
                          {character.translatedDescription ??
                            character.description}
                        </button>
                      {/if}
                    </div>
                  {/if}
                </div>

                <!-- Footer Actions -->
                <div class="flex items-center justify-between mt-1">
                  {#if (character.description?.length ?? 0) > 45 || (character.translatedDescription?.length ?? 0) > 45}
                    <Button
                      variant="text"
                      size="icon"
                      class="h-6 w-6 -ml-2 text-muted-foreground hover:text-foreground"
                      onclick={() => toggleCollapse(character.id)}
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

                  <IconRow
                    class="ml-auto"
                    onDelete={!isProtagonist
                      ? () => deleteCharacter(character)
                      : undefined}
                    showDelete={!isProtagonist}
                  >
                    <Button
                      variant="text"
                      size="icon"
                      class={cn(
                        "h-6 w-6",
                        savedToVaultId === character.id
                          ? "text-green-500"
                          : "text-muted-foreground hover:text-primary",
                      )}
                      onclick={() => saveCharacterToVault(character)}
                      title="Save to vault"
                    >
                      <Archive class="h-3 w-3" />
                    </Button>
                  </IconRow>
                </div>
              </div>
            {:else}
              <!-- Just footer actions if no details -->
              <div
                class="flex items-center justify-end mt-1 border-t border-border"
              >
                <IconRow
                  class="ml-auto"
                  onDelete={!isProtagonist
                    ? () => deleteCharacter(character)
                    : undefined}
                  showDelete={!isProtagonist}
                >
                  <Button
                    variant="text"
                    size="icon"
                    class={cn(
                      "h-6 w-6",
                      savedToVaultId === character.id
                        ? "text-green-500"
                        : "text-muted-foreground hover:text-primary",
                    )}
                    onclick={() => saveCharacterToVault(character)}
                    title="Save to vault"
                  >
                    <Archive class="h-3 w-3" />
                  </Button>
                </IconRow>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Expanded Portrait Modal -->
{#if expandedPortrait}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    onclick={() => (expandedPortrait = null)}
    role="dialog"
    aria-label="Expanded portrait"
    tabindex="0"
  >
    <div
      class="relative max-h-[85vh] max-w-[85vw] shadow-2xl rounded-lg overflow-hidden border border-border"
    >
      <img
        src={expandedPortrait.src}
        alt="{expandedPortrait.name} portrait"
        class="max-h-[85vh] max-w-[85vw] object-contain"
      />
      <Button
        variant="secondary"
        size="icon"
        class="absolute right-2 top-2 h-8 w-8 rounded-full opacity-70 hover:opacity-100"
        onclick={(e) => {
          e.stopPropagation();
          expandedPortrait = null;
        }}
      >
        <X class="h-4 w-4" />
      </Button>
    </div>
  </div>
{/if}
