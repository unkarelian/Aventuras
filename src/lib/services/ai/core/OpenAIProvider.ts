import type { APISettings } from '$lib/types';
import type {
  AIProvider,
  GenerationRequest,
  GenerationResponse,
  StreamChunk,
  ModelInfo,
  ProviderInfo,
  AgenticRequest,
  AgenticResponse,
  ToolCall,
  AgenticStreamChunk,
  ReasoningDetail,
} from './types';
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { fetch } from '@tauri-apps/plugin-http';
import { createLogger } from './config';
import { LLM_TIMEOUT_MIN, LLM_TIMEOUT_MAX, LLM_TIMEOUT_DEFAULT } from '$lib/constants/timeout';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/'; //Used as the default.

const log = createLogger('OpenAIProvider');

export class OpenAIProvider implements AIProvider {
  id = 'openrouter';
  name = 'OpenRouter';

  private settings: APISettings;

  constructor(settings: APISettings) {
    this.settings = settings;
  }

  /**
   * Get normalized timeout value within bounds (30s to 10min)
   */
  private getTimeoutMs(): number {
    const rawTimeout = this.settings.llmTimeoutMs ?? LLM_TIMEOUT_DEFAULT;
    return Math.max(LLM_TIMEOUT_MIN, Math.min(LLM_TIMEOUT_MAX, rawTimeout));
  }

  /**
   * Add native timeout parameter to request body if enabled.
   * Compatible with modern AI SDKs (Vercel AI SDK, OpenAI SDK v4+, Anthropic SDK, etc.)
   */
  private addNativeTimeout(requestBody: Record<string, unknown>): void {
    if (this.settings.useNativeTimeout) {
      requestBody.timeout = this.getTimeoutMs();
    }
  }

  /**
   * Set up timeout controller with manual timeout if native timeout is disabled
   */
  private setupTimeout(
    controller: AbortController,
    requestSignal: AbortSignal | undefined,
    logMessage: string
  ): ReturnType<typeof setTimeout> | undefined {
    // Link request signal to timeout controller
    if (requestSignal) {
      requestSignal.addEventListener('abort', () => controller.abort());
    }

    // Only use manual timeout when not using SDK's native timeout
    if (!this.settings.useNativeTimeout) {
      const timeoutMs = this.getTimeoutMs();
      return setTimeout(() => {
        log(logMessage);
        controller.abort();
      }, timeoutMs);
    }

    return undefined;
  }

  /**
   * Handle timeout-related errors in catch blocks
   */
  private handleTimeoutError(error: unknown, requestSignal: AbortSignal | undefined): never {
    if (error instanceof Error && error.name === 'AbortError') {
      if (requestSignal?.aborted) {
        throw error;
      }
      const timeoutMs = this.getTimeoutMs();
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
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
      ...request.extraBody,
    };

    if (request.topP !== undefined) {
      requestBody.top_p = request.topP;
    }

    this.addNativeTimeout(requestBody);

    log('Sending request to OpenRouter...');

    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const startTime = Date.now();
    let debugRequestId: string | undefined;
    if (settings.uiSettings.debugMode) {
      debugRequestId = ui.addDebugRequest('generateResponse', {
        url: baseUrl + 'chat/completions',
        method: 'POST',
        body: requestBody,
      });
    }

    const timeoutController = new AbortController();
    const timeoutId = this.setupTimeout(
      timeoutController,
      request.signal,
      `Request timeout triggered (${this.getTimeoutMs() / 1000}s)`
    );

    try {
      const response = await fetch(baseUrl + 'chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
          'HTTP-Referer': 'https://aventura.camp',
          'X-Title': 'Aventura',
        },
        body: JSON.stringify(requestBody),
        signal: timeoutController.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      log('Response received', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const error = await response.text();
        log('API error', { status: response.status, error });
        if (settings.uiSettings.debugMode && debugRequestId) {
          ui.addDebugResponse(debugRequestId, 'generateResponse', { status: response.status, error }, startTime, error);
        }
        throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      log('Response parsed', {
        model: data.model,
        contentLength: data.choices[0]?.message?.content?.length ?? 0,
        usage: data.usage,
      });

      if (settings.uiSettings.debugMode && debugRequestId) {
        ui.addDebugResponse(debugRequestId, 'generateResponse', data, startTime);
      }

      return {
        content: data.choices[0]?.message?.content ?? '',
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) {
          throw error;
        }
        const rawTimeout = this.settings.llmTimeoutMs ?? LLM_TIMEOUT_DEFAULT;
        const timeoutMs = Math.max(LLM_TIMEOUT_MIN, Math.min(LLM_TIMEOUT_MAX, rawTimeout));
        throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
      }
      throw error;
    }
  }

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

    this.addNativeTimeout(requestBody);

    log('Sending tool-enabled request to OpenRouter...');

    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const startTime = Date.now();
    let debugRequestId: string | undefined;
    if (settings.uiSettings.debugMode) {
      debugRequestId = ui.addDebugRequest('generateWithTools', {
        url: baseUrl + 'chat/completions',
        method: 'POST',
        body: requestBody,
      });
    }

    const timeoutController = new AbortController();
    const timeoutId = this.setupTimeout(
      timeoutController,
      request.signal,
      `Tool request timeout triggered (${this.getTimeoutMs() / 1000}s)`
    );

    try {
      const response = await fetch(baseUrl + 'chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
          'HTTP-Referer': 'https://aventura.camp',
          'X-Title': 'Aventura',
        },
        body: JSON.stringify(requestBody),
        signal: timeoutController.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      log('Tool response received', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const error = await response.text();
        log('Tool API error', { status: response.status, error });
        if (settings.uiSettings.debugMode && debugRequestId) {
          ui.addDebugResponse(debugRequestId, 'generateWithTools', { status: response.status, error }, startTime, error);
        }
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

      let reasoning: string | undefined;
      if (message?.reasoning) {
        reasoning = message.reasoning;
      } else if (data.reasoning) {
        reasoning = data.reasoning;
      }

      const reasoning_details = message?.reasoning_details ?? undefined;

      const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc: Record<string, unknown>) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: (tc.function as Record<string, unknown>).name,
          arguments: (tc.function as Record<string, unknown>).arguments,
        },
      }));

      if (settings.uiSettings.debugMode && debugRequestId) {
        ui.addDebugResponse(debugRequestId, 'generateWithTools', data, startTime);
      }

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
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        if (request.signal?.aborted) {
          throw error;
        }
        const rawTimeout = this.settings.llmTimeoutMs ?? LLM_TIMEOUT_DEFAULT;
        const timeoutMs = Math.max(LLM_TIMEOUT_MIN, Math.min(LLM_TIMEOUT_MAX, rawTimeout));
        throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
      }
      throw error;
    }
  }

  async *streamWithTools(request: AgenticRequest): AsyncGenerator<AgenticStreamChunk> {
    log('streamWithTools called', {
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
      stream: true,
      ...request.extraBody,
    };

    this.addNativeTimeout(requestBody);

    log('Sending streaming tool-enabled request...');

    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const startTime = Date.now();
    let debugRequestId: string | undefined;
    if (settings.uiSettings.debugMode) {
      debugRequestId = ui.addDebugRequest('streamWithTools', {
        url: baseUrl + 'chat/completions',
        method: 'POST',
        body: requestBody,
      });
    }

    const timeoutController = new AbortController();
    const timeoutId = this.setupTimeout(
      timeoutController,
      request.signal,
      `Stream connection timeout triggered (${this.getTimeoutMs() / 1000}s)`
    );

    let response: Response;
    try {
      response = await fetch(baseUrl + 'chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
          'HTTP-Referer': 'https://aventura.camp',
          'X-Title': 'Aventura',
        },
        body: JSON.stringify(requestBody),
        signal: timeoutController.signal,
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      this.handleTimeoutError(error, request.signal);
    }

    if (timeoutId) clearTimeout(timeoutId);

    log('Stream response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      log('Stream API error', { status: response.status, error });
      if (settings.uiSettings.debugMode && debugRequestId) {
        ui.addDebugResponse(debugRequestId, 'streamWithTools', { status: response.status, error }, startTime, error);
      }
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    log('Starting to read tool-enabled stream...');

    const decoder = new TextDecoder();
    let buffer = '';
    let chunkCount = 0;

    let accumulatedContent = '';
    let accumulatedReasoning = '';
    const accumulatedReasoningDetails: ReasoningDetail[] = [];
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' = 'stop';
    let model = request.model;

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

            const toolCalls: ToolCall[] = Array.from(toolCallsMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([_, tc]) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: tc.arguments,
                },
              }));

            if (settings.uiSettings.debugMode && debugRequestId) {
              ui.addDebugResponse(debugRequestId, 'streamWithTools', {
                content: accumulatedContent,
                toolCalls: toolCalls.length,
                reasoningDetails: accumulatedReasoningDetails.length,
                chunks: chunkCount,
                streaming: true,
              }, startTime);
            }

            yield {
              type: 'done',
              response: {
                content: accumulatedContent || null,
                model,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                finish_reason: finishReason,
                reasoning: accumulatedReasoning || undefined,
                reasoning_details: accumulatedReasoningDetails.length > 0 ? accumulatedReasoningDetails : undefined,
              },
            };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            chunkCount++;

            if (chunkCount <= 5) {
              log('Stream chunk #' + chunkCount + ':', JSON.stringify(parsed).substring(0, 200));
            }

            if (parsed.model) {
              model = parsed.model;
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) continue;

            if (chunkCount <= 5) {
              log('Delta keys:', Object.keys(delta).join(', '));
            }

            const hasReasoningDetails = delta.reasoning_details && Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0;

            if (hasReasoningDetails) {
              for (const detail of delta.reasoning_details) {
                if (detail.type === 'reasoning.text' && detail.text) {
                  const text = detail.text;
                  if (text.trim() === '') {
                    continue;
                  }
                  log('Streaming reasoning_details.text chunk:', JSON.stringify(text.substring(0, 50)));
                  yield { type: 'reasoning', content: text };
                  accumulatedReasoning += text;
                  accumulatedReasoningDetails.push(detail);
                } else {
                  accumulatedReasoningDetails.push(detail);
                }
              }
            } else if (delta.reasoning) {
              const text = delta.reasoning;
              if (text.trim() !== '') {
                log('Streaming legacy reasoning chunk:', JSON.stringify(text.substring(0, 50)));
                yield { type: 'reasoning', content: text };
                accumulatedReasoning += text;
              }
            }

            if (delta.content) {
              yield { type: 'content', content: delta.content };
              accumulatedContent += delta.content;
            }

            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0;

                if (!toolCallsMap.has(index)) {
                  toolCallsMap.set(index, {
                    id: tc.id || '',
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  });

                  if (tc.id && tc.function?.name) {
                    yield { type: 'tool_call_start', id: tc.id, name: tc.function.name };
                  }
                } else {
                  const existing = toolCallsMap.get(index)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) {
                    existing.arguments += tc.function.arguments;
                    yield { type: 'tool_call_args', id: existing.id, args: tc.function.arguments };
                  }
                }
              }
            }
          } catch (e) {
            log('JSON parse error (may be incomplete):', data.substring(0, 50));
          }
        }
      }
    }

    const toolCalls: ToolCall[] = Array.from(toolCallsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, tc]) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }));

    if (settings.uiSettings.debugMode && debugRequestId) {
      ui.addDebugResponse(debugRequestId, 'streamWithTools', {
        content: accumulatedContent,
        toolCalls: toolCalls.length,
        reasoningDetails: accumulatedReasoningDetails.length,
        chunks: chunkCount,
        streaming: true,
      }, startTime);
    }

    yield {
      type: 'done',
      response: {
        content: accumulatedContent || null,
        model,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        finish_reason: finishReason,
        reasoning: accumulatedReasoning || undefined,
        reasoning_details: accumulatedReasoningDetails.length > 0 ? accumulatedReasoningDetails : undefined,
      },
    };

    log('Stream finished', { totalChunks: chunkCount });
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
      ...request.extraBody,
    };

    if (request.topP !== undefined) {
      requestBody.top_p = request.topP;
    }

    this.addNativeTimeout(requestBody);

    const baseUrl = this.settings.openaiApiURL.endsWith('/')
      ? this.settings.openaiApiURL
      : this.settings.openaiApiURL + '/';

    const startTime = Date.now();
    let debugRequestId: string | undefined;
    if (settings.uiSettings.debugMode) {
      debugRequestId = ui.addDebugRequest('streamResponse', {
        url: baseUrl + 'chat/completions',
        method: 'POST',
        body: requestBody,
      });
    }

    const timeoutController = new AbortController();
    const timeoutId = this.setupTimeout(
      timeoutController,
      request.signal,
      `Stream connection timeout triggered (${this.getTimeoutMs() / 1000}s)`
    );

    let response: Response;
    try {
      response = await fetch(baseUrl + 'chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.openaiApiKey}`,
          'HTTP-Referer': 'https://aventura.camp',
          'X-Title': 'Aventura',
        },
        body: JSON.stringify(requestBody),
        signal: timeoutController.signal,
      });
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      this.handleTimeoutError(error, request.signal);
    }

    if (timeoutId) clearTimeout(timeoutId);

    log('Stream response received', { status: response.status, ok: response.ok });

    if (!response.ok) {
      const error = await response.text();
      log('Stream API error', { status: response.status, error });
      if (settings.uiSettings.debugMode && debugRequestId) {
        ui.addDebugResponse(debugRequestId, 'streamResponse', { status: response.status, error }, startTime, error);
      }
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
    let fullContent = '';
    let fullReasoning = '';

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
            if (settings.uiSettings.debugMode && debugRequestId) {
              ui.addDebugResponse(debugRequestId, 'streamResponse', {
                content: fullContent,
                reasoning: fullReasoning,
                chunks: chunkCount,
                streaming: true,
              }, startTime);
            }
            yield { content: '', done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0]?.delta;

            const content = delta?.content ?? '';
            const reasoning = delta?.reasoning_details?.reduce((acc: string, detail: { text: string }) => acc + detail.text, '') || delta?.reasoning || '';

            if (content || reasoning) {
              chunkCount++;
              if (content) fullContent += content;
              if (reasoning) fullReasoning += reasoning;

              if (chunkCount <= 3) {
                log('Stream chunk received', {
                  chunkCount,
                  contentLength: content.length,
                  reasoningLength: reasoning.length,
                });
              }

              yield { content, reasoning: reasoning || undefined, done: false };
            }
          } catch (e) {
            log('JSON parse error (may be incomplete):', data.substring(0, 50));
          }
        }
      }
    }

    if (settings.uiSettings.debugMode && debugRequestId) {
      ui.addDebugResponse(debugRequestId, 'streamResponse', {
        content: fullContent,
        chunks: chunkCount,
        streaming: true,
      }, startTime);
    }

    log('Stream finished', { totalChunks: chunkCount });
  }

  async listModels(): Promise<ModelInfo[]> {
    log('listModels called');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      log('Request timeout triggered');
      controller.abort();
    }, 15000);

    try {
      log('Fetching models from OpenRouter API...');

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

      return json.data.map((model: Record<string, unknown>) => ({
        id: model.id,
        name: model.name ?? model.id,
        description: model.description ?? '',
        contextLength: model.context_length ?? (model.top_provider as Record<string, unknown>)?.context_length ?? 4096,
        pricing: model.pricing ? {
          prompt: parseFloat((model.pricing as Record<string, string>).prompt) || 0,
          completion: parseFloat((model.pricing as Record<string, string>).completion) || 0,
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

      return json.data.map((provider: Record<string, unknown>) => ({
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
