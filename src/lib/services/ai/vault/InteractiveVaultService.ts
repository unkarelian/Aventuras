/**
 * Interactive Vault Service
 *
 * Provides an interactive chat interface for managing all vault entity types
 * (characters, lorebooks, scenarios) with cross-entity workflows.
 * Uses the Vercel AI SDK streamText with tools for real-time responses.
 */

import type { VaultCharacter, VaultLorebook, VaultLorebookEntry, VaultScenario } from '$lib/types'
import type { ModelMessage, ToolModelMessage, TextPart, ToolCallPart } from 'ai'
import { settings } from '$lib/stores/settings.svelte'
import { characterVault } from '$lib/stores/characterVault.svelte'
import { lorebookVault } from '$lib/stores/lorebookVault.svelte'
import { scenarioVault } from '$lib/stores/scenarioVault.svelte'
import { createLogger } from '../core/config'
import { FandomService } from '../../fandom'
import { resolveAgentConfig, stopWhenDone } from '../sdk/agents'
import {
  createCharacterTools,
  createScenarioTools,
  createLorebookTools,
  createLorebookBrowsingTools,
  createVaultLinkingTools,
  createFandomTools,
  type CharacterToolContext,
  type ScenarioToolContext,
  type LorebookToolContext,
  type FandomToolContext,
} from '../sdk/tools'
import type { VaultPendingChange } from '../sdk/schemas/vault'
import { promptService } from '$lib/services/prompts'
import { streamText } from 'ai'
import { database } from '$lib/services/database'
import { ui } from '$lib/stores/ui.svelte'

const log = createLogger('InteractiveVault')

// ============================================================================
// Types
// ============================================================================

/** Live vault state provided to each message */
export interface VaultState {
  characters: () => VaultCharacter[]
  lorebooks: () => VaultLorebook[]
  scenarios: () => VaultScenario[]
  /** Current lorebook entries for entry-level tools (optional, scoped to active lorebook) */
  activeLorebookId?: string
  activeEntries?: VaultLorebookEntry[]
}

/** Summary data for initializing the system prompt */
export interface VaultSummary {
  characterCount: number
  lorebookCount: number
  totalEntryCount: number
  scenarioCount: number
}

/** Stream events for progress updates */
export type StreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: ToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: ChatMessage }
  | { type: 'done'; result: SendMessageResult }
  | { type: 'error'; error: string }

/** Tool call info for display in chat */
export interface ToolCallDisplay {
  id: string
  name: string
  args: Record<string, unknown>
  result: string
  pendingChange?: VaultPendingChange
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  pendingChanges?: VaultPendingChange[]
  toolCalls?: ToolCallDisplay[]
  reasoning?: string
  isGreeting?: boolean
}

export interface SendMessageResult {
  response: string
  pendingChanges: VaultPendingChange[]
  toolCalls: ToolCallDisplay[]
  reasoning?: string
}

// ============================================================================
// Service
// ============================================================================

/**
 * Service that provides interactive vault management via chat.
 * Composes all vault tool sets and handles streaming AI conversation.
 */
export class InteractiveVaultService {
  private initialized: boolean = false
  private presetId: string
  private fandomService: FandomService
  private conversationHistory: ModelMessage[] = []
  private systemPrompt: string = ''
  private conversationId: string | null = null

  constructor(presetId: string) {
    this.presetId = presetId
    this.fandomService = new FandomService()
  }

  /**
   * Get the preset configuration.
   */
  private get preset() {
    return settings.getPresetConfig(this.presetId)
  }

  /**
   * Initialize the conversation with vault summary data.
   */
  initialize(vaultSummary: VaultSummary): void {
    this.conversationHistory = []

    this.systemPrompt = promptService.renderPrompt(
      'interactive-vault',
      {
        mode: 'adventure',
        pov: 'second',
        tense: 'present',
        protagonistName: '',
      },
      {
        characterCount: vaultSummary.characterCount,
        lorebookCount: vaultSummary.lorebookCount,
        totalEntryCount: vaultSummary.totalEntryCount,
        scenarioCount: vaultSummary.scenarioCount,
      },
    )

    this.initialized = true
    log('Initialized conversation', { ...vaultSummary, model: this.preset.model })
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Send a user message and stream AI responses.
   * Composes all vault tool sets for the AI to use.
   */
  async *sendMessageStreaming(
    userMessage: string,
    vaultState: VaultState,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    if (!this.initialized) {
      yield { type: 'error', error: 'Service not initialized. Call initialize() first.' }
      return
    }

    // Track state for this message
    const pendingChanges: VaultPendingChange[] = []
    const toolCalls: ToolCallDisplay[] = []
    let responseContent = ''
    let reasoning: string | undefined
    let changeIdCounter = 0

    const generateId = () => `iv-${++changeIdCounter}-${Date.now()}`
    const onPendingChange = (change: VaultPendingChange) => {
      pendingChanges.push(change)
    }

    // --- Compose all tool sets ---

    // Character tools
    const characterContext: CharacterToolContext = {
      characters: vaultState.characters,
      onPendingChange,
      generateId,
    }
    const characterTools = createCharacterTools(characterContext)

    // Scenario tools
    const scenarioContext: ScenarioToolContext = {
      scenarios: vaultState.scenarios,
      onPendingChange,
      generateId,
    }
    const scenarioTools = createScenarioTools(scenarioContext)

    // Lorebook browsing tools (vault-level)
    const browsingTools = createLorebookBrowsingTools({
      lorebooks: vaultState.lorebooks,
    })

    // Lorebook entry-level tools (scoped to active lorebook if provided)
    let lorebookTools: ReturnType<typeof createLorebookTools> | undefined
    if (vaultState.activeEntries) {
      const lorebookContext: LorebookToolContext = {
        entries: vaultState.activeEntries,
        onPendingChange: (change) => {
          // Wrap legacy PendingChangeSchema into VaultPendingChange
          const lorebookId = vaultState.activeLorebookId ?? 'unknown'
          const vaultChange: VaultPendingChange = (() => {
            switch (change.type) {
              case 'create':
                return {
                  id: change.id,
                  toolCallId: change.toolCallId,
                  entityType: 'lorebook-entry' as const,
                  action: 'create' as const,
                  lorebookId,
                  data: change.entry!,
                  status: change.status,
                }
              case 'update':
                return {
                  id: change.id,
                  toolCallId: change.toolCallId,
                  entityType: 'lorebook-entry' as const,
                  action: 'update' as const,
                  lorebookId,
                  entryIndex: change.index!,
                  data: change.updates!,
                  previous: change.previous,
                  status: change.status,
                }
              case 'delete':
                return {
                  id: change.id,
                  toolCallId: change.toolCallId,
                  entityType: 'lorebook-entry' as const,
                  action: 'delete' as const,
                  lorebookId,
                  entryIndex: change.index!,
                  previous: change.previous,
                  status: change.status,
                }
              case 'merge':
                return {
                  id: change.id,
                  toolCallId: change.toolCallId,
                  entityType: 'lorebook-entry' as const,
                  action: 'merge' as const,
                  lorebookId,
                  entryIndices: change.indices!,
                  data: change.entry!,
                  previousEntries: change.previousEntries,
                  status: change.status,
                }
            }
          })()
          pendingChanges.push(vaultChange)
        },
        generateId,
      }
      lorebookTools = createLorebookTools(lorebookContext)
    }

    // Vault linking tools
    const vaultLinkingTools = createVaultLinkingTools({
      characters: vaultState.characters,
      lorebooks: vaultState.lorebooks,
      onPendingChange,
      generateId,
    })

    // Fandom tools
    const fandomContext: FandomToolContext = {
      fandomService: this.fandomService,
    }
    const fandomTools = createFandomTools(fandomContext)

    // Combine all tools
    const tools: Record<string, unknown> = {
      ...characterTools,
      ...scenarioTools,
      ...browsingTools,
      ...(lorebookTools ?? {}),
      ...vaultLinkingTools,
      ...fandomTools,
    }

    // Strip finish_lore_management — it's for the autonomous service only
    delete tools['finish_lore_management']

    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    })

    // Resolve agent config
    const debugId = crypto.randomUUID()
    const startTime = Date.now()
    const { model, providerOptions, preset } = resolveAgentConfig(
      this.presetId,
      'interactive-vault',
      debugId,
    )

    try {
      const result = streamText({
        model,
        system: this.systemPrompt,
        messages: this.conversationHistory,
        tools: tools as Parameters<typeof streamText>[0]['tools'],
        temperature: preset.temperature,
        maxOutputTokens: preset.maxTokens,
        providerOptions,
        abortSignal: signal,
        stopWhen: stopWhenDone(50),
        onFinish: (result) => {
          ui.addDebugResponse(
            debugId,
            'interactive-vault',
            {
              text: result.text,
              toolCalls: result.toolCalls?.map((tc) => ({
                name: tc.toolName,
                args: tc.input,
              })),
              usage: result.usage,
            },
            startTime,
          )
        },
      })

      // Track tool calls for the current step
      const currentToolCalls: Map<string, { name: string; args: Record<string, unknown> }> =
        new Map()

      // Track per-step content
      let stepContent = ''
      let stepToolCalls: ToolCallDisplay[] = []
      let stepReasoning: string | undefined

      // Process the stream
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'start-step':
            stepContent = ''
            stepToolCalls = []
            stepReasoning = undefined
            currentToolCalls.clear()
            break

          case 'finish-step':
            if (stepContent || stepToolCalls.length > 0) {
              responseContent += (responseContent && stepContent ? '\n\n' : '') + stepContent
              toolCalls.push(...stepToolCalls)
              if (stepReasoning) {
                reasoning = (reasoning ? reasoning + '\n\n' : '') + stepReasoning
              }

              const stepMessage: ChatMessage = {
                id: `msg-step-${Date.now()}`,
                role: 'assistant',
                content: stepContent,
                timestamp: Date.now(),
                pendingChanges: pendingChanges.filter((pc) =>
                  stepToolCalls.some((tc) => tc.pendingChange?.id === pc.id),
                ),
                toolCalls: stepToolCalls.length > 0 ? [...stepToolCalls] : undefined,
                reasoning: stepReasoning,
              }
              yield { type: 'message', message: stepMessage }
            }
            break

          case 'reasoning-start':
          case 'reasoning-delta':
            if (event.type === 'reasoning-delta') {
              stepReasoning = (stepReasoning || '') + event.text
            }
            yield { type: 'thinking' }
            break

          case 'text-delta':
            stepContent += event.text
            break

          case 'tool-call':
            currentToolCalls.set(event.toolCallId, {
              name: event.toolName,
              args: event.input as Record<string, unknown>,
            })
            yield {
              type: 'tool_start',
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.input as Record<string, unknown>,
            }
            break

          case 'tool-result': {
            const toolInfo = currentToolCalls.get(event.toolCallId)
            const toolResult = 'result' in event ? event.result : event.output
            if (toolInfo) {
              const toolCallDisplay: ToolCallDisplay = {
                id: event.toolCallId,
                name: toolInfo.name,
                args: toolInfo.args,
                result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              }

              // Check if this tool call created a pending change
              const latestChange = pendingChanges[pendingChanges.length - 1]
              if (latestChange && latestChange.toolCallId.startsWith('iv-')) {
                toolCallDisplay.pendingChange = latestChange
              }

              stepToolCalls.push(toolCallDisplay)
              yield { type: 'tool_end', toolCall: toolCallDisplay }
            }
            break
          }

          case 'error':
            yield { type: 'error', error: String(event.error) }
            return
        }
      }

      // Add assistant response to conversation history
      if (responseContent || toolCalls.length > 0) {
        const assistantMessage: ModelMessage = {
          role: 'assistant',
          content: this.buildAssistantContent(responseContent, toolCalls),
        }
        this.conversationHistory.push(assistantMessage)

        if (toolCalls.length > 0) {
          const toolResultMessage: ToolModelMessage = {
            role: 'tool',
            content: toolCalls.map((tc) => ({
              type: 'tool-result' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              output: { type: 'text' as const, value: tc.result },
            })),
          }
          this.conversationHistory.push(toolResultMessage)
        }
      }

      // Auto-save conversation after AI response completes
      try {
        await this.saveConversation()
      } catch (saveError) {
        log('Auto-save failed', { error: saveError })
      }

      yield {
        type: 'done',
        result: {
          response: responseContent,
          pendingChanges,
          toolCalls,
          reasoning,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log('Error in sendMessageStreaming', { error: errorMessage })
      yield { type: 'error', error: errorMessage }
    }
  }

  /**
   * Build assistant message content with text and tool calls.
   */
  private buildAssistantContent(
    text: string,
    toolCalls: ToolCallDisplay[],
  ): Array<TextPart | ToolCallPart> {
    const content: Array<TextPart | ToolCallPart> = []

    if (text) {
      content.push({ type: 'text', text })
    }

    for (const tc of toolCalls) {
      content.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.args,
      })
    }

    return content.length > 0 ? content : [{ type: 'text', text: '' }]
  }

  /**
   * Handle approval or rejection of a pending change.
   * Adds a system note to conversation history.
   */
  handleApproval(change: VaultPendingChange, approved: boolean, rejectionReason?: string): void {
    // Mutate the change status
    ;(change as { status: string }).status = approved ? 'approved' : 'rejected'
    log('Handled approval', { changeId: change.id, approved, rejectionReason })

    // Extract a display name from the change
    const displayName = this.getChangeDisplayName(change)

    const note = approved
      ? `[System: User approved the ${change.action} operation for ${change.entityType} "${displayName}"]`
      : `[System: User rejected the ${change.action} operation for ${change.entityType}${rejectionReason ? `: ${rejectionReason}` : ''}]`

    this.conversationHistory.push({
      role: 'user',
      content: note,
    })
  }

  /**
   * Apply a pending change to the vault.
   * Routes by entityType to the appropriate vault store.
   */
  async applyChange(change: VaultPendingChange): Promise<void> {
    switch (change.entityType) {
      case 'character':
        await this.applyCharacterChange(change)
        break
      case 'lorebook-entry':
        await this.applyLorebookEntryChange(change)
        break
      case 'scenario':
        await this.applyScenarioChange(change)
        break
    }
  }

  /**
   * Apply a character change to the character vault store.
   */
  private async applyCharacterChange(
    change: Extract<VaultPendingChange, { entityType: 'character' }>,
  ): Promise<void> {
    switch (change.action) {
      case 'create':
        await characterVault.add({
          name: change.data.name,
          description: change.data.description,
          traits: change.data.traits,
          visualDescriptors: change.data.visualDescriptors,
          portrait: change.data.portrait ?? null,
          tags: change.data.tags,
          favorite: change.data.favorite ?? false,
          source: 'manual',
          originalStoryId: null,
          metadata: null,
        })
        break
      case 'update':
        await characterVault.update(change.entityId, change.data)
        break
      case 'delete':
        await characterVault.delete(change.entityId)
        break
    }
  }

  /**
   * Apply a lorebook entry change to the lorebook vault store.
   * Modifies the entries array and calls lorebookVault.update().
   */
  private async applyLorebookEntryChange(
    change: Extract<VaultPendingChange, { entityType: 'lorebook-entry' }>,
  ): Promise<void> {
    const lorebook = lorebookVault.getById(change.lorebookId)
    if (!lorebook) {
      log('Lorebook not found for entry change', { lorebookId: change.lorebookId })
      return
    }

    const entries = [...lorebook.entries]

    switch (change.action) {
      case 'create':
        entries.push(change.data)
        break
      case 'update':
        if (change.entryIndex >= 0 && change.entryIndex < entries.length) {
          entries[change.entryIndex] = { ...entries[change.entryIndex], ...change.data }
        }
        break
      case 'delete':
        if (change.entryIndex >= 0 && change.entryIndex < entries.length) {
          entries.splice(change.entryIndex, 1)
        }
        break
      case 'merge':
        if (change.entryIndices) {
          // Remove source entries in reverse order to preserve indices
          const sortedIndices = [...change.entryIndices].sort((a, b) => b - a)
          for (const index of sortedIndices) {
            if (index >= 0 && index < entries.length) {
              entries.splice(index, 1)
            }
          }
          // Add merged entry
          entries.push(change.data)
        }
        break
    }

    await lorebookVault.update(change.lorebookId, { entries })
  }

  /**
   * Apply a scenario change to the scenario vault store.
   */
  private async applyScenarioChange(
    change: Extract<VaultPendingChange, { entityType: 'scenario' }>,
  ): Promise<void> {
    switch (change.action) {
      case 'create':
        await scenarioVault.add({
          name: change.data.name,
          description: change.data.description,
          settingSeed: change.data.settingSeed,
          npcs: change.data.npcs,
          primaryCharacterName: change.data.primaryCharacterName,
          firstMessage: change.data.firstMessage ?? null,
          alternateGreetings: change.data.alternateGreetings ?? [],
          tags: change.data.tags,
          favorite: change.data.favorite ?? false,
          source: 'manual',
          originalFilename: null,
          metadata: null,
        })
        break
      case 'update':
        await scenarioVault.update(change.entityId, change.data)
        break
      case 'delete':
        await scenarioVault.delete(change.entityId)
        break
    }
  }

  /**
   * Extract a display name from a pending change for system notes.
   */
  private getChangeDisplayName(change: VaultPendingChange): string {
    if ('data' in change && change.data && 'name' in change.data) {
      return (change.data as { name?: string }).name ?? 'unknown'
    }
    if ('previous' in change && change.previous && 'name' in change.previous) {
      return (change.previous as { name?: string }).name ?? 'unknown'
    }
    return 'unknown'
  }

  /**
   * Save the current conversation to the database.
   * Creates a new conversation if none exists, otherwise updates the existing one.
   */
  async saveConversation(): Promise<string> {
    const messagesJson = JSON.stringify(this.conversationHistory)

    if (this.conversationId) {
      await database.saveVaultConversation(this.conversationId, {
        messages: messagesJson,
      })
      log('Saved conversation', { id: this.conversationId })
      return this.conversationId
    }

    // Create new conversation with auto-generated title
    const id = `vc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const title = this.generateTitle()
    const now = new Date().toISOString()

    await database.createVaultConversation({
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: messagesJson,
    })

    this.conversationId = id
    log('Created conversation', { id, title })
    return id
  }

  /**
   * Load a conversation from the database and restore its history.
   */
  async loadConversation(conversationId: string): Promise<boolean> {
    const conversation = await database.loadVaultConversation(conversationId)
    if (!conversation) {
      log('Conversation not found', { conversationId })
      return false
    }

    try {
      this.conversationHistory = JSON.parse(conversation.messages) as ModelMessage[]
      this.conversationId = conversationId
      log('Loaded conversation', {
        id: conversationId,
        messageCount: this.conversationHistory.length,
      })
      return true
    } catch (error) {
      log('Failed to parse conversation messages', { conversationId, error })
      return false
    }
  }

  /**
   * Get the current conversation ID.
   */
  getConversationId(): string | null {
    return this.conversationId
  }

  /**
   * Auto-generate a conversation title from the first user message.
   * Truncates to ~50 characters at a word boundary.
   */
  private generateTitle(): string {
    const firstUserMessage = this.conversationHistory.find((m) => m.role === 'user')
    if (!firstUserMessage) return 'New Conversation'

    const content =
      typeof firstUserMessage.content === 'string'
        ? firstUserMessage.content
        : firstUserMessage.content
            .filter((p): p is TextPart => p.type === 'text')
            .map((p) => p.text)
            .join(' ')

    if (!content) return 'New Conversation'

    // Strip system notes
    const cleaned = content.replace(/^\[System:.*\]$/g, '').trim()
    if (!cleaned) return 'New Conversation'

    if (cleaned.length <= 50) return cleaned

    // Truncate at word boundary
    const truncated = cleaned.slice(0, 50)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...'
  }

  /**
   * Reset the conversation.
   */
  reset(): void {
    this.conversationHistory = []
    this.systemPrompt = ''
    this.initialized = false
    this.conversationId = null
  }

  /**
   * Get the current conversation history for persistence.
   */
  getConversationHistory(): ModelMessage[] {
    return [...this.conversationHistory]
  }

  /**
   * Restore conversation history from persistence.
   */
  setConversationHistory(history: ModelMessage[]): void {
    this.conversationHistory = [...history]
  }

  /**
   * Convert stored ModelMessage history into displayable ChatMessages.
   * Skips tool/system messages and internal approval notes.
   */
  getChatMessages(): ChatMessage[] {
    const result: ChatMessage[] = []
    // Use a base timestamp and increment so messages appear in order
    const baseTime = Date.now() - this.conversationHistory.length * 1000

    this.conversationHistory.forEach((msg, i) => {
      if (msg.role === 'tool' || msg.role === 'system') return

      const content =
        typeof msg.content === 'string'
          ? msg.content
          : (msg.content as Array<{ type: string; text?: string }>)
              .filter((p) => p.type === 'text' && p.text)
              .map((p) => p.text!)
              .join('\n')

      // Skip internal system approval notes injected by handleApproval
      if (content.startsWith('[System:')) return

      // Skip assistant steps that had no text (tool-only steps)
      if (msg.role === 'assistant' && !content.trim()) return

      result.push({
        id: `loaded-${i}-${Math.random().toString(36).slice(2, 7)}`,
        role: msg.role as 'user' | 'assistant',
        content,
        timestamp: baseTime + i * 1000,
      })
    })

    return result
  }
}
