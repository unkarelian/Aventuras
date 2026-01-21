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
    Trash2,
    Star,
    ImageUp,
    Wand2,
    X,
    Loader2,
    ChevronDown,
    Archive,
    UserPlus,
  } from "lucide-svelte";
  import type { Character } from "$lib/types";
  import { NanoGPTImageProvider } from "$lib/services/ai/nanoGPTImageProvider";
  import { promptService } from "$lib/services/prompts";
  import { normalizeImageDataUrl } from "$lib/utils/image";

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
  let confirmingDeleteId = $state<string | null>(null);
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

    const isProtagonist = character.relationship === "self";
    await characterVault.saveFromStory(
      character,
      isProtagonist ? "protagonist" : "supporting",
      story.currentStory.id,
    );

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
    confirmingDeleteId = null;
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
        return "text-green-400";
      case "inactive":
        return "text-surface-500";
      case "deceased":
        return "text-red-400";
      default:
        return "text-surface-400";
    }
  }

  function getStatusBgColor(status: string) {
    switch (status) {
      case "active":
        return "bg-green-500/20 ring-green-500/30";
      case "inactive":
        return "bg-surface-700 ring-surface-600";
      case "deceased":
        return "bg-red-500/20 ring-red-500/30";
      default:
        return "bg-surface-700 ring-surface-600";
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

<div class="flex flex-col gap-3">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-medium text-surface-400">Characters</h3>
    <button
      class="sm:btn-ghost flex items-center justify-center rounded-md p-1.5 text-surface-400 hover:text-surface-200"
      onclick={() => (showAddForm = !showAddForm)}
      title="Add character"
    >
      <Plus class="h-4 w-4" />
    </button>
  </div>

  <!-- Add Form -->
  {#if showAddForm}
    <div class="rounded-lg border border-surface-700/50 bg-surface-800/50 p-3">
      <div class="space-y-2">
        <input
          type="text"
          bind:value={newName}
          placeholder="Name"
          class="input text-sm"
        />
        <input
          type="text"
          bind:value={newRelationship}
          placeholder="Relationship (ally, enemy...)"
          class="input text-sm"
        />
        <textarea
          bind:value={newDescription}
          placeholder="Description (optional)"
          class="input resize-none text-sm"
          rows="2"
        ></textarea>
      </div>
      <div class="mt-3 flex justify-end gap-2">
        <button
          class="btn sm:btn-ghost px-3 py-1.5 text-xs"
          onclick={() => (showAddForm = false)}
        >
          Cancel
        </button>
        <button
          class="btn btn-primary px-3 py-1.5 text-xs"
          onclick={addCharacter}
          disabled={!newName.trim()}
        >
          Add
        </button>
      </div>
    </div>
  {/if}

  <!-- Empty State -->
  {#if story.characters.length === 0}
    <div class="flex flex-col items-center justify-center py-8 text-center">
      <div class="mb-3 rounded-full bg-surface-800 p-3">
        <UserPlus class="h-6 w-6 text-surface-500" />
      </div>
      <p class="text-sm text-surface-500">No characters yet</p>
      <button
        class="mt-3 flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300"
        onclick={() => (showAddForm = true)}
      >
        <Plus class="h-3.5 w-3.5" />
        Add your first character
      </button>
    </div>
  {:else}
    <!-- Character List -->
    <div class="flex flex-col gap-2">
      {#each story.characters as character (character.id)}
        {@const StatusIcon = getStatusIcon(character.status)}
        {@const isProtagonist = character.relationship === "self"}
        {@const isCollapsed = ui.isEntityCollapsed(character.id)}
        {@const showDetails = hasDetails(character) && !isCollapsed}

        <div
          class="group rounded-lg border border-surface-700/50 bg-surface-800/30 p-3 transition-colors hover:bg-surface-800/60"
        >
          <!-- Row 1: Portrait + Name -->
          <div class="flex items-start gap-2.5 pr-3 sm:pr-0">
            <!-- Portrait / Avatar -->
            {#if character.portrait}
              <button
                class="flex-shrink-0"
                onclick={() =>
                  (expandedPortrait = {
                    src: normalizeImageDataUrl(character.portrait) ?? "",
                    name: character.name,
                  })}
              >
                <img
                  src={normalizeImageDataUrl(character.portrait) ?? ""}
                  alt="{character.name} portrait"
                  class="h-9 w-9 rounded-lg object-cover ring-1 ring-surface-600 transition-all hover:ring-2 hover:ring-accent-500"
                />
              </button>
            {:else}
              <div
                class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ring-1 {getStatusBgColor(
                  character.status,
                )}"
              >
                <StatusIcon
                  class="h-4 w-4 {getStatusColor(character.status)}"
                />
              </div>
            {/if}

            <!-- Name & Role -->
            <div class="min-w-0 flex-1">
              <p class="font-medium leading-tight text-surface-100">
                {character.translatedName ?? character.name}
              </p>
              <div class="mt-0.5 flex items-center gap-1.5">
                {#if isProtagonist}
                  <span
                    class="inline-flex items-center gap-1 rounded bg-accent-500/20 px-1.5 py-0.5 text-[10px] font-medium text-accent-300"
                  >
                    <Star class="h-2.5 w-2.5" />
                    Protagonist
                  </span>
                {:else if character.relationship || character.translatedRelationship}
                  <span class="text-xs text-surface-500"
                    >{character.translatedRelationship ?? character.relationship}</span
                  >
                {/if}
              </div>
            </div>
          </div>

          <!-- Row 2: Actions -->
          <div class="mt-2 flex items-center justify-between">
            <div class="flex items-center -ml-1 gap-1 sm:gap-0">
              {#if confirmingDeleteId === character.id}
                <button
                  class="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                  onclick={() => deleteCharacter(character)}
                >
                  Delete?
                </button>
                <button
                  class="rounded px-2 py-1 text-xs text-surface-400 hover:bg-surface-700"
                  onclick={() => (confirmingDeleteId = null)}
                >
                  Cancel
                </button>
              {:else}
                {#if !isProtagonist}
                  <button
                    class="flex h-6 w-6 items-center justify-center rounded p-0 text-surface-500 hover:text-amber-400 sm:h-auto sm:w-auto sm:btn-ghost sm:p-1.5"
                    onclick={() => beginSwap(character)}
                    title="Make protagonist"
                  >
                    <Star class="h-3.5 w-3.5" />
                  </button>
                {/if}
                <button
                  class="flex h-6 w-6 items-center justify-center rounded p-0 {savedToVaultId ===
                  character.id
                    ? 'text-green-400'
                    : 'text-surface-500 hover:text-accent-400'} sm:h-auto sm:w-auto sm:btn-ghost sm:p-1.5"
                  onclick={() => saveCharacterToVault(character)}
                  title={savedToVaultId === character.id
                    ? "Saved!"
                    : "Save to vault"}
                >
                  <Archive class="h-3.5 w-3.5" />
                </button>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded p-0 text-surface-500 hover:text-surface-200 sm:h-auto sm:w-auto sm:btn-ghost sm:p-1.5"
                  onclick={() => startEdit(character)}
                  title="Edit"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
                <button
                  class="flex h-6 w-6 items-center justify-center rounded p-0 text-surface-500 hover:text-red-400 disabled:opacity-40 sm:h-auto sm:w-auto sm:btn-ghost sm:p-1.5"
                  onclick={() => (confirmingDeleteId = character.id)}
                  title={isProtagonist ? "Swap protagonist first" : "Delete"}
                  disabled={isProtagonist}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              {/if}
            </div>
            {#if hasDetails(character)}
              <button
                class="flex h-6 w-6 items-center justify-center rounded p-0 text-surface-500 hover:text-surface-200 -mr-1 sm:mr-0 sm:h-auto sm:w-auto sm:btn-ghost sm:p-1.5"
                onclick={() => toggleCollapse(character.id)}
                title={isCollapsed ? "Show details" : "Hide details"}
              >
                <ChevronDown
                  class="h-3.5 w-3.5 transition-transform {!isCollapsed
                    ? 'rotate-180'
                    : ''}"
                />
              </button>
            {/if}
          </div>

          <!-- Details Section - Collapsible -->
          {#if showDetails}
            <div class="mt-2 space-y-1.5 text-xs">
              {#if character.traits.length > 0 || (character.translatedTraits && character.translatedTraits.length > 0)}
                <div class="flex flex-wrap gap-1">
                  {#each character.translatedTraits ?? character.traits as trait}
                    <span
                      class="rounded bg-surface-700/80 px-1.5 py-0.5 text-surface-400"
                      >{trait}</span
                    >
                  {/each}
                </div>
              {/if}
              {#if character.visualDescriptors.length > 0 || (character.translatedVisualDescriptors && character.translatedVisualDescriptors.length > 0)}
                <div class="flex flex-wrap gap-1">
                  {#each character.translatedVisualDescriptors ?? character.visualDescriptors as descriptor}
                    <span
                      class="rounded bg-pink-500/10 px-1.5 py-0.5 text-pink-400/70"
                      >{descriptor}</span
                    >
                  {/each}
                </div>
              {/if}
              {#if character.description || character.translatedDescription}
                <p class="pt-0.5 text-surface-400">{character.translatedDescription ?? character.description}</p>
              {/if}
            </div>
          {/if}

          <!-- Protagonist Swap Modal -->
          {#if pendingProtagonistId === character.id}
            <div class="mt-2 rounded-md bg-surface-800/50 p-2.5">
              <p class="mb-2 text-xs text-surface-400">
                New role for <span class="text-surface-300"
                  >{currentProtagonistName}</span
                >:
              </p>
              <input
                type="text"
                bind:value={previousRelationshipLabel}
                placeholder="e.g., former protagonist, ally"
                class="input text-sm"
              />
              {#if swapError}
                <p class="mt-1.5 text-xs text-red-400">{swapError}</p>
              {/if}
              <div class="mt-2 flex justify-end gap-2">
                <button
                  class="btn sm:btn-ghost px-3 py-1.5 text-xs"
                  onclick={cancelSwap}
                >
                  Cancel
                </button>
                <button
                  class="btn btn-primary px-3 py-1.5 text-xs"
                  onclick={() => confirmSwap(character)}
                  disabled={!previousRelationshipLabel.trim()}
                >
                  Swap
                </button>
              </div>
            </div>
          {/if}

          <!-- Edit Form -->
          {#if editingId === character.id}
            <div class="mt-2 rounded-md bg-surface-800/50 p-2.5">
              <div class="space-y-2">
                <input
                  type="text"
                  bind:value={editName}
                  placeholder="Name"
                  class="input text-sm"
                />
                <div class="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    bind:value={editRelationship}
                    placeholder={isProtagonist ? "Protagonist" : "Relationship"}
                    class="input text-sm"
                    disabled={isProtagonist}
                  />
                  <select bind:value={editStatus} class="input text-sm">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="deceased">Deceased</option>
                  </select>
                </div>
                <input
                  type="text"
                  bind:value={editTraits}
                  placeholder="Traits (comma separated)"
                  class="input text-sm"
                />
                <input
                  type="text"
                  bind:value={editVisualDescriptors}
                  placeholder="Appearance (comma separated)"
                  class="input text-sm"
                />
                <textarea
                  bind:value={editDescription}
                  placeholder="Description"
                  class="input resize-none text-sm"
                  rows="2"
                ></textarea>

                <!-- Portrait Section -->
                <div
                  class="rounded-md border border-surface-700/50 bg-surface-800/30 p-3"
                >
                  <div class="mb-2 text-xs font-medium text-surface-400">
                    Portrait
                  </div>
                  <div class="flex items-start gap-3">
                    {#if editPortrait}
                      <div class="relative">
                        <img
                          src={normalizeImageDataUrl(editPortrait) ?? ""}
                          alt="Portrait preview"
                          class="h-16 w-16 rounded-lg object-cover ring-1 ring-surface-600"
                        />
                        <button
                          class="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
                          onclick={removePortrait}
                          title="Remove"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </div>
                    {:else}
                      <div
                        class="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-surface-600 bg-surface-800/50"
                      >
                        <User class="h-6 w-6 text-surface-600" />
                      </div>
                    {/if}
                    <div class="flex flex-1 flex-col gap-2">
                      <label
                        class="btn btn-secondary flex cursor-pointer items-center justify-center gap-1.5 px-3 py-2 text-xs"
                      >
                        {#if uploadingPortraitId === character.id}
                          <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          <span>Uploading...</span>
                        {:else}
                          <ImageUp class="h-3.5 w-3.5" />
                          <span>Upload</span>
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
                      <button
                        class="btn btn-secondary flex items-center justify-center gap-1.5 px-3 py-2 text-xs"
                        onclick={() => generatePortrait(character)}
                        disabled={generatingPortraitId !== null ||
                          uploadingPortraitId !== null ||
                          !editVisualDescriptors.trim()}
                        title={!editVisualDescriptors.trim()
                          ? "Add appearance first"
                          : "Generate from appearance"}
                      >
                        {#if generatingPortraitId === character.id}
                          <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          <span>Generating...</span>
                        {:else}
                          <Wand2 class="h-3.5 w-3.5" />
                          <span>Generate</span>
                        {/if}
                      </button>
                    </div>
                  </div>
                  {#if portraitError}
                    <p class="mt-2 text-xs text-red-400">{portraitError}</p>
                  {/if}
                </div>
              </div>

              <div class="mt-3 flex justify-end gap-2">
                <button
                  class="btn sm:btn-ghost px-3 py-1.5 text-xs"
                  onclick={cancelEdit}
                >
                  Cancel
                </button>
                <button
                  class="btn btn-primary px-3 py-1.5 text-xs"
                  onclick={() => saveEdit(character)}
                  disabled={!editName.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Expanded Portrait Modal -->
{#if expandedPortrait}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/80 p-4"
    onclick={() => (expandedPortrait = null)}
    onkeydown={(e) => e.key === "Escape" && (expandedPortrait = null)}
    role="dialog"
    aria-label="Expanded portrait"
  >
    <div class="relative max-h-[80vh] max-w-[80vw]">
      <img
        src={expandedPortrait.src}
        alt="{expandedPortrait.name} portrait"
        class="max-h-[80vh] max-w-[80vw] rounded-lg object-contain"
      />
      <button
        class="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-white"
        onclick={(e) => {
          e.stopPropagation();
          expandedPortrait = null;
        }}
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </div>
{/if}
