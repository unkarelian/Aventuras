import type { ReasoningEffort } from '$lib/types';

const BLOCKED_MANUAL_KEYS = new Set(['messages', 'tools', 'tool_choice', 'stream']);

export interface ManualBodyDefaults {
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  baseProvider?: Record<string, unknown>;
  reasoningEffort?: ReasoningEffort;
  providerOnly?: string[];
}

export interface ExtraBodyOptions {
  manualMode: boolean;
  manualBody?: string | null;
  reasoningEffort?: ReasoningEffort;
  providerOnly?: string[];
  baseProvider?: Record<string, unknown>;
}

export function normalizeProviderOnly(list?: string[] | null): string[] {
  if (!list) return [];
  const normalized = list
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return [...new Set(normalized)];
}

export function buildReasoningConfig(effort: ReasoningEffort | undefined): Record<string, unknown> {
  if (!effort || effort === 'off') {
    return { enabled: false };
  }
  return { effort };
}

export function buildProviderConfig(
  baseProvider?: Record<string, unknown>,
  providerOnly?: string[]
): Record<string, unknown> | undefined {
  const only = normalizeProviderOnly(providerOnly);
  const provider: Record<string, unknown> = {
    ...(baseProvider ?? {}),
  };
  if (only.length > 0) {
    provider.only = only;
  }
  return Object.keys(provider).length > 0 ? provider : undefined;
}

export function parseManualBody(body?: string | null): Record<string, unknown> | null {
  if (!body || !body.trim()) return null;
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function sanitizeManualBody(body: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = { ...body };
  for (const key of BLOCKED_MANUAL_KEYS) {
    if (key in sanitized) {
      delete sanitized[key];
    }
  }
  return sanitized;
}

export function buildExtraBody(options: ExtraBodyOptions): Record<string, unknown> | undefined {
  if (options.manualMode) {
    const parsed = parseManualBody(options.manualBody);
    if (parsed) {
      const sanitized = sanitizeManualBody(parsed);
      return Object.keys(sanitized).length > 0 ? sanitized : undefined;
    }
    return undefined;
  }

  const reasoning = buildReasoningConfig(options.reasoningEffort ?? 'off');
  const provider = buildProviderConfig(options.baseProvider, options.providerOnly);
  const extraBody: Record<string, unknown> = {};

  if (provider) {
    extraBody.provider = provider;
  }
  if (reasoning) {
    extraBody.reasoning = reasoning;
  }

  return Object.keys(extraBody).length > 0 ? extraBody : undefined;
}

export function buildManualBodyDefaults(options: ManualBodyDefaults): Record<string, unknown> {
  const provider = buildProviderConfig(options.baseProvider, options.providerOnly);
  const reasoning = buildReasoningConfig(options.reasoningEffort ?? 'off');
  const body: Record<string, unknown> = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
  };

  if (options.topP !== undefined) {
    body.top_p = options.topP;
  }

  if (options.stopSequences && options.stopSequences.length > 0) {
    body.stop = options.stopSequences;
  }

  if (provider) {
    body.provider = provider;
  }

  if (reasoning) {
    body.reasoning = reasoning;
  }

  return body;
}

export function serializeManualBody(options: ManualBodyDefaults): string {
  return JSON.stringify(buildManualBodyDefaults(options), null, 2);
}
