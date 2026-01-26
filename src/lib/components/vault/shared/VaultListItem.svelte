<script lang="ts">
  import { cn } from "$lib/utils/cn";
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    subtitle?: string;
    selected?: boolean;
    disabled?: boolean;
    onclick?: () => void;
    class?: string;
    
    // Slots
    icon?: Snippet;
    badges?: Snippet;
    end?: Snippet; // For right-aligned content like badges
  }

  let { 
    title,
    subtitle,
    selected = false,
    disabled = false,
    onclick,
    class: className,
    icon,
    badges,
    end
  }: Props = $props();
</script>

<button
  class={cn(
    "group relative flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "border-primary bg-primary/5 ring-1 ring-primary"
      : "border-muted bg-card shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/50",
    disabled && "opacity-50 cursor-not-allowed hover:bg-card hover:border-muted",
    className
  )}
  {onclick}
  {disabled}
  type="button"
>
  <!-- Icon Slot -->
  {#if icon}
    <div class="shrink-0 flex items-center justify-center">
      {@render icon()}
    </div>
  {/if}

  <!-- Content -->
  <div class="min-w-0 flex-1">
    <div class="flex items-center justify-between gap-2">
      <h4 class="truncate text-sm font-medium leading-none text-foreground">
        {title}
      </h4>
      {#if end}
        {@render end()}
      {/if}
    </div>
    
    {#if subtitle}
      <p class="mt-1 truncate text-xs text-muted-foreground">
        {subtitle}
      </p>
    {/if}
    
    {#if badges}
      <div class="mt-1.5 flex flex-wrap gap-1">
        {@render badges()}
      </div>
    {/if}
  </div>
</button>
