/** Custom variable type for pack variables (extends VariableType with textarea). */
export type CustomVariableType = 'text' | 'textarea' | 'enum' | 'number' | 'boolean'

/** Enum option: separates display label from stored value. */
export interface EnumOption {
  /** Display text shown in UI */
  label: string
  /** Stored value used in templates */
  value: string
}

/** User-configurable variable used in pack templates. variableName for templates, displayName for UI. */
export interface CustomVariable {
  /** Unique identifier */
  id: string
  /** Pack this variable belongs to */
  packId: string
  /** Variable name for template usage (e.g., 'writing_style') */
  variableName: string
  /** Display name for UI (e.g., 'Writing Style') */
  displayName: string
  /** Optional description / help text (shown in wizard) */
  description?: string
  /** Variable data type */
  variableType: CustomVariableType
  /** Whether this variable must have a value */
  isRequired: boolean
  /** Author-defined display order within pack (lower = first) */
  sortOrder: number
  /** Default value (stored as string, parsed by type) */
  defaultValue?: string
  /** Available options when variableType is 'enum' */
  enumOptions?: EnumOption[]
  /** Creation timestamp (epoch milliseconds) */
  createdAt: number
}

/** Template content within a pack. Content hash detects modifications from default. */
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

/** Preset pack metadata. Assigned per-story. No versioning — export serves as snapshot. */
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

/** Full pack with all templates and variables. */
export interface FullPack {
  /** Pack metadata */
  pack: PresetPack
  /** All templates in this pack */
  templates: PackTemplate[]
  /** All custom variables in this pack */
  variables: CustomVariable[]
}
