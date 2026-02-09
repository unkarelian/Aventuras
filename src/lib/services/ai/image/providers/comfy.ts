/**
 * Comfy UI Image Provider
 *
 * Direct HTTP calls to Comfy UI API.
 *
 */

import type {
  ImageProvider,
  ImageProviderConfig,
  ImageGenerateOptions,
  ImageGenerateResult,
  ImageModelInfo,
} from './types'
import { imageFetch } from './fetchAdapter'
import { fetch as tauriHttpFetch } from '@tauri-apps/plugin-http'
import { ComfyApi } from '@saintno/comfyui-sdk'

const DEFAULT_BASE_URL = 'http://localhost:8188'

/**
 * Custom ComfyApi that uses Tauri's HTTP plugin to bypass CORS.
 */
class TauriComfyApi extends ComfyApi {
  private config: ImageProviderConfig

  constructor(host: string, config: ImageProviderConfig) {
    super(host)
    this.config = config
  }

  // Override fetchApi to use our CORS-compliant fetch
  async fetchApi(route: string, options: any = {}): Promise<Response> {
    const url = `${this.apiHost}${route}`

    return tauriHttpFetch(url, {
      method: options.method || 'GET',
      body: options.body,
      signal: options.signal,
    })
  }
}

export function createComfyProvider(config: ImageProviderConfig): ImageProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL

  const api = new TauriComfyApi(baseUrl, config).init()

  return {
    id: 'comfyui',
    name: 'Comfy UI',

    async generate(options: ImageGenerateOptions): Promise<ImageGenerateResult> {
      const { model, prompt, size, referenceImages, signal } = options
      const [width, height] = size.split('x').map(Number)

      const body: Record<string, unknown> = {
        model,
        prompt,
        width: width || 1024,
        height: height || 1024,
      }

      // img2img: pass reference as imageDataUrl
      if (referenceImages?.length) {
        body.imageDataUrl = `data:image/png;base64,${referenceImages[0]}`
      }

      const response = await imageFetch({
        url: `${baseUrl}/images/generations`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
        serviceId: 'nanogpt-image',
      })

      const data = await response.json()
      const imageData = data?.data?.[0]

      if (imageData?.b64_json) {
        return { base64: imageData.b64_json, revisedPrompt: imageData.revised_prompt }
      }
      if (imageData?.url) {
        // Fetch the image URL and convert to base64
        const imgResponse = await fetch(imageData.url)
        const blob = await imgResponse.blob()
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
        return { base64, revisedPrompt: imageData.revised_prompt }
      }

      throw new Error('No image data in NanoGPT response')
    },

    async listModels(): Promise<ImageModelInfo[]> {
      console.log('listModels')
      try {
        const imageModels = await api.getCheckpoints()
        console.log(imageModels)

        return imageModels.map((m) => {
          return {
            id: m,
            name: m,
            description: '',
            supportsSizes: ['512x512', '1024x1024'],
            supportsImg2Img: false,
            costPerImage: 0,
          }
        })
      } catch {
        return []
      }
    },

    supportsImg2Img(_modelId: string): boolean {
      return true
    },
  }
}
