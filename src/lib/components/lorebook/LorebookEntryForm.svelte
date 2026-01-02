<script lang="ts">
  import type { Entry, EntryType, EntryInjectionMode, EntryState, AdventureEntryState, CreativeEntryState } from '$lib/types';
  import { story } from '$lib/stores/story.svelte';
  import { ChevronDown, ChevronUp, Plus, X } from 'lucide-svelte';

  interface Props {
    entry?: Entry | null;
    onSave: (entry: Entry) => void;
    onCancel: () => void;
  }

  let { entry = null, onSave, onCancel }: Props = $props();

  // Form state
  let name = $state(entry?.name ?? '');
  let type = $state<EntryType>(entry?.type ?? 'character');
  let description = $state(entry?.description ?? '');
  let hiddenInfo = $state(entry?.hiddenInfo ?? '');
  let aliases = $state<string[]>(entry?.aliases ?? []);
  let keywords = $state<string[]>(entry?.injection.keywords ?? []);
  let injectionMode = $state<EntryInjectionMode>(entry?.injection.mode ?? 'keyword');
  let priority = $state(entry?.injection.priority ?? 50);
  let showHiddenInfo = $state(!!entry?.hiddenInfo);

  // Tag input states
  let newAlias = $state('');
  let newKeyword = $state('');

  let saving = $state(false);
  let error = $state<string | null>(null);

  const entryTypes: Array<{ value: EntryType; label: string }> = [
    { value: 'character', label: 'Character' },
    { value: 'location', label: 'Location' },
    { value: 'item', label: 'Item' },
    { value: 'faction', label: 'Faction' },
    { value: 'concept', label: 'Concept' },
    { value: 'event', label: 'Event' },
  ];

  const injectionModes: Array<{ value: EntryInjectionMode; label: string; description: string }> = [
    { value: 'always', label: 'Always Active', description: 'Always included in every response' },
    { value: 'keyword', label: 'Automatic', description: 'Matched by keywords or AI relevance' },
    { value: 'never', label: 'Manual Only', description: 'Never included automatically' },
  ];

  function getDefaultState(entryType: EntryType): EntryState {
    switch (entryType) {
      case 'character':
        return {
          type: 'character',
          isPresent: false,
          lastSeenLocation: null,
          currentDisposition: null,
          relationship: { level: 0, status: 'unknown', history: [] },
          knownFacts: [],
          revealedSecrets: [],
        };
      case 'location':
        return {
          type: 'location',
          isCurrentLocation: false,
          visitCount: 0,
          changes: [],
          presentCharacters: [],
          presentItems: [],
        };
      case 'item':
        return {
          type: 'item',
          inInventory: false,
          currentLocation: null,
          condition: null,
          uses: [],
        };
      case 'faction':
        return {
          type: 'faction',
          playerStanding: 0,
          status: 'unknown',
          knownMembers: [],
        };
      case 'concept':
        return {
          type: 'concept',
          revealed: false,
          comprehensionLevel: 'unknown',
          relatedEntries: [],
        };
      case 'event':
        return {
          type: 'event',
          occurred: false,
          occurredAt: null,
          witnesses: [],
          consequences: [],
        };
    }
  }

  function getDefaultAdventureState(): AdventureEntryState {
    return { discovered: false, interactedWith: false, notes: [] };
  }

  function getDefaultCreativeState(): CreativeEntryState {
    return { arc: null, thematicRole: null, symbolism: null };
  }

  function addAlias() {
    const trimmed = newAlias.trim();
    if (trimmed && !aliases.includes(trimmed)) {
      aliases = [...aliases, trimmed];
    }
    newAlias = '';
  }

  function removeAlias(alias: string) {
    aliases = aliases.filter(a => a !== alias);
  }

  function addKeyword() {
    const trimmed = newKeyword.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      keywords = [...keywords, trimmed];
    }
    newKeyword = '';
  }

  function removeKeyword(keyword: string) {
    keywords = keywords.filter(k => k !== keyword);
  }

  function handleAliasKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAlias();
    }
  }

  function handleKeywordKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword();
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      error = 'Name is required';
      return;
    }

    saving = true;
    error = null;

    try {
      const now = Date.now();
      const entryData: Entry = {
        id: entry?.id ?? crypto.randomUUID(),
        storyId: story.currentStory?.id ?? '',
        name: name.trim(),
        type,
        description: description.trim(),
        hiddenInfo: hiddenInfo.trim() || null,
        aliases,
        state: entry?.state?.type === type ? entry.state : getDefaultState(type),
        adventureState: entry?.adventureState ?? getDefaultAdventureState(),
        creativeState: entry?.creativeState ?? getDefaultCreativeState(),
        injection: {
          mode: injectionMode,
          keywords,
          priority,
        },
        firstMentioned: entry?.firstMentioned ?? null,
        lastMentioned: entry?.lastMentioned ?? null,
        mentionCount: entry?.mentionCount ?? 0,
        createdBy: entry?.createdBy ?? 'user',
        createdAt: entry?.createdAt ?? now,
        updatedAt: now,
      };

      onSave(entryData);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save entry';
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-4">
  {#if error}
    <div class="p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  <!-- Name -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">
      Name <span class="text-red-400">*</span>
    </label>
    <input
      type="text"
      bind:value={name}
      placeholder="Entry name"
      class="input w-full"
    />
  </div>

  <!-- Type -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">Type</label>
    <select bind:value={type} class="input w-full">
      {#each entryTypes as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </div>

  <!-- Description -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">Description</label>
    <textarea
      bind:value={description}
      placeholder="Describe this entry..."
      rows={4}
      class="input w-full resize-none"
    ></textarea>
  </div>

  <!-- Aliases -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">
      Aliases
      <span class="text-xs text-surface-500 font-normal ml-1">
        Alternative names for matching
      </span>
    </label>
    <div class="flex flex-wrap gap-2 mb-2">
      {#each aliases as alias}
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-700 text-sm">
          {alias}
          <button
            class="text-surface-400 hover:text-surface-200"
            onclick={() => removeAlias(alias)}
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/each}
    </div>
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={newAlias}
        placeholder="Add alias..."
        class="input flex-1"
        onkeydown={handleAliasKeydown}
      />
      <button
        class="btn-ghost p-2 border border-surface-600 rounded-lg"
        onclick={addAlias}
        disabled={!newAlias.trim()}
      >
        <Plus class="h-4 w-4" />
      </button>
    </div>
  </div>

  <!-- Keywords -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">
      Keywords
      <span class="text-xs text-surface-500 font-normal ml-1">
        Trigger words for injection
      </span>
    </label>
    <div class="flex flex-wrap gap-2 mb-2">
      {#each keywords as keyword}
        <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent-500/20 text-accent-300 text-sm">
          {keyword}
          <button
            class="text-accent-400 hover:text-accent-200"
            onclick={() => removeKeyword(keyword)}
          >
            <X class="h-3 w-3" />
          </button>
        </span>
      {/each}
    </div>
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={newKeyword}
        placeholder="Add keyword..."
        class="input flex-1"
        onkeydown={handleKeywordKeydown}
      />
      <button
        class="btn-ghost p-2 border border-surface-600 rounded-lg"
        onclick={addKeyword}
        disabled={!newKeyword.trim()}
      >
        <Plus class="h-4 w-4" />
      </button>
    </div>
  </div>

  <!-- Context Inclusion Mode -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">Context Inclusion</label>
    <div class="grid grid-cols-3 gap-2">
      {#each injectionModes as mode}
        <button
          class="p-2 rounded-lg border text-left transition-colors
            {injectionMode === mode.value
              ? 'border-accent-500 bg-accent-500/20'
              : 'border-surface-600 bg-surface-800 hover:bg-surface-700'}"
          onclick={() => injectionMode = mode.value}
        >
          <div class="font-medium text-sm">{mode.label}</div>
          <div class="text-xs text-surface-500">{mode.description}</div>
        </button>
      {/each}
    </div>
    {#if injectionMode === 'keyword' || injectionMode === 'relevant'}
      <p class="text-xs text-surface-500 mt-2">
        Entry will be included when keywords/aliases match the story, or when the AI determines it's contextually relevant.
      </p>
    {/if}
  </div>

  <!-- Priority -->
  <div>
    <label class="block text-sm font-medium text-surface-300 mb-1">
      Priority
      <span class="text-xs text-surface-500 font-normal ml-1">
        Higher priority entries are injected first
      </span>
    </label>
    <div class="flex items-center gap-3">
      <input
        type="range"
        bind:value={priority}
        min={0}
        max={100}
        class="flex-1"
      />
      <span class="text-sm text-surface-300 w-8 text-right">{priority}</span>
    </div>
  </div>

  <!-- Hidden Info (collapsible) -->
  <div>
    <button
      class="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-300"
      onclick={() => showHiddenInfo = !showHiddenInfo}
    >
      {#if showHiddenInfo}
        <ChevronUp class="h-4 w-4" />
      {:else}
        <ChevronDown class="h-4 w-4" />
      {/if}
      Hidden Info
      <span class="text-xs text-surface-500">(secrets the protagonist doesn't know)</span>
    </button>
    {#if showHiddenInfo}
      <textarea
        bind:value={hiddenInfo}
        placeholder="Hidden information, revealed secrets, etc..."
        rows={3}
        class="input w-full resize-none mt-2"
      ></textarea>
    {/if}
  </div>

  <!-- Actions -->
  <div class="flex gap-2 pt-4 border-t border-surface-700">
    <button
      class="btn-ghost flex-1 py-2 border border-surface-600 rounded-lg"
      onclick={onCancel}
      disabled={saving}
    >
      Cancel
    </button>
    <button
      class="btn-primary flex-1 py-2"
      onclick={handleSave}
      disabled={saving || !name.trim()}
    >
      {saving ? 'Saving...' : (entry ? 'Save Changes' : 'Create Entry')}
    </button>
  </div>
</div>
