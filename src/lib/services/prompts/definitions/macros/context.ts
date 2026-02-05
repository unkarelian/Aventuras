/**
 * Context Macros - Story Context Building Blocks
 *
 * Simple macros for story world context:
 * - settingDescription: Description of the story world
 * - themes: Story themes and motifs
 * - storyContextBlock: Formatted block with all context (genre, tone, setting, themes)
 */

import type { SimpleMacro } from '../../types';

/**
 * Setting description macro - the story world description
 */
export const settingDescriptionMacro: SimpleMacro = {
  id: 'setting-description',
  name: 'Setting Description',
  token: 'settingDescription',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'Description of the story world/setting',
  defaultValue: '',
};

/**
 * Themes macro - story themes and motifs
 */
export const themesMacro: SimpleMacro = {
  id: 'themes',
  name: 'Themes',
  token: 'themes',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'Story themes and motifs (comma-separated)',
  defaultValue: '',
};

/**
 * Story context block macro - formatted block with all context
 * Only shows if values are present
 */
export const storyContextBlockMacro: SimpleMacro = {
  id: 'story-context-block',
  name: 'Story Context Block',
  token: 'storyContextBlock',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description:
    'Formatted block containing genre, tone, setting, and themes (only shows if values are present)',
  defaultValue: '',
};

/**
 * Combined export for registration
 */
export const contextMacros: SimpleMacro[] = [
  settingDescriptionMacro,
  themesMacro,
  storyContextBlockMacro,
];
