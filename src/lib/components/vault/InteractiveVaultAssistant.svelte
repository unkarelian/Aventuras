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
  import { vaultEditor } from '$lib/stores/vaultEditorStore.svelte'
  import {
    ChevronLeft,
    Bot,
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
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'

  interface Props {
    onClose: () => void
    onEditEntity?: (change: VaultPendingChange) => void
  }

  let { onClose, onEditEntity }: Props = $props()

  // Mobile detection
  const isMobile = createIsMobile()

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

  // In-flight pending changes (shown in chat before step message arrives)
  let streamingChanges = $state<VaultPendingChange[]>([])

  // Conversation history selector
  let conversations = $state<VaultConversation[]>([])
  let conversationSelectorOpen = $state(false)
  const MAX_CONVERSATIONS = 10

  // Initialize service on mount
  onMount(() => {
    initializeService()
    loadConversationsList()
  })

  // Clean up on unmount
  onDestroy(() => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    vaultEditor.reset()
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
    vaultEditor.reset()
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
      vaultEditor.reset()
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
    if (!service || isGenerating) return

    const userMessage = inputValue.trim()
    inputValue = ''
    error = null

    if (userMessage) {
      // Add user message to UI
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessage,
        timestamp: Date.now(),
      }
      messages = [...messages, userMsg]
    }
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
        get activeLorebookId() {
          return vaultEditor.currentLorebookId ?? undefined
        },
        get activeEntries() {
          const id = vaultEditor.currentLorebookId
          if (!id) return undefined
          return lorebookVault.getById(id)?.entries
        },
      }

      for await (const event of service.sendMessageStreaming(
        vaultState,
        userMessage,
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
            // Collect pending changes as they arrive (store handles dedup)
            if (event.toolCall.pendingChange) {
              const incoming = event.toolCall.pendingChange
              // Auto-approve lorebook creation (it's a prerequisite step)
              if (incoming.entityType === 'lorebook' && incoming.action === 'create' && service) {
                vaultEditor.addPendingChange(incoming)
                await handleApprove(incoming)
                // Open the newly created lorebook in the editor
                if (!isMobile.current) {
                  await tick()
                  vaultEditor.openEditor(incoming)
                }
              } else {
                vaultEditor.addPendingChange(incoming)
                // Auto-open entity editor on desktop (store handles same-lorebook skip)
                if (!isMobile.current) {
                  vaultEditor.openEditorSmart(incoming)
                }
              }
              // Track for immediate chat display
              streamingChanges = [...streamingChanges, incoming]
            }
            await tick()
            scrollToBottom()
            break

          case 'message': {
            // Clear streaming changes that are now attached to this message
            const msgChangeIds = new Set(event.message.pendingChanges?.map((c) => c.id) ?? [])
            streamingChanges = streamingChanges.filter((c) => !msgChangeIds.has(c.id))
            messages = [...messages, event.message]
            activeToolCalls = []
            isThinking = true
            await tick()
            scrollToBottom()
            break
          }

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
      streamingChanges = []
      abortController = null
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const isTouch = isTouchDevice()
    const shouldSubmit = isTouch
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

  // --- Approval handlers (delegated to store) ---

  async function handleApprove(change?: VaultPendingChange) {
    if (!service) return
    const target = change ?? vaultEditor.activeChange
    if (!target) return
    try {
      await vaultEditor.approve(target, service)
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to apply change'
    }
  }

  function handleReject(change: VaultPendingChange) {
    if (!service) return
    vaultEditor.reject(change, service)
  }

  function handleEdit(change: VaultPendingChange) {
    if (change.status !== 'pending') return
    vaultEditor.openEditor(change)
    onEditEntity?.(change)
  }

  async function handleApproveAll() {
    if (!service) return
    const err = await vaultEditor.approveAll(service)
    if (err) error = err
  }
</script>

<ResponsiveModal.Root open={true} onOpenChange={(open) => !open && onClose()}>
  <ResponsiveModal.Content
    class={cn(
      'flex h-[90vh] w-full flex-col gap-0 overflow-hidden p-0',
      vaultEditor.editorOpen && !isMobile.current ? 'max-w-[90vw]' : 'max-w-2xl',
    )}
  >
    <div class="flex flex-col overflow-hidden" style="height: 100%">
      <!-- Top Bar -->
      <div
        class="border-surface-700/60 bg-surface-900/80 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-sm"
      >
        <div class="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            class="text-surface-400 hover:text-foreground hover:bg-surface-700/50 h-8 w-8"
            onclick={onClose}
            title="Back to Vault"
          >
            <ChevronLeft class="h-4 w-4" />
          </Button>
          <div class="flex items-center gap-2">
            <div class="bg-accent-500/15 flex h-7 w-7 items-center justify-center rounded-lg">
              <Bot class="text-accent-400 h-4 w-4" />
            </div>
            <h2 class="text-surface-100 text-sm font-semibold tracking-tight">Vault Assistant</h2>
          </div>
        </div>
        {#if vaultEditor.pendingCount > 0}
          <div in:fade={{ duration: 150 }}>
            <Button
              variant="outline"
              size="sm"
              class="h-7 gap-1.5 border-emerald-500/30 bg-emerald-500/8 px-2.5 text-xs text-emerald-400 hover:bg-emerald-500/15"
              onclick={handleApproveAll}
              disabled={isGenerating}
            >
              <CheckCheck class="h-3.5 w-3.5" />
              Approve All
              <span
                class="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
              >
                {vaultEditor.pendingBreakdown}
              </span>
            </Button>
          </div>
        {/if}
      </div>

      <!-- Two-panel layout -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Entity Editor Panel (left, desktop only) -->
        {#if vaultEditor.editorOpen && vaultEditor.activeChange && !isMobile.current}
          <div
            class="border-surface-700/50 flex flex-1 flex-col overflow-hidden border-r"
            transition:fade={{ duration: 100 }}
          >
            <VaultEntityEditPanel
              change={vaultEditor.activeChange}
              onApprove={(specificChange) =>
                handleApprove(specificChange ?? vaultEditor.activeChange!)}
              onReject={(change) => handleReject(change)}
              onClose={() => vaultEditor.closeEditor()}
            />
          </div>
        {/if}

        <!-- Chat Panel (right, or full-width on mobile) -->
        <div
          class="flex flex-col overflow-hidden {vaultEditor.editorOpen && !isMobile.current
            ? 'w-full max-w-2xl shrink-0'
            : 'mx-auto w-full max-w-2xl'}"
        >
          <!-- Conversation selector -->
          <div
            class="border-surface-700/40 bg-surface-900/40 flex items-center gap-2 border-b px-3 py-1.5"
          >
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
          <div class="flex-1 space-y-3 overflow-y-auto px-4 py-3" bind:this={messagesContainer}>
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
                        'rounded-xl text-sm',
                        message.role === 'user'
                          ? 'bg-accent-600/90 px-3.5 py-2.5 text-white'
                          : 'bg-surface-800/60 border-surface-700/40 border px-3.5 py-2.5',
                      )}
                    >
                      <!-- Icon + content -->
                      <div class="flex items-start gap-2.5">
                        {#if message.role === 'assistant'}
                          <div
                            class="bg-accent-500/15 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                          >
                            <Bot class="text-accent-400 h-3 w-3" />
                          </div>
                        {:else}
                          <div
                            class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-white/10"
                          >
                            <User class="h-3 w-3 opacity-90" />
                          </div>
                        {/if}
                        <div class="min-w-0 flex-1">
                          <div class="chat-markdown prose-content break-words">
                            {@html parseMarkdown(message.content)}
                          </div>
                        </div>
                      </div>

                      <!-- Reasoning (collapsible) -->
                      {#if message.role === 'assistant' && message.reasoning}
                        <div class="border-surface-700/30 mt-2 border-t pt-2">
                          <button
                            class="text-surface-400 hover:text-surface-200 flex items-center gap-1.5 text-xs transition-colors"
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
                              class="bg-surface-900/60 text-surface-400 mt-2 rounded-lg p-2.5 font-mono text-xs whitespace-pre-wrap"
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
                      <div class="mt-1.5 space-y-1">
                        {#each message.toolCalls as toolCall (toolCall.id)}
                          <div
                            class="border-surface-700/30 bg-surface-800/30 flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs"
                          >
                            <Wrench class="text-surface-500 h-3 w-3 flex-shrink-0" />
                            <span class="text-surface-400 font-medium"
                              >{formatToolCallName(toolCall.name)}</span
                            >
                          </div>
                        {/each}
                      </div>
                    {/if}

                    <!-- Timestamp -->
                    <div
                      class={cn(
                        'text-surface-500 mt-1 px-1 text-[10px]',
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
                      {@const liveChange = vaultEditor.getLiveChange(change.id) ?? change}
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
                  <div
                    class="border-surface-700/40 bg-surface-800/60 rounded-xl border px-3.5 py-2.5"
                  >
                    <div class="flex items-start gap-2.5">
                      <div
                        class="bg-accent-500/15 mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                      >
                        <Bot class="text-accent-400 h-3 w-3" />
                      </div>
                      <div class="min-w-0 flex-1">
                        {#if activeToolCalls.length > 0}
                          <div class="space-y-1">
                            {#each activeToolCalls as toolCall (toolCall.id)}
                              <div
                                class="border-surface-700/30 bg-surface-900/40 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                                in:fade
                              >
                                {#if toolCall.result === '...'}
                                  <Loader2
                                    class="text-accent-400 h-3 w-3 flex-shrink-0 animate-spin"
                                  />
                                {:else}
                                  <Wrench class="text-surface-500 h-3 w-3 flex-shrink-0" />
                                {/if}
                                <span class="text-surface-300 font-medium"
                                  >{formatToolCallName(toolCall.name)}</span
                                >
                              </div>
                            {/each}
                          </div>
                        {:else if isThinking}
                          <div class="text-surface-400 flex items-center gap-2 text-sm">
                            <Loader2 class="text-accent-400 h-3.5 w-3.5 animate-spin" />
                            <span>Thinking...</span>
                          </div>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Streaming diff cards (shown before step message arrives) -->
              {#if streamingChanges.length > 0}
                <div class="mt-3 space-y-2">
                  {#each streamingChanges as change (change.id)}
                    {@const liveChange = vaultEditor.getLiveChange(change.id) ?? change}
                    <VaultDiffView
                      change={liveChange}
                      onApprove={() => handleApprove(liveChange)}
                      onReject={() => handleReject(liveChange)}
                      onEdit={() => handleEdit(liveChange)}
                    />
                  {/each}
                </div>
              {/if}
            {/if}
          </div>

          <!-- Error display -->
          {#if error}
            <div class="border-t border-red-500/20 bg-red-500/8 px-4 py-2" in:slide>
              <div class="flex items-center gap-2 text-xs text-red-400">
                <AlertCircle class="h-3.5 w-3.5" />
                <span>{error}</span>
              </div>
            </div>
          {/if}

          <!-- Input area -->
          <div class="border-surface-700/40 bg-surface-900/30 border-t p-3">
            <div class="flex items-end gap-2">
              <Textarea
                bind:value={inputValue}
                onkeydown={handleKeyDown}
                placeholder="Ask me to create characters, organize lorebooks, set up scenarios..."
                rows={2}
                class="border-surface-700/50 bg-surface-800/50 placeholder:text-surface-500 min-h-[2.5rem] resize-none rounded-xl text-sm"
                disabled={isGenerating || !service}
              />
              <Button
                size="icon"
                class={cn(
                  'h-10 w-10 shrink-0 rounded-xl',
                  isGenerating ? 'opacity-70' : 'bg-accent-600 hover:bg-accent-500',
                )}
                onclick={handleSend}
                disabled={!inputValue.trim() || isGenerating || !service}
                title="Send message"
              >
                {#if isGenerating}
                  <Loader2 class="h-5 w-5 animate-spin" />
                {:else}
                  <Send class="h-5 w-5" />
                {/if}
              </Button>
            </div>
            <div class="text-surface-500 mt-1.5 hidden text-center text-[10px] md:block">
              {isTouchDevice()
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
{#if isMobile.current && vaultEditor.activeChange}
  <Sheet.Root
    open={vaultEditor.editorOpen}
    onOpenChange={(open) => {
      if (!open) vaultEditor.closeEditor()
    }}
  >
    <Sheet.Content side="bottom" class="flex h-[85dvh] flex-col p-0">
      {#if vaultEditor.activeChange}
        <VaultEntityEditPanel
          change={vaultEditor.activeChange}
          onApprove={(specificChange) => handleApprove(specificChange ?? vaultEditor.activeChange!)}
          onReject={(change) => handleReject(change)}
          onClose={() => vaultEditor.closeEditor()}
        />
      {/if}
    </Sheet.Content>
  </Sheet.Root>
{/if}
