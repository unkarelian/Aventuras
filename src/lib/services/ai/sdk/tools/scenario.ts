/**
 * Scenario CRUD Tools
 *
 * Tool definitions for vault scenario management including NPC sub-operations.
 * Used by InteractiveVaultService.
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { VaultScenario } from '$lib/types'
import type { VaultPendingChange } from '../schemas/vault'
import { vaultScenarioInputSchema, vaultScenarioNpcSchema } from '../schemas'

/**
 * Context provided to scenario tools.
 */
export interface ScenarioToolContext {
  /** Getter for current vault scenarios (live, not snapshot) */
  scenarios: () => VaultScenario[]
  /** Callback to register a pending change */
  onPendingChange: (change: VaultPendingChange) => void
  /** Generate unique ID for pending changes */
  generateId: () => string
}

/**
 * Create scenario CRUD tools with the given context.
 */
export function createScenarioTools(context: ScenarioToolContext) {
  const { scenarios, onPendingChange, generateId } = context

  /** Helper to build a scenario input snapshot for `previous` field */
  function toScenarioInput(s: VaultScenario): z.infer<typeof vaultScenarioInputSchema> {
    return {
      name: s.name,
      description: s.description,
      settingSeed: s.settingSeed,
      npcs: s.npcs,
      primaryCharacterName: s.primaryCharacterName,
      firstMessage: s.firstMessage,
      alternateGreetings: s.alternateGreetings,
      tags: s.tags,
      favorite: s.favorite,
    }
  }

  return {
    /**
     * List all vault scenarios.
     */
    list_scenarios: tool({
      description: 'List all vault scenarios. Returns scenario summaries with IDs.',
      inputSchema: z.object({}),
      execute: async () => {
        const all = scenarios()
        return {
          scenarios: all.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description?.slice(0, 200) ?? null,
            primaryCharacterName: s.primaryCharacterName,
            npcCount: s.npcs.length,
            tags: s.tags,
            favorite: s.favorite,
          })),
          total: all.length,
        }
      },
    }),

    /**
     * Read full details of a specific scenario by ID.
     */
    read_scenario: tool({
      description:
        'Read the full details of a vault scenario by ID. Use list_scenarios first to find scenario IDs.',
      inputSchema: z.object({
        scenarioId: z.string().describe('The ID of the scenario to read'),
      }),
      execute: async ({ scenarioId }: { scenarioId: string }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { found: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        return {
          found: true,
          scenario: {
            id: scenario.id,
            name: scenario.name,
            description: scenario.description,
            settingSeed: scenario.settingSeed,
            npcs: scenario.npcs,
            primaryCharacterName: scenario.primaryCharacterName,
            firstMessage: scenario.firstMessage,
            alternateGreetings: scenario.alternateGreetings,
            tags: scenario.tags,
            favorite: scenario.favorite,
            source: scenario.source,
          },
        }
      },
    }),

    /**
     * Create a new vault scenario.
     * Returns a pending change for approval workflow.
     */
    create_scenario: tool({
      description: 'Create a new vault scenario. The change will be pending until approved.',
      inputSchema: z.object({
        name: z.string().describe('Scenario name'),
        description: z.string().nullable().describe('Brief scenario description'),
        settingSeed: z.string().describe('Setting seed text describing the world and context'),
        npcs: z
          .array(vaultScenarioNpcSchema)
          .optional()
          .default([])
          .describe('NPCs in the scenario'),
        primaryCharacterName: z.string().describe('Name of the primary character / protagonist'),
        firstMessage: z.string().nullable().optional().describe('Opening message'),
        alternateGreetings: z
          .array(z.string())
          .optional()
          .default([])
          .describe('Alternative opening messages'),
        tags: z.array(z.string()).optional().default([]).describe('Tags for organization'),
        favorite: z.boolean().optional().default(false).describe('Whether to favorite'),
      }),
      execute: async ({
        name,
        description,
        settingSeed,
        npcs,
        primaryCharacterName,
        firstMessage,
        alternateGreetings,
        tags,
        favorite,
      }: {
        name: string
        description: string | null
        settingSeed: string
        npcs?: z.infer<typeof vaultScenarioNpcSchema>[]
        primaryCharacterName: string
        firstMessage?: string | null
        alternateGreetings?: string[]
        tags?: string[]
        favorite?: boolean
      }) => {
        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'create',
          data: {
            name,
            description,
            settingSeed,
            npcs: npcs ?? [],
            primaryCharacterName,
            firstMessage: firstMessage ?? null,
            alternateGreetings: alternateGreetings ?? [],
            tags: tags ?? [],
            favorite: favorite ?? false,
          },
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending scenario "${name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Update an existing vault scenario.
     * Returns a pending change for approval workflow.
     */
    update_scenario: tool({
      description:
        'Update an existing vault scenario by ID. Only include fields you want to change. The change will be pending until approved.',
      inputSchema: z.object({
        scenarioId: z.string().describe('ID of the scenario to update'),
        name: z.string().optional().describe('New name'),
        description: z.string().nullable().optional().describe('New description'),
        settingSeed: z.string().optional().describe('New setting seed'),
        npcs: z
          .array(vaultScenarioNpcSchema)
          .optional()
          .describe('New NPC list (replaces existing)'),
        primaryCharacterName: z.string().optional().describe('New primary character name'),
        firstMessage: z.string().nullable().optional().describe('New first message'),
        alternateGreetings: z.array(z.string()).optional().describe('New alternate greetings'),
        tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
        favorite: z.boolean().optional().describe('New favorite status'),
      }),
      execute: async ({
        scenarioId,
        ...updates
      }: {
        scenarioId: string
        name?: string
        description?: string | null
        settingSeed?: string
        npcs?: z.infer<typeof vaultScenarioNpcSchema>[]
        primaryCharacterName?: string
        firstMessage?: string | null
        alternateGreetings?: string[]
        tags?: string[]
        favorite?: boolean
      }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { success: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, v]) => v !== undefined),
        ) as Partial<z.infer<typeof vaultScenarioInputSchema>>

        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'update',
          entityId: scenarioId,
          data: cleanUpdates,
          previous: toScenarioInput(scenario),
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending update for "${scenario.name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Delete a vault scenario.
     * Returns a pending change for approval workflow.
     */
    delete_scenario: tool({
      description: 'Delete a vault scenario by ID. The change will be pending until approved.',
      inputSchema: z.object({
        scenarioId: z.string().describe('ID of the scenario to delete'),
        reason: z.string().optional().describe('Reason for deletion'),
      }),
      execute: async ({ scenarioId, reason }: { scenarioId: string; reason?: string }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { success: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'delete',
          entityId: scenarioId,
          previous: toScenarioInput(scenario),
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending deletion for "${scenario.name}"${reason ? ` (${reason})` : ''}. Awaiting approval.`,
        }
      },
    }),

    /**
     * Add an NPC to a scenario.
     * Produces a VaultPendingChange of type update on the parent scenario.
     */
    add_scenario_npc: tool({
      description:
        'Add a new NPC to a scenario. Creates a pending update on the parent scenario with the NPC added to the npcs array.',
      inputSchema: z.object({
        scenarioId: z.string().describe('ID of the scenario to add the NPC to'),
        npc: vaultScenarioNpcSchema.describe('The NPC to add'),
      }),
      execute: async ({
        scenarioId,
        npc,
      }: {
        scenarioId: string
        npc: z.infer<typeof vaultScenarioNpcSchema>
      }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { success: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        const updatedNpcs = [...scenario.npcs, npc]
        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'update',
          entityId: scenarioId,
          data: { npcs: updatedNpcs },
          previous: toScenarioInput(scenario),
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending NPC addition "${npc.name}" to "${scenario.name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Update an NPC in a scenario.
     * Produces a VaultPendingChange of type update on the parent scenario.
     */
    update_scenario_npc: tool({
      description:
        'Update an existing NPC in a scenario by name. Creates a pending update on the parent scenario with the modified npcs array.',
      inputSchema: z.object({
        scenarioId: z.string().describe('ID of the scenario containing the NPC'),
        npcName: z.string().describe('Name of the NPC to update'),
        updates: z
          .object({
            name: z.string().optional().describe('New NPC name'),
            role: z.string().optional().describe('New role'),
            description: z.string().optional().describe('New description'),
            relationship: z.string().optional().describe('New relationship'),
            traits: z.array(z.string()).optional().describe('New traits (replaces existing)'),
          })
          .describe('Fields to update on the NPC'),
      }),
      execute: async ({
        scenarioId,
        npcName,
        updates,
      }: {
        scenarioId: string
        npcName: string
        updates: {
          name?: string
          role?: string
          description?: string
          relationship?: string
          traits?: string[]
        }
      }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { success: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        const npcIndex = scenario.npcs.findIndex((n) => n.name === npcName)
        if (npcIndex === -1) {
          return {
            success: false,
            error: `NPC "${npcName}" not found in scenario "${scenario.name}"`,
          }
        }

        const updatedNpcs = [...scenario.npcs]
        updatedNpcs[npcIndex] = { ...updatedNpcs[npcIndex], ...updates }

        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'update',
          entityId: scenarioId,
          data: { npcs: updatedNpcs },
          previous: toScenarioInput(scenario),
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending NPC update for "${npcName}" in "${scenario.name}". Awaiting approval.`,
        }
      },
    }),

    /**
     * Remove an NPC from a scenario.
     * Produces a VaultPendingChange of type update on the parent scenario.
     */
    remove_scenario_npc: tool({
      description:
        'Remove an NPC from a scenario by name. Creates a pending update on the parent scenario with the NPC removed from the npcs array.',
      inputSchema: z.object({
        scenarioId: z.string().describe('ID of the scenario containing the NPC'),
        npcName: z.string().describe('Name of the NPC to remove'),
      }),
      execute: async ({ scenarioId, npcName }: { scenarioId: string; npcName: string }) => {
        const scenario = scenarios().find((s) => s.id === scenarioId)

        if (!scenario) {
          return { success: false, error: `Scenario with ID "${scenarioId}" not found` }
        }

        const npcIndex = scenario.npcs.findIndex((n) => n.name === npcName)
        if (npcIndex === -1) {
          return {
            success: false,
            error: `NPC "${npcName}" not found in scenario "${scenario.name}"`,
          }
        }

        const updatedNpcs = scenario.npcs.filter((n) => n.name !== npcName)

        const changeId = generateId()
        const pendingChange: VaultPendingChange = {
          id: changeId,
          toolCallId: changeId,
          entityType: 'scenario',
          action: 'update',
          entityId: scenarioId,
          data: { npcs: updatedNpcs },
          previous: toScenarioInput(scenario),
          status: 'pending',
        }

        onPendingChange(pendingChange)

        return {
          success: true,
          pendingChange,
          message: `Created pending NPC removal "${npcName}" from "${scenario.name}". Awaiting approval.`,
        }
      },
    }),
  }
}

export type ScenarioTools = ReturnType<typeof createScenarioTools>
