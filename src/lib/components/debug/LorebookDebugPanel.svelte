<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { X, BookOpen, Users, MapPin, Package, Shield, Lightbulb, Calendar } from 'lucide-svelte';

  const tierLabels = {
    1: 'Always Active',
    2: 'Keyword Matched',
    3: 'LLM Selected',
  };

  const tierDescriptions = {
    1: 'State-based or always-inject entries',
    2: 'Matched by name, alias, or keyword',
    3: 'Contextually relevant (AI selected)',
  };

  const tierColors = {
    1: 'text-green-400 bg-green-500/10 border-green-500/30',
    2: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    3: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  };

  const typeIcons = {
    character: Users,
    location: MapPin,
    item: Package,
    faction: Shield,
    concept: Lightbulb,
    event: Calendar,
  };

  function getIcon(type: string) {
    return typeIcons[type as keyof typeof typeIcons] || BookOpen;
  }
</script>

{#if ui.lorebookDebugOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onclick={() => ui.closeLorebookDebug()}
    onkeydown={(e) => e.key === 'Escape' && ui.closeLorebookDebug()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="card w-full max-w-2xl max-h-[80vh] overflow-hidden"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-surface-700 pb-4">
        <div class="flex items-center gap-2">
          <BookOpen class="h-5 w-5 text-accent-400" />
          <h2 class="text-xl font-semibold text-surface-100">Active Lorebook Entries</h2>
        </div>
        <button class="btn-ghost rounded-lg p-2" onclick={() => ui.closeLorebookDebug()}>
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="max-h-[60vh] overflow-y-auto py-4">
        {#if ui.lastLorebookRetrieval}
          {@const result = ui.lastLorebookRetrieval}
          {@const totalCount = result.tier1.length + result.tier2.length + result.tier3.length}

          <!-- Summary -->
          <div class="mb-4 p-3 rounded-lg bg-surface-800/50 border border-surface-700">
            <div class="flex items-center justify-between text-sm">
              <span class="text-surface-300">Total Active Entries:</span>
              <span class="font-medium text-surface-100">{totalCount}</span>
            </div>
            <div class="mt-2 flex gap-4 text-xs">
              <span class={tierColors[1].split(' ')[0]}>Tier 1: {result.tier1.length}</span>
              <span class={tierColors[2].split(' ')[0]}>Tier 2: {result.tier2.length}</span>
              <span class={tierColors[3].split(' ')[0]}>Tier 3: {result.tier3.length}</span>
            </div>
          </div>

          {#if totalCount === 0}
            <p class="text-center text-surface-400 py-8">
              No lorebook entries were activated for the last generation.
            </p>
          {:else}
            <!-- Tier 1: Always Active -->
            {#if result.tier1.length > 0}
              <div class="mb-4">
                <h3 class="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-green-400"></span>
                  Tier 1: {tierLabels[1]} ({result.tier1.length})
                </h3>
                <p class="text-xs text-surface-500 mb-2 ml-4">{tierDescriptions[1]}</p>
                <div class="space-y-2">
                  {#each result.tier1 as retrieved}
                    {@const Icon = getIcon(retrieved.entry.type)}
                    <div class="p-3 rounded-lg border {tierColors[1]}">
                      <div class="flex items-start gap-2">
                        <Icon class="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-surface-100">{retrieved.entry.name}</span>
                            <span class="text-xs px-1.5 py-0.5 rounded bg-surface-700 text-surface-400">
                              {retrieved.entry.type}
                            </span>
                          </div>
                          {#if retrieved.matchReason}
                            <p class="text-xs text-surface-500 mt-0.5">Reason: {retrieved.matchReason}</p>
                          {/if}
                          <p class="text-sm text-surface-300 mt-1 line-clamp-2">
                            {retrieved.entry.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Tier 2: Keyword Matched -->
            {#if result.tier2.length > 0}
              <div class="mb-4">
                <h3 class="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-amber-400"></span>
                  Tier 2: {tierLabels[2]} ({result.tier2.length})
                </h3>
                <p class="text-xs text-surface-500 mb-2 ml-4">{tierDescriptions[2]}</p>
                <div class="space-y-2">
                  {#each result.tier2 as retrieved}
                    {@const Icon = getIcon(retrieved.entry.type)}
                    <div class="p-3 rounded-lg border {tierColors[2]}">
                      <div class="flex items-start gap-2">
                        <Icon class="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-surface-100">{retrieved.entry.name}</span>
                            <span class="text-xs px-1.5 py-0.5 rounded bg-surface-700 text-surface-400">
                              {retrieved.entry.type}
                            </span>
                          </div>
                          {#if retrieved.matchReason}
                            <p class="text-xs text-surface-500 mt-0.5">Matched: {retrieved.matchReason}</p>
                          {/if}
                          <p class="text-sm text-surface-300 mt-1 line-clamp-2">
                            {retrieved.entry.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Tier 3: LLM Selected -->
            {#if result.tier3.length > 0}
              <div class="mb-4">
                <h3 class="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                  <span class="w-2 h-2 rounded-full bg-purple-400"></span>
                  Tier 3: {tierLabels[3]} ({result.tier3.length})
                </h3>
                <p class="text-xs text-surface-500 mb-2 ml-4">{tierDescriptions[3]}</p>
                <div class="space-y-2">
                  {#each result.tier3 as retrieved}
                    {@const Icon = getIcon(retrieved.entry.type)}
                    <div class="p-3 rounded-lg border {tierColors[3]}">
                      <div class="flex items-start gap-2">
                        <Icon class="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-surface-100">{retrieved.entry.name}</span>
                            <span class="text-xs px-1.5 py-0.5 rounded bg-surface-700 text-surface-400">
                              {retrieved.entry.type}
                            </span>
                          </div>
                          {#if retrieved.matchReason}
                            <p class="text-xs text-surface-500 mt-0.5">Reason: {retrieved.matchReason}</p>
                          {/if}
                          <p class="text-sm text-surface-300 mt-1 line-clamp-2">
                            {retrieved.entry.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          <!-- Context Block Preview -->
          {#if result.contextBlock}
            <div class="mt-4 border-t border-surface-700 pt-4">
              <h3 class="text-sm font-medium text-surface-300 mb-2">Injected Context Block</h3>
              <pre class="p-3 rounded-lg bg-surface-900 text-xs text-surface-400 overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap">{result.contextBlock}</pre>
            </div>
          {/if}
        {:else}
          <p class="text-center text-surface-400 py-8">
            No lorebook retrieval data available yet. Generate a response to see active entries.
          </p>
        {/if}
      </div>
    </div>
  </div>
{/if}
