<script lang="ts">
  import type { VaultLorebook, VaultLorebookEntry } from '$lib/types';
  import {
    InteractiveLorebookService,
    type PendingChange,
    type ChatMessage,
    type ToolCallDisplay,
    type StreamEvent
  } from '$lib/services/ai/lorebook/InteractiveLorebookService';
  import { OpenAIProvider } from '$lib/services/ai/core/OpenAIProvider';
  import { settings } from '$lib/stores/settings.svelte';
  import DiffView from './DiffView.svelte';
  import {
    X, Send, Loader2, Bot, User, ChevronDown, ChevronUp,
    CheckCheck, AlertCircle, Brain, Wrench
  } from 'lucide-svelte';
  import { fade, slide } from 'svelte/transition';
  import { onMount, onDestroy, tick } from 'svelte';
  import { parseMarkdown } from '$lib/utils/markdown';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { cn } from '$lib/utils/cn';
  import { isTouchDevice } from '$lib/utils/swipe';

  // AbortController for cancelling ongoing requests
  let abortController: AbortController | null = null;

  interface Props {
    lorebookName: string;
    entries: VaultLorebookEntry[];
    onEntriesChange: (entries: VaultLorebookEntry[]) => void;
    onClose: () => void;
    onSave: () => Promise<void>;
  }

  let { lorebookName, entries, onEntriesChange, onClose, onSave }: Props = $props();

  // Service instance
  let service: InteractiveLorebookService | null = $state(null);

  // UI State
  let messages = $state<ChatMessage[]>([]);
  let pendingChanges = $state<PendingChange[]>([]);
  let inputValue = $state('');
  let isGenerating = $state(false);
  let error = $state<string | null>(null);
  let messagesContainer: HTMLDivElement;
  let expandedReasoning = $state<Set<string>>(new Set());

  // Progress state
  let activeToolCalls = $state<ToolCallDisplay[]>([]);
  let isThinking = $state(false);

  // Derived: count of pending changes awaiting approval
  const pendingCount = $derived(pendingChanges.filter(c => c.status === 'pending').length);

  // Initialize service on mount
  onMount(() => {
    initializeService();
  });

  // Clean up on unmount - cancel any ongoing requests
  onDestroy(() => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  });

  function initializeService() {
    try {
      const presetId = settings.getServicePresetId('interactiveLorebook');
      const preset = settings.getPresetConfig(presetId, 'Interactive Lorebook');
      const apiSettings = settings.getApiSettingsForProfile(preset.profileId);

      if (!apiSettings.openaiApiKey) {
        error = 'No API key configured. Please set up an API key in settings.';
        return;
      }

      const provider = new OpenAIProvider(apiSettings);
      service = new InteractiveLorebookService(provider, presetId);
      service.initialize(lorebookName || 'New Lorebook', entries.length);

      // Add initial greeting message (display-only, not sent to API)
      messages = [{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Hello! I'm here to help you create and organize entries for "${lorebookName || 'your new lorebook'}". You can describe characters, locations, items, or any other lore elements you'd like to add, and I'll help you structure them as lorebook entries.\n\nWhat would you like to create?`,
        timestamp: Date.now(),
        isGreeting: true,
      }];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to initialize AI service';
    }
  }

  async function handleSend() {
    if (!inputValue.trim() || !service || isGenerating) return;

    const userMessage = inputValue.trim();
    inputValue = '';
    error = null;

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    };
    messages = [...messages, userMsg];

    // Scroll to bottom
    await tick();
    scrollToBottom();

    isGenerating = true;
    isThinking = true;
    activeToolCalls = [];

    // Create new AbortController for this request
    abortController = new AbortController();

    try {
      // Use async version with progress events
      for await (const event of service.sendMessageStreaming(userMessage, entries, abortController.signal)) {
        switch (event.type) {
          case 'thinking':
            isThinking = true;
            activeToolCalls = [];
            break;

          case 'tool_start':
            isThinking = false;
            // Add placeholder tool call to show it's in progress (use actual ID for matching with tool_end)
            activeToolCalls = [...activeToolCalls, {
              id: event.toolCallId,
              name: event.toolName,
              args: event.args,
              result: '...',
            }];
            await tick();
            scrollToBottom();
            break;

          case 'tool_end':
            // Update the tool call with the result (match by ID to handle multiple calls with same name)
            activeToolCalls = activeToolCalls.map(tc =>
              tc.id === event.toolCall.id
                ? event.toolCall
                : tc
            );
            await tick();
            scrollToBottom();
            break;

          case 'message':
            // Intermediate message from an iteration with tool calls
            messages = [...messages, event.message];

            // Add pending changes to the tracking list
            if (event.message.pendingChanges && event.message.pendingChanges.length > 0) {
              pendingChanges = [...pendingChanges, ...event.message.pendingChanges];
            }

            // Reset state for next iteration
            activeToolCalls = [];
            isThinking = true;

            await tick();
            scrollToBottom();
            break;

          case 'done':
            // Create final assistant message
            const assistantMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: event.result.response,
              timestamp: Date.now(),
              pendingChanges: event.result.pendingChanges,
              toolCalls: event.result.toolCalls,
              reasoning: event.result.reasoning,
            };

            messages = [...messages, assistantMsg];

            // Add new pending changes to the list
            if (event.result.pendingChanges.length > 0) {
              pendingChanges = [...pendingChanges, ...event.result.pendingChanges];
            }
            break;

          case 'error':
            error = event.error;
            const errorMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Sorry, I encountered an error: ${event.error}`,
              timestamp: Date.now(),
            };
            messages = [...messages, errorMsg];
            break;
        }
      }
    } catch (e) {
      // Ignore abort errors (user cancelled or component unmounted)
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }

      error = e instanceof Error ? e.message : 'Failed to get response';

      // Add error message
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error}`,
        timestamp: Date.now(),
      };
      messages = [...messages, errorMsg];
    } finally {
      isGenerating = false;
      isThinking = false;
      activeToolCalls = [];
      abortController = null;
    }
  }

  async function handleApprove(change: PendingChange) {
    // Apply the change to entries
    const newEntries = service!.applyChange(change, entries);
    onEntriesChange(newEntries);

    // Update change status in pendingChanges state
    pendingChanges = pendingChanges.map(c => c.id === change.id ? { ...c, status: 'approved' as const } : c);

    // Update the change within messages to trigger reactivity
    messages = messages.map(msg => {
      if (msg.pendingChanges && msg.pendingChanges.some(c => c.id === change.id)) {
        return {
          ...msg,
          pendingChanges: msg.pendingChanges.map(c =>
            c.id === change.id ? { ...c, status: 'approved' as const } : c
          )
        };
      }
      return msg;
    });

    // Notify service
    service!.handleApproval(change, true);

    // Auto-save the lorebook
    try {
      await onSave();
    } catch (e) {
      console.error('Failed to auto-save lorebook:', e);
    }
  }

  function handleReject(change: PendingChange) {
    // Update change status in pendingChanges state
    pendingChanges = pendingChanges.map(c => c.id === change.id ? { ...c, status: 'rejected' as const } : c);

    // Update the change within messages to trigger reactivity
    messages = messages.map(msg => {
      if (msg.pendingChanges && msg.pendingChanges.some(c => c.id === change.id)) {
        return {
          ...msg,
          pendingChanges: msg.pendingChanges.map(c =>
            c.id === change.id ? { ...c, status: 'rejected' as const } : c
          )
        };
      }
      return msg;
    });

    // Notify service
    service!.handleApproval(change, false, 'User declined the change');
  }

  async function handleApproveAll() {
    const pendingList = pendingChanges.filter(c => c.status === 'pending');
    const pendingIds = new Set(pendingList.map(c => c.id));
    let currentEntries = entries;

    // Sort changes to apply safely:
    // 1. Deletes and merges must be applied from highest index to lowest to prevent index shifting
    // 2. Creates go last (they append to end, no index issues)
    // 3. Updates can go in any order (they modify in place)
    const sortedChanges = [...pendingList].sort((a, b) => {
      // Creates go last
      if (a.type === 'create' && b.type !== 'create') return 1;
      if (b.type === 'create' && a.type !== 'create') return -1;

      // For deletes and merges, sort by highest index first
      if (a.type === 'delete' || a.type === 'merge') {
        const aMaxIndex = a.type === 'merge' ? Math.max(...(a.indices ?? [0])) : (a.index ?? 0);
        const bMaxIndex = b.type === 'merge' ? Math.max(...(b.indices ?? [0])) : (b.index ?? 0);
        return bMaxIndex - aMaxIndex; // Descending order
      }

      return 0;
    });

    for (const change of sortedChanges) {
      currentEntries = service!.applyChange(change, currentEntries);
      service!.handleApproval(change, true);
    }

    onEntriesChange(currentEntries);

    // Update pendingChanges state
    pendingChanges = pendingChanges.map(c =>
      pendingIds.has(c.id) ? { ...c, status: 'approved' as const } : c
    );

    // Also update the changes within messages to trigger reactivity
    messages = messages.map(msg => {
      if (msg.pendingChanges && msg.pendingChanges.some(c => pendingIds.has(c.id))) {
        return {
          ...msg,
          pendingChanges: msg.pendingChanges.map(c =>
            pendingIds.has(c.id) ? { ...c, status: 'approved' as const } : c
          )
        };
      }
      return msg;
    });

    // Auto-save the lorebook
    try {
      await onSave();
    } catch (e) {
      console.error('Failed to auto-save lorebook:', e);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const isMobile = isTouchDevice();
    
    // On mobile: Enter = new line, Shift+Enter = send
    // On desktop: Enter = send, Shift+Enter = new line
    const shouldSubmit = isMobile 
      ? (e.key === 'Enter' && e.shiftKey)
      : (e.key === 'Enter' && !e.shiftKey);
    
    if (shouldSubmit) {
      e.preventDefault();
      handleSend();
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function toggleReasoning(messageId: string) {
    const newSet = new Set(expandedReasoning);
    if (newSet.has(messageId)) {
      newSet.delete(messageId);
    } else {
      newSet.add(messageId);
    }
    expandedReasoning = newSet;
  }

  function formatReasoning(msg: ChatMessage): string | null {
    return msg.reasoning ?? null;
  }

  function formatToolCallName(name: string): string {
    // Convert snake_case to Title Case
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
</script>

<div
  class="flex flex-col h-full w-full bg-background border-l-0 md:border-l border-border"
  in:slide={{ axis: 'x', duration: 200 }}
>
  <!-- Approve All Banner -->
  {#if pendingCount >= 2}
    <div class="px-4 py-2 bg-primary/10 border-b border-primary/20" in:slide>
      <Button
        variant="ghost"
        class="w-full justify-center text-primary hover:text-primary hover:bg-primary/10 gap-2 h-auto py-2"
        onclick={handleApproveAll}
      >
        <CheckCheck class="h-4 w-4" />
        Approve All ({pendingCount} changes)
      </Button>
    </div>
  {/if}

  <!-- Messages -->
  <div
    class="flex-1 overflow-y-auto p-4 space-y-4"
    bind:this={messagesContainer}
  >
    {#each messages as message (message.id)}
      <div
        class={cn(
          "flex w-full",
          message.role === 'user' ? 'justify-end' : 'justify-start'
        )}
        in:fade={{ duration: 150 }}
      >
        <div class={cn(
          "max-w-[90%] md:max-w-[85%]",
          message.role === 'user' ? 'order-2' : 'order-1'
        )}>
          <!-- Message bubble -->
          <div
            class={cn(
              "rounded-lg p-3 text-sm",
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 border'
            )}
          >
            <!-- Icon -->
            <div class="flex items-start gap-2">
              {#if message.role === 'assistant'}
                <Bot class="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
              {:else}
                <User class="h-4 w-4 mt-0.5 flex-shrink-0 opacity-80" />
              {/if}
              <div class="flex-1 min-w-0">
                <div class="chat-markdown prose-content break-words">{@html parseMarkdown(message.content)}</div>
              </div>
            </div>

            <!-- Reasoning (collapsible) -->
            {#if message.role === 'assistant' && formatReasoning(message)}
              {@const reasoning = formatReasoning(message)}
              <div class="mt-2 pt-2 border-t border-border/50">
                <button
                  class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onclick={() => toggleReasoning(message.id)}
                >
                  <Brain class="h-3 w-3" />
                  <span>Reasoning</span>
                  {#if expandedReasoning.has(message.id)}
                    <ChevronUp class="h-3 w-3" />
                  {:else}
                    <ChevronDown class="h-3 w-3" />
                  {/if}
                </button>
                {#if expandedReasoning.has(message.id)}
                  <div class="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/30 p-2 rounded" in:slide>
                    {reasoning}
                  </div>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Tool calls for this message -->
          {#if message.toolCalls && message.toolCalls.length > 0}
            <div class="mt-2 space-y-1">
              {#each message.toolCalls as toolCall (toolCall.id)}
                <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 text-xs border">
                  <Wrench class="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span class="font-medium text-muted-foreground">{formatToolCallName(toolCall.name)}</span>
                  {#if toolCall.args && Object.keys(toolCall.args).length > 0}
                    <span class="text-muted-foreground/70">
                      {#if toolCall.name === 'list_entries' && toolCall.args.type}
                        (type: {toolCall.args.type})
                      {:else if toolCall.name === 'get_entry' && toolCall.args.index !== undefined}
                        (index: {toolCall.args.index})
                      {:else if toolCall.name === 'create_entry' && toolCall.args.name}
                        ({toolCall.args.name})
                      {:else if toolCall.name === 'update_entry' && toolCall.args.index !== undefined}
                        (index: {toolCall.args.index})
                      {:else if toolCall.name === 'delete_entry' && toolCall.args.index !== undefined}
                        (index: {toolCall.args.index})
                      {:else if toolCall.name === 'merge_entries' && toolCall.args.merged_name}
                        ({toolCall.args.merged_name})
                      {/if}
                    </span>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Pending changes for this message -->
          {#if message.pendingChanges && message.pendingChanges.length > 0}
            <div class="mt-3 space-y-2">
              {#each message.pendingChanges as change (change.id)}
                {#if change.status === 'pending'}
                  <DiffView
                    {change}
                    onApprove={() => handleApprove(change)}
                    onReject={() => handleReject(change)}
                  />
                {:else}
                  <!-- Approved/Rejected indicator -->
                  <div
                    class={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-md text-sm border",
                      change.status === 'approved'
                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                        : 'bg-destructive/10 text-destructive border-destructive/20'
                    )}
                    in:fade
                  >
                    {#if change.status === 'approved'}
                      <CheckCheck class="h-4 w-4" />
                      <span>Change approved</span>
                    {:else}
                      <X class="h-4 w-4" />
                      <span>Change rejected</span>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}

          <!-- Timestamp -->
          <div class={cn(
            "mt-1 text-xs text-muted-foreground",
            message.role === 'user' ? 'text-right' : ''
          )}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    {/each}

    <!-- Progress indicator -->
    {#if isGenerating}
      <div class="flex justify-start" in:fade>
        <div class="max-w-[90%] md:max-w-[85%]">
          <div class="bg-muted/50 border rounded-lg p-3">
            <div class="flex items-start gap-2">
              <Bot class="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <!-- Active tool calls -->
                {#if activeToolCalls.length > 0}
                  <div class="space-y-1">
                    {#each activeToolCalls as toolCall (toolCall.id)}
                      <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-background text-xs border" in:fade>
                        {#if toolCall.result === '...'}
                          <Loader2 class="h-3 w-3 text-primary animate-spin flex-shrink-0" />
                        {:else}
                          <Wrench class="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        {/if}
                        <span class="font-medium">{formatToolCallName(toolCall.name)}</span>
                        {#if toolCall.args && Object.keys(toolCall.args).length > 0}
                          <span class="text-muted-foreground">
                            {#if toolCall.name === 'create_entry' && toolCall.args.name}
                              ({toolCall.args.name})
                            {:else if toolCall.name === 'list_entries' && toolCall.args.type}
                              (type: {toolCall.args.type})
                            {:else if toolCall.args.index !== undefined}
                              (index: {toolCall.args.index})
                            {/if}
                          </span>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else if isThinking}
                  <div class="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    <span>Thinking...</span>
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Error display -->
  {#if error}
    <div class="px-4 py-2 bg-destructive/10 border-t border-destructive/20" in:slide>
      <div class="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle class="h-4 w-4" />
        <span>{error}</span>
      </div>
    </div>
  {/if}

  <!-- Input area -->
  <div class="p-4 border-t bg-muted/10 pb-safe">
    <div class="flex items-end gap-2">
      <Textarea
        bind:value={inputValue}
        onkeydown={handleKeyDown}
        placeholder="Describe what you'd like to add..."
        rows={2}
        class="min-h-[2.5rem] resize-none"
        disabled={isGenerating || !service}
      />
      <Button
        size="icon"
        class={cn("h-11 w-11 shrink-0", isGenerating && "opacity-80")}
        onclick={handleSend}
        disabled={!inputValue.trim() || isGenerating || !service}
        title="Send message"
      >
        {#if isGenerating}
          <Loader2 class="h-6 w-6 animate-spin" />
        {:else}
          <Send class="h-6 w-6" />
        {/if}
      </Button>
    </div>
    <div class="mt-2 text-xs text-muted-foreground hidden md:block text-center">
       Press {isTouchDevice() ? 'Shift+Enter to send, Enter for new line' : 'Enter to send, Shift+Enter for new line'}
    </div>
  </div>
</div>
