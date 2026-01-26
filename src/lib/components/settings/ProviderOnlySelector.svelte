<script lang="ts">
  import type { ProviderInfo } from '$lib/services/ai/types';
  import { Button } from "$lib/components/ui/button";
  import * as Command from "$lib/components/ui/command";
  import * as Popover from "$lib/components/ui/popover";
  import { Badge } from "$lib/components/ui/badge";
  import { Check, ChevronsUpDown, X } from "lucide-svelte";
  import { cn } from "$lib/utils/cn";

  interface Props {
    providers: ProviderInfo[];
    selected: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
    label?: string;
  }

  let {
    providers,
    selected,
    onChange,
    disabled = false,
    label = 'Provider Only',
  }: Props = $props();

  let open = $state(false);
  let value = $state("");

  function toggleProvider(slug: string) {
    const set = new Set(selected);
    if (set.has(slug)) {
      set.delete(slug);
    } else {
      set.add(slug);
    }
    onChange([...set]);
  }

  function clearSelection() {
    onChange([]);
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{label}</span>
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={open}
        class="w-full justify-between"
        {...props}
        disabled={disabled}
      >
        <span class="truncate">
        {#if selected.length === 0}
          Select providers...
        {:else if selected.length < 3}
          {selected.map(s => providers.find(p => p.slug === s)?.name || s).join(', ')}
        {:else}
          {selected.length} selected
        {/if}
        </span>
        <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-[280px] p-0">
      <Command.Root>
        <Command.Input placeholder="Search providers..." />
        <Command.List>
          <Command.Empty>No provider found.</Command.Empty>
          <Command.Group>
            {#each providers as provider}
              <Command.Item
                value={provider.name}
                onSelect={() => toggleProvider(provider.slug)}
              >
                <Check
                  class={cn(
                    "mr-2 h-4 w-4",
                    selected.includes(provider.slug) ? "opacity-100" : "opacity-0"
                  )}
                />
                {provider.name}
                <span class="ml-auto text-xs text-muted-foreground">{provider.slug}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>
  {#if selected.length > 0}
    <div class="flex flex-wrap gap-2 mt-1">
      {#each selected as s}
        <Badge variant="secondary" class="gap-1 pr-1">
          {providers.find(p => p.slug === s)?.name || s}
          <button
             onclick={() => toggleProvider(s)}
             class="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
             disabled={disabled}
          >
             <X class="h-3 w-3 text-muted-foreground hover:text-foreground" />
             <span class="sr-only">Remove</span>
          </button>
        </Badge>
      {/each}
      <Button variant="ghost" size="sm" onclick={clearSelection} class="h-6 text-xs px-2" disabled={disabled}>Clear all</Button>
    </div>
  {/if}
</div>
