/**
 * Scope CSS selectors by prefixing with a class.
 * Shared utility for HTML sanitization and streaming.
 */
export function scopeCssSelectors(css: string, scopeClass: string): string {
  // Handle @keyframes specially - don't prefix the keyframe name
  let result = css

  // Process @keyframes blocks - extract and preserve them
  const keyframesBlocks: string[] = []
  result = result.replace(/@keyframes\s+([^\s{]+)\s*\{([\s\S]*?\})\s*\}/gi, (match) => {
    keyframesBlocks.push(match)
    return `__KEYFRAMES_${keyframesBlocks.length - 1}__`
  })

  // Process @media queries - scope selectors inside them
  result = result.replace(/@media\s+([^{]+)\{([\s\S]*?)\}/gi, (_match, query, content) => {
    const scopedContent = prefixSelectorsInBlock(content, scopeClass)
    return `@media ${query}{${scopedContent}}`
  })

  // Process regular CSS rules
  result = prefixSelectorsInBlock(result, scopeClass)

  // Restore keyframes blocks
  keyframesBlocks.forEach((block, index) => {
    result = result.replace(`__KEYFRAMES_${index}__`, block)
  })

  return result
}

/**
 * Prefix selectors in a CSS block.
 */
function prefixSelectorsInBlock(css: string, scopeClass: string): string {
  // Match selector { properties } patterns
  return css.replace(/([^{}@]+?)(\{[^{}]*\})/g, (match, selectors, block) => {
    const trimmedSelectors = selectors.trim()

    // Skip if empty or starts with @ or is a placeholder
    if (
      !trimmedSelectors ||
      trimmedSelectors.startsWith('@') ||
      trimmedSelectors.startsWith('__KEYFRAMES_')
    ) {
      return match
    }

    // Skip percentage selectors (keyframe steps)
    if (
      /^\d+%$/.test(trimmedSelectors) ||
      trimmedSelectors === 'from' ||
      trimmedSelectors === 'to'
    ) {
      return match
    }

    // Prefix each selector
    const prefixedSelectors = selectors
      .split(',')
      .map((s: string) => {
        const trimmed = s.trim()
        if (!trimmed) return s

        // Handle :root specially
        if (trimmed === ':root') {
          return `.${scopeClass}`
        }

        return `.${scopeClass} ${trimmed}`
      })
      .join(', ')

    return `${prefixedSelectors}${block}`
  })
}
