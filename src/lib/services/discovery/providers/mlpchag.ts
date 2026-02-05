import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch, GENERIC_ICON } from '../utils'

const MLPCHAG_API_URL = 'https://mlpchag.neocities.org/mares.json'

// In-memory cache
let cachedCards: any[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export class MlpchagProvider implements DiscoveryProvider {
  id = 'mlpchag'
  name = 'MLPChag'
  icon = GENERIC_ICON
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    if (type === 'lorebook') {
      return { cards: [], hasMore: false }
    }

    // Refresh cache if needed
    if (!cachedCards || Date.now() - lastFetchTime > CACHE_TTL) {
      console.log('[MLPChag] Fetching full index...')
      const response = await corsFetch(MLPCHAG_API_URL)
      if (!response.ok) {
        throw new Error(`MLPChag API error: ${response.status}`)
      }
      const data = await response.json()

      // Transform all cards
      cachedCards = Object.entries(data).map(([key, value]) => this.transformCard(key, value))
      lastFetchTime = Date.now()
      console.log(`[MLPChag] Loaded ${cachedCards.length} cards`)
    }

    if (!cachedCards) return { cards: [], hasMore: false }

    // Filter
    let filtered = cachedCards

    if (options.query) {
      const q = options.query.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.creator.toLowerCase().includes(q) ||
          (c.tags || []).some((t: string) => t.toLowerCase().includes(q)),
      )
    }

    if (options.tags && options.tags.length > 0) {
      const requiredTags = options.tags.map((t) => t.toLowerCase())
      filtered = filtered.filter((c) =>
        requiredTags.every((rt) => (c.tags || []).some((t: string) => t.toLowerCase() === rt)),
      )
    }

    // Sort (client-side)
    if (options.sort === 'new') {
      filtered.sort(
        (a, b) =>
          new Date(b.raw.datecreate || 0).getTime() - new Date(a.raw.datecreate || 0).getTime(),
      )
    } else if (options.sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    }
    // Default is arbitrary (source order)

    // Paginate
    const page = options.page || 1
    const limit = options.limit || 48
    const start = (page - 1) * limit
    const end = start + limit

    const pageItems = filtered.slice(start, end)
    const hasMore = end < filtered.length

    return {
      cards: pageItems,
      hasMore,
      nextPage: hasMore ? page + 1 : undefined,
    }
  }

  private transformCard(key: string, node: any): DiscoveryCard {
    const parts = key.split('/')
    const author = parts.length > 1 ? parts[0] : 'Unknown'
    const filename = parts.length > 1 ? parts.slice(1).join('/') : key

    const encodedKey = parts.map((part) => encodeURIComponent(part)).join('/')
    const imageUrl = `https://mlpchag.neocities.org/cards/${encodedKey}`

    return {
      id: `mlpchag_${key}`,
      name: node.name || filename.replace(/\.png$/i, ''),
      creator: node.author || author,
      description: node.description || '',
      avatarUrl: imageUrl,
      imageUrl: imageUrl,
      tags: node.tags || [],
      stats: {},
      source: 'mlpchag',
      type: 'character',
      nsfw: node.nsfw === true,
      raw: { ...node, _key: key },
    }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    return card.imageUrl || ''
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    // We can construct JSON from the raw data
    const raw = card.raw
    const stCard = {
      name: card.name,
      description: raw.description || '',
      personality: raw.personality || '',
      scenario: raw.scenario || '',
      first_mes: raw.greetings?.[0] || raw.first_mes || '',
      mes_example: raw.examples || raw.mes_example || '',
      creator_notes: raw.creator_notes || '',
      system_prompt: raw.system_prompt || '',
      post_history_instructions: raw.post_history_instructions || '',
      alternate_greetings: raw.greetings?.slice(1) || raw.alternate_greetings || [],
      tags: card.tags,
      creator: card.creator,
      character_version: raw.character_version || '',
      character_book: raw.character_book || raw.lorebook,
    }

    return new Blob([JSON.stringify(stCard, null, 2)], { type: 'application/json' })
  }

  async getTags(): Promise<string[]> {
    return []
  }
}
