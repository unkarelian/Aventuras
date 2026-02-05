/**
 * Narrative Service
 *
 * The core service that generates story responses.
 * This is the heart of the application - it handles narrative generation
 * both streaming and non-streaming.
 *
 * Unlike other services that use the preset system, NarrativeService uses
 * the main narrative profile directly (apiSettings.defaultModel, temperature, maxTokens).
 */

import { streamNarrative, generateNarrative } from '../sdk/generate';
import { buildSystemPrompt, buildPrimingMessage, type WorldStateContext } from '../prompts/systemBuilder';
import { createLogger } from '../core/config';
import type { StreamChunk } from '../core/types';
import type { Story, StoryEntry, Entry } from '$lib/types';
import type { StyleReviewResult } from './StyleReviewerService';
import type { TimelineFillResult } from '../retrieval/TimelineFillService';

const log = createLogger('Narrative');

/**
 * World state context for narrative generation.
 * Extends the base WorldStateContext with lorebook entries.
 */
export interface NarrativeWorldState extends WorldStateContext {
	lorebookEntries?: Entry[];
}

/**
 * Options for narrative generation.
 */
export interface NarrativeOptions {
	/** Pre-built tiered context block for injection */
	tieredContextBlock?: string;
	/** Style review results for avoiding repetition */
	styleReview?: StyleReviewResult | null;
	/** Retrieved chapter context from memory system */
	retrievedChapterContext?: string | null;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Timeline fill result for Q&A injection */
	timelineFillResult?: TimelineFillResult | null;
}

/**
 * Service for generating narrative responses.
 *
 * This service uses the main narrative profile from apiSettings directly,
 * rather than going through the preset system. This ensures narrative
 * generation uses the user's primary model and settings.
 */
export class NarrativeService {
	/**
	 * Create a new NarrativeService.
	 * No preset required - uses main narrative profile from settings.
	 */
	constructor() {
		// No configuration needed - uses main profile directly
	}

	/**
	 * Stream a narrative response.
	 *
	 * This is the primary method used by the UI for real-time narrative generation.
	 * Yields StreamChunk objects as text arrives from the model.
	 */
	async *stream(
		entries: StoryEntry[],
		worldState: NarrativeWorldState,
		story?: Story | null,
		options: NarrativeOptions = {}
	): AsyncIterable<StreamChunk> {
		const {
			tieredContextBlock,
			styleReview,
			retrievedChapterContext,
			signal,
			timelineFillResult
		} = options;

		log('stream', {
			entriesCount: entries.length,
			hasTieredContext: !!tieredContextBlock,
			hasStyleReview: !!styleReview,
			hasRetrievedContext: !!retrievedChapterContext,
			hasTimelineFill: !!timelineFillResult
		});

		// Extract story settings with defaults
		const mode = story?.mode ?? 'adventure';
		const pov = story?.settings?.pov ?? 'second';
		const tense = story?.settings?.tense ?? 'present';

		// Build system prompt using the centralized builder
		const systemPrompt = buildSystemPrompt(worldState, {
			mode,
			pov,
			tense,
			tieredContextBlock,
			retrievedContext: retrievedChapterContext ?? undefined,
			timeTracker: story?.timeTracker,
			genre: story?.genre,
			settingDescription: story?.description,
			tone: story?.settings?.tone,
			themes: story?.settings?.themes,
			visualProseMode: story?.settings?.visualProseMode ?? false,
			styleReview,
			chapters: worldState.chapters,
			timelineFillResult
		});

		// Build the user prompt from entries
		const userPrompt = this.buildUserPrompt(entries, mode);

		// Build priming message for models that need it
		const protagonist = worldState.characters.find((c) => c.relationship === 'self');
		const primingMessage = buildPrimingMessage(mode, pov, tense, protagonist?.name);

		try {
			// Stream using the main narrative profile
			const stream = streamNarrative({
				system: systemPrompt,
				prompt: `${primingMessage}\n\n${userPrompt}`,
				signal
			});

			// Use fullStream to capture both text and reasoning
			// - Native reasoning providers (Anthropic, OpenAI) emit reasoning-delta parts
			// - Models using <think> tags have reasoning extracted by extractReasoningMiddleware
			for await (const part of stream.fullStream) {
				if (part.type === 'reasoning-delta') {
					// Reasoning delta from native providers or extracted from <think> tags
					yield { content: '', reasoning: (part as { text?: string }).text, done: false };
				} else if (part.type === 'text-delta') {
					// Regular text content
					yield { content: (part as { text?: string }).text || '', done: false };
				}
				// Ignore other part types (reasoning-start, reasoning-end, tool calls, finish, etc.)
			}

			yield { content: '', done: true };
		} catch (error) {
			log('stream error', error);
			// Re-throw to let caller handle the error
			throw error;
		}
	}

	/**
	 * Generate a complete narrative response (non-streaming).
	 *
	 * Used for scenarios where streaming is not needed or supported.
	 */
	async generate(
		entries: StoryEntry[],
		worldState: NarrativeWorldState,
		story?: Story | null,
		options: Omit<NarrativeOptions, 'timelineFillResult'> = {}
	): Promise<string> {
		const { tieredContextBlock, styleReview, retrievedChapterContext, signal } = options;

		log('generate', { entriesCount: entries.length });

		const mode = story?.mode ?? 'adventure';
		const pov = story?.settings?.pov ?? 'second';
		const tense = story?.settings?.tense ?? 'present';

		const systemPrompt = buildSystemPrompt(worldState, {
			mode,
			pov,
			tense,
			tieredContextBlock,
			retrievedContext: retrievedChapterContext ?? undefined,
			timeTracker: story?.timeTracker,
			genre: story?.genre,
			settingDescription: story?.description,
			tone: story?.settings?.tone,
			themes: story?.settings?.themes,
			visualProseMode: story?.settings?.visualProseMode ?? false,
			styleReview,
			chapters: worldState.chapters
		});

		const userPrompt = this.buildUserPrompt(entries, mode);
		const protagonist = worldState.characters.find((c) => c.relationship === 'self');
		const primingMessage = buildPrimingMessage(mode, pov, tense, protagonist?.name);

		return generateNarrative({
			system: systemPrompt,
			prompt: `${primingMessage}\n\n${userPrompt}`,
			signal
		});
	}

	/**
	 * Build the user prompt from recent story entries.
	 *
	 * Formats entries as a conversation history with the current action highlighted.
	 */
	private buildUserPrompt(entries: StoryEntry[], mode: 'adventure' | 'creative-writing'): string {
		// Use all entries passed - these are already the visible (non-summarized) entries
		// Truncation/context management happens upstream via the memory system

		// Format entries based on mode
		const historyParts: string[] = [];
		for (const entry of entries) {
			if (entry.type === 'user_action') {
				const prefix = mode === 'creative-writing' ? '[DIRECTION]' : '[ACTION]';
				historyParts.push(`${prefix} ${entry.content}`);
			} else if (entry.type === 'narration') {
				historyParts.push(`[NARRATIVE]\n${entry.content}`);
			}
		}

		// Get the last user action as the current input
		const lastUserAction = [...entries].reverse().find((e) => e.type === 'user_action');
		const currentAction = lastUserAction?.content ?? '';

		// Build final prompt
		let prompt = '';

		if (historyParts.length > 1) {
			// Include history minus the last action (which becomes current)
			prompt += '## Recent Story:\n';
			prompt += historyParts.slice(0, -1).join('\n\n');
			prompt += '\n\n';
		}

		prompt += '## Current Action:\n';
		prompt += currentAction;
		prompt += '\n\n';
		prompt += 'Continue the narrative:';

		return prompt;
	}
}
