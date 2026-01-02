<script lang="ts">
  import type { Entry, EntryType } from '$lib/types';
  import { Users, MapPin, Package, Shield, Lightbulb, Calendar, BookOpen, ChevronRight } from 'lucide-svelte';
  import { ui } from '$lib/stores/ui.svelte';

  interface Props {
    entry: Entry;
    selected?: boolean;
    showCheckbox?: boolean;
    onSelect?: () => void;
  }

  let { entry, selected = false, showCheckbox = false, onSelect }: Props = $props();

  const typeIcons: Record<EntryType, typeof Users> = {
    character: Users,
    location: MapPin,
    item: Package,
    faction: Shield,
    concept: Lightbulb,
    event: Calendar,
  };

  const typeColors: Record<EntryType, string> = {
    character: 'text-blue-400',
    location: 'text-green-400',
    item: 'text-amber-400',
    faction: 'text-purple-400',
    concept: 'text-pink-400',
    event: 'text-cyan-400',
  };

  const injectionLabels: Record<string, string> = {
    always: 'Always',
    keyword: 'Auto',
    relevant: 'Auto', // Same as keyword - both use keywords + AI
    never: 'Manual',
  };

  const Icon = $derived(typeIcons[entry.type] || BookOpen);
  const colorClass = $derived(typeColors[entry.type] || 'text-surface-400');
  const isSelected = $derived(ui.lorebookBulkSelection.has(entry.id));
  const keywordCount = $derived(entry.injection.keywords.length);

  function handleClick() {
    if (showCheckbox) {
      ui.toggleBulkSelection(entry.id);
    } else {
      onSelect?.();
    }
  }

  function handleCheckboxClick(e: Event) {
    e.stopPropagation();
    ui.toggleBulkSelection(entry.id);
  }
</script>

<button
  class="w-full text-left p-3 rounded-lg border transition-colors min-h-[56px]
    {selected ? 'bg-accent-500/20 border-accent-500/50' : 'bg-surface-800/50 border-surface-700 hover:bg-surface-700/50'}"
  onclick={handleClick}
>
  <div class="flex items-center gap-3">
    {#if showCheckbox}
      <input
        type="checkbox"
        checked={isSelected}
        onclick={handleCheckboxClick}
        class="h-4 w-4 rounded border-surface-600 bg-surface-800 text-accent-500 focus:ring-accent-500 focus:ring-offset-0"
      />
    {/if}

    <div class="flex-shrink-0 {colorClass}">
      <Icon class="h-5 w-5" />
    </div>

    <div class="flex-1 min-w-0">
      <div class="flex items-center gap-2">
        <span class="font-medium text-surface-100 truncate">{entry.name}</span>
      </div>
      <div class="flex items-center gap-2 mt-0.5 text-xs text-surface-500">
        <span class="capitalize">{entry.type}</span>
        {#if keywordCount > 0}
          <span class="text-surface-600">|</span>
          <span>{keywordCount} keyword{keywordCount !== 1 ? 's' : ''}</span>
        {/if}
        <span class="text-surface-600">|</span>
        <span class="capitalize">{injectionLabels[entry.injection.mode]}</span>
      </div>
    </div>

    <ChevronRight class="h-4 w-4 text-surface-500 flex-shrink-0 hidden sm:block" />
  </div>
</button>
