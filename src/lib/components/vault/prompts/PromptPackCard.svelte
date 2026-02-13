<script lang="ts">
  import type { PresetPack } from '$lib/services/packs/types'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'

  interface Props {
    pack: PresetPack
    modifiedCount: number
    usageCount: number
    onclick: () => void
  }

  let { pack, modifiedCount, usageCount, onclick }: Props = $props()
</script>

<button type="button" class="w-full text-left" {onclick}>
  <Card
    class="group cursor-pointer transition-colors hover:border-primary/50"
  >
    <CardContent class="p-4">
      <div class="flex items-start justify-between">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-semibold truncate">{pack.name}</h3>
            {#if pack.isDefault}
              <Badge variant="default">Default</Badge>
            {/if}
            {#if usageCount > 0}
              <Badge variant="outline" class="border-green-500/50 text-green-500">Active</Badge>
            {/if}
          </div>
          {#if pack.description}
            <p class="text-muted-foreground mt-1 text-sm line-clamp-2">{pack.description}</p>
          {/if}
        </div>
      </div>
      <div class="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{modifiedCount} modified</span>
        <span class="text-muted-foreground/50">|</span>
        <span>{pack.author ?? 'Custom'}</span>
      </div>
    </CardContent>
  </Card>
</button>
