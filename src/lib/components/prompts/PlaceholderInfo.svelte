<script lang="ts">
  import { X, Info, Database, BookOpen, Wand2, FileText } from 'lucide-svelte'
  import type { ContextPlaceholder } from '$lib/services/prompts'

  interface Props {
    isOpen: boolean
    placeholder: ContextPlaceholder
    onClose: () => void
  }

  let { isOpen, placeholder, onClose }: Props = $props()

  // Category icons and labels
  const categoryInfo: Record<string, { icon: typeof Info; label: string; color: string }> = {
    story: { icon: FileText, label: 'Story Context', color: 'text-blue-400' },
    entities: { icon: Database, label: 'Entity Tracking', color: 'text-green-400' },
    memory: { icon: BookOpen, label: 'Memory System', color: 'text-purple-400' },
    wizard: { icon: Wand2, label: 'Story Wizard', color: 'text-amber-400' },
    other: { icon: Info, label: 'Other', color: 'text-surface-400' },
  }

  const catInfo = $derived(categoryInfo[placeholder.category] || categoryInfo.other)

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose()
    }
  }
  const Icon = $derived(catInfo.icon)
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="placeholder-info-title"
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
          <div class="bg-surface-800 rounded-lg p-1.5 {catInfo.color}">
            <Icon class="h-4 w-4" />
          </div>
          <div>
            <h2 id="placeholder-info-title" class="text-surface-100 text-base font-semibold">
              {placeholder.name}
            </h2>
            <p class="text-xs {catInfo.color}">{catInfo.label}</p>
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

      <!-- Content -->
      <div class="space-y-4 p-4">
        <!-- Token display -->
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="text-surface-500 mb-1 block text-xs font-medium">Token</label>
          <code
            class="bg-surface-800 text-surface-300 block rounded-lg px-3 py-2 font-mono text-sm"
          >
            {'{{' + placeholder.token + '}}'}
          </code>
        </div>

        <!-- Description -->
        <div>
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label class="text-surface-500 mb-1 block text-xs font-medium">Description</label>
          <p class="text-surface-300 text-sm leading-relaxed">
            {placeholder.description}
          </p>
        </div>

        <!-- Info note -->
        <div
          class="bg-surface-800/50 border-surface-700 flex items-start gap-2 rounded-lg border p-3"
        >
          <Info class="text-surface-500 mt-0.5 h-4 w-4 flex-shrink-0" />
          <p class="text-surface-400 text-xs leading-relaxed">
            This is a <strong class="text-surface-300">context placeholder</strong> that gets automatically
            filled with data at runtime. It cannot be edited directly, but you can move or remove it within
            this prompt template. It will not be populated if moved to a different prompt.
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="border-surface-700 flex justify-end border-t px-4 py-3">
        <button class="btn btn-secondary text-sm" onclick={onClose}> Close </button>
      </div>
    </div>
  </div>
{/if}
