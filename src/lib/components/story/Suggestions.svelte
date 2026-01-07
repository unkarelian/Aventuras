<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { Lightbulb, ArrowRight, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-svelte';
  import type { StorySuggestion } from '$lib/services/ai/suggestions';
  import { swipe } from '$lib/utils/swipe';

  interface Props {
    suggestions: StorySuggestion[];
    loading: boolean;
    onSelect: (text: string) => void;
    onRefresh: () => void;
  }

  let { suggestions, loading, onSelect, onRefresh }: Props = $props();

  // Collapsed state - always starts collapsed to avoid interrupting the flow
  let collapsed = $state(true);

  const typeColors: Record<string, string> = {
    action: 'text-blue-400',
    dialogue: 'text-green-400',
    revelation: 'text-yellow-400',
    twist: 'text-purple-400',
  };

  const typeLabels: Record<string, string> = {
    action: 'Action',
    dialogue: 'Dialogue',
    revelation: 'Revelation',
    twist: 'Twist',
  };

  // Swipe handlers for mobile
  function handleSwipeDown() {
    if (!collapsed) {
      collapsed = true;
    }
  }

  function handleSwipeUp() {
    if (collapsed) {
      collapsed = false;
    }
  }
</script>

{#if story.storyMode === 'creative-writing'}
  <div
    class="border-t border-surface-700 pt-3"
    use:swipe={{ onSwipeDown: handleSwipeDown, onSwipeUp: handleSwipeUp, threshold: 40 }}
  >
    <!-- Header - always visible, clickable to expand/collapse. Swipe down to collapse, swipe up to expand -->
    <button
      class="w-full flex items-center justify-between py-1 text-left group"
      onclick={() => collapsed = !collapsed}
    >
      <div class="flex items-center gap-2 text-surface-300">
        <Lightbulb class="h-4 w-4" />
        <span class="text-sm font-medium">What happens next?</span>
        {#if collapsed && suggestions.length > 0}
          <span class="text-xs text-surface-500">({suggestions.length} suggestions)</span>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if !collapsed}
          <button
            class="btn-ghost p-1.5 rounded text-surface-400 hover:text-surface-200"
            onclick={(e) => { e.stopPropagation(); onRefresh(); }}
            disabled={loading}
            title="Generate new suggestions"
          >
            <RefreshCw class="h-4 w-4 {loading ? 'animate-spin' : ''}" />
          </button>
        {/if}
        <span class="text-surface-500 group-hover:text-surface-300 transition-colors">
          {#if collapsed}
            <ChevronDown class="h-4 w-4" />
          {:else}
            <ChevronUp class="h-4 w-4" />
          {/if}
        </span>
      </div>
    </button>

    <!-- Content - collapsible -->
    {#if !collapsed}
      <div class="mt-2">
        {#if loading}
          <div class="flex items-center justify-center py-4 text-surface-400">
            <Loader2 class="h-5 w-5 animate-spin mr-2" />
            <span class="text-sm">Generating suggestions...</span>
          </div>
        {:else if suggestions.length === 0}
          <div class="text-center py-3 text-surface-500 text-sm">
            No suggestions available. Click refresh to generate some.
          </div>
        {:else}
          <div class="space-y-2">
            {#each suggestions as suggestion}
              <button
                class="w-full text-left card p-3 hover:bg-surface-700/50 transition-colors group"
                onclick={() => { onSelect(suggestion.text); collapsed = true; }}
              >
                <div class="flex items-start gap-3">
                  <ArrowRight class="h-4 w-4 mt-0.5 text-surface-500 group-hover:text-primary-400 transition-colors shrink-0" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-surface-200 group-hover:text-surface-100">
                      {suggestion.text}
                    </p>
                    <span class="text-xs {typeColors[suggestion.type]} mt-1 inline-block">
                      {typeLabels[suggestion.type]}
                    </span>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
