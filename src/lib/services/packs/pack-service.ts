import { database } from '$lib/services/database'
import { PROMPT_TEMPLATES } from '$lib/services/prompts/templates'
import type { PresetPack, FullPack, PackTemplate } from './types'

/**
 * Pack Service
 *
 * Business logic for preset pack management.
 * Handles default pack initialization, pack creation (copies from default),
 * template modification detection, and safe pack deletion.
 *
 * All database operations are delegated to DatabaseService.
 * This service adds the business rules on top.
 */
class PackService {
  private initialized = false

  /**
   * Initialize the pack system.
   * Call on app startup after database is ready.
   * - Ensures default pack exists
   * - Seeds templates from PROMPT_TEMPLATES if missing
   * - Adds any new templates from app updates
   * Idempotent: safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    let defaultPack = await database.getDefaultPack()

    if (!defaultPack) {
      // Create default pack if missing (first run)
      defaultPack = await database.createPack({
        id: 'default-pack',
        name: 'Default',
        description: 'Built-in prompt templates shipped with Aventura',
        author: 'Aventura',
        isDefault: true,
      })
    }

    // Check existing templates
    const existingTemplates = await database.getPackTemplates('default-pack')
    const existingIds = new Set(existingTemplates.map(t => t.templateId))

    // Seed or update templates from PROMPT_TEMPLATES
    for (const template of PROMPT_TEMPLATES) {
      // Seed system prompt content
      if (!existingIds.has(template.id)) {
        await database.setPackTemplateContent('default-pack', template.id, template.content)
      }
      // Seed user content (if template has it)
      const userContentId = `${template.id}-user`
      if (template.userContent && !existingIds.has(userContentId)) {
        await database.setPackTemplateContent('default-pack', userContentId, template.userContent)
      }
    }

    this.initialized = true
  }

  /**
   * Get all preset packs.
   */
  async getAllPacks(): Promise<PresetPack[]> {
    return database.getAllPacks()
  }

  /**
   * Get a single pack by ID.
   */
  async getPack(id: string): Promise<PresetPack | null> {
    return database.getPack(id)
  }

  /**
   * Load a pack with all its templates and variables.
   */
  async getFullPack(packId: string): Promise<FullPack | null> {
    const pack = await database.getPack(packId)
    if (!pack) return null

    const [templates, variables] = await Promise.all([
      database.getPackTemplates(packId),
      database.getPackVariables(packId),
    ])

    return { pack, templates, variables }
  }

  /**
   * Create a new pack by copying all templates and variables from the default pack.
   * Per user decision: new packs start as a copy of the default pack.
   */
  async createPack(name: string, description?: string, author?: string): Promise<PresetPack> {
    const packId = crypto.randomUUID()

    // Create pack metadata
    const pack = await database.createPack({
      id: packId,
      name,
      description: description ?? null,
      author: author ?? null,
      isDefault: false,
    })

    // Copy all templates from default pack
    const defaultTemplates = await database.getPackTemplates('default-pack')
    for (const template of defaultTemplates) {
      await database.setPackTemplateContent(packId, template.templateId, template.content)
    }

    // Copy all variables from default pack
    const defaultVariables = await database.getPackVariables('default-pack')
    for (const variable of defaultVariables) {
      await database.createPackVariable(packId, {
        variableName: variable.variableName,
        displayName: variable.displayName,
        variableType: variable.variableType,
        isRequired: variable.isRequired,
        defaultValue: variable.defaultValue,
        enumOptions: variable.enumOptions,
      })
    }

    return pack
  }

  /**
   * Delete a pack if allowed.
   * Per user decisions:
   * - Default pack cannot be deleted
   * - Pack cannot be deleted while any story uses it
   * Returns true if deleted, false if not allowed.
   */
  async deletePack(packId: string): Promise<{ deleted: boolean, reason?: string }> {
    const pack = await database.getPack(packId)
    if (!pack) return { deleted: false, reason: 'Pack not found' }
    if (pack.isDefault) return { deleted: false, reason: 'Cannot delete the default pack' }

    const canDelete = await database.canDeletePack(packId)
    if (!canDelete) {
      return { deleted: false, reason: 'Pack is in use by one or more stories. Reassign stories first.' }
    }

    await database.deletePack(packId)
    return { deleted: true }
  }

  /**
   * Check if a template in a pack has been modified from the default baseline.
   * Compares the pack template's content hash against the hash of the default content.
   */
  async isTemplateModified(packId: string, templateId: string): Promise<boolean> {
    const packTemplate = await database.getPackTemplate(packId, templateId)
    if (!packTemplate) return false

    // Find default baseline content
    const defaultContent = this.getDefaultContent(templateId)
    if (defaultContent === null) return false

    const defaultHash = await this.hashContent(defaultContent)
    return packTemplate.contentHash !== defaultHash
  }

  /**
   * Get modification status for all templates in a pack.
   * Returns a map of templateId -> isModified.
   */
  async getModifiedTemplates(packId: string): Promise<Map<string, boolean>> {
    const templates = await database.getPackTemplates(packId)
    const result = new Map<string, boolean>()

    for (const template of templates) {
      const defaultContent = this.getDefaultContent(template.templateId)
      if (defaultContent === null) {
        result.set(template.templateId, false)
        continue
      }
      const defaultHash = await this.hashContent(defaultContent)
      result.set(template.templateId, template.contentHash !== defaultHash)
    }

    return result
  }

  /**
   * Reset a template to the default baseline content.
   * Per user decision: reset is per-template, not per-pack.
   */
  async resetTemplate(packId: string, templateId: string): Promise<boolean> {
    const defaultContent = this.getDefaultContent(templateId)
    if (defaultContent === null) return false

    await database.setPackTemplateContent(packId, templateId, defaultContent)
    return true
  }

  /**
   * Get the default baseline content for a template ID.
   * Handles both system prompt (template.id) and user message (template.id + '-user') patterns.
   */
  private getDefaultContent(templateId: string): string | null {
    // Check for user content template (e.g., 'adventure-user')
    if (templateId.endsWith('-user')) {
      const baseId = templateId.replace(/-user$/, '')
      const template = PROMPT_TEMPLATES.find(t => t.id === baseId)
      return template?.userContent ?? null
    }

    // System prompt content
    const template = PROMPT_TEMPLATES.find(t => t.id === templateId)
    return template?.content ?? null
  }

  /**
   * Hash content using SHA-256 with whitespace normalization.
   * Duplicates DatabaseService.hashContent intentionally -- service layer
   * needs hashing for comparison without going through the database.
   */
  private async hashContent(content: string): Promise<string> {
    const normalized = content.trim().replace(/\r\n/g, '\n')
    const encoder = new TextEncoder()
    const data = encoder.encode(normalized)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}

/** Singleton pack service instance */
export const packService = new PackService()
