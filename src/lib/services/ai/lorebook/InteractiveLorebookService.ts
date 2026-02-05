/**
 * Interactive Lorebook Service
 *
 * Provides an interactive chat interface for creating and managing lorebook entries.
 * Uses the Vercel AI SDK streamText with tools for real-time responses.
 */

import type { VaultLorebookEntry } from '$lib/types'
import type { ModelMessage, ToolModelMessage, TextPart, ToolCallPart } from 'ai'
import { settings } from '$lib/stores/settings.svelte'
import { createLogger } from '../core/config'
import { FandomService } from '../../fandom'
import { resolveAgentConfig, stopWhenDone } from '../sdk/agents'
import {
  createLorebookTools,
  createFandomTools,
  type LorebookToolContext,
  type FandomToolContext,
} from '../sdk/tools'
import type { PendingChangeSchema } from '../sdk/schemas/lorebook'
import { promptService } from '$lib/services/prompts'
import { streamText } from 'ai'

const log = createLogger('InteractiveLorebook')

// Event types for progress updates
export type StreamEvent =
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_end'; toolCall: ToolCallDisplay }
  | { type: 'thinking' }
  | { type: 'message'; message: ChatMessage }
  | { type: 'done'; result: SendMessageResult }
  | { type: 'error'; error: string }

// Types for pending changes and chat messages
export interface PendingChange {
  id: string
  type: 'create' | 'update' | 'delete' | 'merge'
  toolCallId: string
  entry?: VaultLorebookEntry
  index?: number
  indices?: number[]
  updates?: Partial<VaultLorebookEntry>
  previous?: VaultLorebookEntry
  previousEntries?: VaultLorebookEntry[]
  status: 'pending' | 'approved' | 'rejected'
}

// Tool call info for display in chat
export interface ToolCallDisplay {
  id: string
  name: string
  args: Record<string, unknown>
  result: string
  pendingChange?: PendingChange
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  pendingChanges?: PendingChange[]
  toolCalls?: ToolCallDisplay[]
  reasoning?: string
  isGreeting?: boolean
}

export interface SendMessageResult {
  response: string
  pendingChanges: PendingChange[]
  toolCalls: ToolCallDisplay[]
  reasoning?: string
}

/**
 * Convert PendingChangeSchema to PendingChange for UI compatibility.
 */
function schemaToPendingChange(schema: PendingChangeSchema): PendingChange {
  return {
    id: schema.id,
    type: schema.type,
    toolCallId: schema.toolCallId,
    entry: schema.entry,
    index: schema.index,
    indices: schema.indices,
    updates: schema.updates,
    previous: schema.previous,
    previousEntries: schema.previousEntries,
    status: schema.status,
  }
}

/**
 * Service that provides interactive lorebook management via chat.
 * Uses streamText with tools for real-time responses.
 */
export class InteractiveLorebookService {
  private initialized: boolean = false
  private presetId: string
  private fandomService: FandomService
  private conversationHistory: ModelMessage[] = []
  private systemPrompt: string = ''

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
   * Initialize the conversation.
   */
  initialize(lorebookName: string, entryCount: number): void {
    this.conversationHistory = []

    // Get system prompt from prompt service
    // Service prompts don't use narrative context, so pass minimal required values
    // and use placeholders for service-specific variables
    this.systemPrompt = promptService.renderPrompt(
      'interactive-lorebook',
      {
        mode: 'adventure',
        pov: 'second',
        tense: 'present',
        protagonistName: '',
      },
      {
        lorebookName,
        entryCount,
      },
    )

    this.initialized = true
    log('Initialized conversation', { lorebookName, entryCount, model: this.preset.model })
  }

  /**
   * Check if the service has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Send a user message and get the AI response.
   * Non-streaming version for backwards compatibility.
   */
  async sendMessage(
    userMessage: string,
    entries: VaultLorebookEntry[],
  ): Promise<SendMessageResult> {
    // Use the streaming version and collect results
    const events: StreamEvent[] = []
    for await (const event of this.sendMessageStreaming(userMessage, entries)) {
      events.push(event)
    }

    const doneEvent = events.find((e) => e.type === 'done')
    if (doneEvent && doneEvent.type === 'done') {
      return doneEvent.result
    }

    const errorEvent = events.find((e) => e.type === 'error')
    if (errorEvent && errorEvent.type === 'error') {
      throw new Error(errorEvent.error)
    }

    return {
      response: '',
      pendingChanges: [],
      toolCalls: [],
    }
  }

  /**
   * Streaming version of sendMessage.
   * Yields events as the AI processes the message.
   */
  async *sendMessageStreaming(
    userMessage: string,
    entries: VaultLorebookEntry[],
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    if (!this.initialized) {
      yield { type: 'error', error: 'Service not initialized. Call initialize() first.' }
      return
    }

    // Track state for this message
    const pendingChanges: PendingChange[] = []
    const toolCalls: ToolCallDisplay[] = []
    let responseContent = ''
    let reasoning: string | undefined
    let changeIdCounter = 0

    // Create tool context
    const lorebookContext: LorebookToolContext = {
      entries,
      onPendingChange: (change) => {
        pendingChanges.push(schemaToPendingChange(change))
      },
      generateId: () => `il-${++changeIdCounter}-${Date.now()}`,
    }

    const fandomContext: FandomToolContext = {
      fandomService: this.fandomService,
    }

    // Create combined tools
    const lorebookTools = createLorebookTools(lorebookContext)
    const fandomTools = createFandomTools(fandomContext)
    const tools = { ...lorebookTools, ...fandomTools }

    // Remove the finish_lore_management tool since this is interactive mode
    delete (tools as Record<string, unknown>)['finish_lore_management']

    // Add user message to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    })

    // Resolve agent config
    const { model, providerOptions, preset } = resolveAgentConfig(
      this.presetId,
      'interactive-lorebook',
    )

    try {
      // Use streamText for streaming with tools
      // Continue until the model stops calling tools (or hits safety limit of 50 steps)
      const result = streamText({
        model,
        system: this.systemPrompt,
        messages: this.conversationHistory,
        tools,
        temperature: preset.temperature,
        maxOutputTokens: preset.maxTokens,
        providerOptions,
        abortSignal: signal,
        stopWhen: stopWhenDone(50),
      })

      // Track tool calls for the current step
      const currentToolCalls: Map<string, { name: string; args: Record<string, unknown> }> =
        new Map()

      // Track per-step content (reset on each new step)
      let stepContent = ''
      let stepToolCalls: ToolCallDisplay[] = []
      let stepReasoning: string | undefined

      // Process the stream
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'start-step':
            // Reset step-level accumulators for the new step
            stepContent = ''
            stepToolCalls = []
            stepReasoning = undefined
            currentToolCalls.clear()
            break

          case 'finish-step':
            // Step completed - emit a message if we have content or tool calls
            if (stepContent || stepToolCalls.length > 0) {
              // Accumulate for conversation history
              responseContent += (responseContent && stepContent ? '\n\n' : '') + stepContent
              toolCalls.push(...stepToolCalls)
              if (stepReasoning) {
                reasoning = (reasoning ? reasoning + '\n\n' : '') + stepReasoning
              }

              // Emit intermediate message to UI for this step
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
            // Capture reasoning/thinking
            if (event.type === 'reasoning-delta') {
              stepReasoning = (stepReasoning || '') + event.text
            }
            yield { type: 'thinking' }
            break

          case 'text-delta':
            // Accumulate response text for this step
            stepContent += event.text
            break

          case 'tool-call':
            // Tool is being called
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
            // Tool completed
            const toolInfo = currentToolCalls.get(event.toolCallId)
            // Extract result - handle both typed and dynamic tool results
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
              if (latestChange && latestChange.toolCallId.startsWith('il-')) {
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
        // Build the assistant message with tool calls if any
        const assistantMessage: ModelMessage = {
          role: 'assistant',
          content: this.buildAssistantContent(responseContent, toolCalls),
        }
        this.conversationHistory.push(assistantMessage)

        // Add tool results as tool messages
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

      // Note: Individual step messages are emitted via 'finish-step' events above
      // We don't emit a final 'message' here to avoid duplication

      // Return final result (for non-streaming callers and completion signal)
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
   */
  handleApproval(change: PendingChange, approved: boolean, rejectionReason?: string): void {
    change.status = approved ? 'approved' : 'rejected'
    log('Handled approval', { changeId: change.id, approved, rejectionReason })

    // Add a note to conversation about the approval/rejection
    const note = approved
      ? `[System: User approved the ${change.type} operation for "${change.entry?.name || change.previous?.name || 'entry'}"]`
      : `[System: User rejected the ${change.type} operation${rejectionReason ? `: ${rejectionReason}` : ''}]`

    this.conversationHistory.push({
      role: 'user',
      content: note,
    })
  }

  /**
   * Apply a pending change to the entries array.
   */
  applyChange(change: PendingChange, entries: VaultLorebookEntry[]): VaultLorebookEntry[] {
    const newEntries = [...entries]

    switch (change.type) {
      case 'create':
        if (change.entry) {
          newEntries.push(change.entry)
        }
        break

      case 'update':
        if (
          change.updates &&
          change.index !== undefined &&
          change.index >= 0 &&
          change.index < newEntries.length
        ) {
          newEntries[change.index] = { ...newEntries[change.index], ...change.updates }
        }
        break

      case 'delete':
        if (change.index !== undefined && change.index >= 0 && change.index < newEntries.length) {
          newEntries.splice(change.index, 1)
        }
        break

      case 'merge':
        if (change.indices && change.entry) {
          // Remove source entries (in reverse order to preserve indices)
          const sortedIndices = [...change.indices].sort((a, b) => b - a)
          for (const index of sortedIndices) {
            if (index >= 0 && index < newEntries.length) {
              newEntries.splice(index, 1)
            }
          }
          // Add merged entry
          newEntries.push(change.entry)
        }
        break
    }

    return newEntries
  }

  /**
   * Reset the conversation.
   */
  reset(lorebookName: string, entryCount: number): void {
    this.initialize(lorebookName, entryCount)
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
}
