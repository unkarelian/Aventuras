import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch } from '../utils'

const QUILLGEN_API_URL = 'https://quillgen.app/v1/public/api/browse'

// In-memory cache
let cachedCards: any[] | null = null
let lastFetchTime = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export class QuillGenProvider implements DiscoveryProvider {
  id = 'quillgen'
  name = 'QuillGen.app'
  icon = 'https://quillgen.app/logo-dark.png'
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    if (type === 'lorebook') {
      return { cards: [], hasMore: false }
    }

    if (!cachedCards || Date.now() - lastFetchTime > CACHE_TTL) {
      console.log('[QuillGen] Fetching index...')
      // Fetch up to 500
      const url = `${QUILLGEN_API_URL}/characters?limit=500`
      const response = await corsFetch(url, { headers: { Accept: 'application/json' } })

      if (response.ok) {
        const data = await response.json()
        cachedCards = (data.cards || []).map((c: any) => this.transformCard(c))
        lastFetchTime = Date.now()
      } else {
        console.warn(`[QuillGen] API error: ${response.status}`)
        if (!cachedCards) return { cards: [], hasMore: false }
      }
    }

    if (!cachedCards) return { cards: [], hasMore: false }

    let filtered = cachedCards

    // Filter NSFW
    if (options.nsfw === false) {
      filtered = filtered.filter((c) => !c.nsfw)
    }

    if (options.query) {
      const q = options.query.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.creator.toLowerCase().includes(q) ||
          (c.tags || []).some((t: string) => t.toLowerCase().includes(q)),
      )
    }

    const page = options.page || 1
    const limit = options.limit || 48
    const start = (page - 1) * limit
    const end = start + limit

    return {
      cards: filtered.slice(start, end),
      hasMore: end < filtered.length,
      nextPage: end < filtered.length ? page + 1 : undefined,
    }
  }

  private transformCard(card: any): DiscoveryCard {
    let avatarUrl = card.avatar_url
    if (card.id) {
      avatarUrl = `${QUILLGEN_API_URL}/characters/${card.id}/avatar?size=300&format=webp`
    }

    return {
      id: card.id || card.public_id,
      name: card.name || 'Unnamed',
      creator: card.creator?.name || 'Unknown',
      description: card.description || '',
      avatarUrl: avatarUrl,
      imageUrl: avatarUrl, // Use avatar as main image
      tags: card.tags || [],
      stats: {
        downloads: card.downloads || 0,
      },
      source: 'quillgen',
      type: 'character',
      nsfw: card.nsfw || false,
      raw: card,
    }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    return card.raw?.image_url || ''
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    const url = await this.getDownloadUrl(card)
    const response = await corsFetch(url)
    if (!response.ok) throw new Error(`Failed to download card: ${response.status}`)
    return await response.blob()
  }

  async getTags(): Promise<string[]> {
    return []
  }
}
