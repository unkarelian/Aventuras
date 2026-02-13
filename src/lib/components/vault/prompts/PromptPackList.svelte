<script lang="ts">
  import type { PresetPack } from '$lib/services/packs/types'
  import { packService } from '$lib/services/packs/pack-service'
  import { database } from '$lib/services/database'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { fade } from 'svelte/transition'
  import PromptPackCard from './PromptPackCard.svelte'
  import CreatePackDialog from './CreatePackDialog.svelte'

  interface Props {
    onOpenPack: (packId: string) => void
    showCreateDialog?: boolean
  }

  let { onOpenPack, showCreateDialog = $bindable(false) }: Props = $props()

  let packs = $state<PresetPack[]>([])
  let modifiedCounts = $state<Map<string, number>>(new Map())
  let usageCounts = $state<Map<string, number>>(new Map())
  let loading = $state(true)

  async function loadPacks() {
    loading = true
    try {
      const allPacks = await packService.getAllPacks()

      // Load modified counts and usage counts in parallel for each pack
      const [modifiedResults, usageResults] = await Promise.all([
        Promise.all(
          allPacks.map(async (pack) => {
            const modified = await packService.getModifiedTemplates(pack.id)
            const count = [...modified.values()].filter(Boolean).length
            return [pack.id, count] as const
          }),
        ),
        Promise.all(
          allPacks.map(async (pack) => {
            const count = await database.getPackUsageCount(pack.id)
            return [pack.id, count] as const
          }),
        ),
      ])

      modifiedCounts = new Map(modifiedResults)
      usageCounts = new Map(usageResults)

      // Sort: default pack first, then user-created packs by name
      packs = allPacks.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return a.name.localeCompare(b.name)
      })
    } catch (error) {
      console.error('[PromptPackList] Failed to load packs:', error)
    } finally {
      loading = false
    }
  }

  function handlePackCreated(pack: PresetPack) {
    loadPacks()
  }

  // Load on mount
  $effect(() => {
    loadPacks()
  })
</script>

{#if loading}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each Array(3) as _, i (i)}
      <div class="space-y-3">
        <Skeleton class="h-[120px] w-full rounded-xl" />
      </div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" in:fade>
    {#each packs as pack (pack.id)}
      <PromptPackCard
        {pack}
        modifiedCount={modifiedCounts.get(pack.id) ?? 0}
        usageCount={usageCounts.get(pack.id) ?? 0}
        onclick={() => onOpenPack(pack.id)}
      />
    {/each}
  </div>
{/if}

<CreatePackDialog
  open={showCreateDialog}
  onOpenChange={(v) => (showCreateDialog = v)}
  onCreated={handlePackCreated}
/>
