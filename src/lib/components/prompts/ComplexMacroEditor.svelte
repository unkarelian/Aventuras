<script lang="ts">
  import { X, RotateCcw, Settings2, Check } from 'lucide-svelte'
  import type { ComplexMacro, MacroVariant, MacroOverride, VariantKey } from '$lib/services/prompts'

  interface Props {
    isOpen: boolean
    macro: ComplexMacro
    /** Current override (if any) */
    currentOverride?: MacroOverride | null
    /** Current story context for highlighting active variant */
    currentContext?: {
      mode?: 'adventure' | 'creative-writing'
      pov?: 'first' | 'second' | 'third'
      tense?: 'past' | 'present'
    }
    onClose: () => void
    onSave: (variantOverrides: MacroVariant[]) => void
    onReset: () => void
  }

  let {
    isOpen,
    macro,
    currentOverride = null,
    currentContext,
    onClose,
    onSave,
    onReset,
  }: Props = $props()

  // Tab state
  let selectedMode = $state<'adventure' | 'creative-writing'>('adventure')
  let selectedPov = $state<'first' | 'second' | 'third'>('second')
  let selectedTense = $state<'past' | 'present'>('present')

  // Edited variants (local copy)
  let editedVariants = $state<MacroVariant[]>([])
  // Initial state to compare against for detecting changes
  let initialVariants = $state<MacroVariant[]>([])

  // Get the current variant key based on selections
  let currentKey = $derived<VariantKey>({
    mode: macro.variesBy.mode ? selectedMode : undefined,
    pov: macro.variesBy.pov ? selectedPov : undefined,
    tense: macro.variesBy.tense ? selectedTense : undefined,
  })

  // Find the current variant content
  let currentVariantContent = $derived.by(() => {
    // Check edited variants first
    const edited = findVariant(editedVariants, currentKey)
    if (edited) return edited.content

    // Check override variants
    if (currentOverride?.variantOverrides) {
      const override = findVariant(currentOverride.variantOverrides, currentKey)
      if (override) return override.content
    }

    // Fall back to builtin
    const builtin = findVariant(macro.variants, currentKey)
    return builtin?.content ?? ''
  })

  // Get the default content for this variant
  let defaultVariantContent = $derived.by(() => {
    const builtin = findVariant(macro.variants, currentKey)
    return builtin?.content ?? ''
  })

  // Check if current variant is modified
  let isCurrentModified = $derived.by(() => {
    const edited = findVariant(editedVariants, currentKey)
    return edited !== undefined
  })

  // Check if there are any changes compared to initial state
  let hasChanges = $derived.by(() => {
    // Different number of edits means changes
    if (editedVariants.length !== initialVariants.length) return true

    // Check if all edits match the initial state
    for (const edited of editedVariants) {
      const initial = findVariant(initialVariants, edited.key)
      if (!initial || initial.content !== edited.content) return true
    }
    return false
  })

  // Deep clone helper for variant arrays
  function deepCloneVariants(variants: MacroVariant[]): MacroVariant[] {
    return variants.map((v) => ({ ...v, key: { ...v.key } }))
  }

  // Initialize when modal opens
  $effect(() => {
    if (isOpen) {
      // Start with override variants if they exist (deep clone to avoid mutating original)
      const sourceVariants = currentOverride?.variantOverrides ?? []
      editedVariants = deepCloneVariants(sourceVariants)
      // Store initial state for change detection (separate deep copy)
      initialVariants = deepCloneVariants(sourceVariants)

      // Set initial tab selection based on current context
      if (currentContext) {
        if (currentContext.mode && macro.variesBy.mode) {
          selectedMode = currentContext.mode
        }
        if (currentContext.pov && macro.variesBy.pov) {
          selectedPov = currentContext.pov
        }
        if (currentContext.tense && macro.variesBy.tense) {
          selectedTense = currentContext.tense
        }
      }
    }
  })

  function findVariant(variants: MacroVariant[], key: VariantKey): MacroVariant | undefined {
    return variants.find((v) => variantKeyMatches(v.key, key))
  }

  function variantKeyMatches(a: VariantKey, b: VariantKey): boolean {
    return a.mode === b.mode && a.pov === b.pov && a.tense === b.tense
  }

  function updateCurrentVariant(content: string) {
    const existingIndex = editedVariants.findIndex((v) => variantKeyMatches(v.key, currentKey))

    if (content === defaultVariantContent) {
      // If content matches default, remove the override
      if (existingIndex >= 0) {
        editedVariants = editedVariants.filter((_, i) => i !== existingIndex)
      }
    } else {
      // Add or update the override
      if (existingIndex >= 0) {
        editedVariants[existingIndex] = { key: { ...currentKey }, content }
      } else {
        editedVariants = [...editedVariants, { key: { ...currentKey }, content }]
      }
    }
    // hasChanges is now computed automatically via $derived
  }

  function resetCurrentVariant() {
    const existingIndex = editedVariants.findIndex((v) => variantKeyMatches(v.key, currentKey))
    if (existingIndex >= 0) {
      editedVariants = editedVariants.filter((_, i) => i !== existingIndex)
    }
    // hasChanges is now computed automatically via $derived
  }

  function handleSave() {
    onSave(editedVariants)
    onClose()
  }

  function handleResetAll() {
    editedVariants = []
    // hasChanges is now computed automatically via $derived
    onReset()
    onClose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  // Check if a specific variant is the current story's active one
  function isActiveVariant(mode?: string, pov?: string, tense?: string): boolean {
    if (!currentContext) return false
    const modeMatch = !macro.variesBy.mode || mode === currentContext.mode
    const povMatch = !macro.variesBy.pov || pov === currentContext.pov
    const tenseMatch = !macro.variesBy.tense || tense === currentContext.tense
    return modeMatch && povMatch && tenseMatch
  }

  // Mode labels
  const modeLabels = {
    adventure: 'Adventure',
    'creative-writing': 'Creative Writing',
  }

  // POV labels
  const povLabels = {
    first: '1st Person',
    second: '2nd Person',
    third: '3rd Person',
  }

  // Tense labels
  const tenseLabels = {
    past: 'Past',
    present: 'Present',
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="complex-macro-editor-title"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/60 backdrop-blur-sm"
      onclick={onClose}
      role="presentation"
    ></div>

    <!-- Modal -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="border-surface-700 bg-surface-900 relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div
        class="border-surface-700 flex flex-shrink-0 items-center justify-between border-b px-4 py-3"
      >
        <div class="flex items-center gap-2">
          <Settings2 class="text-surface-400 h-5 w-5" />
          <div>
            <h2 id="complex-macro-editor-title" class="text-surface-100 text-lg font-semibold">
              {macro.name}
            </h2>
            <p class="text-surface-500 text-xs">{macro.description}</p>
          </div>
        </div>
        <button
          class="text-surface-400 hover:bg-surface-800 hover:text-surface-200 rounded-lg p-1.5"
          onclick={onClose}
          title="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="border-surface-700 flex-shrink-0 border-b px-4 py-2">
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
          <!-- Mode tabs -->
          {#if macro.variesBy.mode}
            <div class="flex flex-wrap items-center gap-1">
              <span class="text-surface-500 mr-1 w-12 text-xs sm:w-auto">Mode:</span>
              {#each Object.entries(modeLabels) as [mode, label], i (i)}
                <button
                  class="tab-btn {selectedMode === mode ? 'tab-btn-active' : ''} {isActiveVariant(
                    mode,
                    selectedPov,
                    selectedTense,
                  )
                    ? 'tab-btn-current'
                    : ''}"
                  onclick={() => (selectedMode = mode as 'adventure' | 'creative-writing')}
                >
                  {label}
                  {#if isActiveVariant(mode, selectedPov, selectedTense)}
                    <Check class="ml-1 h-3 w-3" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          <!-- POV tabs -->
          {#if macro.variesBy.pov}
            <div class="flex flex-wrap items-center gap-1">
              <span class="text-surface-500 mr-1 w-12 text-xs sm:w-auto">POV:</span>
              {#each Object.entries(povLabels) as [pov, label], i (i)}
                <button
                  class="tab-btn {selectedPov === pov ? 'tab-btn-active' : ''} {isActiveVariant(
                    selectedMode,
                    pov,
                    selectedTense,
                  )
                    ? 'tab-btn-current'
                    : ''}"
                  onclick={() => (selectedPov = pov as 'first' | 'second' | 'third')}
                >
                  {label}
                  {#if isActiveVariant(selectedMode, pov, selectedTense)}
                    <Check class="ml-1 h-3 w-3" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}

          <!-- Tense tabs -->
          {#if macro.variesBy.tense}
            <div class="flex flex-wrap items-center gap-1">
              <span class="text-surface-500 mr-1 w-12 text-xs sm:w-auto">Tense:</span>
              {#each Object.entries(tenseLabels) as [tense, label], i (i)}
                <button
                  class="tab-btn {selectedTense === tense ? 'tab-btn-active' : ''} {isActiveVariant(
                    selectedMode,
                    selectedPov,
                    tense,
                  )
                    ? 'tab-btn-current'
                    : ''}"
                  onclick={() => (selectedTense = tense as 'past' | 'present')}
                >
                  {label}
                  {#if isActiveVariant(selectedMode, selectedPov, tense)}
                    <Check class="ml-1 h-3 w-3" />
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 space-y-3 overflow-y-auto p-4">
        <!-- Current selection indicator -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-surface-400 text-sm">Editing variant:</span>
            <code class="bg-surface-800 text-surface-300 rounded px-2 py-0.5 text-xs">
              {macro.variesBy.mode ? modeLabels[selectedMode] : ''}
              {macro.variesBy.mode && macro.variesBy.pov ? ' / ' : ''}
              {macro.variesBy.pov ? povLabels[selectedPov] : ''}
              {(macro.variesBy.mode || macro.variesBy.pov) && macro.variesBy.tense ? ' / ' : ''}
              {macro.variesBy.tense ? tenseLabels[selectedTense] : ''}
            </code>
            {#if isCurrentModified}
              <span
                class="rounded border border-amber-700/30 bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-400"
              >
                Modified
              </span>
            {/if}
          </div>
          {#if isCurrentModified}
            <button
              class="text-surface-400 hover:text-surface-200 flex items-center gap-1 text-xs"
              onclick={resetCurrentVariant}
            >
              <RotateCcw class="h-3 w-3" />
              Reset this variant
            </button>
          {/if}
        </div>

        <!-- Variant content editor -->
        <textarea
          value={currentVariantContent}
          oninput={(e) => updateCurrentVariant(e.currentTarget.value)}
          class="input min-h-[200px] resize-y font-mono text-sm"
          placeholder="Enter variant content..."
        ></textarea>

        <!-- Default value reference -->
        <details class="text-xs">
          <summary class="text-surface-500 hover:text-surface-300 cursor-pointer">
            View default content
          </summary>
          <pre
            class="bg-surface-800/50 text-surface-400 mt-2 max-h-32 overflow-x-auto overflow-y-auto rounded p-2 whitespace-pre-wrap">{defaultVariantContent}</pre>
        </details>
      </div>

      <!-- Footer -->
      <div
        class="border-surface-700 flex flex-shrink-0 flex-col items-stretch justify-between gap-2 border-t px-4 py-3 sm:flex-row sm:items-center"
      >
        <button
          class="btn btn-ghost text-surface-400 order-2 flex items-center justify-center gap-1.5 text-sm hover:text-red-400 sm:order-1"
          onclick={handleResetAll}
          title="Reset all variants to defaults"
        >
          <RotateCcw class="h-4 w-4" />
          <span class="xs:inline hidden">Reset All to Defaults</span>
          <span class="xs:hidden">Reset All</span>
        </button>
        <div class="order-1 flex items-center gap-2 sm:order-2">
          <button class="btn btn-secondary flex-1 text-sm sm:flex-none" onclick={onClose}>
            Cancel
          </button>
          <button
            class="btn btn-primary flex-1 text-sm sm:flex-none"
            onclick={handleSave}
            disabled={!hasChanges}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .tab-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 0.375rem;
    color: var(--text-secondary);
    background-color: transparent;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
  }

  .tab-btn:hover {
    background-color: var(--bg-tertiary);
  }

  .tab-btn-active {
    background-color: var(--bg-tertiary);
    border-color: var(--border-primary);
    color: var(--text-primary);
  }

  .tab-btn-current {
    border-color: var(--color-accent-600);
    color: var(--color-accent-400);
  }

  .tab-btn-active.tab-btn-current {
    background-color: var(--color-accent-900);
  }
</style>
