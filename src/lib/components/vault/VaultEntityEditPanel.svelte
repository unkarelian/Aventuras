<script lang="ts">
  import type { VaultPendingChange } from '$lib/services/ai/sdk/schemas/vault'
  import type { VaultCharacterInput, VaultScenarioInput } from '$lib/services/ai/sdk/schemas/vault'
  import type { VaultLorebookEntry } from '$lib/types'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import { X, Check, User, BookOpen, Map } from 'lucide-svelte'

  interface Props {
    change: VaultPendingChange
    onApprove: () => void
    onClose: () => void
    onUpdate: (updatedChange: VaultPendingChange) => void
  }

  let { change, onApprove, onClose, onUpdate }: Props = $props()

  // ─── Character edit state ────────────────────────────────────────────────

  let charName = $state('')
  let charDescription = $state('')
  let charTraits = $state('')
  let charTags = $state('')

  // ─── Lorebook entry edit state ───────────────────────────────────────────

  let entryName = $state('')
  let entryDescription = $state('')
  let entryKeywords = $state('')

  // ─── Scenario edit state ─────────────────────────────────────────────────

  let scenarioName = $state('')
  let scenarioDescription = $state('')
  let scenarioSettingSeed = $state('')
  let scenarioFirstMessage = $state('')

  // Initialize local state from the change data
  $effect(() => {
    if (change.entityType === 'character' && 'data' in change) {
      const d = change.data as VaultCharacterInput
      charName = d.name ?? ''
      charDescription = d.description ?? ''
      charTraits = (d.traits ?? []).join(', ')
      charTags = (d.tags ?? []).join(', ')
    } else if (change.entityType === 'lorebook-entry' && 'data' in change) {
      const d = change.data as VaultLorebookEntry
      entryName = d.name ?? ''
      entryDescription = d.description ?? ''
      entryKeywords = (d.keywords ?? []).join(', ')
    } else if (change.entityType === 'scenario' && 'data' in change) {
      const d = change.data as VaultScenarioInput
      scenarioName = d.name ?? ''
      scenarioDescription = d.description ?? ''
      scenarioSettingSeed = d.settingSeed ?? ''
      scenarioFirstMessage = d.firstMessage ?? ''
    }
  })

  function emitUpdate() {
    if (change.entityType === 'character' && 'data' in change) {
      const d = change.data as VaultCharacterInput
      onUpdate({
        ...change,
        data: {
          ...d,
          name: charName,
          description: charDescription || null,
          traits: charTraits
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          tags: charTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      } as VaultPendingChange)
    } else if (change.entityType === 'lorebook-entry' && 'data' in change) {
      const d = change.data as VaultLorebookEntry
      onUpdate({
        ...change,
        data: {
          ...d,
          name: entryName,
          description: entryDescription,
          keywords: entryKeywords
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        },
      } as VaultPendingChange)
    } else if (change.entityType === 'scenario' && 'data' in change) {
      const d = change.data as VaultScenarioInput
      onUpdate({
        ...change,
        data: {
          ...d,
          name: scenarioName,
          description: scenarioDescription || null,
          settingSeed: scenarioSettingSeed,
          firstMessage: scenarioFirstMessage || null,
        },
      } as VaultPendingChange)
    }
  }

  function handleApproveWithEdits() {
    emitUpdate()
    // Small tick to allow emitUpdate to propagate before approve
    setTimeout(onApprove, 0)
  }

  const entityLabel = $derived(
    change.entityType === 'character'
      ? 'Character'
      : change.entityType === 'lorebook-entry'
        ? 'Lorebook Entry'
        : 'Scenario',
  )

  const actionLabel = $derived(
    'action' in change ? change.action.charAt(0).toUpperCase() + change.action.slice(1) : '',
  )
</script>

<div class="flex h-full flex-col overflow-hidden">
  <!-- Header -->
  <div class="bg-muted/20 flex items-center justify-between border-b px-4 py-3">
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
  <div class="flex-1 space-y-4 overflow-y-auto p-4">
    {#if change.entityType === 'character' && 'data' in change}
      <div class="space-y-3">
        <div class="space-y-1">
          <Label class="text-xs">Name</Label>
          <Input bind:value={charName} oninput={emitUpdate} class="h-8" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Description</Label>
          <Textarea
            bind:value={charDescription}
            oninput={emitUpdate}
            rows={3}
            class="resize-none text-sm"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Traits</Label>
          <Input
            bind:value={charTraits}
            oninput={emitUpdate}
            placeholder="Comma separated..."
            class="h-8"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Tags</Label>
          <Input
            bind:value={charTags}
            oninput={emitUpdate}
            placeholder="Comma separated..."
            class="h-8"
          />
        </div>
      </div>
    {:else if change.entityType === 'lorebook-entry' && 'data' in change}
      <div class="space-y-3">
        <div class="space-y-1">
          <Label class="text-xs">Name</Label>
          <Input bind:value={entryName} oninput={emitUpdate} class="h-8" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Description</Label>
          <Textarea
            bind:value={entryDescription}
            oninput={emitUpdate}
            rows={5}
            class="resize-none text-sm"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Keywords</Label>
          <Input
            bind:value={entryKeywords}
            oninput={emitUpdate}
            placeholder="Comma separated..."
            class="h-8"
          />
        </div>
      </div>
    {:else if change.entityType === 'scenario' && 'data' in change}
      <div class="space-y-3">
        <div class="space-y-1">
          <Label class="text-xs">Name</Label>
          <Input bind:value={scenarioName} oninput={emitUpdate} class="h-8" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Description</Label>
          <Textarea
            bind:value={scenarioDescription}
            oninput={emitUpdate}
            rows={2}
            class="resize-none text-sm"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Setting Seed</Label>
          <Textarea
            bind:value={scenarioSettingSeed}
            oninput={emitUpdate}
            rows={6}
            class="resize-none font-mono text-sm"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">First Message</Label>
          <Textarea
            bind:value={scenarioFirstMessage}
            oninput={emitUpdate}
            rows={3}
            class="resize-none text-sm"
          />
        </div>
      </div>
    {:else}
      <p class="text-muted-foreground text-sm">
        Delete operations cannot be edited — approve or reject directly.
      </p>
    {/if}
  </div>

  <!-- Footer -->
  <div class="bg-muted/20 flex items-center justify-end gap-2 border-t px-4 py-3">
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
</div>
