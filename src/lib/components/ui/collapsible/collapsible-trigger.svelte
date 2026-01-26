<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from "bits-ui";
	import { cn } from "$lib/utils/cn.js";
	import type { ClassValue } from "clsx";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CollapsiblePrimitive.TriggerProps & { class?: ClassValue } = $props();
</script>

<CollapsiblePrimitive.Trigger
	bind:ref
	class={cn(
		"flex items-center justify-center gap-2 text-sm font-medium transition-colors [&[data-state=open]>text-accent-400]",
		className
	)}
	{...restProps}
>
	<slot />
</CollapsiblePrimitive.Trigger>
