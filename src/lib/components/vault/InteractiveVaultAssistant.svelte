<script lang="ts">
  import {
    InteractiveVaultService,
    type ChatMessage,
    type ToolCallDisplay,
    type VaultState,
  } from '$lib/services/ai/vault/InteractiveVaultService'
  import type { VaultPendingChange } from '$lib/services/ai/sdk/schemas/vault'
  import type { VaultConversation } from '$lib/types'
  import { database } from '$lib/services/database'
  import { settings } from '$lib/stores/settings.svelte'
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
  import { scenarioVault } from '$lib/stores/scenarioVault.svelte'
  import {
    ChevronLeft,
    Bot,
    MessageSquare,
    Send,
    Loader2,
    User,
    Brain,
    ChevronDown,
    ChevronUp,
    Wrench,
    AlertCircle,
    CheckCheck,
    Trash2,
    Plus,
    History,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Textarea } from '$lib/components/ui/textarea'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import VaultDiffView from './VaultDiffView.svelte'
  import VaultEntityEditPanel from './VaultEntityEditPanel.svelte'
  import { fade, slide } from 'svelte/transition'
  import { onMount, onDestroy, tick } from 'svelte'
  import * as Sheet from '$lib/components/ui/sheet'
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { parseMarkdown } from '$lib/utils/markdown'
  import { cn } from '$lib/utils/cn'
  import { isTouchDevice } from '$lib/utils/swipe'
  import { SvelteSet } from 'svelte/reactivity'

  interface Props {
    onClose: () => void
    onEditEntity?: (change: VaultPendingChange) => void
  }

  let { onClose, onEditEntity }: Props = $props()

  // Mobile detection
  let isMobile = $state(false)

  // Whether the entity editor panel is open
  let showEntityEditor = $state(false)

  // The change currently open in the entity editor (for edit-before-approve)
  let activeEditChange = $state<VaultPendingChange | null>(null)

  // Edited versions of pending changes — keys are change IDs
  const editedChanges = new Map<string, VaultPendingChange>()

  // AbortController for cancelling ongoing requests
  let abortController: AbortController | null = null

  // Service instance
  let service: InteractiveVaultService | null = $state(null)

  // UI State
  let messages = $state<ChatMessage[]>([])
  let inputValue = $state('')
  let isGenerating = $state(false)
  let error = $state<string | null>(null)
  let messagesContainer: HTMLDivElement
  let expandedReasoning = $state<Set<string>>(new Set())

  // Progress state
  let activeToolCalls = $state<ToolCallDisplay[]>([])
  let isThinking = $state(false)

  // Pending changes tracking — collects all pending changes across messages
  let allPendingChanges = $state<VaultPendingChange[]>([])

  // Conversation history selector
  let conversations = $state<VaultConversation[]>([])
  let conversationSelectorOpen = $state(false)
  const MAX_CONVERSATIONS = 10

  // Derived: only pending (not yet approved/rejected) changes
  const pendingCount = $derived(allPendingChanges.filter((c) => c.status === 'pending').length)

  // Derived: per-entity-type breakdown of pending changes
  const pendingBreakdown = $derived.by(() => {
    const pending = allPendingChanges.filter((c) => c.status === 'pending')
    const counts: Record<string, number> = {}
    for (const c of pending) {
      const label =
        c.entityType === 'character'
          ? 'character'
          : c.entityType === 'lorebook-entry'
            ? 'entry'
            : 'scenario'
      counts[label] = (counts[label] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ')
  })

  // Initialize service on mount
  onMount(() => {
    // Detect mobile viewport
    const mq = window.matchMedia('(max-width: 767px)')
    isMobile = mq.matches
    const mqHandler = (e: MediaQueryListEvent) => {
      isMobile = e.matches
    }
    mq.addEventListener('change', mqHandler)

    initializeService()
    loadConversationsList()

    return () => mq.removeEventListener('change', mqHandler)
  })

  // Clean up on unmount
  onDestroy(() => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  })

  function initializeService() {
    try {
      const presetId = settings.getServicePresetId('interactiveVault')
      service = new InteractiveVaultService(presetId)

      const allLorebooks = lorebookVault.items
      service.initialize({
        characterCount: characterVault.items.length,
        lorebookCount: allLorebooks.length,
        totalEntryCount: allLorebooks.reduce((sum, lb) => sum + lb.entries.length, 0),
        scenarioCount: scenarioVault.items.length,
      })

      messages = [
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            "Hello! I'm your Vault Assistant. I can help you manage characters, lorebooks, and scenarios in your vault.\n\nTry asking me to create a character, organize lorebook entries, or set up a new scenario.",
          timestamp: Date.now(),
          isGreeting: true,
        },
      ]
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to initialize AI service'
    }
  }

  async function loadConversationsList() {
    try {
      conversations = await database.listVaultConversations()
    } catch {
      // Non-critical — conversation selector just won't show history
    }
  }

  async function handleNewConversation() {
    if (!service) return
    // Auto-save current conversation before starting new one
    if (messages.some((m) => !m.isGreeting)) {
      await service.saveConversation().catch(() => {})
    }
    service.reset()
    allPendingChanges = []
    activeEditChange = null
    showEntityEditor = false
    initializeService()
    await loadConversationsList()
  }

  async function handleSwitchConversation(id: string) {
    if (!service) return
    // Auto-save current before switching
    if (messages.some((m) => !m.isGreeting)) {
      await service.saveConversation().catch(() => {})
    }
    const ok = await service.loadConversation(id)
    if (ok) {
      allPendingChanges = []
      activeEditChange = null
      showEntityEditor = false
      // Rebuild chat display from restored history
      const loaded = service.getChatMessages()
      messages =
        loaded.length > 0
          ? loaded
          : [
              {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: 'Conversation loaded. Continue where you left off!',
                timestamp: Date.now(),
                isGreeting: true,
              },
            ]
      await tick()
      scrollToBottom()
    }
    await loadConversationsList()
  }

  async function handleDeleteConversation(id: string) {
    try {
      await database.deleteVaultConversation(id)
      await loadConversationsList()
    } catch {
      // Ignore
    }
  }

  async function handleSend() {
    if (!inputValue.trim() || !service || isGenerating) return

    const userMessage = inputValue.trim()
    inputValue = ''
    error = null

    // Add user message to UI
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: Date.now(),
    }
    messages = [...messages, userMsg]

    await tick()
    scrollToBottom()

    isGenerating = true
    isThinking = true
    activeToolCalls = []

    abortController = new AbortController()

    try {
      const vaultState: VaultState = {
        characters: () => characterVault.items,
        lorebooks: () => lorebookVault.items,
        scenarios: () => scenarioVault.items,
      }

      for await (const event of service.sendMessageStreaming(
        userMessage,
        vaultState,
        abortController.signal,
      )) {
        switch (event.type) {
          case 'thinking':
            isThinking = true
            activeToolCalls = []
            break

          case 'tool_start':
            isThinking = false
            activeToolCalls = [
              ...activeToolCalls,
              {
                id: event.toolCallId,
                name: event.toolName,
                args: event.args,
                result: '...',
              },
            ]
            await tick()
            scrollToBottom()
            break

          case 'tool_end':
            activeToolCalls = activeToolCalls.map((tc) =>
              tc.id === event.toolCall.id ? event.toolCall : tc,
            )
            // Collect pending changes as they arrive
            if (event.toolCall.pendingChange) {
              allPendingChanges = [...allPendingChanges, event.toolCall.pendingChange]
              // Auto-open entity editor on desktop for the latest proposed change
              if (!isMobile) {
                activeEditChange = event.toolCall.pendingChange
                showEntityEditor = true
              }
            }
            await tick()
            scrollToBottom()
            break

          case 'message':
            messages = [...messages, event.message]
            activeToolCalls = []
            isThinking = true
            await tick()
            scrollToBottom()
            break

          case 'done':
            break

          case 'error':
            error = event.error
            const errorMsg: ChatMessage = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Sorry, I encountered an error: ${event.error}`,
              timestamp: Date.now(),
            }
            messages = [...messages, errorMsg]
            break
        }
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return
      }
      error = e instanceof Error ? e.message : 'Failed to get response'
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error}`,
        timestamp: Date.now(),
      }
      messages = [...messages, errorMsg]
    } finally {
      isGenerating = false
      isThinking = false
      activeToolCalls = []
      abortController = null
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const isMobile = isTouchDevice()
    const shouldSubmit = isMobile
      ? e.key === 'Enter' && e.shiftKey
      : e.key === 'Enter' && !e.shiftKey

    if (shouldSubmit) {
      e.preventDefault()
      handleSend()
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  }

  function toggleReasoning(messageId: string) {
    const newSet = new SvelteSet(expandedReasoning)
    if (newSet.has(messageId)) {
      newSet.delete(messageId)
    } else {
      newSet.add(messageId)
    }
    expandedReasoning = newSet
  }

  function formatToolCallName(name: string): string {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // --- Approval handlers ---

  async function handleApprove(change: VaultPendingChange) {
    if (!service || change.status !== 'pending') return
    try {
      const effectiveChange = editedChanges.get(change.id) ?? change
      await service.applyChange(effectiveChange)
      service.handleApproval(change, true)
      editedChanges.delete(change.id)
      if (activeEditChange?.id === change.id) {
        activeEditChange = null
        showEntityEditor = false
      }
      allPendingChanges = [...allPendingChanges]
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to apply change'
    }
  }

  function handleReject(change: VaultPendingChange) {
    if (!service || change.status !== 'pending') return
    service.handleApproval(change, false)
    editedChanges.delete(change.id)
    if (activeEditChange?.id === change.id) {
      activeEditChange = null
      showEntityEditor = false
    }
    allPendingChanges = [...allPendingChanges]
  }

  function handleEdit(change: VaultPendingChange) {
    if (change.status !== 'pending') return
    activeEditChange = change
    showEntityEditor = true
    onEditEntity?.(change)
  }

  /** Called by the entity editor when the user modifies proposed data before approving. */
  function handleEditUpdate(updatedChange: VaultPendingChange) {
    editedChanges.set(updatedChange.id, updatedChange)
  }

  async function handleApproveAll() {
    if (!service) return
    const pending = allPendingChanges.filter((c) => c.status === 'pending')
    for (const change of pending) {
      try {
        const effectiveChange = editedChanges.get(change.id) ?? change
        await service.applyChange(effectiveChange)
        service.handleApproval(change, true)
        editedChanges.delete(change.id)
      } catch (e) {
        error = e instanceof Error ? e.message : 'Failed to apply change'
        break
      }
    }
    activeEditChange = null
    showEntityEditor = false
    allPendingChanges = [...allPendingChanges]
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => !open && onClose()}>
  <ResponsiveModal.Content
    class={cn(
      'flex h-[90vh] w-full flex-col gap-0 overflow-hidden p-0',
      showEntityEditor && !isMobile ? 'max-w-6xl' : 'max-w-2xl',
    )}
  >
    <div class="flex flex-col overflow-hidden" style="height: 100%">
      <!-- Top Bar -->
      <div class="bg-muted/20 flex items-center justify-between border-b px-4 py-3">
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-foreground h-9 w-9"
            onclick={onClose}
            title="Back to Vault"
          >
            <ChevronLeft class="h-5 w-5" />
          </Button>
          <Bot class="text-accent-400 h-5 w-5" />
          <h2 class="text-lg font-semibold tracking-tight">Vault Assistant</h2>
        </div>
        {#if pendingCount > 0}
          <div in:fade={{ duration: 150 }}>
            <Button
              variant="outline"
              size="sm"
              class="gap-2 border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
              onclick={handleApproveAll}
              disabled={isGenerating}
            >
              <CheckCheck class="h-4 w-4" />
              Approve All
              <span
                class="rounded-full bg-green-500/20 px-1.5 py-0.5 text-xs font-semibold text-green-300"
              >
                {pendingBreakdown}
              </span>
            </Button>
          </div>
        {/if}
      </div>

      <!-- Two-panel layout -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Entity Editor Panel (left, desktop only) -->
        {#if showEntityEditor && activeEditChange && !isMobile}
          <div
            class="border-border flex flex-1 flex-col overflow-hidden border-r"
            transition:fade={{ duration: 100 }}
          >
            <VaultEntityEditPanel
              change={activeEditChange}
              onApprove={() => handleApprove(activeEditChange!)}
              onClose={() => {
                activeEditChange = null
                showEntityEditor = false
              }}
              onUpdate={handleEditUpdate}
            />
          </div>
        {/if}

        <!-- Chat Panel (right, or full-width on mobile) -->
        <div
          class="flex flex-col overflow-hidden {showEntityEditor && !isMobile
            ? 'w-full max-w-2xl shrink-0'
            : 'mx-auto w-full max-w-2xl'}"
        >
          <!-- Conversation selector -->
          <div class="bg-muted/10 flex items-center gap-2 border-b px-3 py-2">
            <DropdownMenu.Root bind:open={conversationSelectorOpen}>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="sm"
                    class="text-muted-foreground hover:text-foreground h-7 gap-1.5 px-2 text-xs"
                  >
                    <History class="h-3.5 w-3.5" />
                    {conversations.length > 0 ? 'Conversations' : 'No history'}
                    <ChevronDown class="h-3 w-3" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content class="w-72" align="start">
                <DropdownMenu.Item onclick={handleNewConversation} class="gap-2">
                  <Plus class="h-3.5 w-3.5" />
                  New Conversation
                </DropdownMenu.Item>
                {#if conversations.length > 0}
                  <DropdownMenu.Separator />
                  {#each conversations as conv, i (conv.id)}
                    <div class="group flex items-center">
                      <DropdownMenu.Item
                        class="min-w-0 flex-1 gap-2 pr-1"
                        onclick={() => handleSwitchConversation(conv.id)}
                      >
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-xs font-medium">{conv.title || 'Untitled'}</div>
                          <div class="text-muted-foreground text-[10px]">
                            {new Date(conv.updatedAt).toLocaleDateString()}
                            {#if i === conversations.length - 1 && conversations.length >= MAX_CONVERSATIONS}
                              <span class="text-muted-foreground/60 ml-1">· oldest</span>
                            {/if}
                          </div>
                        </div>
                      </DropdownMenu.Item>
                      <button
                        class="text-muted-foreground hover:text-destructive mr-1 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        onclick={(e) => {
                          e.stopPropagation()
                          handleDeleteConversation(conv.id)
                        }}
                        title="Delete conversation"
                      >
                        <Trash2 class="h-3 w-3" />
                      </button>
                    </div>
                  {/each}
                {/if}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </div>

          <!-- Messages -->
          <div class="flex-1 space-y-4 overflow-y-auto p-4" bind:this={messagesContainer}>
            {#if messages.length === 0 && !isGenerating}
              <!-- Empty state -->
              <div class="flex flex-1 flex-col items-center justify-center py-16">
                <MessageSquare class="text-muted-foreground/30 mb-4 h-12 w-12" />
                <p class="text-muted-foreground text-sm">
                  Send a message to start managing your vault
                </p>
              </div>
            {/if}

            {#each messages as message (message.id)}
              <div in:fade={{ duration: 150 }}>
                <div
                  class={cn(
                    'flex w-full',
                    message.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    class={cn(
                      'max-w-[90%] md:max-w-[85%]',
                      message.role === 'user' ? 'order-2' : 'order-1',
                    )}
                  >
                    <!-- Message bubble -->
                    <div
                      class={cn(
                        'rounded-lg p-3 text-sm',
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 border',
                      )}
                    >
                      <!-- Icon + content -->
                      <div class="flex items-start gap-2">
                        {#if message.role === 'assistant'}
                          <Bot class="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                        {:else}
                          <User class="mt-0.5 h-4 w-4 flex-shrink-0 opacity-80" />
                        {/if}
                        <div class="min-w-0 flex-1">
                          <div class="chat-markdown prose-content break-words">
                            {@html parseMarkdown(message.content)}
                          </div>
                        </div>
                      </div>

                      <!-- Reasoning (collapsible) -->
                      {#if message.role === 'assistant' && message.reasoning}
                        <div class="border-border/50 mt-2 border-t pt-2">
                          <button
                            class="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
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
                            <div
                              class="text-muted-foreground bg-muted/30 mt-2 rounded p-2 font-mono text-xs whitespace-pre-wrap"
                              in:slide
                            >
                              {message.reasoning}
                            </div>
                          {/if}
                        </div>
                      {/if}
                    </div>

                    <!-- Tool calls for this message -->
                    {#if message.toolCalls && message.toolCalls.length > 0}
                      <div class="mt-2 space-y-1">
                        {#each message.toolCalls as toolCall (toolCall.id)}
                          <div
                            class="bg-muted/30 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                          >
                            <Wrench class="text-muted-foreground h-3 w-3 flex-shrink-0" />
                            <span class="text-muted-foreground font-medium"
                              >{formatToolCallName(toolCall.name)}</span
                            >
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Timestamp -->
                    <div
                      class={cn(
                        'text-muted-foreground mt-1 text-xs',
                        message.role === 'user' ? 'text-right' : '',
                      )}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <!-- Inline diff cards for pending changes produced by this message -->
                {#if message.pendingChanges && message.pendingChanges.length > 0}
                  <div class="mt-3 space-y-2">
                    {#each message.pendingChanges as change (change.id)}
                      {@const liveChange =
                        allPendingChanges.find((c) => c.id === change.id) ?? change}
                      <VaultDiffView
                        change={liveChange}
                        onApprove={() => handleApprove(liveChange)}
                        onReject={() => handleReject(liveChange)}
                        onEdit={() => handleEdit(liveChange)}
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}

            <!-- Progress indicator -->
            {#if isGenerating}
              <div class="flex justify-start" in:fade>
                <div class="max-w-[90%] md:max-w-[85%]">
                  <div class="bg-muted/50 rounded-lg border p-3">
                    <div class="flex items-start gap-2">
                      <Bot class="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
                      <div class="min-w-0 flex-1">
                        {#if activeToolCalls.length > 0}
                          <div class="space-y-1">
                            {#each activeToolCalls as toolCall (toolCall.id)}
                              <div
                                class="bg-background flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                                in:fade
                              >
                                {#if toolCall.result === '...'}
                                  <Loader2
                                    class="text-primary h-3 w-3 flex-shrink-0 animate-spin"
                                  />
                                {:else}
                                  <Wrench class="text-muted-foreground h-3 w-3 flex-shrink-0" />
                                {/if}
                                <span class="font-medium">{formatToolCallName(toolCall.name)}</span>
                              </div>
                            {/each}
                          </div>
                        {:else if isThinking}
                          <div class="text-muted-foreground flex items-center gap-2 text-sm">
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
            <div class="bg-destructive/10 border-destructive/20 border-t px-4 py-2" in:slide>
              <div class="text-destructive flex items-center gap-2 text-sm">
                <AlertCircle class="h-4 w-4" />
                <span>{error}</span>
              </div>
            </div>
          {/if}

          <!-- Input area -->
          <div class="bg-muted/10 border-t p-4">
            <div class="flex items-end gap-2">
              <Textarea
                bind:value={inputValue}
                onkeydown={handleKeyDown}
                placeholder="Ask me to create characters, organize lorebooks, set up scenarios..."
                rows={2}
                class="min-h-[2.5rem] resize-none"
                disabled={isGenerating || !service}
              />
              <Button
                size="icon"
                class={cn('h-11 w-11 shrink-0', isGenerating && 'opacity-80')}
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
            <div class="text-muted-foreground mt-2 hidden text-center text-xs md:block">
              Press {isTouchDevice()
                ? 'Shift+Enter to send, Enter for new line'
                : 'Enter to send, Shift+Enter for new line'}
            </div>
          </div>
        </div>
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<!-- Mobile entity editor — bottom sheet -->
{#if isMobile && activeEditChange}
  <Sheet.Root
    open={showEntityEditor}
    onOpenChange={(open) => {
      if (!open) {
        activeEditChange = null
        showEntityEditor = false
      }
    }}
  >
    <Sheet.Content side="bottom" class="flex h-[85dvh] flex-col p-0">
      {#if activeEditChange}
        <VaultEntityEditPanel
          change={activeEditChange}
          onApprove={() => handleApprove(activeEditChange!)}
          onClose={() => {
            activeEditChange = null
            showEntityEditor = false
          }}
          onUpdate={handleEditUpdate}
        />
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}
