/**
 * Preset Pack Module
 *
 * Storage and management infrastructure for preset packs.
 * A pack bundles all prompt templates and custom variable definitions into a single unit.
 *
 * @example
 * import { packService, validatePackImport } from '$lib/services/packs'
 *
 * // Initialize on app startup
 * await packService.initialize()
 *
 * // Create a new pack
 * const pack = await packService.createPack('My Custom Pack', 'Custom prompts', 'User')
 *
 * // Check if template modified
 * const isModified = await packService.isTemplateModified(pack.id, 'adventure')
 *
 * // Validate import data
 * const result = validatePackImport(jsonData)
 */

// ============================================================================
// Pack Service
// ============================================================================

export { packService } from './pack-service'

// ============================================================================
// Validation
// ============================================================================

export {
  validatePackImport,
  validateCustomVariable,
  PackExportSchema,
  CustomVariableSchema,
  EnumOptionSchema,
  PackTemplateSchema,
} from './validation'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  PresetPack,
  PackTemplate,
  CustomVariable,
  CustomVariableType,
  EnumOption,
  FullPack,
} from './types'

export type { PackExport } from './validation'
