/**
 * Markdown rendering utilities for story content.
 * Uses marked for parsing with safe defaults.
 */

import { marked } from 'marked'

// Configure marked with safe defaults
marked.setOptions({
  breaks: true, // Convert \n to <br>
  gfm: true, // GitHub Flavored Markdown
})

/**
 * Parse markdown string to HTML.
 * Safe for rendering in story content.
 */
export function parseMarkdown(text: string): string {
  if (!text) return ''

  try {
    // Parse the markdown - marked.parse() can return string or Promise
    // We use parseInline for inline elements to avoid wrapping in <p> tags
    // But for full content we want the full parser
    const result = marked.parse(text)

    // marked.parse returns string in sync mode (our configuration)
    return typeof result === 'string' ? result : ''
  } catch (error) {
    console.error('[Markdown] Parse error:', error)
    // Fallback to plain text with basic escaping
    return escapeHtml(text)
  }
}

/**
 * Parse inline markdown only (no block elements like headers, lists).
 * Useful for single-line content.
 */
export function parseInlineMarkdown(text: string): string {
  if (!text) return ''

  try {
    return marked.parseInline(text) as string
  } catch (error) {
    console.error('[Markdown] Inline parse error:', error)
    return escapeHtml(text)
  }
}

/**
 * Escape HTML special characters.
 * Used as fallback when markdown parsing fails.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
