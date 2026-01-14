import { scopeCssSelectors } from './cssScope';
import { hasIncompletePicTag } from './inlineImageParser';

/**
 * StreamingHtmlRenderer - Handles incremental HTML parsing for Visual Prose Mode.


 *
 * Features:
 * - Buffers incomplete HTML tags until complete
 * - Buffers incomplete <style> blocks until </style>
 * - Scopes all CSS selectors to prevent leakage between entries
 * - Provides safe HTML output at each chunk
 */
export class StreamingHtmlRenderer {
  private buffer = '';
  private safeHtml = '';
  private scopeClass: string;

  constructor(entryId: string) {
    this.scopeClass = `vp-${entryId.slice(0, 8)}`;
  }

  /**
   * Append a chunk and return safely renderable HTML.
   */
  append(chunk: string): string {
    this.buffer += chunk;
    this.processBuffer();
    return this.getWrappedOutput();
  }

  /**
   * Finalize - flush remaining buffer.
   */
  flush(): string {
    const remaining = this.scopeCss(this.buffer);
    this.safeHtml += remaining;
    this.buffer = '';
    return this.getWrappedOutput();
  }

  /**
   * Get the raw accumulated content (for storage without wrapper).
   */
  getRawContent(): string {
    return this.safeHtml + this.buffer;
  }

  private processBuffer(): void {
    const safeEnd = this.findSafeRenderPoint();
    if (safeEnd > 0) {
      const safeChunk = this.buffer.slice(0, safeEnd);
      this.safeHtml += this.scopeCss(safeChunk);
      this.buffer = this.buffer.slice(safeEnd);
    }
  }

private findSafeRenderPoint(): number {
    const html = this.buffer;

    // Check for incomplete <pic> tags (inline image mode)
    const picResult = hasIncompletePicTag(html);
    if (picResult.incomplete) {
      // If we have an incomplete <pic> tag, only render up to that point
      return Math.min(this.findHtmlSafePoint(html), picResult.safeEnd);
    }

    // Check if we're inside an incomplete <style> block
    const styleOpenIndex = html.lastIndexOf('<style');
    const styleCloseIndex = html.lastIndexOf('</style>');
    if (styleOpenIndex > styleCloseIndex) {
      // Inside a style block - don't render any of it yet
      return styleOpenIndex;
    }

    return this.findHtmlSafePoint(html);
  }

  private findHtmlSafePoint(html: string): number {
    // Find last complete tag (last '>' not inside an incomplete tag or comment)
    let lastSafeIndex = 0;
    let inTag = false;
    let inString = false;
    let stringChar = '';
    let inComment = false;

    for (let i = 0; i < html.length; i++) {
      const char = html[i];

      // Handle comments - ignore everything inside
      if (inComment) {
        if (char === '>' && i >= 2 && html[i - 1] === '-' && html[i - 2] === '-') {
          inComment = false;
          lastSafeIndex = i + 1;
        }
        continue;
      }

      // Track string boundaries within tags
      if (inTag && !inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        inString = false;
        stringChar = '';
      }

      // Track tag boundaries
      if (!inString) {
        if (char === '<') {
          // Check for comment start
          if (!inTag && html.startsWith('<!--', i)) {
            inComment = true;
          } else {
            inTag = true;
          }
        } else if (char === '>') {
          if (inTag) {
            inTag = false;
            lastSafeIndex = i + 1;
          }
        }
      }
    }

    // If we're currently inside a tag or comment, don't include it
    return (inTag || inComment) ? lastSafeIndex : html.length;
  }


  private scopeCss(html: string): string {
    // Find all <style>...</style> blocks and prefix selectors
    return html.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs, css) => {
      const scopedCss = scopeCssSelectors(css, this.scopeClass);
      return `<style${attrs}>${scopedCss}</style>`;
    });
  }

  private getWrappedOutput(): string {
    // Wrap output in scoped container

    return `<div class="${this.scopeClass} visual-prose-entry">${this.safeHtml}</div>`;
  }
}
