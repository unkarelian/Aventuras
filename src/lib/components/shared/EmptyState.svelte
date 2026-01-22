<script lang="ts">
  import { Button } from "$lib/components/ui/button";

  interface Props {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
    class?: string;
  }

  let {
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    class: className = ""
  }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center flex-1 text-center px-4 py-12 {className}">
  <div class="rounded-full bg-muted p-6 mb-4">
    <Icon class="h-12 w-12 text-muted-foreground" />
  </div>
  <h2 class="text-xl font-semibold text-foreground mb-2">{title}</h2>
  <p class="text-muted-foreground max-w-sm mb-6">
    {description}
  </p>
  {#if actionLabel && onAction}
    <Button variant="default" onclick={onAction}>
      {actionLabel}
    </Button>
  {/if}
</div>
