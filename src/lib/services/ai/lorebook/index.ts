/**
 * AI Lorebook Module
 *
 * AI-powered lorebook management services:
 * - LoreManagement: Autonomous agent for lorebook maintenance and updates
 * - InteractiveLorebook: Interactive lorebook creation and editing
 */

export {
  LoreManagementService,
  getDefaultLoreManagementSettings,
  type LoreManagementSettings,
  type LoreManagementResult,
  type LoreManagementContext,
} from './LoreManagementService'

export {
  InteractiveLorebookService,
  type StreamEvent,
  type PendingChange,
  type ToolCallDisplay,
  type ChatMessage,
  type SendMessageResult,
} from './InteractiveLorebookService'
