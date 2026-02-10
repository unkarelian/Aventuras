/**
 * Variable Registry
 *
 * Manages variable definitions across three categories:
 * - system: Auto-filled by the application
 * - runtime: Injected by services at render time
 * - custom: User-defined variables in preset packs
 */

import type { VariableDefinition, VariableCategory } from './types'

/**
 * System variables - auto-filled by the application
 * These variables are always available in templates and are populated from story context.
 */
export const SYSTEM_VARIABLES: VariableDefinition[] = [
  {
    name: 'protagonistName',
    type: 'text',
    category: 'system',
    description: 'Name of the main character',
    required: true,
  },
  {
    name: 'currentLocation',
    type: 'text',
    category: 'system',
    description: 'Current story location',
    required: false,
  },
  {
    name: 'storyTime',
    type: 'text',
    category: 'system',
    description: 'Current in-story time',
    required: false,
  },
  {
    name: 'genre',
    type: 'text',
    category: 'system',
    description: 'Story genre',
    required: false,
  },
  {
    name: 'tone',
    type: 'text',
    category: 'system',
    description: 'Story tone/mood',
    required: false,
  },
  {
    name: 'settingDescription',
    type: 'text',
    category: 'system',
    description: 'World/setting description',
    required: false,
  },
  {
    name: 'themes',
    type: 'text',
    category: 'system',
    description: 'Story themes as comma-separated list',
    required: false,
  },
  {
    name: 'mode',
    type: 'enum',
    category: 'system',
    description: 'Story mode',
    required: true,
    enumValues: ['adventure', 'creative-writing'],
  },
  {
    name: 'pov',
    type: 'enum',
    category: 'system',
    description: 'Point of view',
    required: true,
    enumValues: ['first', 'second', 'third'],
  },
  {
    name: 'tense',
    type: 'enum',
    category: 'system',
    description: 'Narrative tense',
    required: true,
    enumValues: ['past', 'present'],
  },
]

/**
 * Variable Registry class
 * Manages variable definitions with lookup and categorization capabilities.
 */
class VariableRegistry {
  private variables: Map<string, VariableDefinition>

  constructor() {
    this.variables = new Map()
    // Pre-populate with system variables
    this.registerMany(SYSTEM_VARIABLES)
  }

  /**
   * Register a single variable definition
   *
   * @param definition - Variable definition to register
   * @throws Error if variable name already registered (prevents duplicates)
   */
  register(definition: VariableDefinition): void {
    if (this.variables.has(definition.name)) {
      throw new Error(`Variable '${definition.name}' is already registered`)
    }
    this.variables.set(definition.name, definition)
  }

  /**
   * Register multiple variable definitions
   *
   * @param definitions - Array of variable definitions to register
   */
  registerMany(definitions: VariableDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition)
    }
  }

  /**
   * Get a variable definition by name
   *
   * @param name - Variable name
   * @returns Variable definition or undefined if not found
   */
  get(name: string): VariableDefinition | undefined {
    return this.variables.get(name)
  }

  /**
   * Check if a variable is registered
   *
   * @param name - Variable name
   * @returns True if variable exists
   */
  has(name: string): boolean {
    return this.variables.has(name)
  }

  /**
   * Get all variables in a specific category
   *
   * @param category - Variable category (system, runtime, or custom)
   * @returns Array of variable definitions in that category
   */
  getByCategory(category: VariableCategory): VariableDefinition[] {
    return Array.from(this.variables.values()).filter((v) => v.category === category)
  }

  /**
   * Get all registered variable names
   *
   * @returns Array of all variable names
   */
  getAllNames(): string[] {
    return Array.from(this.variables.keys())
  }

  /**
   * Get all registered variable definitions
   *
   * @returns Array of all variable definitions
   */
  getAll(): VariableDefinition[] {
    return Array.from(this.variables.values())
  }

  /**
   * Clear all variable definitions
   * Useful for reinitialization.
   */
  clear(): void {
    this.variables.clear()
  }

  /**
   * Remove a single variable definition
   *
   * @param name - Variable name to remove
   */
  remove(name: string): void {
    this.variables.delete(name)
  }
}

/**
 * Singleton variable registry instance
 * Pre-loaded with system variables. Use this throughout the application.
 */
export const variableRegistry = new VariableRegistry()
