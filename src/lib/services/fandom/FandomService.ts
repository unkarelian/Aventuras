/**
 * FandomService - MediaWiki API client for Fandom wikis
 *
 * Uses Tauri's HTTP plugin via corsFetch to bypass CORS restrictions.
 * Provides search and article fetching capabilities for creating lorebook entries.
 * Supports section-by-section reading to avoid fetching entire large articles at once.
 */

import { corsFetch } from '../discovery/utils'

export interface FandomSearchResult {
  title: string
  snippet: string
  pageid: number
  wordcount: number
}

export interface FandomSection {
  index: string
  number: string
  line: string // Section title
  level: string // Heading level (1-6)
}

export interface FandomArticleInfo {
  title: string
  pageid: number
  sections: FandomSection[]
  categories: string[]
}

export interface FandomSectionContent {
  title: string
  sectionTitle: string
  sectionIndex: string
  content: string
}

interface MediaWikiSearchResponse {
  query?: {
    search: Array<{
      title: string
      snippet: string
      pageid: number
      wordcount: number
    }>
  }
  error?: {
    code: string
    info: string
  }
}

interface MediaWikiParseResponse {
  parse?: {
    title: string
    pageid: number
    // Text can be string (formatversion=2) or object with '*' key (formatversion=1)
    text?: string | { '*': string }
    sections: Array<{ line: string; number: string; index: string; level: string }>
    // Categories can be in formatversion=2 or formatversion=1 format
    categories: Array<{ category: string; hidden?: boolean } | { '*': string }>
  }
  error?: {
    code: string
    info: string
  }
}

export class FandomService {
  /**
   * Build the base API URL for a Fandom wiki
   */
  private getApiUrl(wiki: string): string {
    // Normalize wiki name (lowercase, no spaces)
    const normalizedWiki = wiki.toLowerCase().replace(/\s+/g, '')
    return `https://${normalizedWiki}.fandom.com/api.php`
  }

  /**
   * Search for articles on a Fandom wiki
   */
  async search(wiki: string, query: string, limit: number = 10): Promise<FandomSearchResult[]> {
    const apiUrl = this.getApiUrl(wiki)
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(Math.min(limit, 50)), // MediaWiki caps at 50
      format: 'json',
      formatversion: '2',
    })

    const url = `${apiUrl}?${params.toString()}`

    try {
      const response = await corsFetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as MediaWikiSearchResponse

      if (data.error) {
        throw new Error(`MediaWiki API error: ${data.error.info}`)
      }

      if (!data.query?.search) {
        return []
      }

      return data.query.search.map((item) => ({
        title: item.title,
        snippet: this.stripHtmlTags(item.snippet),
        pageid: item.pageid,
        wordcount: item.wordcount,
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to search ${wiki} wiki: ${message}`)
    }
  }

  /**
   * Get article info including section list (without full content)
   * This is a lightweight call to understand the article structure before fetching sections.
   */
  async getArticleInfo(wiki: string, title: string): Promise<FandomArticleInfo> {
    const apiUrl = this.getApiUrl(wiki)
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      prop: 'sections|categories',
      format: 'json',
      formatversion: '2',
    })

    const url = `${apiUrl}?${params.toString()}`

    try {
      const response = await corsFetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as MediaWikiParseResponse

      if (data.error) {
        if (data.error.code === 'missingtitle') {
          throw new Error(`Article "${title}" not found on ${wiki} wiki`)
        }
        throw new Error(`MediaWiki API error: ${data.error.info}`)
      }

      if (!data.parse) {
        throw new Error(`No content returned for "${title}"`)
      }

      return {
        title: data.parse.title,
        pageid: data.parse.pageid,
        sections: data.parse.sections.map((sec) => ({
          index: sec.index,
          number: sec.number,
          line: sec.line,
          level: sec.level,
        })),
        categories: data.parse.categories.map((cat) =>
          'category' in cat ? cat.category : cat['*'],
        ),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to get article info for "${title}" from ${wiki} wiki: ${message}`)
    }
  }

  /**
   * Fetch a specific section of an article by section index.
   * Use section=0 for the lead/intro section (content before first heading).
   */
  async getSection(
    wiki: string,
    title: string,
    sectionIndex: string,
  ): Promise<FandomSectionContent> {
    const apiUrl = this.getApiUrl(wiki)
    const params = new URLSearchParams({
      action: 'parse',
      page: title,
      section: sectionIndex,
      prop: 'text',
      format: 'json',
      formatversion: '2',
    })

    const url = `${apiUrl}?${params.toString()}`

    try {
      const response = await corsFetch(url)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as MediaWikiParseResponse

      if (data.error) {
        if (data.error.code === 'missingtitle') {
          throw new Error(`Article "${title}" not found on ${wiki} wiki`)
        }
        if (data.error.code === 'nosuchsection') {
          throw new Error(`Section ${sectionIndex} not found in article "${title}"`)
        }
        throw new Error(`MediaWiki API error: ${data.error.info}`)
      }

      if (!data.parse) {
        throw new Error(`No content returned for section ${sectionIndex} of "${title}"`)
      }

      // Handle both formatversion=2 (text as string) and formatversion=1 (text as object with '*')
      const parseText = data.parse.text
      let rawHtml: string
      if (typeof parseText === 'string') {
        rawHtml = parseText
      } else if (parseText && typeof parseText === 'object' && '*' in parseText) {
        rawHtml = (parseText as { '*': string })['*']
      } else if (parseText === undefined || parseText === null) {
        throw new Error(
          `No text content returned for section ${sectionIndex}. The section may be empty or the wiki may restrict API access.`,
        )
      } else {
        throw new Error(
          `Unexpected text format in API response for section ${sectionIndex}: ${typeof parseText}`,
        )
      }

      const plainText = this.htmlToPlainText(rawHtml)

      // Extract section title from the content if present
      const sectionTitleMatch = plainText.match(/^##?\s*(.+?)(?:\n|$)/)
      const sectionTitle = sectionTitleMatch
        ? sectionTitleMatch[1].trim()
        : sectionIndex === '0'
          ? 'Introduction'
          : `Section ${sectionIndex}`

      return {
        title: data.parse.title,
        sectionTitle,
        sectionIndex,
        content: plainText,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(
        `Failed to fetch section ${sectionIndex} of "${title}" from ${wiki} wiki: ${message}`,
      )
    }
  }

  /**
   * Fetch the lead section (introduction, section 0) of an article.
   * This is typically a good summary to start with.
   */
  async getLeadSection(wiki: string, title: string): Promise<FandomSectionContent> {
    return this.getSection(wiki, title, '0')
  }

  /**
   * Convert wiki HTML to clean plain text
   * Removes navigation elements, scripts, styles, and converts structure to readable format
   */
  htmlToPlainText(html: string): string {
    // Remove script and style tags with their content
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')

    // Remove navigation boxes, infoboxes, and other structural elements
    text = text.replace(
      /<div[^>]*class="[^"]*(?:navbox|infobox|toc|mw-references|reference|reflist|noprint|catlinks|messagebox)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
      '',
    )
    text = text.replace(
      /<table[^>]*class="[^"]*(?:navbox|infobox|wikitable)[^"]*"[^>]*>[\s\S]*?<\/table>/gi,
      '',
    )
    text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

    // Remove figure elements (usually contain images)
    text = text.replace(/<figure[^>]*>[\s\S]*?<\/figure>/gi, '')

    // Remove remaining images and thumbs
    text = text.replace(/<div[^>]*class="[^"]*thumb[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    text = text.replace(/<img[^>]*>/gi, '')

    // Convert headers to markdown-style markers
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n')
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n')

    // Convert paragraphs and breaks
    text = text.replace(/<\/p>/gi, '\n\n')
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<\/div>/gi, '\n')

    // Convert list items
    text = text.replace(/<li[^>]*>/gi, '- ')
    text = text.replace(/<\/li>/gi, '\n')

    // Remove reference markers like [1], [2], etc.
    text = text.replace(/<sup[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
    text = text.replace(/\[\d+\]/g, '')

    // Remove edit section links
    text = text.replace(/<span[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')

    // Strip all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '')

    // Decode HTML entities
    text = this.decodeHtmlEntities(text)

    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    text = text.replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
    text = text.replace(/\n +/g, '\n') // Remove leading spaces on lines
    text = text.replace(/ +\n/g, '\n') // Remove trailing spaces on lines
    text = text.trim()

    return text
  }

  /**
   * Strip HTML tags from a string (simple version for search snippets)
   */
  private stripHtmlTags(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&ndash;': '-',
      '&mdash;': '-',
      '&hellip;': '...',
      '&lsquo;': "'",
      '&rsquo;': "'",
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&bull;': '*',
      '&copy;': '(c)',
      '&reg;': '(R)',
      '&trade;': '(TM)',
      '&times;': 'x',
      '&divide;': '/',
      '&frac12;': '1/2',
      '&frac14;': '1/4',
      '&frac34;': '3/4',
    }

    let result = text
    for (const [entity, replacement] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'gi'), replacement)
    }

    // Handle numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )

    return result
  }
}
