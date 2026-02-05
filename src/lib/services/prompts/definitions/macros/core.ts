/**
 * Core Macros - Basic Story Context
 *
 * Simple macros for fundamental story information:
 * - protagonistName: The protagonist character name
 * - currentLocation: The current scene location
 * - storyTime: In-story time (Year X, Day Y, H:MM)
 * - genre: Story genre (Fantasy, Sci-Fi, etc.)
 * - tone: Writing tone/style (dark, lighthearted, etc.)
 */

import type { SimpleMacro } from '../../types'

/**
 * Protagonist name macro - the main character's name
 */
export const protagonistNameMacro: SimpleMacro = {
  id: 'protagonist-name',
  name: 'Protagonist Name',
  token: 'protagonistName',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The protagonist character name from the story',
  defaultValue: 'the protagonist',
}

/**
 * Current location macro - the scene location
 */
export const currentLocationMacro: SimpleMacro = {
  id: 'current-location',
  name: 'Current Location',
  token: 'currentLocation',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The current scene location',
  defaultValue: '',
}

/**
 * Story time macro - in-story time tracking
 */
export const storyTimeMacro: SimpleMacro = {
  id: 'story-time',
  name: 'Story Time',
  token: 'storyTime',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The current in-story time (Year X, Day Y, H hours M minutes)',
  defaultValue: '',
}

/**
 * Genre macro - the story's genre
 */
export const genreMacro: SimpleMacro = {
  id: 'genre',
  name: 'Genre',
  token: 'genre',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The story genre (e.g., Fantasy, Science Fiction, Mystery)',
  defaultValue: '',
}

/**
 * Tone macro - the writing tone/style
 */
export const toneMacro: SimpleMacro = {
  id: 'tone',
  name: 'Tone',
  token: 'tone',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The writing tone/style (e.g., dark, lighthearted, suspenseful)',
  defaultValue: '',
}

/**
 * Combined export for registration
 */
export const coreMacros: SimpleMacro[] = [
  protagonistNameMacro,
  currentLocationMacro,
  storyTimeMacro,
  genreMacro,
  toneMacro,
]
