/**
 * Model Fetcher
 *
 * Fetches available models from AI providers using SDK-compatible fetch infrastructure.
 * Uses the same Tauri-compatible fetch that Vercel AI SDK providers use internally.
 */

import { createTimeoutFetch } from './fetch';
import type { ProviderType } from '$lib/types';

/**
 * Default base URLs for model fetching endpoints.
 * Used when baseUrl is not explicitly provided.
 */
const DEFAULT_BASE_URLS: Record<ProviderType, string | undefined> = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
};

/**
 * Fallback model list for Anthropic, used when the /v1/models endpoint fails.
 */
const ANTHROPIC_FALLBACK_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
];

/**
 * URLs that don't require authentication for model fetching.
 * Used for OpenAI-compatible providers that have public /models endpoints.
 */
const NO_AUTH_PATTERNS = [
  'integrate.api.nvidia.com',    // NVIDIA NIM
  'nano-gpt.com',                 // NanoGPT
  'gen.pollinations.ai',          // Pollinations
  '127.0.0.1',                    // Self-hosted (Ollama, LM Studio, llama.cpp)
  'localhost',                    // Self-hosted alternative
];

/**
 * Fetches available models from a provider using the SDK's fetch infrastructure.
 *
 * This function uses createTimeoutFetch() which wraps Tauri's HTTP plugin,
 * making it compatible with Tauri's sandboxed environment and consistent
 * with how the Vercel AI SDK providers make their API calls.
 *
 * @param providerType - The provider to fetch models from
 * @param baseUrl - Optional custom base URL (for local LLMs, custom deployments, etc.)
 * @param apiKey - Optional API key for authentication (required for some providers)
 * @returns Array of model IDs available from the provider
 * @throws Error if the provider doesn't support model fetching or if the request fails
 *
 * @example
 * ```typescript
 * // Fetch OpenRouter models
 * const models = await fetchModelsFromProvider('openrouter');
 *
 * // Fetch OpenAI models with API key
 * const models = await fetchModelsFromProvider('openai', undefined, apiKey);
 *
 * // Fetch from local Ollama instance
 * const models = await fetchModelsFromProvider('openai', 'http://localhost:11434/v1');
 * ```
 */
export async function fetchModelsFromProvider(
  providerType: ProviderType,
  baseUrl?: string,
  apiKey?: string
): Promise<string[]> {
  // Google uses a different endpoint format with API key as query param
  if (providerType === 'google') {
    return fetchGoogleModels(baseUrl, apiKey);
  }

  // Anthropic uses a different auth header and response format
  if (providerType === 'anthropic') {
    return fetchAnthropicModels(baseUrl, apiKey);
  }

  // Determine effective base URL
  const effectiveBaseUrl = baseUrl || DEFAULT_BASE_URLS[providerType];
  if (!effectiveBaseUrl) {
    throw new Error(`No base URL available for provider: ${providerType}`);
  }

  // Check if this URL requires authentication for model fetching
  const requiresAuth = !NO_AUTH_PATTERNS.some(pattern =>
    effectiveBaseUrl.toLowerCase().includes(pattern)
  );

  // Create SDK-compatible fetch with 30s timeout (shorter than default for model fetching)
  const fetch = createTimeoutFetch(30000);
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models';

  // Make the request using SDK's Tauri-compatible fetch
  // Only include auth header if required AND apiKey is provided
  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers: (requiresAuth && apiKey) ? { Authorization: `Bearer ${apiKey}` } : {},
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  // Handle OpenAI/OpenRouter format: { data: [{ id: "..." }] }
  if (data.data && Array.isArray(data.data)) {
    return data.data.map((m: { id: string }) => m.id);
  }

  // Handle alternative format: [{ id: "...", name: "..." }]
  if (Array.isArray(data)) {
    return data
      .map((m: { id?: string; name?: string }) => m.id || m.name || '')
      .filter(Boolean);
  }

  throw new Error('Unexpected API response format');
}

/**
 * Fetches models from the Anthropic API.
 * Anthropic uses `x-api-key` header and a different response format: { data: [{ id, type }] }
 * Falls back to a curated static list if the API call fails.
 */
async function fetchAnthropicModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  const effectiveBaseUrl = baseUrl || DEFAULT_BASE_URLS.anthropic!;
  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models';

  try {
    const fetchFn = createTimeoutFetch(30000);
    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetchFn(modelsUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      console.warn(`[ModelFetcher] Anthropic API returned ${response.status}, using fallback models`);
      return ANTHROPIC_FALLBACK_MODELS;
    }

    const data = await response.json();

    if (data.data && Array.isArray(data.data)) {
      const models = data.data
        .map((m: { id: string }) => m.id)
        .filter(Boolean);
      if (models.length > 0) return models;
    }

    console.warn('[ModelFetcher] Unexpected Anthropic response format, using fallback models');
    return ANTHROPIC_FALLBACK_MODELS;
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Anthropic models, using fallback list:', error);
    return ANTHROPIC_FALLBACK_MODELS;
  }
}

/**
 * Fallback model list for Google, used when the API call fails.
 */
const GOOGLE_FALLBACK_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

/**
 * Google AI model entry from the /v1beta/models endpoint.
 */
interface GoogleModelEntry {
  name: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

/**
 * Fetches models from Google AI API.
 * Google uses API key as a query param and a `{ models: [...] }` response format.
 * Only returns models that support `generateContent`.
 * Falls back to a curated static list if the API call fails.
 */
async function fetchGoogleModels(baseUrl?: string, apiKey?: string): Promise<string[]> {
  const effectiveBaseUrl = baseUrl || DEFAULT_BASE_URLS.google!;

  if (!apiKey) {
    console.warn('[ModelFetcher] Google API key required for model fetching, using fallback models');
    return GOOGLE_FALLBACK_MODELS;
  }

  const modelsUrl = effectiveBaseUrl.replace(/\/$/, '') + '/models?key=' + apiKey;

  try {
    const fetchFn = createTimeoutFetch(30000);
    const response = await fetchFn(modelsUrl, { method: 'GET' });

    if (!response.ok) {
      console.warn(`[ModelFetcher] Google API returned ${response.status}, using fallback models`);
      return GOOGLE_FALLBACK_MODELS;
    }

    const data = await response.json();

    if (data.models && Array.isArray(data.models)) {
      const models = (data.models as GoogleModelEntry[])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        .filter(Boolean);
      if (models.length > 0) return models;
    }

    console.warn('[ModelFetcher] Unexpected Google response format, using fallback models');
    return GOOGLE_FALLBACK_MODELS;
  } catch (error) {
    console.warn('[ModelFetcher] Failed to fetch Google models, using fallback list:', error);
    return GOOGLE_FALLBACK_MODELS;
  }
}
