/**
 * Inline Image Parser
 * 
 * Parses and extracts <pic> tags from narrative content for inline image generation.
 * Similar to the st-image-auto-generation SillyTavern plugin approach.
 */

export interface ParsedPicTag {
  /** Full original tag text */
  originalTag: string;
  /** Start position in content */
  startIndex: number;
  /** End position in content */
  endIndex: number;
  /** Image generation prompt */
  prompt: string;
  /** Character names for portrait reference */
  characters: string[];
}

/**
 * Extract all <pic> tags from content.
 * Supports both self-closing (<pic ... />) and paired tags (<pic ...></pic>).
 * 
 * @param content - The narrative content to parse
 * @returns Array of parsed pic tags with their positions and attributes
 */
export function extractPicTags(content: string): ParsedPicTag[] {
  const tags: ParsedPicTag[] = [];
  
  // Match <pic ... /> or <pic ...></pic>
  // Handles multiline prompts and various attribute orders
  // Captures: full match, attributes section
  const regex = /<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const attributes = match[1];
    
    // Extract prompt attribute (required)
    const promptMatch = attributes.match(/prompt=["']([^"']+)["']/i);
    const prompt = promptMatch ? promptMatch[1] : '';
    
    // Extract characters attribute (optional)
    const charsMatch = attributes.match(/characters=["']([^"']*)["']/i);
    const characters = charsMatch 
      ? charsMatch[1].split(',').map(c => c.trim()).filter(c => c)
      : [];
    
    // Only include tags with valid prompts
    if (prompt && prompt.length >= 10) {
      tags.push({
        originalTag: fullMatch,
        startIndex: match.index,
        endIndex: match.index + fullMatch.length,
        prompt,
        characters,
      });
    }
  }
  
  return tags;
}

/**
 * Check if content contains incomplete <pic tags (for streaming buffer).
 * Used to determine safe render points during streaming.
 * 
 * @param content - The content to check
 * @returns Object with incomplete flag and safe end position
 */
export function hasIncompletePicTag(content: string): { incomplete: boolean; safeEnd: number } {
  const lastPicOpen = content.lastIndexOf('<pic');
  
  if (lastPicOpen === -1) {
    return { incomplete: false, safeEnd: content.length };
  }
  
  // Check if there's a closing after the last open
  const afterOpen = content.slice(lastPicOpen);
  const hasClose = afterOpen.includes('/>') || afterOpen.includes('</pic>');
  
  if (hasClose) {
    return { incomplete: false, safeEnd: content.length };
  }
  
  return { incomplete: true, safeEnd: lastPicOpen };
}

/**
 * Escape HTML special characters for safe attribute values.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace <pic> tags with loading placeholders during streaming.
 * Shows a visual placeholder while images are being generated.
 *
 * @param content - The content with <pic> tags
 * @returns Content with placeholders instead of <pic> tags
 */
export function replacePicTagsWithPlaceholders(content: string): string {
  return content.replace(
    /<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi,
    (match, attrs) => {
      const promptMatch = attrs.match(/prompt=["']([^"']+)["']/i);
      const prompt = promptMatch ? promptMatch[1] : 'Image';
      const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;

      return `<div class="inline-image-placeholder generating" data-prompt="${escapeHtml(prompt)}">
        <div class="placeholder-shimmer"></div>
        <div class="placeholder-content">
          <div class="placeholder-loader">
            <svg class="placeholder-spinner-svg" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
            </svg>
            <svg class="placeholder-image-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
          <div class="placeholder-info">
            <span class="placeholder-status">Generating image...</span>
            <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
          </div>
        </div>
      </div>`;
    }
  );
}

/**
 * Image info for replacement mapping.
 */
export interface ImageReplacementInfo {
  imageData: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  id: string;
  errorMessage?: string;
}

/**
 * Replace <pic> tags with actual images or status placeholders.
 * Uses a map keyed by original tag text to match images to their tags.
 *
 * @param content - The content with <pic> tags
 * @param imageMap - Map of original tag text to image info
 * @param regeneratingIds - Optional set of image IDs currently being regenerated
 * @returns Content with images or placeholders instead of <pic> tags
 */
export function replacePicTagsWithImages(
  content: string,
  imageMap: Map<string, ImageReplacementInfo>,
  regeneratingIds?: Set<string>
): string {
  return content.replace(
    /<pic\s+([^>]*?)(?:\/>|>\s*<\/pic>)/gi,
    (match, attrs) => {
      const promptMatch = attrs.match(/prompt=["']([^"']+)["']/i);
      const prompt = promptMatch ? promptMatch[1] : '';
      const shortPrompt = prompt.length > 60 ? prompt.slice(0, 60) + '...' : prompt;

      // Look up by original tag text
      const imageInfo = imageMap.get(match);

      if (!imageInfo) {
        // No image record - this shouldn't happen after streaming completes
        // Just hide the tag (image may have failed to queue)
        return '';
      }

      if (imageInfo.status === 'complete' && imageInfo.imageData) {
        const isRegenerating = regeneratingIds?.has(imageInfo.id) ?? false;
        // Successfully generated - show clickable image (opens modal on click)
        // If regenerating, show loading overlay
        if (isRegenerating) {
          return `<div class="inline-generated-image regenerating" data-image-id="${imageInfo.id}" data-prompt="${escapeHtml(prompt)}">
            <img src="data:image/png;base64,${imageInfo.imageData}" alt="${escapeHtml(prompt)}" loading="lazy" class="regenerating-image" />
            <div class="regenerating-overlay">
              <div class="regenerating-content">
                <svg class="regenerating-spinner" viewBox="0 0 50 50">
                  <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
                </svg>
                <span class="regenerating-text">Regenerating...</span>
              </div>
            </div>
          </div>`;
        }
        return `<div class="inline-generated-image" data-image-id="${imageInfo.id}" data-prompt="${escapeHtml(prompt)}" data-action="view" role="button" tabindex="0"><img src="data:image/png;base64,${imageInfo.imageData}" alt="${escapeHtml(prompt)}" loading="lazy" /></div>`;
      }

      if (imageInfo.status === 'generating') {
        // Currently generating - show animated loading state
        return `<div class="inline-image-placeholder generating" data-image-id="${imageInfo.id}" data-prompt="${escapeHtml(prompt)}">
          <div class="placeholder-shimmer"></div>
          <div class="placeholder-content">
            <div class="placeholder-loader">
              <svg class="placeholder-spinner-svg" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
              </svg>
              <svg class="placeholder-image-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <circle cx="9" cy="9" r="2"/>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
              </svg>
            </div>
            <div class="placeholder-info">
              <span class="placeholder-status">Generating image...</span>
              <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
            </div>
          </div>
        </div>`;
      }

      if (imageInfo.status === 'failed') {
        // Failed - show error state with retry button
        const errorMsg = imageInfo.errorMessage || 'Generation failed';
        return `<div class="inline-image-placeholder failed" data-image-id="${imageInfo.id}" data-prompt="${escapeHtml(prompt)}">
          <div class="placeholder-content">
            <div class="placeholder-error-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" x2="12" y1="8" y2="12"/>
                <line x1="12" x2="12.01" y1="16" y2="16"/>
              </svg>
            </div>
            <div class="placeholder-info">
              <span class="placeholder-status error">${escapeHtml(errorMsg)}</span>
              <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
            </div>
            <button class="inline-image-btn retry-btn" data-action="regenerate" data-image-id="${imageInfo.id}" title="Retry generation">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
              Retry
            </button>
          </div>
        </div>`;
      }

      // Pending state - image record exists but hasn't started generating yet
      return `<div class="inline-image-placeholder pending" data-image-id="${imageInfo.id}" data-prompt="${escapeHtml(prompt)}">
        <div class="placeholder-shimmer"></div>
        <div class="placeholder-content">
          <div class="placeholder-loader">
            <svg class="placeholder-spinner-svg pending" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="80, 200" stroke-dashoffset="0"></circle>
            </svg>
            <svg class="placeholder-image-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <circle cx="9" cy="9" r="2"/>
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
            </svg>
          </div>
          <div class="placeholder-info">
            <span class="placeholder-status">In queue...</span>
            <span class="placeholder-prompt">${escapeHtml(shortPrompt)}</span>
          </div>
        </div>
      </div>`;
    }
  );
}

/**
 * Count the number of <pic> tags in content.
 * Useful for quick checks without full parsing.
 * 
 * @param content - The content to check
 * @returns Number of <pic> tags found
 */
export function countPicTags(content: string): number {
  const regex = /<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/gi;
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Check if content contains any <pic> tags.
 * 
 * @param content - The content to check
 * @returns True if at least one <pic> tag is found
 */
export function hasPicTags(content: string): boolean {
  return /<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/i.test(content);
}

/**
 * Strip all <pic> tags from content, leaving just the text.
 * Useful for word count or plain text extraction.
 * 
 * @param content - The content with <pic> tags
 * @returns Content without <pic> tags
 */
export function stripPicTags(content: string): string {
  return content.replace(/<pic\s+[^>]*?(?:\/>|>\s*<\/pic>)/gi, '');
}
