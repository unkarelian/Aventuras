<script lang="ts">
  import type { Entry, EntryType } from '$lib/types';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { Users, MapPin, Package, Shield, Lightbulb, Calendar, BookOpen, Pencil, Trash2, ArrowLeft } from 'lucide-svelte';
  import LorebookEntryForm from './LorebookEntryForm.svelte';

  interface Props {
    entry: Entry;
    isMobile?: boolean;
  }

  let { entry, isMobile = false }: Props = $props();

  let deleting = $state(false);

  const typeIcons: Record<EntryType, typeof Users> = {
    character: Users,
    location: MapPin,
    item: Package,
    faction: Shield,
    concept: Lightbulb,
    event: Calendar,
  };

  const typeColors: Record<EntryType, string> = {
    character: 'text-blue-400 bg-blue-500/20',
    location: 'text-green-400 bg-green-500/20',
    item: 'text-amber-400 bg-amber-500/20',
    faction: 'text-purple-400 bg-purple-500/20',
    concept: 'text-pink-400 bg-pink-500/20',
    event: 'text-cyan-400 bg-cyan-500/20',
  };

  const injectionLabels: Record<string, string> = {
    always: 'Always Active',
    keyword: 'Automatic (keywords + AI)',
    relevant: 'Automatic (keywords + AI)', // Same behavior as keyword
    never: 'Manual Only',
  };

  const Icon = $derived(typeIcons[entry.type] || BookOpen);
  const colorClass = $derived(typeColors[entry.type] || 'text-surface-400 bg-surface-700');

  async function handleSave(updatedEntry: Entry) {
    if (entry.id) {
      // Update existing
      const { id, storyId, createdAt, ...updates } = updatedEntry;
      await story.updateLorebookEntry(entry.id, updates);
    }
    ui.setLorebookEditMode(false);
  }

  async function handleDelete() {
    const confirmed = confirm(`Delete "${entry.name}"? This cannot be undone.`);
    if (!confirmed) return;

    deleting = true;
    try {
      await story.deleteLorebookEntry(entry.id);
      if (isMobile) {
        ui.hideLorebookDetail();
      } else {
        ui.selectLorebookEntry(null);
      }
    } finally {
      deleting = false;
    }
  }

  function handleBack() {
    if (ui.lorebookEditMode) {
      ui.setLorebookEditMode(false);
    } else {
      ui.hideLorebookDetail();
    }
  }
</script>

<div class="flex flex-col h-full">
  <!-- Header -->
  <div class="flex items-center justify-between gap-3 p-4 border-b border-surface-700">
    <div class="flex items-center gap-3 min-w-0">
      {#if isMobile}
        <button
          class="btn-ghost p-2 rounded-lg -ml-2"
          onclick={handleBack}
        >
          <ArrowLeft class="h-5 w-5" />
        </button>
      {/if}

      <div class="p-2 rounded-lg {colorClass}">
        <Icon class="h-5 w-5" />
      </div>

      <div class="min-w-0">
        <h2 class="font-semibold text-surface-100 truncate">
          {ui.lorebookEditMode ? 'Edit Entry' : entry.name}
        </h2>
        {#if !ui.lorebookEditMode}
          <span class="text-xs text-surface-500 capitalize">{entry.type}</span>
        {/if}
      </div>
    </div>

    {#if !ui.lorebookEditMode}
      <div class="flex items-center gap-2">
        <button
          class="btn-ghost p-2 rounded-lg"
          onclick={() => ui.setLorebookEditMode(true)}
          title="Edit"
        >
          <Pencil class="h-4 w-4" />
        </button>
        <button
          class="btn-ghost p-2 rounded-lg text-red-400 hover:text-red-300"
          onclick={handleDelete}
          disabled={deleting}
          title="Delete"
        >
          <Trash2 class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if ui.lorebookEditMode}
      <LorebookEntryForm
        {entry}
        onSave={handleSave}
        onCancel={() => ui.setLorebookEditMode(false)}
      />
    {:else}
      <div class="space-y-6">
        <!-- Description -->
        <div>
          <h3 class="text-sm font-medium text-surface-400 mb-2">Description</h3>
          {#if entry.description}
            <p class="text-surface-200 whitespace-pre-wrap">{entry.description}</p>
          {:else}
            <p class="text-surface-500 italic">No description</p>
          {/if}
        </div>

        <!-- Aliases -->
        {#if entry.aliases.length > 0}
          <div>
            <h3 class="text-sm font-medium text-surface-400 mb-2">Aliases</h3>
            <div class="flex flex-wrap gap-2">
              {#each entry.aliases as alias}
                <span class="px-2 py-1 rounded-full bg-surface-700 text-sm text-surface-300">
                  {alias}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Keywords -->
        {#if entry.injection.keywords.length > 0}
          <div>
            <h3 class="text-sm font-medium text-surface-400 mb-2">Keywords</h3>
            <div class="flex flex-wrap gap-2">
              {#each entry.injection.keywords as keyword}
                <span class="px-2 py-1 rounded-full bg-accent-500/20 text-sm text-accent-300">
                  {keyword}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Context Inclusion -->
        <div>
          <h3 class="text-sm font-medium text-surface-400 mb-2">Context Inclusion</h3>
          <div class="flex items-center gap-4 text-sm">
            <div>
              <span class="text-surface-500">Mode:</span>
              <span class="text-surface-300 ml-1">{injectionLabels[entry.injection.mode]}</span>
            </div>
            <div>
              <span class="text-surface-500">Priority:</span>
              <span class="text-surface-300 ml-1">{entry.injection.priority}</span>
            </div>
          </div>
        </div>

        <!-- Hidden Info -->
        {#if entry.hiddenInfo}
          <div>
            <h3 class="text-sm font-medium text-surface-400 mb-2">Hidden Info</h3>
            <div class="p-3 rounded-lg bg-surface-800/50 border border-surface-700">
              <p class="text-surface-300 text-sm whitespace-pre-wrap">{entry.hiddenInfo}</p>
            </div>
          </div>
        {/if}

        <!-- Metadata -->
        <div>
          <h3 class="text-sm font-medium text-surface-400 mb-2">Metadata</h3>
          <div class="text-sm text-surface-500 space-y-1">
            <div>Created: {new Date(entry.createdAt).toLocaleDateString()}</div>
            <div>Updated: {new Date(entry.updatedAt).toLocaleDateString()}</div>
            <div>Source: <span class="capitalize">{entry.createdBy}</span></div>
            {#if entry.mentionCount > 0}
              <div>Mentions: {entry.mentionCount}</div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
