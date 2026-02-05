/**
 * Font detection utility using canvas measurement technique.
 * Tests if a font is available by comparing rendered text width
 * against a fallback font.
 */

// Test string with varied characters for accurate detection
const TEST_STRING = 'mmmmmmmmmmlli'

// Base fonts that are guaranteed to exist and have distinct metrics
const BASE_FONTS = ['monospace', 'sans-serif', 'serif'] as const

// Cache for font detection results
const fontCache = new Map<string, boolean>()

// Canvas context for measuring text (lazily initialized)
let ctx: CanvasRenderingContext2D | null = null

function getContext(): CanvasRenderingContext2D {
  if (!ctx) {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext('2d')!
  }
  return ctx
}

function measureText(fontFamily: string): number {
  const context = getContext()
  context.font = `72px ${fontFamily}`
  return context.measureText(TEST_STRING).width
}

/**
 * Check if a font is available on the system.
 * Uses canvas text measurement to detect if the font renders
 * differently than the fallback fonts.
 */
export function isFontAvailable(fontFamily: string): boolean {
  // Check cache first
  if (fontCache.has(fontFamily)) {
    return fontCache.get(fontFamily)!
  }

  // Measure base font widths
  const baseWidths = BASE_FONTS.map(measureText)

  // Measure with the test font (falling back to base fonts)
  const testWidths = BASE_FONTS.map((baseFont) => measureText(`'${fontFamily}', ${baseFont}`))

  // If any measurement differs from base, font is available
  const isAvailable = testWidths.some((width, i) => width !== baseWidths[i])

  // Cache the result
  fontCache.set(fontFamily, isAvailable)

  return isAvailable
}

/**
 * Filter a list of fonts to only those available on the system.
 */
export function getAvailableFonts(fonts: string[]): string[] {
  return fonts.filter(isFontAvailable)
}

/**
 * Common system fonts to test for availability.
 * Organized by category for better UX.
 */
export const SYSTEM_FONT_CANDIDATES = {
  serif: [
    'Georgia',
    'Times New Roman',
    'Palatino Linotype',
    'Palatino',
    'Book Antiqua',
    'Garamond',
    'Baskerville',
    'Cambria',
    'Didot',
    'Hoefler Text',
    'Bookman Old Style',
    'Century Schoolbook',
    'American Typewriter',
  ],
  sansSerif: [
    'Arial',
    'Helvetica',
    'Helvetica Neue',
    'Verdana',
    'Trebuchet MS',
    'Gill Sans',
    'Segoe UI',
    'Tahoma',
    'Geneva',
    'Lucida Grande',
    'Lucida Sans Unicode',
    'SF Pro Display',
    'SF Pro Text',
    '-apple-system',
    'BlinkMacSystemFont',
  ],
  monospace: [
    'Courier New',
    'Courier',
    'Lucida Console',
    'Monaco',
    'Consolas',
    'Menlo',
    'SF Mono',
    'DejaVu Sans Mono',
    'Liberation Mono',
  ],
}

/**
 * Get all available system fonts, categorized.
 */
export function getAvailableSystemFonts(): {
  serif: string[]
  sansSerif: string[]
  monospace: string[]
} {
  return {
    serif: getAvailableFonts(SYSTEM_FONT_CANDIDATES.serif),
    sansSerif: getAvailableFonts(SYSTEM_FONT_CANDIDATES.sansSerif),
    monospace: getAvailableFonts(SYSTEM_FONT_CANDIDATES.monospace),
  }
}

/**
 * Get a flat list of all available system fonts.
 */
export function getAllAvailableSystemFonts(): string[] {
  const available = getAvailableSystemFonts()
  return [...available.serif, ...available.sansSerif, ...available.monospace]
}
