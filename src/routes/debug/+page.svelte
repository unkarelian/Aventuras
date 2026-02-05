<script lang="ts">
  import { onMount } from 'svelte';
  import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { type DebugLogEntry } from '$lib/stores/ui.svelte';
  import DebugLogView from '$lib/components/debug/DebugLogView.svelte';
  import { Button } from '$lib/components/ui/button';
  import { WrapText, Minimize2, Trash2 } from 'lucide-svelte';

  let logs = $state<DebugLogEntry[]>([]);
  let renderNewlines = $state(false);
  let unlistenLogs: UnlistenFn | null = null;
  let unlistenCleared: UnlistenFn | null = null;
  let unlistenInitial: UnlistenFn | null = null;
  let unlistenSettings: UnlistenFn | null = null;

  onMount(() => {
    console.log('[DebugWin] Mounted');
    
    // Setup listeners first
    const setupListeners = async () => {
      unlistenInitial = await listen('initial-debug-logs', (event) => {
        console.log('[DebugWin] Received initial-debug-logs', event.payload);
        const data = event.payload as { logs: DebugLogEntry[], renderNewlines: boolean };
        logs = data.logs;
        renderNewlines = data.renderNewlines;
      });

      unlistenLogs = await listen('debug-log-added', (event) => {
        console.log('[DebugWin] Received debug-log-added', (event.payload as DebugLogEntry).id);
        const entry = event.payload as DebugLogEntry;
        logs = [...logs, entry];
        if (logs.length > 100) {
          logs = logs.slice(-100);
        }
      });

      unlistenCleared = await listen('debug-logs-cleared', () => {
        console.log('[DebugWin] Received debug-logs-cleared');
        logs = [];
      });

      unlistenSettings = await listen('debug-render-newlines-changed', (event) => {
        console.log('[DebugWin] Received debug-render-newlines-changed', event.payload);
        renderNewlines = event.payload as boolean;
      });

      // After listeners are ready, request initial data
      console.log('[DebugWin] Emitting request-initial-debug-logs');
      await emit('request-initial-debug-logs');
    };

    setupListeners();

    return () => {
      console.log('[DebugWin] Unmounting');
      if (unlistenLogs) unlistenLogs();
      if (unlistenCleared) unlistenCleared();
      if (unlistenInitial) unlistenInitial();
      if (unlistenSettings) unlistenSettings();
    };
  });

  function handleClear() {
    console.log('[DebugWin] Requesting clear');
    emit('request-clear-debug-logs');
  }

  function handleToggleRenderNewlines() {
    console.log('[DebugWin] Requesting toggle render newlines');
    emit('request-toggle-debug-render-newlines');
  }

  function handlePopIn() {
    console.log('[DebugWin] Requesting pop-in');
    emit('pop-in-debug');
  }
</script>

<svelte:head>
  <title>API Debug Logs</title>
</svelte:head>

<div class="h-screen flex flex-col overflow-hidden bg-background">
  <!-- Window Header -->
  <div class="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
    <div class="flex items-center gap-3">
      <h1 class="text-lg font-semibold">API Debug Logs</h1>
      <span class="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">
        {logs.length}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        class={renderNewlines ? 'text-blue-400 hover:text-blue-500' : 'text-muted-foreground hover:text-foreground'}
        onclick={handleToggleRenderNewlines}
        title={renderNewlines ? 'Show escaped newlines (\\n)' : 'Render newlines as line breaks'}
      >
        <WrapText class="h-4 w-4" />
      </Button>
      
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground hover:text-red-400 hover:bg-red-900/10"
        onclick={handleClear}
        title="Clear all logs"
      >
        <Trash2 class="h-4 w-4" />
      </Button>

      <div class="w-px h-4 bg-border mx-1"></div>

      <Button
        variant="outline"
        size="sm"
        class="gap-2"
        onclick={handlePopIn}
      >
        <Minimize2 class="h-4 w-4" />
        Pop In
      </Button>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-hidden">
    <DebugLogView 
      {logs} 
      onClear={handleClear}
      {renderNewlines}
    />
  </div>
</div>
