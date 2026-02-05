<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { getResponsiveModalContext } from "./context";
	import { cn } from "$lib/utils/cn";

	let { children, class: className, ...props } = $props();
	const { isMobile } = getResponsiveModalContext();
</script>

 {#if isMobile.current}
	<Drawer.Content
        class={cn("max-h-[85vh] h-auto p-0 safe-area-bottom", className)}
        {...props}
    >
		{@render children?.()}
	</Drawer.Content>
 {:else}
	<Dialog.Content class={className} {...props}>
		{@render children?.()}
	</Dialog.Content>
 {/if}

<style>
	:global(.safe-area-bottom) {
		margin-bottom: env(safe-area-inset-bottom, 0px);
	}
</style>
