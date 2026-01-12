<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { Plus, User, Skull, UserX, Pencil, Trash2, Star, ImageUp, Wand2, X, Loader2, ChevronDown, ChevronUp } from 'lucide-svelte';
  import type { Character } from '$lib/types';
  import { NanoGPTImageProvider } from '$lib/services/ai/nanoGPTImageProvider';
  import { promptService } from '$lib/services/prompts';
  import { normalizeImageDataUrl } from '$lib/utils/image';

  let showAddForm = $state(false);
  let newName = $state('');
  let newDescription = $state('');
  let newRelationship = $state('');
  let editingId = $state<string | null>(null);
  let editName = $state('');
  let editDescription = $state('');
  let editRelationship = $state('');
  let editStatus = $state<Character['status']>('active');
  let editTraits = $state('');
  let editVisualDescriptors = $state('');
  let confirmingDeleteId = $state<string | null>(null);
  let pendingProtagonistId = $state<string | null>(null);
  let previousRelationshipLabel = $state('');
  let swapError = $state<string | null>(null);
  let collapsedCharacters = $state<Set<string>>(new Set());

  // Portrait state
  let uploadingPortraitId = $state<string | null>(null);
  let generatingPortraitId = $state<string | null>(null);
  let portraitError = $state<string | null>(null);
  let editPortrait = $state<string | null>(null);
  let expandedPortrait = $state<{ src: string; name: string } | null>(null);
  const currentProtagonistName = $derived.by(() => (
    story.characters.find(c => c.relationship === 'self')?.name ?? 'current'
  ));

  async function addCharacter() {
    if (!newName.trim()) return;
    await story.addCharacter(newName.trim(), newDescription.trim() || undefined, newRelationship.trim() || undefined);
    newName = '';
    newDescription = '';
    newRelationship = '';
    showAddForm = false;
  }

  function startEdit(character: Character) {
    editingId = character.id;
    editName = character.name;
    editDescription = character.description ?? '';
    editRelationship = character.relationship ?? '';
    editStatus = character.status;
    editTraits = character.traits.join(', ');
    editVisualDescriptors = (character.visualDescriptors ?? []).join(', ');
    editPortrait = character.portrait;
    portraitError = null;
  }

  function cancelEdit() {
    editingId = null;
    editName = '';
    editDescription = '';
    editRelationship = '';
    editTraits = '';
    editVisualDescriptors = '';
    editStatus = 'active';
    editPortrait = null;
    portraitError = null;
  }

  async function saveEdit(character: Character) {
    const name = editName.trim();
    if (!name) return;

    const relationship = editRelationship.trim();
    const traits = editTraits
      .split(',')
      .map(trait => trait.trim())
      .filter(Boolean);
    const visualDescriptors = editVisualDescriptors
      .split(',')
      .map(desc => desc.trim())
      .filter(Boolean);

    await story.updateCharacter(character.id, {
      name,
      description: editDescription.trim() || null,
      relationship: character.relationship === 'self' ? 'self' : (relationship || null),
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
    previousRelationshipLabel = '';
    swapError = null;
  }

  function cancelSwap() {
    pendingProtagonistId = null;
    previousRelationshipLabel = '';
    swapError = null;
  }

  async function confirmSwap(character: Character) {
    swapError = null;
    try {
      const label = previousRelationshipLabel.trim();
      if (!label || label.toLowerCase() === 'self') {
        swapError = 'Enter a custom label for the previous protagonist.';
        return;
      }
      await story.setProtagonist(character.id, label);
      cancelSwap();
    } catch (error) {
      swapError = error instanceof Error ? error.message : 'Failed to swap protagonists.';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'active': return User;
      case 'inactive': return UserX;
      case 'deceased': return Skull;
      default: return User;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'inactive': return 'text-surface-500';
      case 'deceased': return 'text-red-400';
      default: return 'text-surface-400';
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
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file');
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be smaller than 5MB');
      }

      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string' || !result.startsWith('data:image/')) {
            reject(new Error('Failed to read image data'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      editPortrait = dataUrl;
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to upload portrait';
    } finally {
      uploadingPortraitId = null;
      // Reset input
      input.value = '';
    }
  }

  async function generatePortrait(character: Character) {
    const imageSettings = settings.systemServicesSettings.imageGeneration;

    // Validate requirements
    if (!imageSettings.nanoGptApiKey) {
      portraitError = 'NanoGPT API key required for portrait generation';
      return;
    }

    // Get visual descriptors from current edit state or character
    const descriptors = editVisualDescriptors
      .split(',')
      .map(d => d.trim())
      .filter(Boolean);

    if (descriptors.length === 0) {
      portraitError = 'Add appearance descriptors first';
      return;
    }

    generatingPortraitId = character.id;
    portraitError = null;

    try {
      // Get the style prompt
      const styleId = imageSettings.styleId;
      let stylePrompt = '';
      try {
        const promptContext = {
          mode: 'adventure' as const,
          pov: 'second' as const,
          tense: 'present' as const,
          protagonistName: '',
        };
        stylePrompt = promptService.getPrompt(styleId, promptContext) || '';
      } catch {
        // Use default style
        stylePrompt = 'Soft cel-shaded anime illustration. Muted pastel color palette with low saturation. Dreamy, airy atmosphere.';
      }

      // Build the portrait generation prompt using the template
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };

      const portraitPrompt = promptService.renderPrompt('image-portrait-generation', promptContext, {
        imageStylePrompt: stylePrompt,
        visualDescriptors: descriptors.join(', '),
        characterName: editName || character.name,
      });

      // Create the image provider
      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);

      // Generate the image
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || 'z-image-turbo',
        size: '1024x1024',
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      editPortrait = `data:image/png;base64,${response.images[0].b64_json}`;
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to generate portrait';
    } finally {
      generatingPortraitId = null;
    }
  }

  function removePortrait() {
    editPortrait = null;
    portraitError = null;
  }

  function toggleCollapse(characterId: string) {
    if (collapsedCharacters.has(characterId)) {
      collapsedCharacters.delete(characterId);
    } else {
      collapsedCharacters.add(characterId);
    }
    collapsedCharacters = new Set(collapsedCharacters);
  }

  function getSectionLineCount(character: Character): number {
    let lines = 0;
    if (character.traits.length > 0) lines++;
    if (character.visualDescriptors && character.visualDescriptors.length > 0) lines++;
    if (character.description) {
      // Estimate description lines based on length
      const words = character.description.split(/\s+/).length;
      lines += Math.ceil(words / 8); // ~8 words per line
    }
    return lines;
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="font-medium text-surface-200">Characters</h3>
    <button
      class="btn-ghost rounded p-1"
      onclick={() => showAddForm = !showAddForm}
      title="Add character"
    >
      <Plus class="h-4 w-4" />
    </button>
  </div>

  {#if showAddForm}
    <div class="card space-y-2">
      <input
        type="text"
        bind:value={newName}
        placeholder="Character name"
        class="input text-sm"
      />
      <input
        type="text"
        bind:value={newRelationship}
        placeholder="Relationship (e.g., ally, enemy)"
        class="input text-sm"
      />
      <textarea
        bind:value={newDescription}
        placeholder="Description (optional)"
        class="input text-sm"
        rows="2"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button class="btn btn-secondary text-xs" onclick={() => showAddForm = false}>
          Cancel
        </button>
        <button class="btn btn-primary text-xs" onclick={addCharacter} disabled={!newName.trim()}>
          Add
        </button>
      </div>
    </div>
  {/if}

  {#if story.characters.length === 0}
    <p class="py-4 text-center text-sm text-surface-500">
      No characters yet
    </p>
  {:else}
    <div class="space-y-2">
      {#each story.characters as character (character.id)}
        {@const StatusIcon = getStatusIcon(character.status)}
        {@const isProtagonist = character.relationship === 'self'}
        {@const isCollapsed = collapsedCharacters.has(character.id)}
        {@const sectionLineCount = getSectionLineCount(character)}
        {@const needsCollapse = sectionLineCount > 8}
        <div class="card p-3">
          <!-- Section 1: Portrait, Name, and Relationship -->
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div class="flex min-w-0 items-start gap-2 flex-1">
              {#if character.portrait}
                <button
                  class="flex-shrink-0 cursor-pointer"
                  onclick={() => expandedPortrait = { src: normalizeImageDataUrl(character.portrait) ?? '', name: character.name }}
                >
                  <img
                    src={normalizeImageDataUrl(character.portrait) ?? ''}
                    alt="{character.name} portrait"
                    class="h-10 w-10 rounded-lg object-cover ring-1 ring-surface-600 hover:ring-2 hover:ring-accent-500 transition-all"
                  />
                </button>
              {:else}
                <div class="rounded-full bg-surface-700 p-1.5 {getStatusColor(character.status)} flex-shrink-0">
                  <StatusIcon class="h-4 w-4" />
                </div>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="break-words font-medium text-surface-100">{character.name}</span>
                  {#if isProtagonist}
                    <span class="inline-flex items-center gap-1 rounded-full bg-accent-500/20 px-2 py-0.5 text-xs text-accent-300">
                      <Star class="h-3 w-3" /> Protagonist
                    </span>
                  {:else if character.relationship}
                    <span class="rounded-full bg-surface-700 px-2 py-0.5 text-xs text-surface-400">
                      {character.relationship}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Traits, Visual Descriptors, and Description -->
          <div class="mt-3 space-y-2 rounded-md bg-surface-800/40" class:max-h-32={isCollapsed && needsCollapse} class:overflow-hidden={isCollapsed && needsCollapse}>
            {#if character.traits.length > 0}
              <div class="break-words text-xs">
                <span class="font-medium text-surface-400">Traits:</span>
                <span class="text-surface-500">{character.traits.join(', ')}</span>
              </div>
            {/if}
            {#if character.visualDescriptors && character.visualDescriptors.length > 0}
              <div class="break-words text-xs">
                <span class="font-medium text-pink-400/80">Appearance:</span>
                <span class="text-pink-400/60">{character.visualDescriptors.join(', ')}</span>
              </div>
            {/if}
            {#if character.description}
              <p class="break-words text-sm text-surface-400">{character.description}</p>
            {/if}
          </div>

          <!-- Action Buttons -->
          <div class="flex items-center justify-between gap-1 self-end sm:self-auto mt-3">
            <div class="flex items-center gap-1">
              {#if confirmingDeleteId === character.id}
                <button
                  class="btn-ghost rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
                  onclick={() => deleteCharacter(character)}
                >
                  Confirm
                </button>
                <button
                  class="btn-ghost rounded px-2 py-1 text-xs"
                  onclick={() => confirmingDeleteId = null}
                >
                  Cancel
                </button>
              {:else}
                {#if !isProtagonist}
                  <button
                    class="btn-ghost rounded p-1.5 text-surface-500 hover:text-surface-200 sm:p-1"
                    onclick={() => beginSwap(character)}
                    title="Make protagonist"
                  >
                    <Star class="h-3.5 w-3.5" />
                  </button>
                {/if}
                <button
                  class="btn-ghost rounded p-1.5 text-surface-500 hover:text-surface-200 sm:p-1"
                  onclick={() => startEdit(character)}
                  title="Edit character"
                >
                  <Pencil class="h-3.5 w-3.5" />
                </button>
                <button
                  class="btn-ghost rounded p-1.5 text-surface-500 hover:text-red-400 disabled:opacity-40 sm:p-1"
                  onclick={() => confirmingDeleteId = character.id}
                  title={isProtagonist ? 'Swap protagonist before deleting' : 'Delete character'}
                  disabled={isProtagonist}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              {/if}
            </div>
            {#if needsCollapse}
              <button
                class="btn-ghost rounded p-1.5 text-surface-500 hover:text-surface-200 sm:p-1"
                onclick={() => toggleCollapse(character.id)}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {#if isCollapsed}
                  <ChevronDown class="h-3.5 w-3.5" />
                {:else}
                  <ChevronUp class="h-3.5 w-3.5" />
                {/if}
              </button>
            {/if}
          </div>

          <!-- Protagonist Swap Modal -->
          {#if pendingProtagonistId === character.id}
            <div class="mt-3 space-y-2 rounded-md border border-surface-700/60 bg-surface-800/40 p-2">
              <p class="text-xs text-surface-400">
                Label the previous protagonist ({currentProtagonistName}).
              </p>
              <input
                type="text"
                bind:value={previousRelationshipLabel}
                placeholder="e.g., former protagonist"
                class="input text-sm"
              />
              {#if swapError}
                <p class="text-xs text-red-400">{swapError}</p>
              {/if}
              <div class="flex justify-end gap-2">
                <button class="btn btn-secondary text-xs" onclick={cancelSwap}>
                  Cancel
                </button>
                <button
                  class="btn btn-primary text-xs"
                  onclick={() => confirmSwap(character)}
                  disabled={!previousRelationshipLabel.trim()}
                >
                  Swap
                </button>
              </div>
            </div>
          {/if}

          {#if editingId === character.id}
            <div class="mt-3 space-y-2">
              <input
                type="text"
                bind:value={editName}
                placeholder="Character name"
                class="input text-sm"
              />
              <input
                type="text"
                bind:value={editRelationship}
                placeholder={isProtagonist ? 'Relationship (protagonist)' : 'Relationship'}
                class="input text-sm"
                disabled={isProtagonist}
              />
              <select bind:value={editStatus} class="input text-sm">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="deceased">Deceased</option>
              </select>
              <input
                type="text"
                bind:value={editTraits}
                placeholder="Traits (comma separated)"
                class="input text-sm"
              />
              <input
                type="text"
                bind:value={editVisualDescriptors}
                placeholder="Appearance (comma separated, for images)"
                class="input text-sm"
              />
              <textarea
                bind:value={editDescription}
                placeholder="Description (optional)"
                class="input text-sm"
                rows="2"
              ></textarea>

              <!-- Portrait Section -->
              <div class="rounded-md border border-surface-700/60 bg-surface-800/40 p-3">
                <div class="mb-2 text-xs font-medium text-surface-400">Portrait</div>
                <div class="flex items-start gap-3">
                  {#if editPortrait}
                    <div class="relative">
                      <img
                        src={normalizeImageDataUrl(editPortrait) ?? ''}
                        alt="Portrait preview"
                        class="h-20 w-20 rounded-lg object-cover ring-1 ring-surface-600"
                      />
                      <button
                        class="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 sm:-right-1 sm:-top-1 sm:h-5 sm:w-5"
                        onclick={removePortrait}
                        title="Remove portrait"
                      >
                        <X class="h-4 w-4 sm:h-3 sm:w-3" />
                      </button>
                    </div>
                  {:else}
                    <div class="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-surface-600 bg-surface-800">
                      <User class="h-8 w-8 text-surface-600" />
                    </div>
                  {/if}
                  <div class="flex flex-1 flex-col gap-2">
                    <label class="btn btn-secondary text-xs min-h-[44px] sm:min-h-0 cursor-pointer">
                      {#if uploadingPortraitId === character.id}
                        <Loader2 class="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                        Uploading...
                      {:else}
                        <ImageUp class="h-4 w-4 sm:h-3 sm:w-3" />
                        Upload
                      {/if}
                      <input
                        type="file"
                        accept="image/*"
                        class="hidden"
                        onchange={handlePortraitUpload}
                        disabled={uploadingPortraitId !== null || generatingPortraitId !== null}
                      />
                    </label>
                    <button
                      class="btn btn-secondary text-xs min-h-[44px] sm:min-h-0"
                      onclick={() => generatePortrait(character)}
                      disabled={generatingPortraitId !== null || uploadingPortraitId !== null || !editVisualDescriptors.trim()}
                      title={!editVisualDescriptors.trim() ? 'Add appearance descriptors first' : 'Generate portrait from appearance'}
                    >
                      {#if generatingPortraitId === character.id}
                        <Loader2 class="h-4 w-4 sm:h-3 sm:w-3 animate-spin" />
                        Generating...
                      {:else}
                        <Wand2 class="h-4 w-4 sm:h-3 sm:w-3" />
                        Generate
                      {/if}
                    </button>
                    <p class="text-xs text-surface-500">
                      {#if editPortrait}
                        Portrait will be used as reference for image generation
                      {:else}
                        Upload or generate a portrait from appearance
                      {/if}
                    </p>
                  </div>
                </div>
                {#if portraitError}
                  <p class="mt-2 text-xs text-red-400">{portraitError}</p>
                {/if}
              </div>

              <div class="flex justify-end gap-2">
                <button class="btn btn-secondary text-xs" onclick={cancelEdit}>
                  Cancel
                </button>
                <button
                  class="btn btn-primary text-xs"
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
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
    onclick={() => expandedPortrait = null}
    onkeydown={(e) => e.key === 'Escape' && (expandedPortrait = null)}
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
        class="absolute -right-3 -top-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-white sm:-right-2 sm:-top-2 sm:min-h-0 sm:min-w-0 sm:p-1.5"
        onclick={(e) => { e.stopPropagation(); expandedPortrait = null; }}
      >
        <X class="h-5 w-5 sm:h-4 sm:w-4" />
      </button>
    </div>
  </div>
{/if}
