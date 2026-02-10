/**
 * Preset Pack System - Type Definitions
 *
 * This module defines the types for the preset pack system.
 * Packs bundle prompt templates and custom variable definitions into reusable units.
 * Each pack is self-contained with all templates and variables needed for a story.
 *
 * Pack types are distinct from the Phase 1 template engine types:
 * - CustomVariableType extends VariableType with 'textarea' for longer text inputs
 * - Packs manage both template content and variable definitions
 * - Packs have no versioning - edits overwrite in place
 */

/**
 * Custom variable type for pack variables
 * Extends Phase 1 VariableType with textarea for multi-line text input.
 *
 * - text: Single-line text input
 * - textarea: Multi-line text input
 * - enum: Dropdown selection with label+value pairs
 * - number: Numeric input
 * - boolean: Toggle/checkbox
 */
export type CustomVariableType = 'text' | 'textarea' | 'enum' | 'number' | 'boolean'

/**
 * Enum option for dropdown variables
 * Separates display text from stored value for flexibility.
 *
 * Example: { label: 'Fantasy', value: 'fantasy' }
 */
export interface EnumOption {
  /** Display text shown in UI */
  label: string
  /** Stored value used in templates */
  value: string
}

/**
 * Custom variable definition
 * Defines a user-configurable variable that can be used in pack templates.
 *
 * Variables have both a variable name (for template usage) and a display name (for UI).
 * Example: variableName='writing_style' appears as {{ writing_style }} in templates,
 * while displayName='Writing Style' is shown in the UI.
 */
export interface CustomVariable {
  /** Unique identifier */
  id: string
  /** Pack this variable belongs to */
  packId: string
  /** Variable name for template usage (e.g., 'writing_style') */
  variableName: string
  /** Display name for UI (e.g., 'Writing Style') */
  displayName: string
  /** Variable data type */
  variableType: CustomVariableType
  /** Whether this variable must have a value */
  isRequired: boolean
  /** Default value (stored as string, parsed by type) */
  defaultValue?: string
  /** Available options when variableType is 'enum' */
  enumOptions?: EnumOption[]
  /** Creation timestamp (epoch milliseconds) */
  createdAt: number
}

/**
 * Pack template content
 * Stores the template content for a specific prompt template within a pack.
 *
 * Each pack contains all prompt templates, even unmodified ones.
 * Content hash enables detection of modifications from default baseline.
 */
export interface PackTemplate {
  /** Unique identifier */
  id: string
  /** Pack this template belongs to */
  packId: string
  /** Reference to PROMPT_TEMPLATES[].id */
  templateId: string
  /** Liquid template string */
  content: string
  /** SHA-256 hash of normalized content */
  contentHash: string
  /** Creation timestamp (epoch milliseconds) */
  createdAt: number
  /** Last modification timestamp (epoch milliseconds) */
  updatedAt: number
}

/**
 * Preset pack metadata
 * Container for a complete set of prompt templates and custom variables.
 *
 * Packs are assigned per-story and provide all template content and variable definitions.
 * No versioning - edits overwrite in place. Export (Phase 5) serves as snapshot mechanism.
 */
export interface PresetPack {
  /** Unique identifier */
  id: string
  /** Pack name (must be unique) */
  name: string
  /** Optional description */
  description: string | null
  /** Optional author attribution */
  author: string | null
  /** Whether this is the built-in default pack */
  isDefault: boolean
  /** Creation timestamp (epoch milliseconds) */
  createdAt: number
  /** Last modification timestamp (epoch milliseconds) */
  updatedAt: number
}

/**
 * Full pack with all child entities
 * Convenience type for loading a complete pack with all templates and variables.
 */
export interface FullPack {
  /** Pack metadata */
  pack: PresetPack
  /** All templates in this pack */
  templates: PackTemplate[]
  /** All custom variables in this pack */
  variables: CustomVariable[]
}
