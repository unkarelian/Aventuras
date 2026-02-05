/**
 * Provider Registry
 *
 * Single entry point for all Vercel AI SDK provider operations.
 */

export { createProviderFromProfile } from './registry'
export { fetchModelsFromProvider } from './modelFetcher'
export {
  PROVIDERS,
  getBaseUrl,
  hasDefaultEndpoint,
  getProviderList,
  supportsReasoning,
  getReasoningMode,
  getReasoningExtraction,
  getDisplayModelName,
  modelSupportsReasoning,
  getApiModelName,
  type ProviderConfig,
  type ProviderServices,
  type ServiceModelDefaults,
  type ProviderCapabilities,
  type ImageDefaults,
} from './config'
export type { ProviderType, APIProfile } from '$lib/types'
