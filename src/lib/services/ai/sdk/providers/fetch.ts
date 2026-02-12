/**
 * Tauri Fetch Adapter
 *
 * Wraps @tauri-apps/plugin-http's fetch for Vercel AI SDK providers.
 * Patches common provider response issues before SDK validation.
 */

import { ui } from '$lib/stores/ui.svelte'
import { fetch as tauriHttpFetch } from '@tauri-apps/plugin-http'

function normalizeHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {}
  if (headers instanceof Headers) {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers as Record<string, string>
}

async function tauriFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return tauriHttpFetch(typeof input === 'string' ? input : input.toString(), {
    method: init?.method ?? 'GET',
    headers: normalizeHeaders(init?.headers),
    body: init?.body as string | undefined,
    signal: init?.signal,
  })
}

function patchResponseJson(json: Record<string, unknown>): Record<string, unknown> {
  if (!json.usage) {
    json.usage = { input_tokens: 0, output_tokens: 0 }
  } else if (typeof json.usage === 'object') {
    const usage = json.usage as Record<string, unknown>
    usage.input_tokens ??= usage.prompt_tokens ?? 0
    usage.output_tokens ??= usage.completion_tokens ?? 0
  }
  return json
}

export function createTimeoutFetch(
  timeoutMs = 180000,
  serviceId: string,
  debugIdExternal?: string,
) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    init?.signal?.addEventListener('abort', () => controller.abort())
    const startTime = Date.now()
    let parsedBody: unknown = {}
    if (typeof init?.body === 'string') {
      try {
        parsedBody = JSON.parse(init.body)
      } catch {
        parsedBody = { raw: init.body.slice(0, 200) }
      }
    }
    const debugId = ui.addDebugRequest(
      serviceId,
      {
        url: input.toString(),
        method: init?.method ?? 'GET',
        body: parsedBody,
      },
      debugIdExternal,
    )
    try {
      const response = await tauriFetch(input, { ...init, signal: controller.signal })

      if (!response.ok) {
        const error = await response.text()
        let errorPayload
        try {
          errorPayload = JSON.parse(error)
        } catch {
          errorPayload = error
        }
        ui.addDebugResponse(
          debugId,
          serviceId,
          { status: response.status, error: errorPayload, statusText: response.statusText },
          startTime,
          error,
        )
      }

      if (!response.headers.get('content-type')?.includes('application/json')) {
        return response
      }

      const text = await response.text()

      if (!(parsedBody as Record<string, unknown>).stream) {
        let responsePayload
        try {
          responsePayload = JSON.parse(text)
        } catch {
          responsePayload = text
        }
        ui.addDebugResponse(
          debugId,
          serviceId,
          {
            url: input.toString(),
            method: init?.method ?? 'GET',
            body: responsePayload,
          },
          startTime,
        )
      }

      try {
        const json = JSON.parse(text)
        const patched = JSON.stringify(patchResponseJson(json))
        return new Response(patched, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      } catch {
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
