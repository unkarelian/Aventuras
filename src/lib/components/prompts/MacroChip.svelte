<script lang="ts">
  import { Variable, Settings2 } from 'lucide-svelte';
  import type { Macro } from '$lib/services/prompts';
  import { Badge } from "$lib/components/ui/badge";

  interface Props {
    macro: Macro;
    /** Whether this chip is in the editor (interactive) or just display */
    interactive?: boolean;
    /** Callback when the chip is clicked */
    onClick?: () => void;
    /** Optional class overrides */
    class?: string;
  }

  let {
    macro,
    interactive = true,
    onClick,
    class: className = '',
  }: Props = $props();

  const isComplex = macro.type === 'complex';
</script>

{#if interactive}
  <button
    type="button"
    class="inline-flex items-center align-middle mx-0.5 cursor-pointer hover:-translate-y-px transition-transform"
    onclick={onClick}
    title={macro.description}
  >
    <Badge 
      variant={isComplex ? "outline" : "secondary"} 
      class="{className} gap-1 px-1.5 py-0.5 font-normal"
    >
      {#if isComplex}
        <Settings2 class="h-3 w-3" />
      {:else}
        <Variable class="h-3 w-3" />
      {/if}
      <span class="max-w-[120px] truncate">{macro.name}</span>
    </Badge>
  </button>
{:else}
  <span class="inline-flex items-center align-middle mx-0.5" title={macro.description}>
    <Badge 
      variant={isComplex ? "outline" : "secondary"} 
      class="{className} gap-1 px-1.5 py-0.5 font-normal"
    >
      {#if isComplex}
        <Settings2 class="h-3 w-3" />
      {:else}
        <Variable class="h-3 w-3" />
      {/if}
      <span class="max-w-[120px] truncate">{macro.name}</span>
    </Badge>
  </span>
{/if}
