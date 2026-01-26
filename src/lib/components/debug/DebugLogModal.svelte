<script lang="ts">
  import { ui, type DebugLogEntry } from '$lib/stores/ui.svelte';
  import { ArrowUpCircle, ArrowDownCircle, Trash2, Copy, Check, WrapText } from 'lucide-svelte';
  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  
  let copiedId = $state<string | null>(null);
  let renderNewlines = $state(false);
  let scrollContainer: HTMLDivElement | null = $state(null);
  let savedScrollTop = 0;
  let savedScrollHeight = 0;

  // Throttled snapshot of logs - only updates every 500ms when modal is open
  let throttledLogs = $state<DebugLogEntry[]>([]);
  let lastUpdateTime = 0;
  let pendingUpdate: ReturnType<typeof setTimeout> | null = null;

  // Update throttled logs when modal opens or logs change (throttled)
  $effect(() => {
    if (!ui.debugModalOpen) {
      // Clear pending updates when modal closes
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      return;
    }

    const logs = ui.debugLogs;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;

    // If enough time has passed, update immediately
    if (timeSinceLastUpdate >= 500) {
      throttledLogs = [...logs];
      lastUpdateTime = now;
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
    } else if (!pendingUpdate) {
      // Schedule an update for later
      pendingUpdate = setTimeout(() => {
        throttledLogs = [...ui.debugLogs];
        lastUpdateTime = Date.now();
        pendingUpdate = null;
      }, 500 - timeSinceLastUpdate);
    }
  });

  // Sync immediately when modal opens
  $effect(() => {
    if (ui.debugModalOpen) {
      throttledLogs = [...ui.debugLogs];
      lastUpdateTime = Date.now();
    }
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

  // Cache for formatted JSON to avoid re-computing on every render
  const jsonCache = new Map<string, string>();

  function formatJson(entry: DebugLogEntry): string {
    // Create cache key from entry id and renderNewlines setting
    const cacheKey = `${entry.id}-${renderNewlines}`;
    const cached = jsonCache.get(cacheKey);
    if (cached) return cached;

    try {
      let json = JSON.stringify(entry.data, null, 2);
      if (renderNewlines) {
        json = json.replace(/\\n/g, '\n');
      }
      // Limit cache size
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

  function handleClearLogs() {
    ui.clearDebugLogs();
    jsonCache.clear();
  }

  // Group logs by request/response pairs - only compute when modal is open
  let groupedLogs = $derived.by(() => {
    if (!ui.debugModalOpen) return [];

    const logs = throttledLogs;
    const groups: { request?: DebugLogEntry; response?: DebugLogEntry }[] = [];
    const requestMap = new Map<string, number>();

    for (const log of logs) {
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

  // Save scroll position before DOM updates
  $effect.pre(() => {
    if (!ui.debugModalOpen) return;
    void groupedLogs;
    if (scrollContainer) {
      savedScrollTop = scrollContainer.scrollTop;
      savedScrollHeight = scrollContainer.scrollHeight;
    }
  });

  // Restore scroll position after DOM updates
  $effect(() => {
    if (!ui.debugModalOpen) return;
    void groupedLogs;
    if (scrollContainer && savedScrollHeight > 0) {
      const heightDiff = scrollContainer.scrollHeight - savedScrollHeight;
      scrollContainer.scrollTop = savedScrollTop + heightDiff;
    }
  });
</script>

<ResponsiveModal.Root bind:open={ui.debugModalOpen}>
  <ResponsiveModal.Content class="sm:max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-6 py-4 border-b border-border">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-2">
          <ResponsiveModal.Title>API Debug Logs</ResponsiveModal.Title>
          <span class="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
            {ui.debugLogs.length} entries
          </span>
        </div>
        <!-- Close button is automatically rendered by Dialog.Content/Drawer.Content -->
      </div>
      <ResponsiveModal.Description class="sr-only">
        Logs of API requests and responses
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 overflow-y-auto px-6 py-4" bind:this={scrollContainer}>
      {#if groupedLogs.length === 0}
        <div class="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
           <p>No API requests logged yet.</p>
           <p>Make a request while debug mode is enabled to see logs here.</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each groupedLogs as group}
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
                  <pre class="p-3 text-xs text-muted-foreground overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap bg-muted/20">{formatJson(group.request)}</pre>
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
                    class="p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap bg-muted/20" 
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

    <ResponsiveModal.Footer class="px-6 py-3 border-t border-border bg-muted/10 mt-auto flex flex-row items-center sm:justify-between justify-between">
      <p class="text-xs text-muted-foreground text-left">
        Logs are stored in memory only and will be cleared when you close the app.
      </p>
      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          class={renderNewlines ? 'text-blue-400 hover:text-blue-500' : 'text-muted-foreground hover:text-foreground'}
          onclick={() => renderNewlines = !renderNewlines}
          title={renderNewlines ? 'Show escaped newlines (\\n)' : 'Render newlines as line breaks'}
        >
          <WrapText class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="text-muted-foreground hover:text-red-400 hover:bg-red-900/10"
          onclick={handleClearLogs}
          title="Clear all logs"
        >
          <Trash2 class="h-4 w-4" />
        </Button>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
