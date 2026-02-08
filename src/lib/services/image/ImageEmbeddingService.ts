/**
 * ImageEmbeddingService - Processes narrative content to render embedded images inline.
 * Handles three modes: Standard (analyzed), Visual Prose, and Inline (<pic> tags).
 */

import type { EmbeddedImage } from '$lib/types'
import { parseMarkdown } from '$lib/utils/markdown'
import { sanitizeVisualProse } from '$lib/utils/htmlSanitize'
import { replacePicTagsWithImages, type ImageReplacementInfo } from '$lib/utils/inlineImageParser'

interface ImageMarker {
  start: number
  end: number
  imageId: string
  status: string
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getDisplayableImages(images: EmbeddedImage[]): EmbeddedImage[] {
  return images.filter(
    (img) => img.status === 'complete' || img.status === 'generating' || img.status === 'pending',
  )
}

/** Find and mark all source text matches, sorted longest-first to avoid partial matches. */
function buildMarkers(content: string, images: EmbeddedImage[]): ImageMarker[] {
  const sortedImages = [...images].sort((a, b) => b.sourceText.length - a.sourceText.length)
  const markers: ImageMarker[] = []

  for (const img of sortedImages) {
    const regex = new RegExp(escapeRegex(img.sourceText.replaceAll('’', "'")), 'gi')
    let match
    while ((match = regex.exec(content.replaceAll('’', "'"))) !== null) {
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

/** Apply markers to content, wrapping matched text in clickable spans. */
function applyMarkers(
  content: string,
  markers: ImageMarker[],
  regeneratingIds: Set<string>,
): string {
  let processed = content

  for (const marker of markers) {
    const originalText = processed.slice(marker.start, marker.end)
    const isRegenerating = regeneratingIds.has(marker.imageId)
    const statusClass = isRegenerating
      ? 'regenerating'
      : marker.status === 'complete'
        ? 'complete'
        : marker.status === 'generating'
          ? 'generating'
          : 'pending'

    const replacement = `<span class="embedded-image-link ${statusClass}" data-image-id="${marker.imageId}">${originalText}</span>`
    processed = processed.slice(0, marker.start) + replacement + processed.slice(marker.end)
  }

  return processed
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
 * Process standard content with embedded image markers.
 * Wraps matched source text in clickable spans for image expansion.
 */
export function processContentWithImages(
  content: string,
  images: EmbeddedImage[],
  regeneratingIds: Set<string> = new Set(),
): string {
  if (images.length === 0) return parseMarkdown(content)
  const displayable = getDisplayableImages(images)
  const markers = buildMarkers(content, displayable)
  const processed = applyMarkers(content, markers, regeneratingIds)
  return parseMarkdown(processed)
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
  const displayable = getDisplayableImages(images)
  const markers = buildMarkers(content, displayable)
  const processed = applyMarkers(content, markers, regeneratingIds)
  return sanitizeVisualProse(processed, entryId)
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
