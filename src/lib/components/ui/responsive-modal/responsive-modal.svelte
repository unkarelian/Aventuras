<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Drawer from '$lib/components/ui/drawer'
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'
  import type { Snippet } from 'svelte'
  import { setResponsiveModalContext } from './context'
  import type { OnChangeFn } from 'vaul-svelte'

  type Props = {
    open: boolean
    onOpenChange?: OnChangeFn<boolean>
    children: Snippet
    [key: string]: unknown
  }

  let { open = $bindable(false), onOpenChange, children, ...props }: Props = $props()

  const isMobile = createIsMobile()
  setResponsiveModalContext({ isMobile })
</script>

{#if isMobile.current}
  <Drawer.Root bind:open {onOpenChange} {...props}>
    {@render children?.()}
  </Drawer.Root>
{:else}
  <Dialog.Root bind:open {onOpenChange} {...props}>
    {@render children?.()}
  </Dialog.Root>
{/if}
