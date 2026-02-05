import type { DiscoveryCard, DiscoveryProvider, SearchOptions, SearchResult } from '../types'
import { corsFetch } from '../utils'

const CT_API_BASE = 'https://character-tavern.com/api/search/cards'

export class CharacterTavernProvider implements DiscoveryProvider {
  id = 'character_tavern'
  name = 'Character Tavern'
  icon = 'https://character-tavern.com/favicon.png'
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'scenario']

  async search(
    options: SearchOptions,
    type: 'character' | 'lorebook' | 'scenario',
  ): Promise<SearchResult> {
    if (type === 'lorebook') {
      return { cards: [], hasMore: false }
    }

    const params = new URLSearchParams()
    if (options.query) params.set('query', options.query)
    params.set('limit', String(options.limit || 30))
    params.set('page', String(options.page || 1))

    if (options.tags && options.tags.length > 0) {
      params.set('tags', options.tags.join(','))
    }

    // Character Tavern doesn't seem to have an explicit NSFW filter param in the snippet,
    // but the results contain isNSFW. Aventura might want to filter them out client-side if the API doesn't support it.
    // Bot Browser snippet doesn't show an nsfw param sent to API.

    const url = `${CT_API_BASE}?${params}`
    console.log('[CharacterTavern] Searching:', url)

    const response = await corsFetch(url, {
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) {
      throw new Error(`Character Tavern API error: ${response.status}`)
    }

    const data = await response.json()
    const hits = data.hits || []

    // Filter NSFW if needed (since API might not support it)
    const filteredHits =
      options.nsfw === false
        ? hits.filter((h: any) => !h.isNSFW && !(h.tags || []).includes('NSFW'))
        : hits

    const cards = filteredHits.map((hit: any) => this.transformCard(hit))

    const totalPages = data.totalPages || 1
    const currentPage = data.page || 1
    const hasMore = currentPage < totalPages

    return {
      cards,
      hasMore,
      nextPage: hasMore ? currentPage + 1 : undefined,
    }
  }

  private transformCard(node: any): DiscoveryCard {
    const imageUrl = node.path ? `https://cards.character-tavern.com/${node.path}.png` : ''

    const description = node.characterDefinition || ''

    return {
      id: node.id,
      name: node.name || node.inChatName || 'Unknown',
      creator: node.author || 'Unknown',
      description: node.tagline || description.substring(0, 300),
      avatarUrl: imageUrl,
      imageUrl: imageUrl,
      tags: node.tags || [],
      stats: {
        downloads: node.downloads || 0,
        views: node.views || 0,
        rating: node.likes || 0,
      },
      source: 'character_tavern',
      type: 'character',
      nsfw: node.isNSFW || false,
      raw: node,
    }
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    // We can return the card image URL which might be importable if it has metadata
    return card.imageUrl || ''
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    // Construct V2 JSON from raw data
    const raw = card.raw || {}

    const charData = {
      name: card.name,
      description: raw.characterDefinition || '',
      personality: raw.characterPersonality || '',
      scenario: raw.characterScenario || '',
      first_mes: raw.characterFirstMessage || '',
      mes_example: raw.characterExampleMessages || '',
      creator_notes: raw.tagline || card.description || '',
      system_prompt: raw.characterPostHistoryPrompt || '',
      post_history_instructions: raw.characterPostHistoryPrompt || '',
      alternate_greetings: raw.alternativeFirstMessage || [],
      tags: card.tags,
      creator: card.creator,
      character_version: '',
      extensions: {
        character_tavern: {
          id: card.id,
          path: raw.path,
        },
      },
    }

    const blob = new Blob([JSON.stringify(charData, null, 2)], { type: 'application/json' })
    return blob
  }

  async getTags(): Promise<string[]> {
    return []
  }
}
