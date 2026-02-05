<script lang="ts">
  import { Drawer as DrawerPrimitive } from 'vaul-svelte'

  let {
    shouldScaleBackground = true,
    open = $bindable(false),
    activeSnapPoint = $bindable(null),
    handleOnly = true,
    closeThreshold = 0.75,
    ...restProps
  }: DrawerPrimitive.RootProps = $props()
</script>

<DrawerPrimitive.Root
  {shouldScaleBackground}
  bind:open
  bind:activeSnapPoint
  {handleOnly}
  {closeThreshold}
  {...restProps}
/>
