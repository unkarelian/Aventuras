/**
 * Fandom wiki integration module
 *
 * Provides access to Fandom wikis via the MediaWiki API for fetching
 * character, location, and lore information from fictional universes.
 */

export { FandomService } from './FandomService'
export type {
  FandomSearchResult,
  FandomSection,
  FandomArticleInfo,
  FandomSectionContent,
} from './FandomService'
