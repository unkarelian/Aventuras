<script lang="ts">
  import { X, RotateCcw, Variable } from 'lucide-svelte';
  import type { SimpleMacro, MacroOverride } from '$lib/services/prompts';

  interface Props {
    isOpen: boolean;
    macro: SimpleMacro;
    /** Current override value (if any) */
    currentOverride?: MacroOverride | null;
    onClose: () => void;
    onSave: (value: string) => void;
    onReset: () => void;
  }

  let {
    isOpen,
    macro,
    currentOverride = null,
    onClose,
    onSave,
    onReset,
  }: Props = $props();

  // Form state
  let value = $state('');
  let hasChanges = $derived(value !== (currentOverride?.value ?? macro.defaultValue));

  // Initialize form when modal opens
  $effect(() => {
    if (isOpen) {
      value = currentOverride?.value ?? macro.defaultValue;
    }
  });

  function handleSave() {
    onSave(value);
    onClose();
  }

  function handleReset() {
    value = macro.defaultValue;
    onReset();
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
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
    <div
      class="relative z-10 w-full max-w-md rounded-xl border border-surface-700 bg-surface-900 shadow-2xl"
      onclick={(e) => e.stopPropagation()}
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-surface-700 px-4 py-3">
        <div class="flex items-center gap-2">
          <Variable class="h-5 w-5 text-accent-400" />
          <h2 id="macro-editor-title" class="text-lg font-semibold text-surface-100">
            Edit Macro
          </h2>
        </div>
        <button
          class="rounded-lg p-1.5 text-surface-400 hover:bg-surface-800 hover:text-surface-200"
          onclick={onClose}
          title="Close"
        >
          <X class="h-5 w-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-4 space-y-4">
        <!-- Macro info -->
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-surface-200">{macro.name}</span>
            <code class="text-xs px-1.5 py-0.5 rounded bg-surface-800 text-surface-400">
              {`{{${macro.token}}}`}
            </code>
          </div>
          <p class="text-sm text-surface-400">{macro.description}</p>
        </div>

        <!-- Dynamic macro notice -->
        {#if macro.dynamic}
          <div class="rounded-lg bg-amber-900/20 border border-amber-700/30 px-3 py-2">
            <p class="text-xs text-amber-400">
              This macro is dynamically resolved from story data. The value below is used as a fallback when no story data is available.
            </p>
          </div>
        {/if}

        <!-- Value input -->
        <div class="space-y-1.5">
          <label for="macro-value" class="text-sm font-medium text-surface-300">
            Value
          </label>
          <textarea
            id="macro-value"
            bind:value
            class="input text-sm min-h-[100px] resize-y"
            placeholder="Enter macro value..."
          ></textarea>
        </div>

        <!-- Default value reference -->
        {#if currentOverride}
          <div class="space-y-1">
            <span class="text-xs text-surface-500">Default value:</span>
            <div class="text-xs text-surface-400 bg-surface-800/50 rounded px-2 py-1.5 max-h-20 overflow-y-auto">
              {macro.defaultValue || '(empty)'}
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 border-t border-surface-700 px-4 py-3">
        <button
          class="btn btn-ghost text-sm flex items-center justify-center gap-1.5 text-surface-400 hover:text-surface-200 order-2 sm:order-1"
          onclick={handleReset}
          disabled={!currentOverride}
          title="Reset to default value"
        >
          <RotateCcw class="h-4 w-4" />
          <span class="hidden xs:inline">Reset to Default</span>
          <span class="xs:hidden">Reset</span>
        </button>
        <div class="flex items-center gap-2 order-1 sm:order-2">
          <button class="btn btn-secondary text-sm flex-1 sm:flex-none" onclick={onClose}>
            Cancel
          </button>
          <button
            class="btn btn-primary text-sm flex-1 sm:flex-none"
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
