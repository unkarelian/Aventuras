import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch, GENERIC_ICON } from '../utils'

const WYVERN_API_BASE = 'https://api.wyvern.chat/exploreSearch'

export class WyvernProvider implements DiscoveryProvider {
  id = 'wyvern'
  name = 'Wyvern Chat'
  icon = GENERIC_ICON // Favicon is rate-limited/protected
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'lorebook', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    const endpoint = type === 'lorebook' ? 'lorebooks' : 'characters'
    const params = new URLSearchParams()

    if (options.query) params.set('q', options.query)
    params.set('page', String(options.page || 1))
    params.set('limit', String(options.limit || 20))

    // Sort
    const sort = options.sort === 'new' ? 'created_at' : options.sort === 'name' ? 'name' : 'votes'
    params.set('sort', sort)
    params.set('order', 'DESC')

    if (options.tags && options.tags.length > 0) {
      params.set('tags', options.tags.join(','))
    }

    // Rating
    if (options.nsfw === false) {
      params.set('rating', 'none')
    } else {
      // If NSFW allowed, we want all
      // API: rating=none (SFW), rating=all (Everything), rating=mature/explicit (Only NSFW)
      // If we want mixed, we might assume default is mixed or send 'all'?
      // Bot Browser sends 'rating' param if set.
      // Let's assume 'all' includes SFW + NSFW if nsfw is true.
      // But Bot Browser says: `if (rating && rating !== 'all') params.set('rating', rating)`.
      // So if 'all', it might omit the param? Or send 'all'?
      // Let's try omitting it for "all" unless we want to force something.
      // Actually, looking at Bot Browser: `rating` defaults to `none` (SFW) in its own logic if not specified?
      // "Bot Browser sends rating param if ... rating !== 'all'".
      // If options.nsfw is true, we want everything. I'll omit the param or send 'all' if the API requires it.
      // Let's try omitting first.
    }

    const url = `${WYVERN_API_BASE}/${endpoint}?${params}`
    console.log('[Wyvern] Searching:', url)

    const response = await corsFetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Wyvern API error: ${response.status}`)
    }

    const data = await response.json()
    const results = data.results || []

    const cards = results.map((node: any) => this.transformCard(node, type))

    return {
      cards,
      hasMore: data.hasMore || false,
      nextPage: data.hasMore ? (data.page || 1) + 1 : undefined,
    }
  }

  private transformCard(node: any, type: 'character' | 'lorebook' | 'scenario'): DiscoveryCard {
    const creator = node.creator?.displayName || node.creator?.vanityUrl || 'Unknown'
    const isNsfw = node.rating === 'mature' || node.rating === 'explicit'

    return {
      id: node.id || node._id,
      name: node.name || node.chat_name || 'Unnamed',
      creator,
      description: node.description || '', // Full description
      avatarUrl: node.avatar || node.photoURL || '',
      imageUrl: node.avatar || node.photoURL || '',
      tags: node.tags || [],
      stats: {
        views: node.statistics_record?.views || 0,
        rating: node.statistics_record?.likes || 0,
      },
      source: 'wyvern',
      type: type === 'scenario' ? 'character' : type, // Normalize scenario to character for UI
      nsfw: isNsfw,
      raw: node,
    }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    // No direct download URL, return page URL
    return `https://wyvern.chat/${card.type === 'lorebook' ? 'lorebooks' : 'characters'}/${card.id}`
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    // For Wyvern, the search result `raw` contains almost everything.
    // We can construct the JSON directly.
    const node = card.raw

    if (card.type === 'lorebook') {
      const lorebook = {
        name: node.name,
        description: node.description || '',
        entries: node.entries || [],
        scan_depth: node.scan_depth,
        token_budget: node.token_budget,
        recursive_scanning: node.recursive_scanning,
        extensions: {
          wyvern: { id: card.id },
        },
      }
      return new Blob([JSON.stringify(lorebook, null, 2)], { type: 'application/json' })
    } else {
      const charData = {
        name: node.name || node.chat_name || '',
        description: node.description || '',
        personality: node.personality || '',
        scenario: node.scenario || '',
        first_mes: node.first_mes || '',
        mes_example: node.mes_example || '',
        creator_notes: node.creator_notes || node.shared_info || '',
        system_prompt: node.pre_history_instructions || '',
        post_history_instructions: node.post_history_instructions || '',
        alternate_greetings: node.alternate_greetings || [],
        tags: node.tags || [],
        creator: card.creator,
        character_version: '1.0',
        extensions: {
          wyvern: { id: card.id },
        },
      }
      return new Blob([JSON.stringify(charData, null, 2)], { type: 'application/json' })
    }
  }

  async getTags(): Promise<string[]> {
    return []
  }
}
