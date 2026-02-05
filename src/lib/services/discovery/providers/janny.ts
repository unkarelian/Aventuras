import type { DiscoveryProvider, DiscoveryCard, SearchOptions, SearchResult } from '../types'
import { corsFetch, GENERIC_ICON } from '../utils'

const JANNY_SEARCH_URL = 'https://search.jannyai.com/multi-search'
const JANNY_IMAGE_BASE = 'https://image.jannyai.com/bot-avatars/'

// Cached token
let cachedToken: string | null = null
const FALLBACK_TOKEN = '88a6463b66e04fb07ba87ee3db06af337f492ce511d93df6e2d2968cb2ff2b30'

// JannyAI tag ID to name mapping
const JANNYAI_TAGS: Record<number, string> = {
  1: 'Male',
  2: 'Female',
  3: 'Non-binary',
  4: 'Celebrity',
  5: 'OC',
  6: 'Fictional',
  7: 'Real',
  8: 'Game',
  9: 'Anime',
  10: 'Historical',
  11: 'Royalty',
  12: 'Detective',
  13: 'Hero',
  14: 'Villain',
  15: 'Magical',
  16: 'Non-human',
  17: 'Monster',
  18: 'Monster Girl',
  19: 'Alien',
  20: 'Robot',
  21: 'Politics',
  22: 'Vampire',
  23: 'Giant',
  24: 'OpenAI',
  25: 'Elf',
  26: 'Multiple',
  27: 'VTuber',
  28: 'Dominant',
  29: 'Submissive',
  30: 'Scenario',
  31: 'Pokemon',
  32: 'Assistant',
  34: 'Non-English',
  36: 'Philosophy',
  38: 'RPG',
  39: 'Religion',
  41: 'Books',
  42: 'AnyPOV',
  43: 'Angst',
  44: 'Demi-Human',
  45: 'Enemies to Lovers',
  46: 'Smut',
  47: 'MLM',
  48: 'WLW',
  49: 'Action',
  50: 'Romance',
  51: 'Horror',
  52: 'Slice of Life',
  53: 'Fantasy',
  54: 'Drama',
  55: 'Comedy',
  56: 'Mystery',
  57: 'Sci-Fi',
  59: 'Yandere',
  60: 'Furry',
  61: 'Movies/TV',
}

async function getSearchToken(): Promise<string> {
  if (cachedToken) return cachedToken

  try {
    // Attempt to fetch the token from JannyAI's client-side config
    const pageResponse = await corsFetch('https://jannyai.com/characters/search', {
      headers: { Accept: 'text/html' },
    })

    if (!pageResponse.ok) throw new Error('Failed to fetch search page')

    const pageHtml = await pageResponse.text()
    const configMatch = pageHtml.match(/client-config\.[a-zA-Z0-9_-]+\.js/)

    if (configMatch) {
      const configResponse = await corsFetch(`https://jannyai.com/_astro/${configMatch[0]}`)
      if (configResponse.ok) {
        const configJs = await configResponse.text()
        const tokenMatch = configJs.match(/"([a-f0-9]{64})"/)
        if (tokenMatch) {
          cachedToken = tokenMatch[1]
          console.log('[Janny] Fetched fresh search token')
          return cachedToken
        }
      }
    }
  } catch (error) {
    console.warn('[Janny] Failed to fetch token, using fallback:', error)
  }

  cachedToken = FALLBACK_TOKEN
  return cachedToken
}

export class JannyProvider implements DiscoveryProvider {
  id = 'janny'
  name = 'JannyAI'
  icon = GENERIC_ICON
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    if (type === 'lorebook') {
      return { cards: [], hasMore: false }
    }

    const token = await getSearchToken()
    const sortMap: Record<string, string> = {
      popular: 'createdAtStamp:desc',
      new: 'createdAtStamp:desc',
      name: 'name:asc',
    }

    const requestBody = {
      queries: [
        {
          indexUid: 'janny-characters',
          q: options.query || '',
          facets: ['isLowQuality', 'tagIds', 'totalToken'],
          attributesToCrop: ['description:300'],
          cropMarker: '...',
          filter:
            options.nsfw === false
              ? [`totalToken <= 4101 AND totalToken >= 29`, `(isNsfw = false)`]
              : [`totalToken <= 4101 AND totalToken >= 29`],
          attributesToHighlight: ['name', 'description'],
          highlightPreTag: '__ais-highlight__',
          highlightPostTag: '__/ais-highlight__',
          hitsPerPage: options.limit || 40,
          page: options.page || 1,
          sort: [sortMap[options.sort || 'popular']],
        },
      ],
    }

    console.log('[Janny] Searching:', options.query)

    const response = await corsFetch(JANNY_SEARCH_URL, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: 'https://jannyai.com',
        Referer: 'https://jannyai.com/',
        'x-meilisearch-client': 'Meilisearch instant-meilisearch (v0.19.0)',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`JannyAI search error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    const results = data?.results?.[0] || {}
    const hits = results.hits || []

    const cards = hits.map((hit: any) => this.transformCard(hit, type))
    const hasMore = hits.length >= (options.limit || 40)

    return {
      cards,
      hasMore,
      nextPage: hasMore ? (options.page || 1) + 1 : undefined,
    }
  }

  private transformCard(hit: any, type: 'character' | 'lorebook' | 'scenario'): DiscoveryCard {
    const tags = (hit.tagIds || []).map((id: number) => JANNYAI_TAGS[id] || `Tag ${id}`)
    if (hit.isNsfw && !tags.includes('NSFW')) {
      tags.unshift('NSFW')
    }

    const slug = (hit.name || 'character')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)

    const avatarUrl = hit.avatar ? `${JANNY_IMAGE_BASE}${hit.avatar}` : ''

    const pageUrl = `https://jannyai.com/characters/${hit.id}_character-${slug}`

    return {
      id: hit.id,
      name: hit.name || 'Unnamed',
      creator: '', // JannyAI doesn't provide creator in search results
      description: this.stripHtml(hit.description || ''),
      avatarUrl,
      imageUrl: avatarUrl, // Use avatar as main image
      tags,
      stats: {
        downloads: hit.stats?.chatCount || 0,
      },
      source: 'janny',
      type: type === 'scenario' ? 'character' : type, // Normalize scenario to character
      nsfw: hit.isNsfw || false,
      raw: { ...hit, slug, pageUrl },
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    // JannyAI cards need to be fetched from the character page and parsed
    // We return the page URL - downloadCard will handle the scraping
    const slug = card.raw?.slug || 'character'
    return `https://jannyai.com/characters/${card.id}_${slug}`
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    // For JannyAI, we need to scrape the character page to get full data
    const url = await this.getDownloadUrl(card)
    console.log('[Janny] Fetching character page:', url)

    const response = await corsFetch(url, {
      headers: { Accept: 'text/html' },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch JannyAI character: ${response.status}`)
    }

    const html = await response.text()
    const characterData = this.parseAstroProps(html)

    // Convert to SillyTavern-compatible JSON format
    const stCard = this.convertToSTFormat(characterData)
    const jsonString = JSON.stringify(stCard, null, 2)

    return new Blob([jsonString], { type: 'application/json' })
  }

  private parseAstroProps(html: string): any {
    const astroMatch = html.match(
      /astro-island[^>]*component-export="CharacterButtons"[^>]*props="([^"]+)"/,
    )
    if (!astroMatch) {
      throw new Error('Could not find character data in JannyAI page')
    }

    const propsEncoded = astroMatch[1]
    const propsDecoded = propsEncoded
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")

    const propsJson = JSON.parse(propsDecoded)
    return this.decodeAstroValue(propsJson.character)
  }

  private decodeAstroValue(value: any): any {
    if (!Array.isArray(value)) return value
    const [type, data] = value
    if (type === 0) {
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        const decoded: Record<string, any> = {}
        for (const [key, val] of Object.entries(data)) {
          decoded[key] = this.decodeAstroValue(val)
        }
        return decoded
      }
      return data
    } else if (type === 1) {
      return data.map((item: any) => this.decodeAstroValue(item))
    }
    return data
  }

  private convertToSTFormat(char: any): any {
    const tags = (char.tagIds || []).map((id: number) => JANNYAI_TAGS[id] || `Tag ${id}`)

    return {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: char.name || 'Unnamed',
        description: char.personality || '',
        personality: '',
        scenario: char.scenario || '',
        first_mes: char.firstMessage || '',
        mes_example: char.exampleDialogs || '',
        creator_notes: this.stripHtml(char.description || ''),
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags,
        creator: '',
        character_version: '1.0',
        extensions: {
          jannyai: {
            id: char.id,
            creatorId: char.creatorId,
          },
        },
      },
    }
  }

  async getTags(): Promise<string[]> {
    // JannyAI has a fixed set of tags - return them sorted alphabetically
    return Object.values(JANNYAI_TAGS).sort()
  }
}
