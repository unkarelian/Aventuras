<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Trash2, X, Check } from "lucide-svelte";
  import type { Snippet } from "svelte";

  interface Props {
    onDelete?: () => void;
    class?: string;
    children?: Snippet;
    confirmMessage?: string;
    size?: "default" | "sm" | "lg" | "icon";
    showDelete?: boolean;
  }

  let {
    onDelete,
    class: className,
    children,
    confirmMessage = "Delete?",
    size = "icon",
    showDelete = true,
  }: Props = $props();

  let confirming = $state(false);
</script>

<div class="flex items-center shrink-0 gap-1 {className}">
  {#if confirming}
    <span class="text-xs font-medium text-muted-foreground">
      {confirmMessage}
    </span>
      <Button
        variant="text"
        {size}
        class="hover:bg-transparent text-muted-foreground hover:text-foreground h-6 w-5"
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          confirming = false;
        }}
        title="Cancel"
      >
        <X class="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="text"
        {size}
        class="hover:bg-transparent text-destructive h-6 w-5"
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          confirming = false;
          onDelete?.();
        }}
        title="Confirm Delete"
      >
        <Check class="h-3.5 w-3.5" />
      </Button>
    {:else}
      {#if children}
        {@render children()}
      {/if}
      {#if onDelete && showDelete}
        <Button
          class="h-6 w-5"
          variant="destructive"
          {size}
        onclick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          confirming = true;
        }}
        title="Delete"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </Button>
    {/if}
  {/if}
</div>
