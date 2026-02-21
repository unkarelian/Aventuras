/**
 * ImageEmbeddingService - Processes narrative content to render embedded images inline.
 * Handles three modes: Standard (analyzed), Visual Prose, and Inline (<pic> tags).
 */

import type { EmbeddedImage } from '$lib/types'
import { parseMarkdown } from '$lib/utils/markdown'
import { sanitizeVisualProse } from '$lib/utils/htmlSanitize'
import { replacePicTagsWithImages, type ImageReplacementInfo } from '$lib/utils/inlineImageParser'
import { createFuzzyTextRegex } from '$lib/utils/text'

interface ImageMarker {
  start: number
  end: number
  imageId: string
  status: string
}

function getDisplayableImages(images: EmbeddedImage[]): EmbeddedImage[] {
  return images.filter(
    (img) =>
      (img.status === 'complete' || img.status === 'generating' || img.status === 'pending') &&
      img.sourceText.length >= 20,
  )
}

/** Find and mark all source text matches, sorted reverse by position (for safe replacement). */
function buildMarkers(content: string, images: EmbeddedImage[]): ImageMarker[] {
  const displayable = getDisplayableImages(images)
  const sortedImages = [...displayable].sort((a, b) => b.sourceText.length - a.sourceText.length)
  const markers: ImageMarker[] = []

  for (const img of sortedImages) {
    const regex = createFuzzyTextRegex(img.sourceText)

    let match
    while ((match = regex.exec(content)) !== null) {
      const start = match.index
      const end = start + match[0].length

      const overlaps = markers.some(
        (m) =>
          (start >= m.start && start < m.end) ||
          (end > m.start && end <= m.end) ||
          (start <= m.start && end >= m.end),
      )

      if (!overlaps) {
        markers.push({ start, end, imageId: img.id, status: img.status })
      }
    }
  }

  return markers.sort((a, b) => b.start - a.start)
}

/**
 * Replace matched source text with placeholder tokens, render via `render()`,
 * then swap placeholders back with the actual image-link HTML spans.
 */
function applyMarkersWithPlaceholders(
  content: string,
  images: EmbeddedImage[],
  regeneratingIds: Set<string>,
  render: (text: string) => string,
): string {
  const markers = buildMarkers(content, images)
  if (markers.length === 0) return render(content)

  let text = content
  const placeholderMap = new Map<string, string>()

  // markers are already reverse-sorted by position
  for (const marker of markers) {
    const originalText = content.slice(marker.start, marker.end)
    const placeholder = `IMGPH_${marker.imageId.replace(/-/g, '')}`

    const statusClass = regeneratingIds.has(marker.imageId)
      ? 'regenerating'
      : marker.status === 'complete'
        ? 'complete'
        : marker.status === 'generating'
          ? 'generating'
          : 'pending'

    placeholderMap.set(
      placeholder,
      `<span class="embedded-image-link ${statusClass}" data-image-id="${marker.imageId}">${originalText}</span>`,
    )
    text = text.slice(0, marker.start) + placeholder + text.slice(marker.end)
  }

  let html = render(text)
  for (const [placeholder, replacement] of placeholderMap) {
    html = html.replaceAll(placeholder, replacement)
  }
  return html
}

/** Build image map for inline <pic> tag replacement. */
function buildInlineImageMap(images: EmbeddedImage[]): Map<string, ImageReplacementInfo> {
  const imageMap = new Map<string, ImageReplacementInfo>()
  for (const img of images) {
    if (img.generationMode === 'inline') {
      imageMap.set(img.sourceText, {
        imageData: img.imageData,
        status: img.status,
        id: img.id,
        errorMessage: img.errorMessage,
      })
    }
  }
  return imageMap
}

/**
 * Get the IDs of images that would be successfully placed in the content.
 * Uses the exact same logic as the rendering process.
 */
export function getPlacedImageIds(content: string, images: EmbeddedImage[]): Set<string> {
  if (images.length === 0) return new Set()
  const markers = buildMarkers(content, images)
  return new Set(markers.map((m) => m.imageId))
}

/**
 * Process standard content with embedded image markers.
 * Wraps matched source text in clickable spans for image expansion.
 */
export function processContentWithImages(
  content: string,
  images: EmbeddedImage[],
  regeneratingIds: Set<string> = new Set(),
): string {
  if (images.length === 0) return parseMarkdown(content)
  return applyMarkersWithPlaceholders(content, images, regeneratingIds, parseMarkdown)
}

/**
 * Process Visual Prose content with embedded images.
 * Applies image markers before HTML sanitization.
 */
export function processVisualProseWithImages(
  content: string,
  images: EmbeddedImage[],
  entryId: string,
  regeneratingIds: Set<string> = new Set(),
): string {
  if (images.length === 0) return sanitizeVisualProse(content, entryId)
  return applyMarkersWithPlaceholders(content, images, regeneratingIds, (t) =>
    sanitizeVisualProse(t, entryId),
  )
}

/**
 * Process content with inline <pic> tags.
 * Replaces <pic> tags with actual images or status placeholders.
 */
export function processContentWithInlineImages(
  content: string,
  images: EmbeddedImage[],
  regeneratingIds: Set<string> = new Set(),
): string {
  const imageMap = buildInlineImageMap(images)
  const processedContent = replacePicTagsWithImages(content, imageMap, regeneratingIds)
  return parseMarkdown(processedContent)
}

/**
 * Process Visual Prose content with inline <pic> tags.
 * Replaces <pic> tags before applying Visual Prose sanitization.
 */
export function processVisualProseWithInlineImages(
  content: string,
  images: EmbeddedImage[],
  entryId: string,
  regeneratingIds: Set<string> = new Set(),
): string {
  const imageMap = buildInlineImageMap(images)
  const processedContent = replacePicTagsWithImages(content, imageMap, regeneratingIds)
  return sanitizeVisualProse(processedContent, entryId)
}

export const imageEmbeddingService = {
  processContentWithImages,
  processVisualProseWithImages,
  processContentWithInlineImages,
  processVisualProseWithInlineImages,
}
