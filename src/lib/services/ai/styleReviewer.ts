import type { OpenAIProvider } from './openrouter';
import type { StoryEntry } from '$lib/types';
import { settings } from '$lib/stores/settings.svelte';
import { buildExtraBody } from './requestOverrides';

const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[StyleReviewer]', ...args);
  }
}

// Phrase analysis result
export interface PhraseAnalysis {
  phrase: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high';
  alternatives: string[];
  contexts: string[];
}

// Complete review result
export interface StyleReviewResult {
  phrases: PhraseAnalysis[];
  overallAssessment: string;
  reviewedEntryCount: number;
  timestamp: number;
}

/**
 * Service for analyzing narration text for repetitive phrases and style issues.
 * Runs in the background every N messages to provide writing guidance.
 */
export class StyleReviewerService {
  private provider: OpenAIProvider;

  constructor(provider: OpenAIProvider) {
    this.provider = provider;
  }

  private get model(): string {
    return settings.systemServicesSettings.styleReviewer.model;
  }

  private get temperature(): number {
    return settings.systemServicesSettings.styleReviewer.temperature;
  }

  private get maxTokens(): number {
    return settings.systemServicesSettings.styleReviewer.maxTokens;
  }

  private get systemPrompt(): string {
    return settings.systemServicesSettings.styleReviewer.systemPrompt;
  }

  /**
   * Analyze narration entries for style issues.
   * Only analyzes visible (non-summarized) narration entries.
   */
  async analyzeStyle(entries: StoryEntry[]): Promise<StyleReviewResult> {
    // Filter to only narration entries (exclude user_action, system, retry)
    const narrationEntries = entries.filter(e => e.type === 'narration');

    log('analyzeStyle called', {
      totalEntries: entries.length,
      narrationEntries: narrationEntries.length,
      model: this.model,
    });

    if (narrationEntries.length === 0) {
      return this.getEmptyResult();
    }

    // Combine narration text for analysis
    const combinedText = narrationEntries
      .map(e => e.content)
      .join('\n\n---\n\n');

    const prompt = this.buildAnalysisPrompt(combinedText, narrationEntries.length);

    try {
      log('Sending style analysis request...');

      const response = await this.provider.generateResponse({
        model: this.model,
        messages: [
          { role: 'system', content: this.systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        extraBody: buildExtraBody({
          manualMode: settings.advancedRequestSettings.manualMode,
          manualBody: settings.systemServicesSettings.styleReviewer.manualBody,
          reasoningEffort: settings.systemServicesSettings.styleReviewer.reasoningEffort,
          providerOnly: settings.systemServicesSettings.styleReviewer.providerOnly,
        }),
      });

      log('Style analysis response received', {
        contentLength: response.content.length,
        usage: response.usage,
      });

      const result = this.parseAnalysisResponse(response.content, narrationEntries.length);
      log('Style analysis parsed', {
        phrasesFound: result.phrases.length,
      });

      return result;
    } catch (error) {
      log('Style analysis failed', error);
      return this.getEmptyResult();
    }
  }

  private buildAnalysisPrompt(text: string, entryCount: number): string {
    return `Analyze the following narrative text (${entryCount} passages) for repetitive phrases and style issues.

## Narrative Text
"""
${text}
"""

## Your Task
1. Identify phrases that appear multiple times (2+ occurrences)
2. Note problematic sentence patterns or stylistic tics
3. Rate severity based on frequency and impact
4. Provide 2-3 specific alternatives for each issue

## Response Format (JSON only)
{
  "phrases": [
    {
      "phrase": "exact phrase text",
      "frequency": 3,
      "severity": "medium",
      "alternatives": ["alternative 1", "alternative 2"],
      "contexts": ["brief snippet showing usage"]
    }
  ],
  "overallAssessment": "Brief 1-2 sentence summary of prose quality and main issues"
}

Focus on the most impactful issues (up to 10 phrases max). Return valid JSON only.`;
  }

  private parseAnalysisResponse(content: string, entryCount: number): StyleReviewResult {
    try {
      let jsonStr = content.trim();

      // Handle markdown code blocks
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      const phrases: PhraseAnalysis[] = [];
      if (Array.isArray(parsed.phrases)) {
        for (const p of parsed.phrases.slice(0, 10)) {
          if (p.phrase) {
            phrases.push({
              phrase: p.phrase,
              frequency: typeof p.frequency === 'number' ? p.frequency : 2,
              severity: ['low', 'medium', 'high'].includes(p.severity) ? p.severity : 'low',
              alternatives: Array.isArray(p.alternatives) ? p.alternatives.slice(0, 3) : [],
              contexts: Array.isArray(p.contexts) ? p.contexts.slice(0, 2) : [],
            });
          }
        }
      }

      return {
        phrases,
        overallAssessment: parsed.overallAssessment || '',
        reviewedEntryCount: entryCount,
        timestamp: Date.now(),
      };
    } catch (e) {
      log('Failed to parse style analysis JSON', e);
      return this.getEmptyResult();
    }
  }

  private getEmptyResult(): StyleReviewResult {
    return {
      phrases: [],
      overallAssessment: '',
      reviewedEntryCount: 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Format review results for injection into the main generation prompt.
   * Returns an empty string if there are no phrases to report.
   */
  static formatForPromptInjection(result: StyleReviewResult): string {
    if (result.phrases.length === 0) {
      return '';
    }

    let block = '\n\n<style_guidance>\n';
    block += '## Recent Style Review\n';
    block += 'The following phrases have been overused in recent narration. Please vary your language:\n\n';

    for (const phrase of result.phrases) {
      block += `- "${phrase.phrase}" (${phrase.frequency}x, ${phrase.severity})`;
      if (phrase.alternatives.length > 0) {
        block += ` - Try: ${phrase.alternatives.join(', ')}`;
      }
      block += '\n';
    }

    if (result.overallAssessment) {
      block += `\nNote: ${result.overallAssessment}`;
    }

    block += '\n</style_guidance>';
    return block;
  }
}
