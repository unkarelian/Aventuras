<script lang="ts">
  import { X, RotateCcw, Variable } from 'lucide-svelte'
  import type { SimpleMacro, MacroOverride } from '$lib/services/prompts'

  interface Props {
    isOpen: boolean
    macro: SimpleMacro
    /** Current override value (if any) */
    currentOverride?: MacroOverride | null
    onClose: () => void
    onSave: (value: string) => void
    onReset: () => void
  }

  let { isOpen, macro, currentOverride = null, onClose, onSave, onReset }: Props = $props()

  // Form state
  let value = $state('')
  let hasChanges = $derived(value !== (currentOverride?.value ?? macro.defaultValue))

  // Initialize form when modal opens
  $effect(() => {
    if (isOpen) {
      value = currentOverride?.value ?? macro.defaultValue
    }
  })

  function handleSave() {
    onSave(value)
    onClose()
  }

  function handleReset() {
    value = macro.defaultValue
    onReset()
    onClose()
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="macro-editor-title"
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
      class="border-surface-700 bg-surface-900 relative z-10 w-full max-w-md rounded-xl border shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="border-surface-700 flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-2">
          <Variable class="text-accent-400 h-5 w-5" />
          <h2 id="macro-editor-title" class="text-surface-100 text-lg font-semibold">Edit Macro</h2>
        </div>
        <button
          class="text-surface-400 hover:bg-surface-800 hover:text-surface-200 rounded-lg p-1.5"
          onclick={onClose}
          title="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="space-y-4 p-4">
        <!-- Macro info -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-surface-200 text-sm font-medium">{macro.name}</span>
            <code class="bg-surface-800 text-surface-400 rounded px-1.5 py-0.5 text-xs">
              {`{{${macro.token}}}`}
            </code>
          </div>
          <p class="text-surface-400 text-sm">{macro.description}</p>
        </div>

        <!-- Dynamic macro notice -->
        {#if macro.dynamic}
          <div class="rounded-lg border border-amber-700/30 bg-amber-900/20 px-3 py-2">
            <p class="text-xs text-amber-400">
              This macro is dynamically resolved from story data. The value below is used as a
              fallback when no story data is available.
            </p>
          </div>
        {/if}

        <!-- Value input -->
        <div class="space-y-1.5">
          <label for="macro-value" class="text-surface-300 text-sm font-medium"> Value </label>
          <textarea
            id="macro-value"
            bind:value
            class="input min-h-[100px] resize-y text-sm"
            placeholder="Enter macro value..."
          ></textarea>
        </div>

        <!-- Default value reference -->
        {#if currentOverride}
          <div class="space-y-1">
            <span class="text-surface-500 text-xs">Default value:</span>
            <div
              class="text-surface-400 bg-surface-800/50 max-h-20 overflow-y-auto rounded px-2 py-1.5 text-xs"
            >
              {macro.defaultValue || '(empty)'}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="border-surface-700 flex flex-col items-stretch justify-between gap-2 border-t px-4 py-3 sm:flex-row sm:items-center"
      >
        <button
          class="btn btn-ghost text-surface-400 hover:text-surface-200 order-2 flex items-center justify-center gap-1.5 text-sm sm:order-1"
          onclick={handleReset}
          disabled={!currentOverride}
          title="Reset to default value"
        >
          <RotateCcw class="h-4 w-4" />
          <span class="xs:inline hidden">Reset to Default</span>
          <span class="xs:hidden">Reset</span>
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
