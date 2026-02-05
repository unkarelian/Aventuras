export function normalizeImageDataUrl(imageData: string | null | undefined): string | null {
  if (!imageData) {
    return null
  }
  if (
    imageData.startsWith('data:image/') ||
    imageData.startsWith('http://') ||
    imageData.startsWith('https://')
  ) {
    return imageData
  }
  // Backward compatibility: stored as raw base64 without a data URL prefix.
  return `data:image/png;base64,${imageData}`
}
