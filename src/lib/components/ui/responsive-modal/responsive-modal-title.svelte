<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { getResponsiveModalContext } from "./context";
	import { cn } from "$lib/utils/cn";

	let { children, class: className, ...props } = $props();
	const { isMobile } = getResponsiveModalContext();
</script>

{#if isMobile.current}
	<Drawer.Title class={cn("", className)} {...props}>
		{@render children?.()}
	</Drawer.Title>
{:else}
	<Dialog.Title class={className} {...props}>
		{@render children?.()}
	</Dialog.Title>
{/if}
