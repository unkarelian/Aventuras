import type { APISettings } from '$lib/types';
import type {
  AIProvider,
  GenerationRequest,
  GenerationResponse,
  StreamChunk,
  ModelInfo,
  ProviderInfo,
  Message,
  AgenticRequest,
  AgenticResponse,
  Tool,
  ToolCall,
  AgenticMessage,
} from './types';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/' //Used as the default.
const DEBUG = true;

function log(...args: any[]) {
  if (DEBUG) {
    console.log('[OpenRouter]', ...args);
  }
}

export class OpenAIProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';

  private settings: APISettings

  constructor(settings: APISettings ) {
    this.settings = settings
  }

  async generateResponse(request: GenerationRequest): Promise<GenerationResponse> {
    log('generateResponse called', {
      model: request.model,
      messagesCount: request.messages.length,
      temperature: request.temperature,
      topP: request.topP,
      maxTokens: request.maxTokens,
    });

    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.8,
      max_tokens: request.maxTokens ?? 8192,
      stop: request.stopSequences,
      ...request.extraBody, // Spread provider-specific options (e.g., reasoning)
    };

    // Add top_p only if specified (some providers don't support it)
    if (request.topP !== undefined) {
      requestBody.top_p = request.topP;
    }

    log('Sending request to OpenRouter...');

    // Ensure base URL has trailing slash for proper URL construction
    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const response = await fetch(baseUrl + 'chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        'HTTP-Referer': 'https://aventura.camp',
        'X-Title': 'Aventura',
      },
      body: JSON.stringify(requestBody),
      signal: request.signal,
    });

    log('Response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      log('API error', { status: response.status, error });
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    log('Response parsed', {
      model: data.model,
      contentLength: data.choices[0]?.message?.content?.length ?? 0,
      usage: data.usage,
    });

    return {
      content: data.choices[0]?.message?.content ?? '',
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }

  /**
   * Generate a response with tool calling support.
   * Used for agentic flows (Lore Management, Agentic Retrieval, etc.)
   */
  async generateWithTools(request: AgenticRequest): Promise<AgenticResponse> {
    log('generateWithTools called', {
      model: request.model,
      messagesCount: request.messages.length,
      toolsCount: request.tools.length,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    });

    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 8192,
      tools: request.tools,
      tool_choice: request.tool_choice ?? 'auto',
      ...request.extraBody,
    };

    log('Sending tool-enabled request to OpenRouter...');

    // Ensure base URL has trailing slash for proper URL construction
    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const response = await fetch(baseUrl + 'chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        'HTTP-Referer': 'https://aventura.camp',
        'X-Title': 'Aventura',
      },
      body: JSON.stringify(requestBody),
      signal: request.signal,
    });

    log('Tool response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      log('Tool API error', { status: response.status, error });
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices[0];
    const message = choice?.message;

    log('Tool response parsed', {
      model: data.model,
      finishReason: choice?.finish_reason,
      hasToolCalls: !!message?.tool_calls,
      toolCallCount: message?.tool_calls?.length ?? 0,
      contentLength: message?.content?.length ?? 0,
      hasReasoning: !!message?.reasoning,
      reasoningLength: message?.reasoning?.length ?? 0,
      hasReasoningDetails: !!message?.reasoning_details,
      reasoningDetailsCount: message?.reasoning_details?.length ?? 0,
    });

    // Extract legacy reasoning string if present (for backwards compatibility)
    let reasoning: string | undefined;
    if (message?.reasoning) {
      reasoning = message.reasoning;
    } else if (data.reasoning) {
      // Fallback to top-level reasoning if present
      reasoning = data.reasoning;
    }

    // Extract reasoning_details array if present (for preserving reasoning across tool calls)
    // Per OpenRouter docs: This is required for models like MiniMax M2.1, Claude 3.7+, OpenAI o-series
    // https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    const reasoning_details = message?.reasoning_details ?? undefined;

    // Parse tool calls if present
    const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc: any) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }));

    return {
      content: message?.content ?? null,
      model: data.model,
      tool_calls: toolCalls,
      finish_reason: choice?.finish_reason ?? 'stop',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
        reasoningTokens: data.usage.reasoning_tokens,
      } : undefined,
      reasoning,
      reasoning_details,
    };
  }

  async *streamResponse(request: GenerationRequest): AsyncIterable<StreamChunk> {
    log('streamResponse called', {
      model: request.model,
      messagesCount: request.messages.length,
      temperature: request.temperature,
      topP: request.topP,
      maxTokens: request.maxTokens,
    });

    log('Sending streaming request to OpenRouter...');

    const requestBody: Record<string, unknown> = {
      model: request.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.8,
      max_tokens: request.maxTokens ?? 8192,
      stop: request.stopSequences,
      stream: true,
      ...request.extraBody, // Spread provider-specific options (e.g., reasoning)
    };

    // Add top_p only if specified (some providers don't support it)
    if (request.topP !== undefined) {
      requestBody.top_p = request.topP;
    }

    // Ensure base URL has trailing slash for proper URL construction
    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const response = await fetch(baseUrl + 'chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        'HTTP-Referer': 'https://aventura.camp',
        'X-Title': 'Aventura',
      },
      body: JSON.stringify(requestBody),
      signal: request.signal,
    });

    log('Stream response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      log('Stream API error', { status: response.status, error });
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      log('No response body available');
      throw new Error('No response body');
    }

    log('Starting to read stream...');

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        log('Stream reader done');
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            log('Received [DONE] signal');
            yield { content: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content ?? '';
            if (content) {
              chunkCount++;
              if (chunkCount <= 3) {
                log('Stream chunk received', { chunkCount, contentLength: content.length });
              }
              yield { content, done: false };
            }
          } catch (e) {
            // Ignore parsing errors for incomplete JSON
            log('JSON parse error (may be incomplete):', data.substring(0, 50));
          }
        }
      }
    }

    log('Stream finished', { totalChunks: chunkCount });
  }

  async listModels(): Promise<ModelInfo[]> {
    log('listModels called');

    // The models endpoint is public and doesn't require authentication
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      log('Request timeout triggered');
      controller.abort();
    }, 15000); // 15 second timeout

    try {
      log('Fetching models from OpenRouter API...');

      // Ensure base URL has trailing slash for proper URL construction
      const baseUrl = this.settings.openaiApiURL.endsWith('/')
        ? this.settings.openaiApiURL
        : this.settings.openaiApiURL + '/';

      const response = await fetch(baseUrl + 'models', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      log('Models response received', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorText = await response.text();
        log('Models API error', { status: response.status, error: errorText });
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const json = await response.json();

      if (!json.data || !Array.isArray(json.data)) {
        log('Unexpected API response structure', { keys: Object.keys(json) });
        throw new Error('Invalid API response structure');
      }

      log('Models fetched successfully', { count: json.data.length });

      return json.data.map((model: any) => ({
        id: model.id,
        name: model.name ?? model.id,
        description: model.description ?? '',
        contextLength: model.context_length ?? model.top_provider?.context_length ?? 4096,
        pricing: model.pricing ? {
          prompt: parseFloat(model.pricing.prompt) || 0,
          completion: parseFloat(model.pricing.completion) || 0,
        } : undefined,
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        log('Request timed out after 15 seconds');
        throw new Error('Request timed out');
      }
      log('listModels error', error);
      throw error;
    }
  }

  async listProviders(): Promise<ProviderInfo[]> {
    log('listProviders called');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      log('Request timeout triggered');
      controller.abort();
    }, 15000);

    try {
      log('Fetching providers from OpenRouter API...');

      const baseUrl = this.settings.openaiApiURL.endsWith('/')
        ? this.settings.openaiApiURL
        : this.settings.openaiApiURL + '/';

      const response = await fetch(baseUrl + 'providers', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      log('Providers response received', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorText = await response.text();
        log('Providers API error', { status: response.status, error: errorText });
        throw new Error(`Failed to fetch providers: ${response.status}`);
      }

      const json = await response.json();

      if (!json.data || !Array.isArray(json.data)) {
        log('Unexpected providers API response structure', { keys: Object.keys(json) });
        throw new Error('Invalid providers API response structure');
      }

      log('Providers fetched successfully', { count: json.data.length });

      return json.data.map((provider: any) => ({
        name: provider.name,
        slug: provider.slug,
        privacyPolicyUrl: provider.privacy_policy_url ?? null,
        termsOfServiceUrl: provider.terms_of_service_url ?? null,
        statusPageUrl: provider.status_page_url ?? null,
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        log('Request timed out after 15 seconds');
        throw new Error('Request timed out');
      }
      log('listProviders error', error);
      throw error;
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.listModels();
      return true;
    } catch {
      return false;
    }
  }
}
