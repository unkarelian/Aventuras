<script lang="ts">
  import type { VaultPendingChange } from '$lib/services/ai/sdk/schemas/vault'
  import type { VaultCharacterInput, VaultScenarioInput } from '$lib/services/ai/sdk/schemas/vault'
  import type { VaultLorebook, VaultLorebookEntry } from '$lib/types'
  import { Button } from '$lib/components/ui/button'
  import { X, Check, User, BookOpen, Map, Save } from 'lucide-svelte'
  import VaultCharacterFormFields from './VaultCharacterFormFields.svelte'
  import VaultScenarioFormFields from './VaultScenarioFormFields.svelte'
  import VaultLorebookEditorContent from './VaultLorebookEditorContent.svelte'
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
  import { vaultEditor } from '$lib/stores/vaultEditorStore.svelte'

  interface Props {
    change: VaultPendingChange
    onApprove: (change?: VaultPendingChange) => void
    onClose: () => void
  }

  let { change, onApprove, onClose }: Props = $props()

  // Local state for the editable data (character / scenario)
  let charData = $state<VaultCharacterInput | null>(null)
  let entryData = $state<VaultLorebookEntry | null>(null)
  let scenarioData = $state<VaultScenarioInput | null>(null)

  // Initialize local state from the change data
  $effect(() => {
    if (change.entityType === 'character' && 'data' in change) {
      charData = JSON.parse(JSON.stringify(change.data))
    } else if (change.entityType === 'lorebook-entry' && 'data' in change) {
      entryData = JSON.parse(JSON.stringify(change.data))
    } else if (change.entityType === 'scenario' && 'data' in change) {
      scenarioData = JSON.parse(JSON.stringify(change.data))
    }
  })

  /** Push local edits to the store so "Approve" uses the edited version */
  function emitUpdate() {
    if (change.entityType === 'character' && charData) {
      vaultEditor.updateChangeData(change.id, {
        ...change,
        data: charData,
      } as VaultPendingChange)
    } else if (change.entityType === 'lorebook-entry' && entryData) {
      vaultEditor.updateChangeData(change.id, {
        ...change,
        data: entryData,
      } as VaultPendingChange)
    } else if (change.entityType === 'scenario' && scenarioData) {
      vaultEditor.updateChangeData(change.id, {
        ...change,
        data: scenarioData,
      } as VaultPendingChange)
    }
  }

  function handleApproveWithEdits() {
    emitUpdate()
    // Small tick to allow emitUpdate to propagate before approve
    setTimeout(() => {
      onApprove()
    }, 0)
  }

  /** Save lorebook edits directly to the vault store */
  function handleLorebookEditorSave(updatedLorebook: VaultLorebook) {
    const id = vaultEditor.currentLorebookId
    if (id) {
      lorebookVault.update(id, {
        entries: updatedLorebook.entries,
        name: updatedLorebook.name,
        description: updatedLorebook.description,
        tags: updatedLorebook.tags,
      })
    }
  }

  /** Approve a specific pending entry from the lorebook editor list */
  function handlePendingEntryApprove(pendingChange: VaultPendingChange) {
    onApprove(pendingChange)
  }

  const entityLabel = $derived(
    change.entityType === 'character'
      ? 'Character'
      : change.entityType === 'lorebook-entry'
        ? 'Lorebook Entry'
        : change.entityType === 'lorebook'
          ? 'Lorebook'
          : 'Scenario',
  )

  const actionLabel = $derived(
    'action' in change ? change.action.charAt(0).toUpperCase() + change.action.slice(1) : '',
  )
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#if (change.entityType === 'lorebook-entry' || change.entityType === 'lorebook') && vaultEditor.previewLorebook}
    <!-- Full Lorebook Editor UI — reads derived state from vaultEditor store -->
    {#key change.id}
      <VaultLorebookEditorContent
        lorebook={vaultEditor.previewLorebook}
        initialEntryIndex={vaultEditor.initialEntryIndex}
        onSave={(updated) => handleLorebookEditorSave(updated)}
        {onClose}
        isEmbedded={true}
        isPendingApproval={change.entityType === 'lorebook' && change.status === 'pending'}
        onApprove={handleApproveWithEdits}
        pendingEntries={vaultEditor.pendingEntries}
        onApproveEntry={handlePendingEntryApprove}
        onUpdatePendingChange={(changeToUpdate, newData) => {
          vaultEditor.updateChangeData(changeToUpdate.id, {
            ...changeToUpdate,
            data: newData,
          } as VaultPendingChange)
        }}
      />
    {/key}
  {:else}
    <!-- Standard UI for character / scenario -->
    <!-- Header -->
    <div class="bg-muted/20 flex shrink-0 items-center justify-between border-b px-4 py-3">
      <div class="flex items-center gap-2">
        {#if change.entityType === 'character'}
          <User class="h-4 w-4 text-amber-400" />
        {:else if change.entityType === 'lorebook-entry'}
          <BookOpen class="h-4 w-4 text-cyan-400" />
        {:else}
          <Map class="h-4 w-4 text-violet-400" />
        {/if}
        <span class="text-sm font-semibold">{actionLabel} {entityLabel}</span>
      </div>
      <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onClose}>
        <X class="h-4 w-4" />
      </Button>
    </div>

    <!-- Form -->
    <div class="flex-1 space-y-4 overflow-y-auto">
      {#if change.entityType === 'character' && charData}
        <div class="px-4">
          <VaultCharacterFormFields
            data={charData}
            onUpdate={(newData) => {
              charData = newData
              emitUpdate()
            }}
          />
        </div>
      {:else if change.entityType === 'scenario' && scenarioData}
        <VaultScenarioFormFields
          data={scenarioData}
          onUpdate={(newData) => {
            scenarioData = newData
            emitUpdate()
          }}
        />
      {:else if !('data' in change)}
        <div class="p-4">
          <p class="text-muted-foreground text-sm">
            Delete operations cannot be edited — approve or reject directly.
          </p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="bg-muted/20 flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
      <Button variant="outline" size="sm" onclick={onClose}>Cancel</Button>
      <Button
        size="sm"
        class="gap-1.5 bg-green-600 text-white hover:bg-green-700"
        onclick={handleApproveWithEdits}
      >
        <Check class="h-3.5 w-3.5" />
        Confirm & Approve
      </Button>
    </div>
  {/if}
</div>
