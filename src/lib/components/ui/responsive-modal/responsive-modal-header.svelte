<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer";
	import { getResponsiveModalContext } from "./context";
	import { cn } from "$lib/utils/cn";
	import { X } from "lucide-svelte";
	import { Button } from "$lib/components/ui/button";

	let { title, class: className, children, ...props } = $props();
	const { isMobile } = getResponsiveModalContext();
</script>

{#if isMobile.current}
	<Drawer.Header class={cn("text-center", className)} {...props}>
		{#if title}
			<h2 class="text-lg font-semibold">{title}</h2>
		{:else}
			{@render children?.()}
		{/if}
	</Drawer.Header>
{:else}
	<div
		class={cn(
			"flex items-center justify-between py-4 border-b border-border relative z-10 bg-background sm:rounded-t-lg",
			className,
		)}
	>
		<Dialog.Header class="flex-1" {...props}>
			{#if title}
				<h2 class="text-lg font-semibold">{title}</h2>
			{:else}
				{@render children?.()}
			{/if}
		</Dialog.Header>
		<Dialog.Close>
			<Button variant="destructive" size="icon">
				<X class="size-6!" />
				<span class="sr-only">Close</span>
			</Button>
		</Dialog.Close>
	</div>
{/if}
