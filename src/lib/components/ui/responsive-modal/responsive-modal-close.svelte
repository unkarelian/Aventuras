<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { getResponsiveModalContext } from "./context";

	let { children, ...props } = $props();
	const { isMobile } = getResponsiveModalContext();
</script>

{#if isMobile.current}
	<Drawer.Close {...props}>
		{@render children?.()}
	</Drawer.Close>
{:else}
	<Dialog.Close {...props}>
		{@render children?.()}
	</Dialog.Close>
{/if}
