export interface DiscoveryCard {
  id: string;
  name: string;
  creator: string;
  description: string;
  avatarUrl: string;
  imageUrl?: string;
  tags: string[];
  stats?: {
    downloads?: number;
    rating?: number;
    views?: number;
  };
  source: string; // 'chub', 'janny', etc.
  type: 'character' | 'lorebook' | 'scenario';
  nsfw: boolean;
  raw?: any; // Original data for debugging/advanced usage
}

export interface SearchOptions {
  query: string;
  page?: number;
  limit?: number;
  sort?: 'popular' | 'new' | 'name';
  nsfw?: boolean;
  tags?: string[];
}

export interface SearchResult {
  cards: DiscoveryCard[];
  hasMore: boolean;
  nextPage?: number;
}

export interface DiscoveryProvider {
  id: string;
  name: string;
  icon?: string;
  supports: ('character' | 'lorebook' | 'scenario')[];
  search(options: SearchOptions, type: 'character' | 'lorebook' | 'scenario'): Promise<SearchResult>;
  getDownloadUrl(card: DiscoveryCard): Promise<string>;
  // Some providers might require specific headers or fetch logic for the download
  downloadCard(card: DiscoveryCard): Promise<Blob>;
  // Get available tags for filtering (provider-specific)
  getTags(): Promise<string[]>;
  // Fetch full details for a card (e.g. including alternate greetings, scenario, etc.)
  getCardDetails?(card: DiscoveryCard): Promise<DiscoveryCard>;
}

