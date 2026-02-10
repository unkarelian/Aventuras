/**
 * Template Engine Module
 *
 * Unified template rendering and validation system using LiquidJS.
 * All services should import from this module -- never from liquidjs directly.
 *
 * @example
 * import { templateEngine, validateTemplate, variableRegistry } from '$lib/services/templates'
 *
 * // Render a template
 * const output = templateEngine.render('Hello {{ name }}', { name: 'World' })
 *
 * // Validate before saving
 * const result = validateTemplate('Hello {{ name }}')
 * if (!result.valid) { ... }
 *
 * // Check available variables
 * const systemVars = variableRegistry.getByCategory('system')
 */

// ============================================================================
// Core Engine
// ============================================================================

export { templateEngine } from './engine'

// ============================================================================
// Validation
// ============================================================================

export { validateTemplate } from './validator'

// ============================================================================
// Variable Registry
// ============================================================================

export { variableRegistry, SYSTEM_VARIABLES } from './variables'

// ============================================================================
// Type Exports
// ============================================================================

export type {
  VariableType,
  VariableCategory,
  VariableDefinition,
  TemplateContext,
  ValidationError,
  ValidationErrorType,
  ValidationResult,
  RenderResult,
} from './types'
