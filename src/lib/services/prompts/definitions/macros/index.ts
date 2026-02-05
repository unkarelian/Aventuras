/**
 * Macros Registry - Combined Export
 *
 * This module aggregates all macro definitions from domain-specific files
 * and exports them as a single combined array for the prompt system.
 *
 * Domain files:
 * - core.ts: Basic story context (protagonistName, currentLocation, storyTime, genre, tone)
 * - context.ts: Story context blocks (settingDescription, themes, storyContextBlock)
 * - narrative.ts: POV/tense-aware complex macros (styleInstruction, responseInstruction, primingMessage)
 * - features.ts: Feature-specific macros (visualProse, inlineImage, responseLength, translation)
 * - placeholders.ts: Runtime context placeholders (NOT user-editable)
 */

import type { Macro } from '../../types'

// Re-export all individual macros for direct access
export * from './core'
export * from './context'
export * from './narrative'
export * from './features'

// Re-export placeholders
export { CONTEXT_PLACEHOLDERS, getPlaceholderByToken } from './placeholders'

// Import arrays for combined registry
import { coreMacros } from './core'
import { contextMacros } from './context'
import { narrativeMacros } from './narrative'
import { featureMacros } from './features'

/**
 * Combined array of all builtin macros.
 * This is the primary export used by the prompt system for macro resolution.
 */
export const BUILTIN_MACROS: Macro[] = [
  ...coreMacros,
  ...contextMacros,
  ...narrativeMacros,
  ...featureMacros,
]
