<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";
	import type { ClassValue } from "clsx";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CollapsiblePrimitive.ContentProps & { class?: ClassValue } = $props();
</script>

<CollapsiblePrimitive.Content
	bind:ref
	class={cn(
		"overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
		className
	)}
	{...restProps}
>
	<slot />
</CollapsiblePrimitive.Content>
