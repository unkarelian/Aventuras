<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { Plus, User, Skull, UserX, Pencil, Trash2, Star } from 'lucide-svelte';
  import type { Character } from '$lib/types';

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
  let confirmingDeleteId = $state<string | null>(null);
  let pendingProtagonistId = $state<string | null>(null);
  let previousRelationshipLabel = $state('');
  let swapError = $state<string | null>(null);
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
  }

  function cancelEdit() {
    editingId = null;
    editName = '';
    editDescription = '';
    editRelationship = '';
    editTraits = '';
    editStatus = 'active';
  }

  async function saveEdit(character: Character) {
    const name = editName.trim();
    if (!name) return;

    const relationship = editRelationship.trim();
    const traits = editTraits
      .split(',')
      .map(trait => trait.trim())
      .filter(Boolean);

    await story.updateCharacter(character.id, {
      name,
      description: editDescription.trim() || null,
      relationship: character.relationship === 'self' ? 'self' : (relationship || null),
      status: editStatus,
      traits,
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
        <div class="card p-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 items-start gap-2">
              <div class="rounded-full bg-surface-700 p-1.5 {getStatusColor(character.status)}">
                <StatusIcon class="h-4 w-4" />
              </div>
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
                {#if character.traits.length > 0}
                  <p class="mt-1 break-words text-xs text-surface-500">
                    Traits: {character.traits.join(', ')}
                  </p>
                {/if}
                {#if character.description}
                  <p class="mt-1 break-words text-sm text-surface-400">{character.description}</p>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-1 self-end sm:self-auto">
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
          </div>

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
              <textarea
                bind:value={editDescription}
                placeholder="Description (optional)"
                class="input text-sm"
                rows="2"
              ></textarea>
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
