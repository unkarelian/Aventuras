import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch, GENERIC_ICON } from '../utils'

const PYGMALION_API_BASE = 'https://server.pygmalion.chat/galatea.v1.PublicCharacterService'

export class PygmalionProvider implements DiscoveryProvider {
  id = 'pygmalion'
  name = 'Pygmalion.chat'
  icon = GENERIC_ICON
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    if (type === 'lorebook') {
      return { cards: [], hasMore: false }
    }

    const sortMap: Record<string, string> = {
      new: 'approved_at',
      popular: 'downloads',
      name: 'display_name',
    }

    const input = {
      orderBy: sortMap[options.sort || 'new'] || 'approved_at',
      orderDescending: true,
      includeSensitive: options.nsfw !== false,
      pageSize: options.limit || 60,
      page: (options.page || 1) - 1, // 0-indexed
      query: options.query || undefined,
    }

    const url = `${PYGMALION_API_BASE}/CharacterSearch`
    console.log('[Pygmalion] Searching:', url)

    const response = await corsFetch(url, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(`Pygmalion API error: ${response.status}`)
    }

    const data = await response.json()
    const characters = data.characters || []

    // Pass nsfw state to transform to label potential NSFW content if we asked for it
    const cards = characters.map((c: any) => this.transformCard(c, input.includeSensitive))
    const hasMore = characters.length >= input.pageSize

    return {
      cards,
      hasMore,
      nextPage: hasMore ? (options.page || 1) + 1 : undefined,
    }
  }

  private transformCard(char: any, askedForSensitive: boolean): DiscoveryCard {
    return {
      id: char.id,
      name: char.displayName || 'Unnamed',
      creator: char.owner?.displayName || char.owner?.username || 'Unknown',
      description: char.description || '',
      avatarUrl: char.avatarUrl || '',
      imageUrl: char.avatarUrl || '',
      tags: char.tags || [],
      stats: {
        downloads: char.downloads || 0,
        views: char.views || 0,
        rating: char.stars || 0,
      },
      source: 'pygmalion',
      type: 'character',
      // If we asked for sensitive content, we assume it's mixed and potentially NSFW
      // since the API doesn't seem to flag individual items in the search response.
      nsfw: askedForSensitive,
      raw: char,
    }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    return `https://pygmalion.chat/chat/${card.id}`
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    // Fetch full details
    const url = `${PYGMALION_API_BASE}/Character`
    const response = await corsFetch(url, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
      },
      body: JSON.stringify({ characterMetaId: card.id }),
    })

    if (!response.ok) throw new Error(`Failed to fetch character details: ${response.status}`)

    const data = await response.json()
    const char = data.character || data
    const personality = char.personality || {}

    const stCard = {
      name: personality.name || char.displayName || 'Unnamed',
      description: personality.persona || char.description || '',
      personality: '',
      scenario: '',
      first_mes: personality.greeting || '',
      mes_example: '',
      creator_notes: char.description || '',
      tags: char.tags || [],
      creator: personality.creator || char.owner?.displayName || 'Unknown',
      character_version: char.versionLabel || '1.0',
      extensions: {
        pygmalion: { id: char.id },
      },
    }

    return new Blob([JSON.stringify(stCard, null, 2)], { type: 'application/json' })
  }

  async getTags(): Promise<string[]> {
    return []
  }
}
