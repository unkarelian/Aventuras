<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";
	import type { ClassValue } from "clsx";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CollapsiblePrimitive.RootProps & { class?: ClassValue } = $props();
</script>

<CollapsiblePrimitive.Root
	bind:ref
	class={cn(className)}
	{...restProps}
/>
