<script lang="ts">
  import type { ProviderInfo } from '$lib/services/ai/types';

  interface Props {
    providers: ProviderInfo[];
    selected: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
    label?: string;
  }

  let {
    providers,
    selected,
    onChange,
    disabled = false,
    label = 'Provider Only',
  }: Props = $props();

  let isOpen = $state(false);
  let filter = $state('');

  let filteredProviders = $derived.by(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return providers;
    return providers.filter((provider) => {
      return provider.name.toLowerCase().includes(query)
        || provider.slug.toLowerCase().includes(query);
    });
  });

  function toggleProvider(slug: string, checked: boolean) {
    const set = new Set(selected);
    if (checked) {
      set.add(slug);
    } else {
      set.delete(slug);
    }
    onChange([...set]);
  }

  function clearSelection() {
    onChange([]);
  }
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between">
    <label class="text-xs font-medium text-surface-400">{label}</label>
    <div class="flex items-center gap-2">
      <span class="text-xs text-surface-500">{selected.length} selected</span>
      <button
        class="text-xs text-surface-400 hover:text-surface-200"
        onclick={clearSelection}
        disabled={disabled || selected.length === 0}
        aria-label="Clear provider selection"
      >
        Clear
      </button>
      <button
        class="text-xs text-accent-400 hover:text-accent-300"
        onclick={() => isOpen = !isOpen}
        disabled={disabled}
        aria-expanded={isOpen}
      >
        {isOpen ? 'Hide' : 'Select'}
      </button>
    </div>
  </div>

  {#if isOpen}
    <input
      type="text"
      class="input text-xs"
      placeholder="Filter providers..."
      bind:value={filter}
      disabled={disabled}
    />
    <div class="max-h-40 overflow-y-auto rounded border border-surface-700 bg-surface-900 p-2">
      {#if filteredProviders.length === 0}
        <p class="text-xs text-surface-500">No matching providers.</p>
      {:else}
        {#each filteredProviders as provider}
          <label class="flex items-center gap-2 text-xs text-surface-300 py-1">
            <input
              type="checkbox"
              checked={selected.includes(provider.slug)}
              onchange={(e) => toggleProvider(provider.slug, e.currentTarget.checked)}
              disabled={disabled}
              class="h-4 w-4 rounded border-surface-600 bg-surface-700"
            />
            <span class="text-surface-200">{provider.name}</span>
            <span class="text-surface-500">({provider.slug})</span>
          </label>
        {/each}
      {/if}
    </div>
  {/if}
</div>
