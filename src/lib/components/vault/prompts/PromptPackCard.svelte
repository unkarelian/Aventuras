<script lang="ts">
  import type { PresetPack } from '$lib/services/packs/types'
  import { Card, CardContent } from '$lib/components/ui/card'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { Download } from 'lucide-svelte'
  import { stripToPlainText } from '$lib/utils/markdown'

  interface Props {
    pack: PresetPack
    modifiedCount: number
    usageCount: number
    onclick: () => void
    onExport?: () => void
  }

  let { pack, modifiedCount, usageCount, onclick, onExport }: Props = $props()
</script>

<button type="button" class="w-full text-left" {onclick}>
  <Card
    class="group h-full cursor-pointer transition-colors hover:border-primary/50"
  >
    <CardContent class="flex h-full flex-col p-4">
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
          <p class="text-muted-foreground mt-1 text-sm line-clamp-2">
            {#if pack.description}{stripToPlainText(pack.description)}{:else}&nbsp;{/if}
          </p>
        </div>
        {#if onExport}
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onclick={(e: MouseEvent) => {
              e.stopPropagation()
              onExport?.()
            }}
            title="Export pack"
          >
            <Download class="h-4 w-4" />
          </Button>
        {/if}
      </div>
      <div class="mt-auto flex items-center gap-3 pt-3 text-xs text-muted-foreground">
        <span>{modifiedCount} modified</span>
        <span class="text-muted-foreground/50">|</span>
        <span>{pack.author ?? 'Custom'}</span>
      </div>
    </CardContent>
  </Card>
</button>
