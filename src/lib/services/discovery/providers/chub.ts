import type { DiscoveryProvider, DiscoveryCard, SearchOptions, SearchResult } from '../types';
import { corsFetch } from '../utils';

const CHUB_API_BASE = 'https://api.chub.ai';
const CHUB_GATEWAY_BASE = 'https://gateway.chub.ai';

// Cache for tags
let cachedTags: string[] | null = null;

export class ChubProvider implements DiscoveryProvider {
  id = 'chub';
  name = 'Chub.ai';
  icon = 'https://avatars.charhub.io/icons/assets/full_logo.png';
  supports: ('character' | 'lorebook' | 'scenario')[] = ['character', 'lorebook', 'scenario'];

  async search(options: SearchOptions, type: 'character' | 'lorebook' | 'scenario'): Promise<SearchResult> {
    const namespace = type === 'lorebook' ? 'lorebooks' : 'characters';
    const sortMap: Record<string, string> = {
      popular: 'download_count',
      new: 'created_at',
      name: 'name'
    };

    const params = new URLSearchParams({
      search: options.query || '',
      first: String(options.limit || 48),
      page: String(options.page || 1),
      sort: sortMap[options.sort || 'popular'] || 'download_count',
      asc: 'false',
      nsfw: String(options.nsfw ?? true),
      nsfl: String(options.nsfw ?? true)
    });

    // Add tag filtering if tags are specified
    if (options.tags && options.tags.length > 0) {
      params.set('topics', options.tags.join(','));
    }

    const url = type === 'lorebook'
      ? `${CHUB_GATEWAY_BASE}/search?${params}&namespace=lorebooks&include_forks=true`
      : `${CHUB_API_BASE}/search?${params}`;

    console.log('[Chub] Searching:', url);

    const response = await corsFetch(url, {
      method: type === 'lorebook' ? 'POST' : 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Chub API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    let nodes: any[] = [];

    if (Array.isArray(data)) {
      nodes = data;
    } else if (data?.data?.nodes) {
      nodes = data.data.nodes;
    } else if (data?.nodes) {
      nodes = data.nodes;
    }

    const cards = nodes.map((node) => this.transformCard(node, type));
    const hasMore = nodes.length >= (options.limit || 48);

    return {
      cards,
      hasMore,
      nextPage: hasMore ? (options.page || 1) + 1 : undefined
    };
  }

  private transformCard(node: any, type: 'character' | 'lorebook' | 'scenario'): DiscoveryCard {
    let fullPath = node.fullPath || node.name || '';
    if (type === 'lorebook' && fullPath.startsWith('lorebooks/')) {
      fullPath = fullPath.substring('lorebooks/'.length);
    }

    const creator = fullPath.includes('/') ? fullPath.split('/')[0] : 'Unknown';
    const hasNsfwTag = (node.topics || []).some((t: string) => t.toLowerCase() === 'nsfw');
    const isNsfw = node.nsfw_image || node.nsfw || hasNsfwTag;

    // Use character image for scenarios too
    const avatarBase = type === 'lorebook'
      ? `https://avatars.charhub.io/avatars/lorebooks/${fullPath}/avatar.webp`
      : `https://avatars.charhub.io/avatars/${fullPath}/chara_card_v2.png`;

    return {
      id: fullPath,
      name: node.name || 'Unnamed',
      creator,
      description: node.tagline || node.description || '',
      avatarUrl: avatarBase,
      imageUrl: avatarBase, // Use avatar/card image as the main image
      tags: node.topics || [],
      stats: {
        downloads: node.nChats || node.downloadCount || 0,
        rating: node.starCount || 0
      },
      source: 'chub',
      type: type === 'scenario' ? 'character' : type, // Normalize scenario to character type for card logic
      nsfw: isNsfw,
      raw: {
        ...node,
        pageUrl: type === 'lorebook'
          ? `https://chub.ai/lorebooks/${fullPath}`
          : `https://chub.ai/characters/${fullPath}`
      }
    };
  }

  async getDownloadUrl(card: DiscoveryCard): Promise<string> {
    if (card.type === 'lorebook') {
      // Lorebooks need a special API call to get the SillyTavern raw JSON
      const nodeId = card.raw?.id;
      if (!nodeId) throw new Error('Lorebook nodeId not found');
      const nocache = Math.random().toString().substring(2);
      return `${CHUB_GATEWAY_BASE}/api/v4/projects/${nodeId}/repository/files/raw%252Fsillytavern_raw.json/raw?ref=main&response_type=blob&nocache=0.${nocache}`;
    }
    // Characters can be downloaded as PNG cards
    return `https://avatars.charhub.io/avatars/${card.id}/chara_card_v2.png`;
  }

  async downloadCard(card: DiscoveryCard): Promise<Blob> {
    const url = await this.getDownloadUrl(card);
    console.log('[Chub] Downloading card from:', url);

    const response = await corsFetch(url, {
      headers: { Accept: card.type === 'lorebook' ? 'application/json' : 'image/png' }
    });

    if (!response.ok) {
      throw new Error(`Failed to download card: ${response.status}`);
    }

    return await response.blob();
  }

  async getCardDetails(card: DiscoveryCard): Promise<DiscoveryCard> {
    if (card.type === 'lorebook') {
      // Lorebooks might have a different structure, but we can try fetching the project definition
      return card; 
    }

    try {
      const url = `${CHUB_API_BASE}/api/characters/${card.id}?full=true`;
      console.log('[Chub] Fetching full details:', url);
      
      const response = await corsFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        console.warn(`[Chub] Failed to fetch details for ${card.id}: ${response.status}`);
        return card;
      }

      const data = await response.json();
      
      // Update the raw data with the full definition
      // We assume data.node contains the character definition or data itself is the node
      const fullNode = data.node || data;
      
      return {
        ...card,
        // Update specific fields if they were missing/truncated in search
        description: fullNode.description || fullNode.tagline || card.description,
        raw: {
          ...card.raw,
          ...fullNode
        }
      };
    } catch (error) {
      console.error('[Chub] Error fetching details:', error);
      return card;
    }
  }

  async getTags(): Promise<string[]> {

    // Return cached tags if available
    if (cachedTags) {
      return cachedTags;
    }

    console.log('[Chub] Fetching popular tags...');

    try {
      // Fetch popular cards to extract common tags
      const params = new URLSearchParams({
        search: '',
        first: '100',
        page: '1',
        sort: 'download_count',
        asc: 'false',
        nsfw: 'true',
        nsfl: 'true'
      });

      const response = await corsFetch(`${CHUB_API_BASE}/search?${params}`, {
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tags: ${response.status}`);
      }

      const data = await response.json();
      let nodes: any[] = [];

      if (Array.isArray(data)) {
        nodes = data;
      } else if (data?.data?.nodes) {
        nodes = data.data.nodes;
      } else if (data?.nodes) {
        nodes = data.nodes;
      }

      // Extract all tags and count occurrences
      const tagCounts = new Map<string, number>();
      for (const node of nodes) {
        const topics = node.topics || [];
        for (const tag of topics) {
          if (typeof tag === 'string' && tag.length > 0) {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          }
        }
      }

      // Sort by frequency and take top tags
      const sortedTags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      cachedTags = sortedTags;
      console.log(`[Chub] Fetched ${sortedTags.length} unique tags`);
      return sortedTags;
    } catch (error) {
      console.error('[Chub] Failed to fetch tags:', error);
      // Return empty array on error
      return [];
    }
  }
}
