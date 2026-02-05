<script lang="ts">
  import { ui, type DebugLogEntry } from '$lib/stores/ui.svelte';
  import { Trash2, WrapText, ExternalLink, RefreshCcw } from 'lucide-svelte';
  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import DebugLogView from './DebugLogView.svelte';
  
  let scrollContainer: HTMLDivElement | null = $state(null);
  let savedScrollTop = 0;
  let savedScrollHeight = 0;

  // Throttled snapshot of logs - only updates every 500ms when modal is open
  let throttledLogs = $state<DebugLogEntry[]>([]);
  let lastUpdateTime = 0;
  let pendingUpdate: ReturnType<typeof setTimeout> | null = null;

  // Update throttled logs when modal opens or logs change (throttled)
  $effect(() => {
    if (!ui.debugModalOpen || ui.debugWindowActive) {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
      return;
    }

    const logs = ui.debugLogs;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;

    if (timeSinceLastUpdate >= 500) {
      throttledLogs = [...logs];
      lastUpdateTime = now;
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
        pendingUpdate = null;
      }
    } else if (!pendingUpdate) {
      pendingUpdate = setTimeout(() => {
        throttledLogs = [...ui.debugLogs];
        lastUpdateTime = Date.now();
        pendingUpdate = null;
      }, 500 - timeSinceLastUpdate);
    }
  });

  // Sync immediately when modal opens
  $effect(() => {
    if (ui.debugModalOpen && !ui.debugWindowActive) {
      throttledLogs = [...ui.debugLogs];
      lastUpdateTime = Date.now();
    }
  });

  function handleClearLogs() {
    ui.clearDebugLogs();
  }

  async function handlePopOut() {
    await ui.popOutDebug();
  }

  async function handlePopIn() {
    await ui.popInDebug();
  }
</script>

<ResponsiveModal.Root bind:open={ui.debugModalOpen}>
  <ResponsiveModal.Content class="sm:max-w-4xl max-h-[85vh] h-[85vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-6 py-4 border-b border-border">
      <div class="flex items-center justify-between w-full">
        <div class="flex items-center gap-4 flex-1">
          <div class="flex items-center gap-2">
            <ResponsiveModal.Title>API Debug Logs</ResponsiveModal.Title>
            <span class="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
              {ui.debugLogs.length}
            </span>
          </div>

          {#if !ui.debugWindowActive}
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-muted-foreground hover:text-foreground hidden md:inline-flex"
              onclick={handlePopOut}
              title="Pop out to separate window"
            >
              <ExternalLink class="h-4 w-4" />
            </Button>
          {/if}
        </div>
      </div>
      <ResponsiveModal.Description class="sr-only">
        Logs of API requests and responses
      </ResponsiveModal.Description>
    </ResponsiveModal.Header>

    <div class="flex-1 overflow-hidden flex flex-col">
      {#if ui.debugWindowActive}
        <div class="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div class="p-4 rounded-full bg-blue-500/10 text-blue-400">
            <ExternalLink class="h-8 w-8" />
          </div>
          <div class="space-y-2">
            <h3 class="text-lg font-medium">Logs are in an external window</h3>
            <p class="text-sm text-muted-foreground max-w-sm">
              The debug logs are currently being displayed in a separate window for your convenience.
            </p>
          </div>
          <Button variant="outline" class="gap-2" onclick={handlePopIn}>
            <RefreshCcw class="h-4 w-4" />
            Bring Back to Modal
          </Button>
        </div>
      {:else}
        <DebugLogView 
          logs={throttledLogs} 
          onClear={handleClearLogs}
          renderNewlines={ui.debugRenderNewlines}
          onToggleRenderNewlines={() => ui.toggleDebugRenderNewlines()}
        />
      {/if}
    </div>

    <ResponsiveModal.Footer class="px-6 py-3 border-t border-border bg-muted/10 mt-auto">
      <p class="text-xs text-muted-foreground text-center md:text-left w-full">
        Logs are stored in memory only.
      </p>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
