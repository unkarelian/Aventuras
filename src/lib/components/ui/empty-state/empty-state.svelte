<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: any;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    class?: string;
    size?: "default" | "sm";
    children?: import("svelte").Snippet;
  }

  let {
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    class: className = "",
    size = "default",
    children,
  }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center flex-1 text-center {className}"
>
  {#if Icon}
    <div class="rounded-full bg-muted {size === 'sm' ? 'p-3 mb-2' : 'p-6 mb-3'}">
      <Icon class="{size === 'sm' ? 'h-6 w-6' : 'h-12 w-12'} text-muted-foreground" />
    </div>
  {/if}
  <h2 class="{size === 'sm' ? 'text-sm' : 'text-xl'} font-semibold text-foreground">{title}</h2>
  <p class="text-muted-foreground max-w-sm {size === 'sm' ? 'mb-2 text-xs' : 'mb-4 text-sm'} leading-snug">
    {description}
  </p>
  {#if children}
    {@render children()}
  {:else if actionLabel && onAction}
    <Button variant="default" onclick={onAction}>
      {actionLabel}
    </Button>
  {/if}
</div>
