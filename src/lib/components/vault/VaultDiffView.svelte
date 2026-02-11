<script lang="ts">
  import type { VaultPendingChange } from '$lib/services/ai/sdk/schemas/vault'
  import type {
    VaultCharacter,
    VaultLorebookEntry,
    VaultScenarioNpc,
    VisualDescriptors,
  } from '$lib/types'
  import {
    Check,
    X,
    ArrowRight,
    Trash2,
    GitMerge,
    Plus,
    Pencil,
    User,
    BookOpen,
    Map,
    CheckCircle2,
    XCircle,
  } from 'lucide-svelte'
  import { fade } from 'svelte/transition'

  interface Props {
    change: VaultPendingChange
    onApprove: () => void
    onReject: () => void
    onEdit?: () => void
  }

  let { change, onApprove, onReject, onEdit }: Props = $props()

  const isApproved = $derived(change.status === 'approved')
  const isRejected = $derived(change.status === 'rejected')

  // --- Entity type display config ---

  const entityConfig = $derived.by(() => {
    switch (change.entityType) {
      case 'character':
        return { label: 'Character', icon: User, color: 'text-amber-400', bg: 'bg-amber-500/15' }
      case 'lorebook-entry':
        return {
          label: 'Lorebook Entry',
          icon: BookOpen,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/15',
        }
      case 'scenario':
        return { label: 'Scenario', icon: Map, color: 'text-violet-400', bg: 'bg-violet-500/15' }
    }
  })

  const actionConfig = $derived.by(() => {
    switch (change.action) {
      case 'create':
        return { label: 'Create', icon: Plus, color: 'text-green-400' }
      case 'update':
        return { label: 'Update', icon: ArrowRight, color: 'text-blue-400' }
      case 'delete':
        return { label: 'Delete', icon: Trash2, color: 'text-red-400' }
      case 'merge':
        return { label: 'Merge', icon: GitMerge, color: 'text-purple-400' }
    }
  })

  // --- Entity name extraction ---

  const entityName = $derived.by(() => {
    if (change.entityType === 'character') {
      if (change.action === 'create') return change.data.name
      if (change.action === 'update') return change.data.name ?? change.previous?.name ?? 'Unknown'
      if (change.action === 'delete') return change.previous?.name ?? 'Unknown'
    }
    if (change.entityType === 'lorebook-entry') {
      if (change.action === 'create') return change.data.name
      if (change.action === 'update') return change.data.name ?? change.previous?.name ?? 'Unknown'
      if (change.action === 'delete') return change.previous?.name ?? 'Unknown'
      if (change.action === 'merge') return change.data.name
    }
    if (change.entityType === 'scenario') {
      if (change.action === 'create') return change.data.name
      if (change.action === 'update') return change.data.name ?? change.previous?.name ?? 'Unknown'
      if (change.action === 'delete') return change.previous?.name ?? 'Unknown'
    }
    return 'Unknown'
  })

  // --- Formatting helpers ---

  function formatVisualDescriptors(vd: VisualDescriptors | undefined): string {
    if (!vd) return ''
    return (
      Object.entries(vd)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n') || '(none)'
    )
  }

  function formatCharacter(
    data: (VaultCharacter & Record<string, unknown>) | Record<string, unknown> | undefined,
  ): string {
    if (!data) return ''
    const lines: string[] = []
    if (data.name) lines.push(`Name: ${data.name}`)
    if (data.description) lines.push(`Description: ${data.description}`)
    if ((data.traits as string[])?.length)
      lines.push(`Traits: ${(data.traits as string[]).join(', ')}`)
    if (data.visualDescriptors) {
      const vd = formatVisualDescriptors(data.visualDescriptors as VisualDescriptors)
      if (vd && vd !== '(none)') lines.push(`Appearance:\n${vd}`)
    }
    if ((data.tags as string[])?.length) lines.push(`Tags: ${(data.tags as string[]).join(', ')}`)
    return lines.join('\n')
  }

  function formatEntry(entry: VaultLorebookEntry | undefined): string {
    if (!entry) return ''
    return [
      `Name: ${entry.name}`,
      `Type: ${entry.type}`,
      `Description: ${entry.description}`,
      entry.keywords.length > 0 ? `Keywords: ${entry.keywords.join(', ')}` : null,
      entry.aliases.length > 0 ? `Aliases: ${entry.aliases.join(', ')}` : null,
      `Injection: ${entry.injectionMode}`,
      `Priority: ${entry.priority}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  function formatNpc(npc: VaultScenarioNpc): string {
    return [
      `  ${npc.name} (${npc.role})`,
      `    ${npc.description}`,
      `    Relationship: ${npc.relationship}`,
      npc.traits.length > 0 ? `    Traits: ${npc.traits.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  }

  function formatScenario(data: Record<string, unknown> | undefined): string {
    if (!data) return ''
    const lines: string[] = []
    if (data.name) lines.push(`Name: ${data.name}`)
    if (data.description) lines.push(`Description: ${data.description}`)
    if (data.settingSeed) {
      const seed = String(data.settingSeed)
      lines.push(`Setting: ${seed.length > 200 ? seed.slice(0, 200) + '...' : seed}`)
    }
    if (data.primaryCharacterName) lines.push(`Protagonist: ${data.primaryCharacterName}`)
    if ((data.npcs as VaultScenarioNpc[])?.length) {
      lines.push(`NPCs (${(data.npcs as VaultScenarioNpc[]).length}):`)
      for (const npc of data.npcs as VaultScenarioNpc[]) {
        lines.push(formatNpc(npc))
      }
    }
    if (data.firstMessage) {
      const msg = String(data.firstMessage)
      lines.push(`First Message: ${msg.length > 150 ? msg.slice(0, 150) + '...' : msg}`)
    }
    if ((data.tags as string[])?.length) lines.push(`Tags: ${(data.tags as string[]).join(', ')}`)
    return lines.join('\n')
  }

  // --- Computed display data per entity type ---

  function formatChangeData(): string {
    if (!('data' in change)) return ''
    if (change.entityType === 'character') {
      return formatCharacter(change.data as Record<string, unknown>)
    }
    if (change.entityType === 'lorebook-entry') {
      return formatEntry(change.data as VaultLorebookEntry)
    }
    if (change.entityType === 'scenario') {
      return formatScenario(change.data as Record<string, unknown>)
    }
    return ''
  }

  function formatPrevious(): string {
    if (change.entityType === 'character' && 'previous' in change) {
      return formatCharacter(change.previous as Record<string, unknown>)
    }
    if (change.entityType === 'lorebook-entry' && 'previous' in change) {
      return formatEntry(change.previous as VaultLorebookEntry | undefined)
    }
    if (change.entityType === 'scenario' && 'previous' in change) {
      return formatScenario(change.previous as Record<string, unknown>)
    }
    return ''
  }

  // Merge-specific data (lorebook entries only)
  const mergeData = $derived(
    change.entityType === 'lorebook-entry' && change.action === 'merge' ? change.data : undefined,
  )
  const previousEntries = $derived(
    change.entityType === 'lorebook-entry' && change.action === 'merge'
      ? change.previousEntries
      : undefined,
  )
</script>

<div
  class="border-surface-600 overflow-hidden rounded-lg border {isApproved
    ? 'bg-green-500/5 opacity-75'
    : isRejected
      ? 'bg-red-500/5 opacity-60'
      : 'bg-surface-800'}"
  in:fade={{ duration: 150 }}
>
  <!-- Header -->
  <div
    class="bg-surface-700/50 border-surface-600 flex flex-col justify-between gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:px-4"
  >
    <div class="flex items-center gap-2">
      <!-- Entity type badge -->
      <div
        class="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium {entityConfig.color} {entityConfig.bg}"
      >
        <entityConfig.icon class="h-3 w-3" />
        {entityConfig.label}
      </div>

      <!-- Action indicator -->
      <div class="flex items-center gap-1.5">
        <actionConfig.icon class="h-4 w-4 {actionConfig.color}" />
        <span class="text-sm font-medium {actionConfig.color}">
          {actionConfig.label}
        </span>
      </div>

      <!-- Entity name -->
      <span class="text-surface-300 truncate text-sm">{entityName}</span>
    </div>

    <div class="flex items-center gap-2">
      {#if isApproved}
        <div class="flex items-center gap-1.5 text-sm font-medium text-green-400">
          <CheckCircle2 class="h-4 w-4" />
          Approved
        </div>
      {:else if isRejected}
        <div class="flex items-center gap-1.5 text-sm font-medium text-red-400">
          <XCircle class="h-4 w-4" />
          Rejected
        </div>
      {:else}
        {#if onEdit}
          <button
            class="bg-surface-600/50 text-surface-300 hover:bg-surface-600 active:bg-surface-500 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:py-1.5"
            onclick={onEdit}
          >
            <Pencil class="h-4 w-4" />
            Edit
          </button>
        {/if}
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/30 active:bg-red-500/40 sm:flex-none sm:py-1.5"
          onclick={onReject}
        >
          <X class="h-4 w-4" />
          Reject
        </button>
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-green-500/20 px-3 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/30 active:bg-green-500/40 sm:flex-none sm:py-1.5"
          onclick={onApprove}
        >
          <Check class="h-4 w-4" />
          Approve
        </button>
      {/if}
    </div>
  </div>

  <!-- Content -->
  <div class="p-3 sm:p-4">
    {#if change.action === 'create'}
      <!-- Create: Show new entity data -->
      <div class="rounded-md border border-green-500/30 bg-green-500/10 p-3">
        <div class="mb-2 text-xs font-medium text-green-400">
          New {entityConfig.label}
        </div>
        <pre
          class="text-surface-200 font-mono text-sm whitespace-pre-wrap">{formatChangeData()}</pre>
      </div>
    {:else if change.action === 'update'}
      <!-- Update: Before / After -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <div class="mb-2 text-xs font-medium text-red-400">Before</div>
          <pre
            class="text-surface-300 font-mono text-sm whitespace-pre-wrap">{formatPrevious()}</pre>
        </div>
        <div class="rounded-md border border-green-500/30 bg-green-500/10 p-3">
          <div class="mb-2 text-xs font-medium text-green-400">After</div>
          <pre
            class="text-surface-200 font-mono text-sm whitespace-pre-wrap">{formatChangeData()}</pre>
        </div>
      </div>
    {:else if change.action === 'delete'}
      <!-- Delete: Show entity being removed -->
      <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3">
        <div class="mb-2 text-xs font-medium text-red-400">
          {entityConfig.label} to Delete
        </div>
        <pre
          class="text-surface-300 font-mono text-sm whitespace-pre-wrap line-through opacity-70">{formatPrevious()}</pre>
      </div>
    {:else if change.action === 'merge'}
      <!-- Merge: Source entries and result (lorebook-entry only) -->
      <div class="space-y-4">
        <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <div class="mb-2 text-xs font-medium text-red-400">
            Entries to Merge ({previousEntries?.length ?? 0})
          </div>
          <div class="space-y-2">
            {#each previousEntries ?? [] as entry, i (i)}
              <div class="bg-surface-700/50 rounded p-2">
                <div class="text-surface-400 mb-1 text-xs">Entry {i + 1}: {entry.name}</div>
                <pre class="text-surface-300 font-mono text-sm whitespace-pre-wrap">{formatEntry(
                    entry,
                  )}</pre>
              </div>
            {/each}
          </div>
        </div>

        <div class="flex justify-center">
          <ArrowRight class="h-5 w-5 rotate-90 text-purple-400" />
        </div>

        <div class="rounded-md border border-green-500/30 bg-green-500/10 p-3">
          <div class="mb-2 text-xs font-medium text-green-400">Merged Entry</div>
          <pre class="text-surface-200 font-mono text-sm whitespace-pre-wrap">{formatEntry(
              mergeData as VaultLorebookEntry | undefined,
            )}</pre>
        </div>
      </div>
    {/if}
  </div>
</div>
