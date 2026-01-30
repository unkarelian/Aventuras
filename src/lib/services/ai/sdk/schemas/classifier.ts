/**
 * Classifier Schema
 *
 * Zod schema for validating world state extraction from narrative responses.
 * Matches the JSON format expected by the classifier prompt template.
 */

import { z } from 'zod';

// ============================================================================
// Character Schemas
// ============================================================================

export const characterUpdateSchema = z.object({
  name: z.string(),
  changes: z.object({
    status: z.enum(['active', 'inactive', 'deceased']).optional(),
    relationship: z.string().optional(),
    newTraits: z.array(z.string()).optional(),
    removeTraits: z.array(z.string()).optional(),
    replaceVisualDescriptors: z.array(z.string()).optional(),
    addVisualDescriptors: z.array(z.string()).optional(),
    removeVisualDescriptors: z.array(z.string()).optional(),
  }),
});

export const newCharacterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  relationship: z.string().optional(),
  traits: z.array(z.string()).optional(),
  visualDescriptors: z.array(z.string()).optional(),
  status: z.enum(['active', 'inactive', 'deceased']).optional(),
});

// ============================================================================
// Location Schemas
// ============================================================================

export const locationUpdateSchema = z.object({
  name: z.string(),
  changes: z.object({
    visited: z.boolean().optional(),
    current: z.boolean().optional(),
    description: z.string().optional(),
    descriptionAddition: z.string().optional(),
  }),
});

export const newLocationSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  visited: z.boolean().optional(),
  current: z.boolean().optional(),
});

// ============================================================================
// Item Schemas
// ============================================================================

export const itemUpdateSchema = z.object({
  name: z.string(),
  changes: z.object({
    quantity: z.number().optional(),
    location: z.string().optional(),
    equipped: z.boolean().optional(),
  }),
});

export const newItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  location: z.string().optional(),
  equipped: z.boolean().optional(),
});

// ============================================================================
// Story Beat Schemas
// ============================================================================

export const storyBeatUpdateSchema = z.object({
  title: z.string(),
  changes: z.object({
    status: z.enum(['pending', 'active', 'completed', 'failed']).optional(),
    description: z.string().optional(),
  }),
});

export const newStoryBeatSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(['milestone', 'quest', 'revelation', 'event', 'plot_point']).optional(),
  status: z.enum(['pending', 'active', 'completed', 'failed']).optional(),
});

// ============================================================================
// Entry Updates Schema
// ============================================================================

export const entryUpdatesSchema = z.object({
  characterUpdates: z.array(characterUpdateSchema).default([]),
  locationUpdates: z.array(locationUpdateSchema).default([]),
  itemUpdates: z.array(itemUpdateSchema).default([]),
  storyBeatUpdates: z.array(storyBeatUpdateSchema).default([]),
  newCharacters: z.array(newCharacterSchema).default([]),
  newLocations: z.array(newLocationSchema).default([]),
  newItems: z.array(newItemSchema).default([]),
  newStoryBeats: z.array(newStoryBeatSchema).default([]),
});

// ============================================================================
// Scene Schema
// ============================================================================

export const sceneSchema = z.object({
  currentLocationName: z.string().nullable().optional(),
  presentCharacterNames: z.array(z.string()).default([]),
  timeProgression: z.enum(['none', 'minutes', 'hours', 'days']).default('none'),
});

// ============================================================================
// Main Classification Result Schema
// ============================================================================

export const classificationResultSchema = z.object({
  entryUpdates: entryUpdatesSchema,
  scene: sceneSchema,
});

// ============================================================================
// Type Exports
// ============================================================================

export type CharacterUpdate = z.infer<typeof characterUpdateSchema>;
export type NewCharacter = z.infer<typeof newCharacterSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;
export type NewLocation = z.infer<typeof newLocationSchema>;
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;
export type NewItem = z.infer<typeof newItemSchema>;
export type StoryBeatUpdate = z.infer<typeof storyBeatUpdateSchema>;
export type NewStoryBeat = z.infer<typeof newStoryBeatSchema>;
export type EntryUpdates = z.infer<typeof entryUpdatesSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
