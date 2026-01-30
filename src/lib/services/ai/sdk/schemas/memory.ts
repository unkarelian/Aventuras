/**
 * Memory Service Schemas
 *
 * Zod schemas for chapter analysis, summarization, and retrieval decisions.
 */

import { z } from 'zod';

export const chapterAnalysisSchema = z.object({
  shouldCreateChapter: z.boolean(),
  optimalEndIndex: z.number(),
  suggestedTitle: z.string().nullable().optional(),
  keywords: z.array(z.string()),
  characters: z.array(z.string()),
  locations: z.array(z.string()),
  plotThreads: z.array(z.string()),
  emotionalTone: z.string(),
  significantEvents: z.array(z.string()),
});

export type ChapterAnalysis = z.infer<typeof chapterAnalysisSchema>;

export const chapterSummaryResultSchema = z.object({
  title: z.string().nullable().optional(),
  summary: z.string(),
  keywords: z.array(z.string()),
  characters: z.array(z.string()),
  locations: z.array(z.string()),
  plotThreads: z.array(z.string()),
  emotionalTone: z.string().nullable().optional(),
});

export type ChapterSummaryResult = z.infer<typeof chapterSummaryResultSchema>;

export const retrievalDecisionSchema = z.object({
  shouldRetrieve: z.boolean(),
  relevantChapterIds: z.array(z.string()),
  reasoning: z.string().optional(),
});

export type RetrievalDecision = z.infer<typeof retrievalDecisionSchema>;
