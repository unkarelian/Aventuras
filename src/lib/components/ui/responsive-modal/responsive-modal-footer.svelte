<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Drawer from '$lib/components/ui/drawer'
  import { getResponsiveModalContext } from './context'
  import { cn } from '$lib/utils/cn'

  let { children, class: className, ...props } = $props()
  const { isMobile } = getResponsiveModalContext()
</script>

{#if isMobile.current}
  <Drawer.Footer class={cn('border-t pt-2', className)} {...props}>
    {@render children?.()}
  </Drawer.Footer>
{:else}
  <Dialog.Footer
    class={cn(
      'border-border bg-background relative z-10 border-t py-4 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] sm:rounded-b-lg',
      className,
    )}
    {...props}
  >
    {@render children?.()}
  </Dialog.Footer>
{/if}
