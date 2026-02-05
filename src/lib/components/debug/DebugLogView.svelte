<script lang="ts">
  import { type DebugLogEntry } from '$lib/stores/ui.svelte';
  import { ArrowUpCircle, ArrowDownCircle, Copy, Check, Filter, CirclePlus, Trash2, WrapText } from 'lucide-svelte';
  import { Button } from "$lib/components/ui/button";
  import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates';
  import * as Popover from "$lib/components/ui/popover";
  import * as Command from "$lib/components/ui/command";
  import * as Select from "$lib/components/ui/select";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import { cn } from "$lib/utils/cn.js";

  interface Props {
    logs: DebugLogEntry[];
    onClear?: () => void;
    renderNewlines: boolean;
    onToggleRenderNewlines?: () => void;
  }

  let { logs, onClear, renderNewlines, onToggleRenderNewlines }: Props = $props();

  let copiedId = $state<string | null>(null);
  let selectedCategories = $state<string[]>([]);
  let scrollContainer: HTMLDivElement | null = $state(null);
  let savedScrollTop = 0;
  let savedScrollHeight = 0;

  // Pagination
  let currentPage = $state(1);
  let pageSize = $state(20);

  $effect(() => {
    // Reset to page 1 when filters change, logs are cleared, or page size changes
    void selectedCategories;
    void logs;
    void pageSize;
    currentPage = 1;
  });

  function formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  function formatDuration(duration: number | undefined): string {
    if (duration === undefined) return '';
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  }

  const jsonCache = new Map<string, string>();

  function formatJson(entry: DebugLogEntry): string {
    const cacheKey = `${entry.id}-${renderNewlines}`;
    const cached = jsonCache.get(cacheKey);
    if (cached) return cached;

    try {
      let json = JSON.stringify(entry.data, null, 2);
      if (renderNewlines) {
        json = json.replace(/\\n/g, '\n');
      }
      if (jsonCache.size > 200) {
        const firstKey = jsonCache.keys().next().value;
        if (firstKey) jsonCache.delete(firstKey);
      }
      jsonCache.set(cacheKey, json);
      return json;
    } catch {
      return String(entry.data);
    }
  }

  async function copyToClipboard(entry: DebugLogEntry) {
    try {
      const text = formatJson(entry);
      await navigator.clipboard.writeText(text);
      copiedId = entry.id;
      setTimeout(() => {
        if (copiedId === entry.id) copiedId = null;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  let categories = $derived.by(() => {
    const templateIds = new Set(PROMPT_TEMPLATES.map(t => t.id));
    const logServiceNames = new Set(logs.map(l => l.serviceName));
    const all = new Set([...templateIds, ...logServiceNames]);
    return Array.from(all).sort();
  });

  let groupedLogs = $derived.by(() => {
    let currentLogs = logs;
    
    if (selectedCategories.length > 0) {
      currentLogs = currentLogs.filter(l => selectedCategories.includes(l.serviceName));
    }

    const groups: { request?: DebugLogEntry; response?: DebugLogEntry }[] = [];
    const requestMap = new Map<string, number>();

    for (const log of currentLogs) {
      if (log.type === 'request') {
        groups.push({ request: log });
        requestMap.set(log.id, groups.length - 1);
      } else {
        const requestId = log.id.replace('-response', '');
        const groupIndex = requestMap.get(requestId);
        if (groupIndex !== undefined) {
          groups[groupIndex].response = log;
        } else {
          groups.push({ response: log });
        }
      }
    }

    return groups.reverse();
  });

  let totalPages = $derived(Math.ceil(groupedLogs.length / pageSize) || 1);
  
  let pagedLogs = $derived.by(() => {
    const start = (currentPage - 1) * pageSize;
    return groupedLogs.slice(start, start + pageSize);
  });

  // Scroll management
  $effect.pre(() => {
    void groupedLogs;
    if (scrollContainer) {
      savedScrollTop = scrollContainer.scrollTop;
      savedScrollHeight = scrollContainer.scrollHeight;
    }
  });

  $effect(() => {
    void groupedLogs;
    if (scrollContainer && savedScrollHeight > 0) {
      const heightDiff = scrollContainer.scrollHeight - savedScrollHeight;
      scrollContainer.scrollTop = savedScrollTop + heightDiff;
    }
  });
</script>

<div class="flex flex-col h-full overflow-hidden bg-background">
  <!-- Toolbar -->
  <div class="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
    <div class="flex items-center gap-2">
      <Filter class="h-3.5 w-3.5 text-muted-foreground" />
      <Popover.Root>
        <Popover.Trigger asChild>
          {#snippet children({ builder })}
            <Button
              variant="outline"
              size="sm"
              class="h-8 border-dashed bg-muted/20 gap-2"
              builders={[builder]}
            >
              <CirclePlus class="h-4 w-4 opacity-50" />
              <span class="text-xs">Services</span>
              {#if selectedCategories.length > 0}
                <Separator orientation="vertical" class="mx-1 h-4" />
                <Badge
                  variant="secondary"
                  class="rounded-sm px-1 font-normal lg:hidden"
                >
                  {selectedCategories.length}
                </Badge>
                <div class="hidden space-x-1 lg:flex">
                  {#if selectedCategories.length > 2}
                    <Badge
                      variant="secondary"
                      class="rounded-sm px-1 font-normal"
                    >
                      {selectedCategories.length} selected
                    </Badge>
                  {:else}
                    {#each selectedCategories as cat}
                      <Badge
                        variant="secondary"
                        class="rounded-sm px-1 font-normal"
                      >
                        {cat}
                      </Badge>
                    {/each}
                  {/if}
                </div>
              {/if}
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-[240px] p-0" align="start">
          <Command.Root>
            <Command.Input placeholder="Filter services..." />
            <Command.List>
              <Command.Empty>No service found.</Command.Empty>
              <Command.Group>
                {#each categories as cat}
                  {@const isSelected = selectedCategories.includes(cat)}
                  <Command.Item
                    value={cat}
                    onSelect={() => {
                      if (isSelected) {
                        selectedCategories = selectedCategories.filter(c => c !== cat);
                      } else {
                        selectedCategories = [...selectedCategories, cat];
                      }
                    }}
                  >
                    <div
                      class={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check class="h-4 w-4" />
                    </div>
                    <span class="text-xs">{cat}</span>
                  </Command.Item>
                {/each}
              </Command.Group>
              {#if selectedCategories.length > 0}
                <Command.Separator />
                <Command.Group>
                  <Command.Item
                    onSelect={() => (selectedCategories = [])}
                    class="justify-center text-center text-xs text-red-400 hover:text-red-300"
                  >
                    Clear filters
                  </Command.Item>
                </Command.Group>
              {/if}
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>
    </div>

    <div class="flex items-center gap-2">
      {#if onToggleRenderNewlines}
        <Button
          variant="ghost"
          size="icon"
          class={renderNewlines ? 'text-blue-400 hover:text-blue-500' : 'text-muted-foreground hover:text-foreground'}
          onclick={onToggleRenderNewlines}
          title={renderNewlines ? 'Show escaped newlines (\\n)' : 'Render newlines as line breaks'}
        >
          <WrapText class="h-4 w-4" />
        </Button>
      {/if}

      {#if onClear}
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-900/10"
          onclick={onClear}
          title="Clear all logs"
        >
          <Trash2 class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Logs Area -->
  <div class="flex-1 overflow-y-auto px-6 py-4" bind:this={scrollContainer}>
    {#if pagedLogs.length === 0}
      <div class="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
         <p>No API requests matching the current filter.</p>
      </div>
    {:else}
      <div class="space-y-4 pb-4">
        {#each pagedLogs as group}
          <div class="border border-border rounded-lg overflow-hidden bg-card">
            <!-- Request -->
            {#if group.request}
              <div class="bg-muted/30">
                <div class="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div class="flex items-center gap-2">
                    <ArrowUpCircle class="h-4 w-4 text-blue-400" />
                    <span class="text-sm font-medium text-blue-400">Request</span>
                    <span class="text-xs text-muted-foreground">{group.request.serviceName}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(group.request.timestamp)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onclick={() => copyToClipboard(group.request!)}
                      title="Copy JSON"
                    >
                      {#if copiedId === group.request.id}
                        <Check class="h-3.5 w-3.5 text-green-400" />
                      {:else}
                        <Copy class="h-3.5 w-3.5" />
                      {/if}
                    </Button>
                  </div>
                </div>
                <pre class="p-3 text-xs text-muted-foreground overflow-x-auto max-h-[500px] overflow-y-auto font-mono whitespace-pre-wrap bg-primary-foreground/5">{formatJson(group.request)}</pre>
              </div>
            {/if}

            <!-- Response -->
            {#if group.response}
              <div class="bg-muted/10">
                <div class="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div class="flex items-center gap-2">
                    <span class={group.response.error ? 'text-red-400' : 'text-green-400'}>
                      <ArrowDownCircle class="h-4 w-4" />
                    </span>
                    <span class="text-sm font-medium {group.response.error ? 'text-red-400' : 'text-green-400'}">
                      {group.response.error ? 'Error' : 'Response'}
                    </span>
                    {#if group.response.duration}
                      <span class="text-xs px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
                        {formatDuration(group.response.duration)}
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-muted-foreground font-mono">
                      {formatTimestamp(group.response.timestamp)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onclick={() => copyToClipboard(group.response!)}
                      title="Copy JSON"
                    >
                      {#if copiedId === group.response.id}
                        <Check class="h-3.5 w-3.5 text-green-400" />
                      {:else}
                        <Copy class="h-3.5 w-3.5" />
                      {/if}
                    </Button>
                  </div>
                </div>
                <pre 
                  class="p-3 text-xs overflow-x-auto max-h-[500px] overflow-y-auto font-mono whitespace-pre-wrap bg-primary-foreground/5" 
                  class:text-muted-foreground={!group.response.error} 
                  class:text-red-300={group.response.error}
                >{formatJson(group.response)}</pre>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Pagination Controls -->
  <div class="flex items-center justify-between px-6 py-2 border-t border-border bg-card/50">
    <div class="flex items-center gap-4">
      <div class="text-xs text-muted-foreground whitespace-nowrap">
        {#if groupedLogs.length > 0}
          Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, groupedLogs.length)} of {groupedLogs.length}
        {:else}
          No entries
        {/if}
      </div>
      
      <div class="flex items-center gap-2">
        <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Size</span>
        <Select.Root 
          type="single" 
          value={String(pageSize)} 
          onValueChange={(v) => { if (v) pageSize = Number(v); }}
        >
          <Select.Trigger class="h-7 w-16 text-xs bg-muted/20 border-border">
            {pageSize}
          </Select.Trigger>
          <Select.Content class="min-w-16">
            <Select.Item value="10" label="10" class="text-xs">10</Select.Item>
            <Select.Item value="20" label="20" class="text-xs">20</Select.Item>
            <Select.Item value="50" label="50" class="text-xs">50</Select.Item>
            <Select.Item value="100" label="100" class="text-xs">100</Select.Item>
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2 text-xs"
        disabled={currentPage === 1}
        onclick={() => {
          currentPage--;
          scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        Previous
      </Button>
      <div class="text-xs font-medium px-2 min-w-[80px] text-center">
        Page {currentPage} of {totalPages}
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 px-2 text-xs"
        disabled={currentPage === totalPages}
        onclick={() => {
          currentPage++;
          scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      >
        Next
      </Button>
    </div>
  </div>
</div>
