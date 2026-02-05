/**
 * Model Fetcher
 *
 * Fetches available models from AI providers.
 */

import { createTimeoutFetch } from './fetch'
import { PROVIDERS, getBaseUrl } from './config'
import type { ProviderType } from '$lib/types'

/** URLs that don't require authentication for model fetching */
const NO_AUTH_PATTERNS = ['nano-gpt.com', 'gen.pollinations.ai', '127.0.0.1', 'localhost']

/**
 * Fetches available models from a provider.
 */
export async function fetchModelsFromProvider(
  providerType: ProviderType,
  baseUrl?: string,
  apiKey?: string,
): Promise<string[]> {
  // Provider-specific fetch logic
  if (providerType === 'google') return fetchGoogleModels(baseUrl, apiKey)
  if (providerType === 'anthropic') return fetchAnthropicModels(baseUrl, apiKey)
  if (providerType === 'chutes') return fetchChutesModels(baseUrl, apiKey)
  if (providerType === 'ollama') return fetchOllamaModels(baseUrl)
  if (providerType === 'zhipu') return fetchZhipuModels(baseUrl, apiKey)
  if (providerType === 'mistral') return fetchMistralModels(baseUrl, apiKey)

  // Standard OpenAI-compatible endpoint
  const effectiveBaseUrl = baseUrl || getBaseUrl(providerType)
  if (!effectiveBaseUrl) {
    throw new Error(`No base URL available for provider: ${providerType}`)
  }

  const requiresAuth = !NO_AUTH_PATTERNS.some((p) => effectiveBaseUrl.toLowerCase().includes(p))
  const fetch = createTimeoutFetch(30000, 'model-fetch')
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models'

  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers: requiresAuth && apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (data.data && Array.isArray(data.data)) {
    return data.data.map((m: { id: string }) => m.id)
  }
  if (Array.isArray(data)) {
    return data.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean)
  }

  throw new Error('Unexpected API response format')
}

async function fetchAnthropicModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  const effectiveBaseUrl = baseUrl || 'https://api.anthropic.com/v1'
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models'

  try {
    const fetchFn = createTimeoutFetch(30000, 'model-fetch')
    const headers: Record<string, string> = { 'anthropic-version': '2023-06-01' }
    if (apiKey) headers['x-api-key'] = apiKey

    const response = await fetchFn(modelsUrl, { method: 'GET', headers })

    if (!response.ok) {
      console.warn(
        `[ModelFetcher] Anthropic API returned ${response.status}, using fallback models`,
      )
      return PROVIDERS.anthropic.fallbackModels
    }

    const data = await response.json()
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((m: { id: string }) => m.id).filter(Boolean)
      if (models.length > 0) return models
    }

    return PROVIDERS.anthropic.fallbackModels
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Anthropic models:', error)
    return PROVIDERS.anthropic.fallbackModels
  }
}

interface GoogleModelEntry {
  name: string
  supportedGenerationMethods?: string[]
}

async function fetchGoogleModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  const effectiveBaseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta'

  if (!apiKey) {
    console.warn('[ModelFetcher] Google API key required, using fallback models')
    return PROVIDERS.google.fallbackModels
  }

  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models?key=' + apiKey

  try {
    const fetchFn = createTimeoutFetch(30000, 'model-fetch')
    const response = await fetchFn(modelsUrl, { method: 'GET' })

    if (!response.ok) {
      console.warn(`[ModelFetcher] Google API returned ${response.status}, using fallback models`)
      return PROVIDERS.google.fallbackModels
    }

    const data = await response.json()
    if (data.models && Array.isArray(data.models)) {
      const models = (data.models as GoogleModelEntry[])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(Boolean)
      if (models.length > 0) return models
    }

    return PROVIDERS.google.fallbackModels
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Google models:', error)
    return PROVIDERS.google.fallbackModels
  }
}

async function fetchChutesModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    throw new Error('Chutes requires an API key to fetch models')
  }

  const effectiveBaseUrl = baseUrl || PROVIDERS.chutes.baseUrl
  const chutesUrl = effectiveBaseUrl.replace(/\/$/, '') + '/chutes'

  const fetchFn = createTimeoutFetch(30000, 'model-fetch')
  const response = await fetchFn(chutesUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch Chutes models: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (data.data && Array.isArray(data.data)) {
    return data.data
      .map((m: { id?: string; name?: string }) => m.id || m.name || '')
      .filter(Boolean)
  }
  if (Array.isArray(data)) {
    return data.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean)
  }

  throw new Error('Unexpected Chutes API response format')
}

async function fetchOllamaModels(baseUrl?: string): Promise<string[]> {
  const effectiveBaseUrl = baseUrl || PROVIDERS.ollama.baseUrl
  const tagsUrl = effectiveBaseUrl.replace(/\/$/, '').replace(/\/api$/, '') + '/api/tags'

  try {
    const fetchFn = createTimeoutFetch(10000, 'model-fetch')
    const response = await fetchFn(tagsUrl, { method: 'GET' })

    if (!response.ok) {
      console.warn(`[ModelFetcher] Ollama returned ${response.status}, using fallback models`)
      return PROVIDERS.ollama.fallbackModels
    }

    const data = await response.json()
    if (data.models && Array.isArray(data.models)) {
      const models = data.models
        .map((m: { name?: string; model?: string }) => m.name || m.model || '')
        .filter(Boolean)
      if (models.length > 0) return models
    }

    return PROVIDERS.ollama.fallbackModels
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Ollama models (is Ollama running?):', error)
    return PROVIDERS.ollama.fallbackModels
  }
}

async function fetchZhipuModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    console.warn('[ModelFetcher] Zhipu API key required, using fallback models')
    return PROVIDERS.zhipu.fallbackModels
  }

  const effectiveBaseUrl = baseUrl || PROVIDERS.zhipu.baseUrl
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models'

  try {
    const fetchFn = createTimeoutFetch(30000, 'model-fetch')
    const response = await fetchFn(modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      console.warn(`[ModelFetcher] Zhipu API returned ${response.status}, using fallback models`)
      return PROVIDERS.zhipu.fallbackModels
    }

    const data = await response.json()
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((m: { id?: string }) => m.id || '').filter(Boolean)
      if (models.length > 0) return models
    }

    return PROVIDERS.zhipu.fallbackModels
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Zhipu models:', error)
    return PROVIDERS.zhipu.fallbackModels
  }
}

async function fetchMistralModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  if (!apiKey) {
    console.warn('[ModelFetcher] Mistral API key required, using fallback models')
    return PROVIDERS.mistral.fallbackModels
  }

  const effectiveBaseUrl = baseUrl || PROVIDERS.mistral.baseUrl
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models'

  try {
    const fetchFn = createTimeoutFetch(30000, 'model-fetch')
    const response = await fetchFn(modelsUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      console.warn(`[ModelFetcher] Mistral API returned ${response.status}, using fallback models`)
      return PROVIDERS.mistral.fallbackModels
    }

    const data = await response.json()
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((m: { id?: string }) => m.id || '').filter(Boolean)
      if (models.length > 0) return models
    }

    return PROVIDERS.mistral.fallbackModels
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Mistral models:', error)
    return PROVIDERS.mistral.fallbackModels
  }
}
