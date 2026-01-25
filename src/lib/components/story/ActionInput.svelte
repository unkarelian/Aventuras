<script lang="ts">
  import { tick } from "svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { aiService } from "$lib/services/ai";
  import { database } from "$lib/services/database";
  import { SimpleActivationTracker } from "$lib/services/ai/entryRetrieval";
  import type { ImageGenerationContext } from "$lib/services/ai/imageGeneration";
  import type { TimelineFillResult } from "$lib/services/ai/timelineFill";
  import { TranslationService } from "$lib/services/ai/translation";
  import {
    Send,
    Wand2,
    MessageSquare,
    Brain,
    Sparkles,
    Feather,
    RefreshCw,
    X,
    PenLine,
    Square,
    ImageIcon,
  } from "lucide-svelte";
  import type { Chapter } from "$lib/types";
  import Suggestions from "./Suggestions.svelte";
  import GrammarCheck from "./GrammarCheck.svelte";
  import {
    emitUserInput,
    emitNarrativeResponse,
    emitSuggestionsReady,
    emitTTSQueued,
    eventBus,
    type ResponseStreamingEvent,
    type ClassificationCompleteEvent,
  } from "$lib/services/events";
  import { isTouchDevice } from "$lib/utils/swipe";

  function log(...args: any[]) {
    console.log("[ActionInput]", ...args);
  }

  let inputValue = $state("");
  let actionType = $state<"do" | "say" | "think" | "story" | "free">("do");
  let isRawActionChoice = $state(false); // True when submitting an AI-generated choice (no prefix/suffix)
  let stopRequested = false;
  let activeAbortController: AbortController | null = null;
  let lastImageGenContext = $state<ImageGenerationContext | null>(null);
  let isManualImageGenRunning = $state(false);

  const canShowManualImageGen = $derived(
    settings.systemServicesSettings.imageGeneration.enabled &&
      !settings.systemServicesSettings.imageGeneration.autoGenerate &&
      !!lastImageGenContext,
  );

  const manualImageGenDisabled = $derived(
    ui.isGenerating ||
      isManualImageGenRunning ||
      !settings.systemServicesSettings.imageGeneration.nanoGptApiKey,
  );

  // In creative writing mode, show different input style
  const isCreativeMode = $derived(story.storyMode === "creative-writing");

  // Keyboard shortcut hint
  const sendKeyHint = $derived(
    isTouchDevice() ? "Shift+Enter to send" : "Enter to send, Shift+Enter for new line"
  );

  // Action type configuration for the redesigned input
  type ActionType = "do" | "say" | "think" | "story" | "free";

  const actionIcons = {
    do: Wand2,
    say: MessageSquare,
    think: Brain,
    story: Sparkles,
    free: PenLine,
  };

  const actionLabels: Record<ActionType, string> = {
    do: "Do",
    say: "Say",
    think: "Think",
    story: "Story",
    free: "Free",
  };

  // Border colors (matching StoryEntry pattern)
  const actionBorderColors: Record<ActionType, string> = {
    do: "border-l-emerald-500",
    say: "border-l-blue-500",
    think: "border-l-purple-500",
    story: "border-l-amber-500",
    free: "border-l-surface-600",
  };

  // Active button styles
  const actionActiveStyles: Record<ActionType, string> = {
    do: "bg-emerald-500/15 text-emerald-400",
    say: "bg-blue-500/15 text-blue-400",
    think: "bg-purple-500/15 text-purple-400",
    story: "bg-amber-500/15 text-amber-400",
    free: "bg-surface-600/30 text-surface-300",
  };

  // Submit button styles (minimal - icon only)
  const actionButtonStyles: Record<ActionType, string> = {
    do: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10",
    say: "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10",
    think: "text-purple-400 hover:text-purple-300 hover:bg-purple-500/10",
    story: "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10",
    free: "text-surface-400 hover:text-surface-200 hover:bg-surface-500/10",
  };

  const actionTypes: ActionType[] = ["do", "say", "think", "story", "free"];

  $effect(() => {
    const storyId = story.currentStory?.id ?? null;
    if (
      !storyId ||
      (lastImageGenContext && lastImageGenContext.storyId !== storyId)
    ) {
      lastImageGenContext = null;
    }
  });

  // Register retry callback with UI store so StoryEntry can trigger it
  $effect(() => {
    log("Registering retry callback");
    ui.setRetryCallback(handleRetry);
    return () => {
      log("Unregistering retry callback");
      ui.setRetryCallback(null);
    };
  });

  // Register retry last message callback for edit-and-retry feature
  $effect(() => {
    log("Registering retry last message callback");
    ui.setRetryLastMessageCallback(handleRetryLastMessage);
    return () => {
      log("Unregistering retry last message callback");
      ui.setRetryLastMessageCallback(null);
    };
  });

  // Watch for pending action choice from ActionChoices component
  $effect(() => {
    const pendingAction = ui.pendingActionChoice;
    if (pendingAction && !ui.isGenerating) {
      log("Processing pending action choice:", pendingAction);
      // Set input value and flag as raw (no prefix/suffix needed)
      // User can edit the text before manually submitting
      inputValue = pendingAction;
      isRawActionChoice = true;
      ui.clearPendingActionChoice();
    }
  });

  /**
   * Generate story direction suggestions for creative writing mode.
   */
  async function refreshSuggestions() {
    if (!isCreativeMode || story.entries.length === 0) {
      ui.clearSuggestions(story.currentStory?.id);
      return;
    }

    ui.setSuggestionsLoading(true);
    try {
      // Use only the lorebook entries that were activated for the previous response
      // Extract the Entry objects from RetrievedEntry wrappers
      const activeLorebookEntries = (ui.lastLorebookRetrieval?.all ?? []).map(
        (r) => r.entry,
      );

      const result = await aiService.generateSuggestions(
        story.entries,
        story.pendingQuests,
        story.currentStory?.genre,
        activeLorebookEntries,
        story.pov,
        story.tense,
      );

      // Translate suggestions if enabled
      let finalSuggestions = result.suggestions;
      const translationSettings = settings.translationSettings;
      if (TranslationService.shouldTranslate(translationSettings)) {
        try {
          finalSuggestions = await aiService.translateSuggestions(
            result.suggestions,
            translationSettings.targetLanguage,
          );
          log("Suggestions translated");
        } catch (error) {
          log("Suggestion translation failed (non-fatal):", error);
        }
      }

      ui.setSuggestions(finalSuggestions, story.currentStory?.id);
      log(
        "Suggestions refreshed:",
        finalSuggestions.length,
        "with",
        activeLorebookEntries.length,
        "active lorebook entries",
      );

      // Emit SuggestionsReady event
      emitSuggestionsReady(
        finalSuggestions.map((s) => ({ text: s.text, type: s.type })),
      );
    } catch (error) {
      log("Failed to generate suggestions:", error);
      ui.clearSuggestions(story.currentStory?.id);
    } finally {
      ui.setSuggestionsLoading(false);
    }
  }

  /**
   * Handle selecting a suggestion - populate the input with the suggestion text.
   */
  function handleSuggestionSelect(text: string) {
    inputValue = text;
    // Focus the input
    const input = document.querySelector("textarea");
    input?.focus();
  }

  async function handleManualImageGeneration() {
    if (!lastImageGenContext || manualImageGenDisabled) return;
    if (!settings.systemServicesSettings.imageGeneration.enabled) return;

    isManualImageGenRunning = true;
    try {
      await aiService.generateImagesForNarrative(lastImageGenContext);
    } catch (error) {
      log("Manual image generation failed (non-fatal)", error);
    } finally {
      isManualImageGenRunning = false;
    }
  }

  /**
   * Check if style review should run (every N messages).
   * Runs in background, non-blocking.
   */
  async function checkStyleReview(
    shouldIncrement: boolean = true,
    source: string = "new",
  ) {
    // Check if style reviewer is enabled
    if (!settings.systemServicesSettings.styleReviewer.enabled) {
      return;
    }

    const storyId = story.currentStory?.id;
    if (!storyId) {
      return;
    }

    // Increment counter for new messages only
    if (shouldIncrement) {
      ui.incrementStyleReviewCounter();
    }

    const triggerInterval =
      settings.systemServicesSettings.styleReviewer.triggerInterval;

    log("Style review counter", {
      source,
      storyId,
      messagesSinceLastReview: ui.messagesSinceLastStyleReview,
      triggerInterval,
      incremented: shouldIncrement,
    });

    // Check if we've hit the interval threshold
    if (ui.messagesSinceLastStyleReview >= triggerInterval) {
      log("Triggering style review...");
      ui.setStyleReviewLoading(true, storyId);

      try {
        const result = await aiService.analyzeStyle(
          story.entries,
          story.currentStory?.mode ?? "adventure",
          story.pov,
          story.tense,
        );
        ui.setStyleReview(result, storyId);
        log("Style review complete", { phrasesFound: result.phrases.length });
      } catch (error) {
        log("Style review failed (non-fatal)", error);
      } finally {
        ui.setStyleReviewLoading(false, storyId);
      }
    }
  }

  /**
   * Generate RPG-style action choices for adventure mode.
   */
  async function generateActionChoices(
    narrativeResponse: string,
    worldState: any,
  ) {
    if (isCreativeMode || story.entries.length === 0) {
      return;
    }

    ui.setActionChoicesLoading(true);
    try {
      // Use only the lorebook entries that were activated for the previous response
      // Extract the Entry objects from RetrievedEntry wrappers
      const activeLorebookEntries = (ui.lastLorebookRetrieval?.all ?? []).map(
        (r) => r.entry,
      );

      const result = await aiService.generateActionChoices(
        story.entries,
        worldState,
        narrativeResponse,
        story.pov,
        activeLorebookEntries,
      );

      // Translate action choices if enabled
      let finalChoices = result.choices;
      const translationSettings = settings.translationSettings;
      if (TranslationService.shouldTranslate(translationSettings)) {
        try {
          finalChoices = await aiService.translateActionChoices(
            result.choices,
            translationSettings.targetLanguage,
          );
          log("Action choices translated");
        } catch (error) {
          log("Action choices translation failed (non-fatal):", error);
        }
      }

      ui.setActionChoices(finalChoices, story.currentStory?.id);
      log(
        "Action choices generated:",
        finalChoices.length,
        "with",
        activeLorebookEntries.length,
        "active lorebook entries",
      );
    } catch (error) {
      log("Failed to generate action choices:", error);
      ui.clearActionChoices(story.currentStory?.id);
    } finally {
      ui.setActionChoicesLoading(false);
    }
  }

  /**
   * Check if auto-summarization should create a new chapter.
   * Runs in background after each response, per design doc section 3.1.2.
   */
  async function checkAutoSummarize() {
    if (!story.currentStory) return;

    const config = story.memoryConfig;
    const tokensOutsideBuffer = story.tokensOutsideBuffer;

    log("checkAutoSummarize", {
      tokensSinceLastChapter: story.tokensSinceLastChapter,
      tokensOutsideBuffer,
      tokenThreshold: config.tokenThreshold,
      messagesOutsideBuffer:
        story.messagesSinceLastChapter - config.chapterBuffer,
    });

    // Skip if no tokens outside buffer (all messages are protected)
    if (tokensOutsideBuffer === 0) {
      log("No messages outside buffer, skipping");
      return;
    }

    // Analyze if we should create a chapter (token-based)
    const analysis = await aiService.analyzeForChapter(
      story.entries,
      story.lastChapterEndIndex,
      config,
      tokensOutsideBuffer,
      story.currentStory?.mode ?? "adventure",
      story.pov,
      story.tense,
    );

    if (!analysis.shouldCreateChapter) {
      log("No chapter needed yet");
      return;
    }

    log("Creating new chapter", { optimalEndIndex: analysis.optimalEndIndex });

    // Get entries for this chapter
    const startIndex = story.lastChapterEndIndex;
    const chapterEntries = story.entries.slice(
      startIndex,
      analysis.optimalEndIndex,
    );

    if (chapterEntries.length === 0) {
      log("No entries for chapter");
      return;
    }

    // Get previous chapters for context (branch-filtered)
    const previousChapters = [...story.currentBranchChapters].sort(
      (a, b) => a.number - b.number,
    );

    // Generate chapter summary with previous chapters as context
    const summary = await aiService.summarizeChapter(
      chapterEntries,
      previousChapters,
      story.currentStory?.mode ?? "adventure",
      story.pov,
      story.tense,
    );

    // Create the chapter - use database method to handle deletions correctly
    const chapterNumber = await story.getNextChapterNumber();

    // Extract time range from entries' metadata
    const firstEntry = chapterEntries[0];
    const lastEntry = chapterEntries[chapterEntries.length - 1];
    const startTime = firstEntry.metadata?.timeStart ?? null;
    const endTime = lastEntry.metadata?.timeEnd ?? null;

    const chapter: Chapter = {
      id: crypto.randomUUID(),
      storyId: story.currentStory.id,
      number: chapterNumber,
      title: analysis.suggestedTitle || summary.title,
      startEntryId: chapterEntries[0].id,
      endEntryId: chapterEntries[chapterEntries.length - 1].id,
      entryCount: chapterEntries.length,
      summary: summary.summary,
      startTime,
      endTime,
      keywords: summary.keywords,
      characters: summary.characters,
      locations: summary.locations,
      plotThreads: summary.plotThreads,
      emotionalTone: summary.emotionalTone,
      branchId: story.currentStory.currentBranchId,
      createdAt: Date.now(),
    };

    await story.addChapter(chapter);
    log("Chapter created", { number: chapterNumber, title: chapter.title });

    // Trigger lore management after chapter creation
    runLoreManagement().catch((err) => {
      console.error("[ActionInput] Lore management failed:", err);
      ui.finishLoreManagement();
    });
  }

  /**
   * Run lore management to review and update lorebook entries.
   * Triggered after chapter creation per design doc section 3.4.
   */
  async function runLoreManagement() {
    if (!story.currentStory) return;

    log("Starting lore management...");
    ui.startLoreManagement();

    let changeCount = 0;
    const bumpChanges = (delta = 1) => {
      changeCount += delta;
      return changeCount;
    };

    try {
      const result = await aiService.runLoreManagement(
        story.currentStory.id,
        story.currentStory.currentBranchId,
        [...story.lorebookEntries], // Clone to avoid mutation issues
        [], // Lore management runs without current chat history
        story.currentBranchChapters, // Use branch-filtered chapters
        {
          onCreateEntry: async (entry) => {
            await story.addLorebookEntry({
              name: entry.name,
              type: entry.type,
              description: entry.description,
              hiddenInfo: entry.hiddenInfo,
              aliases: entry.aliases,
              state: entry.state,
              adventureState: entry.adventureState,
              creativeState: entry.creativeState,
              injection: entry.injection,
              firstMentioned: entry.firstMentioned,
              lastMentioned: entry.lastMentioned,
              mentionCount: entry.mentionCount,
              createdBy: entry.createdBy,
              loreManagementBlacklisted: entry.loreManagementBlacklisted,
            });
            ui.updateLoreManagementProgress(
              "Creating entries...",
              bumpChanges(),
            );
          },
          onUpdateEntry: async (id, updates) => {
            await story.updateLorebookEntry(id, updates);
            ui.updateLoreManagementProgress(
              "Updating entries...",
              bumpChanges(),
            );
          },
          onDeleteEntry: async (id) => {
            await story.deleteLorebookEntry(id);
            ui.updateLoreManagementProgress(
              "Cleaning up entries...",
              bumpChanges(),
            );
          },
          onMergeEntries: async (entryIds, mergedEntry) => {
            // Delete old entries and create merged one
            await story.deleteLorebookEntries(entryIds);
            await story.addLorebookEntry({
              name: mergedEntry.name,
              type: mergedEntry.type,
              description: mergedEntry.description,
              hiddenInfo: mergedEntry.hiddenInfo,
              aliases: mergedEntry.aliases,
              state: mergedEntry.state,
              adventureState: mergedEntry.adventureState,
              creativeState: mergedEntry.creativeState,
              injection: mergedEntry.injection,
              firstMentioned: mergedEntry.firstMentioned,
              lastMentioned: mergedEntry.lastMentioned,
              mentionCount: mergedEntry.mentionCount,
              createdBy: mergedEntry.createdBy,
              loreManagementBlacklisted: mergedEntry.loreManagementBlacklisted,
            });
            ui.updateLoreManagementProgress(
              "Merging entries...",
              bumpChanges(),
            );
          },
        },
        story.currentStory?.mode ?? "adventure",
        story.pov,
        story.tense,
      );

      log("Lore management complete", {
        changesCount: result.changes.length,
        summary: result.summary,
      });

      ui.updateLoreManagementProgress(
        `Complete: ${result.summary}`,
        result.changes.length,
      );
    } finally {
      // Give user a moment to see the completion message
      setTimeout(() => {
        ui.finishLoreManagement();
      }, 2000);
    }
  }

  // Get protagonist name for third person POV
  const protagonistName = $derived.by(
    () =>
      story.characters.find((c) => c.relationship === "self")?.name ??
      "The protagonist",
  );
  const pov = $derived(story.pov);

  // Generate action prefixes based on POV
  const actionPrefixes = $derived.by(() => {
    switch (pov) {
      case "third":
        return {
          do: `${protagonistName} `,
          say: `${protagonistName} says, "`,
          think: `${protagonistName} thinks, "`,
          story: "",
          free: "",
        };
      case "first":
      case "second":
      default:
        return {
          do: "I ",
          say: 'I say, "',
          think: 'I think to myself, "',
          story: "",
          free: "",
        };
    }
  });

  const actionSuffixes = {
    do: "",
    say: '"',
    think: '"',
    story: "",
    free: "",
  };

  /**
   * Core generation logic - used by both handleSubmit and retry
   */
  async function generateResponse(
    userActionEntryId: string,
    userActionContent: string,
    options?: { countStyleReview?: boolean; styleReviewSource?: string },
  ) {
    const countStyleReview = options?.countStyleReview ?? true;
    const styleReviewSource =
      options?.styleReviewSource ?? (countStyleReview ? "new" : "regenerate");
    log("Starting AI generation...", {
      userActionEntryId,
      hasCurrentStory: !!story.currentStory,
    });

    // Ensure we have a current story
    if (!story.currentStory) {
      log("No current story loaded, cannot generate");
      return;
    }

    stopRequested = false;
    activeAbortController = new AbortController();

    // Check if Visual Prose mode is enabled for this story
    const visualProseMode =
      story.currentStory?.settings?.visualProseMode ?? false;
    // Generate a temp entry ID for Visual Prose CSS scoping during streaming
    const streamingEntryId = crypto.randomUUID();

    ui.setGenerating(true);
    ui.clearGenerationError(); // Clear any previous error
    ui.clearActionChoices(story.currentStory?.id); // Clear previous action choices
    ui.startStreaming(visualProseMode, streamingEntryId); // Show loading state immediately

    try {
      // Build world state for AI context (including chapters for summarization)
      // Use branch-filtered chapters for correct branch awareness
      const worldState = {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
        currentLocation: story.currentLocation,
        chapters: story.currentBranchChapters,
        memoryConfig: story.memoryConfig,
        lorebookEntries: story.lorebookEntries,
      };

      log("World state built", {
        characters: worldState.characters.length,
        locations: worldState.locations.length,
        items: worldState.items.length,
        storyBeats: worldState.storyBeats.length,
        chapters: worldState.chapters.length,
        lorebookEntries: worldState.lorebookEntries.length,
      });

      // Phase 0.5: Pre-generation retrieval (parallel)
      // Per design doc: Memory retrieval and Entry retrieval run in parallel
      let retrievedChapterContext: string | null = null;
      let lorebookContext: string | null = null;
      let timelineFillResult: TimelineFillResult | null = null;
      const storyMode = story.currentStory?.mode ?? "adventure";

      // Build parallel retrieval tasks
      const retrievalTasks: Promise<void>[] = [];

      // Task 1: Memory retrieval - get relevant chapter context
      // Use timeline fill (default) or basic retrieval depending on settings
      // Use branch-filtered chapters for correct branch awareness
      const branchChapters = story.currentBranchChapters;
      if (branchChapters.length > 0 && story.memoryConfig.enableRetrieval) {
        retrievalTasks.push(
          (async () => {
            try {
              const timelineFillEnabled =
                settings.systemServicesSettings.timelineFill?.enabled ?? true;
              if (!timelineFillEnabled) {
                log("Timeline fill disabled, skipping memory retrieval");
                return;
              }

              const useAgenticTimelineFill =
                aiService.shouldUseAgenticRetrieval(branchChapters);

              if (useAgenticTimelineFill) {
                log("Starting agentic timeline fill...", {
                  chaptersCount: branchChapters.length,
                });

                const agenticResult = await aiService.runAgenticRetrieval(
                  userActionContent,
                  story.visibleEntries,
                  branchChapters,
                  story.lorebookEntries,
                  (chapterNumber, question) =>
                    aiService.answerChapterQuestion(
                      chapterNumber,
                      question,
                      branchChapters,
                      story.entries,
                      activeAbortController?.signal,
                      storyMode,
                    ),
                  (startChapter, endChapter, question) =>
                    aiService.answerChapterRangeQuestion(
                      startChapter,
                      endChapter,
                      question,
                      branchChapters,
                      story.entries,
                      activeAbortController?.signal,
                      storyMode,
                    ),
                  activeAbortController?.signal,
                  storyMode,
                  story.pov,
                  story.tense,
                );

                if (agenticResult.context) {
                  retrievedChapterContext =
                    aiService.formatAgenticRetrievalForPrompt(agenticResult);
                  log("Agentic timeline fill complete", {
                    iterations: agenticResult.iterations,
                    queriedChapters: agenticResult.queriedChapters.length,
                    contextLength: retrievedChapterContext?.length ?? 0,
                  });
                } else {
                  log("Agentic timeline fill returned no context");
                }
              } else {
                log("Starting timeline fill...", {
                  chaptersCount: branchChapters.length,
                });

                // Timeline fill: generates queries and executes them in one go
                const timelineResult = await aiService.runTimelineFill(
                  userActionContent,
                  story.visibleEntries,
                  branchChapters,
                  story.entries, // All entries for querying chapter content
                  activeAbortController?.signal,
                  storyMode,
                  story.pov,
                  story.tense,
                );

                // Store raw result - formatting is now done in buildChapterSummariesBlock
                timelineFillResult = timelineResult;
                log("Timeline fill complete", {
                  queriesGenerated: timelineResult.queries.length,
                  responsesCount: timelineResult.responses.length,
                });
              }
            } catch (retrievalError) {
              if (
                retrievalError instanceof Error &&
                retrievalError.name === "AbortError"
              ) {
                log("Memory retrieval aborted");
                return;
              }
              log("Memory retrieval failed (non-fatal)", retrievalError);
              console.warn("Memory retrieval failed:", retrievalError);
            }
          })(),
        );
      }

      // Task 2: Lorebook entry retrieval (Tier 3 LLM selection runs here)
      // Pass live-tracked entities for Tier 1 injection
      // Also pass activation tracker for stickiness calculations
      if (
        story.lorebookEntries.length > 0 ||
        story.characters.length > 0 ||
        story.locations.length > 0 ||
        story.items.length > 0
      ) {
        retrievalTasks.push(
          (async () => {
            try {
              // Create activation tracker for stickiness
              // Current position is the number of story entries (next entry will be at this index)
              const storyPosition = story.entries.length;
              const activationTracker = ui.getActivationTracker(
                storyPosition,
              ) as SimpleActivationTracker;

              log("Starting lorebook retrieval...", {
                lorebookEntries: story.lorebookEntries.length,
                liveCharacters: story.characters.length,
                liveLocations: story.locations.length,
                liveItems: story.items.length,
                storyPosition,
              });
              const entryResult = await aiService.getRelevantLorebookEntries(
                story.lorebookEntries,
                userActionContent,
                story.visibleEntries.slice(-10),
                {
                  characters: story.characters,
                  locations: story.locations,
                  items: story.items,
                },
                activationTracker,
                activeAbortController?.signal,
              );
              lorebookContext = entryResult.contextBlock;
              // Store retrieval result for debug panel
              ui.setLastLorebookRetrieval(entryResult);
              // Update activation data with recorded activations (and persist to database)
              ui.updateActivationData(
                activationTracker,
                story.currentStory?.id,
              );
              log("Lorebook retrieval complete", {
                tier1: entryResult.tier1.length,
                tier2: entryResult.tier2.length,
                tier3: entryResult.tier3.length,
                contextLength: lorebookContext?.length ?? 0,
              });
            } catch (entryError) {
              if (
                entryError instanceof Error &&
                entryError.name === "AbortError"
              ) {
                log("Lorebook retrieval aborted");
                return;
              }
              log("Lorebook retrieval failed (non-fatal)", entryError);
              console.warn("Lorebook retrieval failed:", entryError);
            }
          })(),
        );
      }

      // Wait for all retrieval tasks to complete (parallel execution)
      if (retrievalTasks.length > 0) {
        log("Waiting for parallel retrieval tasks...", {
          taskCount: retrievalTasks.length,
        });
        await Promise.all(retrievalTasks);
        log("All retrieval tasks complete");
      }

      if (stopRequested) {
        log("Generation stopped before streaming started");
        return;
      }

      // Combine retrieved contexts
      const combinedRetrievedContext =
        [retrievedChapterContext, lorebookContext].filter(Boolean).join("\n") ||
        null;

      let fullResponse = "";
      let fullReasoning = "";
      let chunkCount = 0;

      // Capture current story reference for use after streaming
      const currentStoryRef = story.currentStory;

      // Retry logic for empty responses
      const MAX_EMPTY_RESPONSE_RETRIES = 3;
      let retryCount = 0;

      // Start streaming indicator now that retrieval is complete
      ui.startStreaming(visualProseMode, streamingEntryId);

      while (retryCount < MAX_EMPTY_RESPONSE_RETRIES) {
        // Reset for each attempt
        fullResponse = "";
        fullReasoning = "";
        chunkCount = 0;

        if (retryCount > 0) {
          log(
            `Retrying generation (attempt ${retryCount + 1}/${MAX_EMPTY_RESPONSE_RETRIES}) due to empty response...`,
          );
          // startStreaming() clears previous content and restarts
          ui.startStreaming(visualProseMode, streamingEntryId);
        }

        // Use streaming response with visible entries only (non-summarized)
        // Per design doc section 3.1.2: summarized entries are excluded from context
        log("Starting stream iteration...", {
          hasStyleReview: !!ui.lastStyleReview,
          visibleEntries: story.visibleEntries.length,
          totalEntries: story.entries.length,
          hasRetrievedContext: !!combinedRetrievedContext,
          hasLorebookContext: !!lorebookContext,
          hasTimelineFill: !!timelineFillResult,
          timelineFillResponses:
            (timelineFillResult as any)?.responses?.length ?? 0,
          attempt: retryCount + 1,
        });

        for await (const chunk of aiService.streamResponse(
          story.visibleEntries,
          worldState,
          currentStoryRef,
          true,
          ui.lastStyleReview,
          combinedRetrievedContext,
          activeAbortController?.signal,
          timelineFillResult,
        )) {
          if (stopRequested) {
            log("Stop requested during streaming");
            break;
          }
          chunkCount++;
          if (chunk.content) {
            fullResponse += chunk.content;
            ui.appendStreamContent(chunk.content);

            // Emit streaming event
            eventBus.emit<ResponseStreamingEvent>({
              type: "ResponseStreaming",
              chunk: chunk.content,
              accumulated: fullResponse,
            });
          }

          // Handle reasoning chunk
          if (chunk.reasoning) {
            ui.appendReasoningContent(chunk.reasoning);
            fullReasoning += chunk.reasoning;
          }

          if (chunk.done) {
            log("Stream done signal received");
            break;
          }
        }

        log("Stream complete", {
          chunkCount,
          responseLength: fullResponse.length,
          attempt: retryCount + 1,
        });

        // Check if we got a valid response
        if (fullResponse.trim()) {
          break; // Success, exit retry loop
        }

        // Empty response, increment retry counter
        retryCount++;
        if (retryCount < MAX_EMPTY_RESPONSE_RETRIES) {
          log(
            `Empty response received, will retry (${retryCount}/${MAX_EMPTY_RESPONSE_RETRIES})...`,
          );
        }
      }

      // End streaming immediately to prevent duplicate display
      // (StreamingEntry would show alongside the saved entry otherwise)
      ui.endStreaming();

      if (stopRequested) {
        log("Generation stopped after streaming, skipping save");
        return;
      }

      // Save the complete response as a story entry
      if (fullResponse.trim()) {
        log("Saving narration entry...", {
          contentLength: fullResponse.length,
          hasReasoning: !!fullReasoning,
        });
        const narrationEntry = await story.addEntry(
          "narration",
          fullResponse,
          undefined,
          fullReasoning || undefined,
        );
        log("Narration entry saved", {
          entryId: narrationEntry.id,
          entriesCount: story.entries.length,
        });

        // Emit NarrativeResponse event
        emitNarrativeResponse(narrationEntry.id, fullResponse);

        // Phase 2.4: Translate narration if enabled (background, non-blocking)
        // Store promise so image generation can wait for it
        const translationSettingsRef = settings.translationSettings;
        let translationPromise: Promise<{ translatedContent: string; targetLanguage: string } | null> | null = null;

        if (TranslationService.shouldTranslateNarration(translationSettingsRef)) {
          const isVisualProse = story.currentStory?.settings?.visualProseMode ?? false;
          const targetLang = translationSettingsRef.targetLanguage;
          const entryIdForTranslation = narrationEntry.id;

          // Run translation async - store promise so image gen can wait for it
          translationPromise = (async () => {
            try {
              log("Translating narration", { entryId: entryIdForTranslation, isVisualProse, targetLang });
              const result = await aiService.translateNarration(fullResponse, targetLang, isVisualProse);
              await database.updateStoryEntry(entryIdForTranslation, {
                translatedContent: result.translatedContent,
                translationLanguage: targetLang,
              });
              // Refresh the entry in the store to show translated content
              await story.refreshEntry(entryIdForTranslation);
              log("Narration translated", { entryId: entryIdForTranslation });
              return { translatedContent: result.translatedContent, targetLanguage: targetLang };
            } catch (error) {
              log("Narration translation failed (non-fatal)", error);
              return null;
            }
          })();
        }

        // Phase 2.5: Trigger TTS for auto-play if enabled
        // If translation is enabled, wait for it first so TTS uses translated content
        const ttsSettings = settings.systemServicesSettings.tts;
        if (ttsSettings.enabled && ttsSettings.autoPlay) {
          if (translationPromise) {
            // Wait for translation to complete before TTS so entry.translatedContent is available
            translationPromise.then(() => {
              emitTTSQueued(narrationEntry.id, fullResponse);
              log("TTS queued for auto-play (after translation)", { entryId: narrationEntry.id });
            }).catch(() => {
              // Translation failed, still trigger TTS with original content
              emitTTSQueued(narrationEntry.id, fullResponse);
              log("TTS queued for auto-play (translation failed)", { entryId: narrationEntry.id });
            });
          } else {
            // No translation enabled, trigger TTS immediately
            emitTTSQueued(narrationEntry.id, fullResponse);
            log("TTS queued for auto-play", { entryId: narrationEntry.id });
          }
        }

        // Phase 3: Classify the response to extract world state changes
        // Pass visible entries so classifier can see full chat history with time data
        // Filter out the current narration entry to avoid sending it twice (once in chatHistory, once as narrativeResponse)
        log("Starting classification phase...");
        ui.setGenerationStatus("Updating world...");
        try {
          const chatHistoryEntries = story.visibleEntries.filter(
            (e) => e.id !== narrationEntry.id,
          );
          const classificationResult = await aiService.classifyResponse(
            fullResponse,
            userActionContent,
            worldState,
            currentStoryRef,
            chatHistoryEntries,
            currentStoryRef?.timeTracker,
          );

          log("Classification complete", {
            newCharacters:
              classificationResult.entryUpdates.newCharacters.length,
            newLocations: classificationResult.entryUpdates.newLocations.length,
            newItems: classificationResult.entryUpdates.newItems.length,
            newStoryBeats:
              classificationResult.entryUpdates.newStoryBeats.length,
          });

          // Emit ClassificationComplete event
          eventBus.emit<ClassificationCompleteEvent>({
            type: "ClassificationComplete",
            messageId: narrationEntry.id,
            result: classificationResult,
          });

          // Phase 4: Apply classification results to world state
          await story.applyClassificationResult(classificationResult);
          log("World state updated from classification");
          ui.setGenerationStatus("Saving...");

          // Phase 4.5: Translate world state elements if enabled (background, non-blocking)
          const translationSettingsForUI = settings.translationSettings;
          if (TranslationService.shouldTranslateWorldState(translationSettingsForUI)) {
            const targetLangForUI = translationSettingsForUI.targetLanguage;

            // Run translation async (non-blocking) - don't await
            (async () => {
              try {
                // Collect items to translate from classification result
                const itemsToTranslate: { id: string; text: string; type: 'name' | 'description' | 'title'; entityType: string; field: string; isArray?: boolean }[] = [];

                // New characters
                for (const char of classificationResult.entryUpdates.newCharacters) {
                  const dbChar = story.characters.find(c => c.name === char.name);
                  if (dbChar) {
                    itemsToTranslate.push({ id: `${dbChar.id}:name`, text: char.name, type: 'name', entityType: 'character', field: 'translatedName' });
                    if (char.description) {
                      itemsToTranslate.push({ id: `${dbChar.id}:desc`, text: char.description, type: 'description', entityType: 'character', field: 'translatedDescription' });
                    }
                    if (char.relationship) {
                      itemsToTranslate.push({ id: `${dbChar.id}:rel`, text: char.relationship, type: 'description', entityType: 'character', field: 'translatedRelationship' });
                    }
                    if (char.traits && char.traits.length > 0) {
                      itemsToTranslate.push({ id: `${dbChar.id}:traits`, text: char.traits.join(', '), type: 'description', entityType: 'character', field: 'translatedTraits', isArray: true });
                    }
                    if (char.visualDescriptors && char.visualDescriptors.length > 0) {
                      itemsToTranslate.push({ id: `${dbChar.id}:visual`, text: char.visualDescriptors.join(', '), type: 'description', entityType: 'character', field: 'translatedVisualDescriptors', isArray: true });
                    }
                  }
                }

                // New locations
                for (const loc of classificationResult.entryUpdates.newLocations) {
                  const dbLoc = story.locations.find(l => l.name === loc.name);
                  if (dbLoc) {
                    itemsToTranslate.push({ id: `${dbLoc.id}:name`, text: loc.name, type: 'name', entityType: 'location', field: 'translatedName' });
                    if (loc.description) {
                      itemsToTranslate.push({ id: `${dbLoc.id}:desc`, text: loc.description, type: 'description', entityType: 'location', field: 'translatedDescription' });
                    }
                  }
                }

                // New items
                for (const item of classificationResult.entryUpdates.newItems) {
                  const dbItem = story.items.find(i => i.name === item.name);
                  if (dbItem) {
                    itemsToTranslate.push({ id: `${dbItem.id}:name`, text: item.name, type: 'name', entityType: 'item', field: 'translatedName' });
                    if (item.description) {
                      itemsToTranslate.push({ id: `${dbItem.id}:desc`, text: item.description, type: 'description', entityType: 'item', field: 'translatedDescription' });
                    }
                  }
                }

                // New story beats
                for (const beat of classificationResult.entryUpdates.newStoryBeats) {
                  const dbBeat = story.storyBeats.find(b => b.title === beat.title);
                  if (dbBeat) {
                    itemsToTranslate.push({ id: `${dbBeat.id}:title`, text: beat.title, type: 'title', entityType: 'storyBeat', field: 'translatedTitle' });
                    if (beat.description) {
                      itemsToTranslate.push({ id: `${dbBeat.id}:desc`, text: beat.description, type: 'description', entityType: 'storyBeat', field: 'translatedDescription' });
                    }
                  }
                }

                if (itemsToTranslate.length > 0) {
                  log("Translating world state elements", { count: itemsToTranslate.length, targetLang: targetLangForUI });
                  const uiItems = itemsToTranslate.map(item => ({ id: item.id, text: item.text, type: item.type }));
                  const translated = await aiService.translateUIElements(uiItems, targetLangForUI);

                  // Apply translations to database
                  for (const translatedItem of translated) {
                    const [entityId, fieldType] = translatedItem.id.split(':');
                    const originalItem = itemsToTranslate.find(i => i.id === translatedItem.id);
                    if (!originalItem) continue;

                    // Handle array fields (traits, visualDescriptors) by splitting the translated comma-separated string
                    const translatedValue = originalItem.isArray
                      ? translatedItem.text.split(',').map(s => s.trim()).filter(Boolean)
                      : translatedItem.text;

                    const updateData: Record<string, string | string[] | null> = {
                      [originalItem.field]: translatedValue,
                      translationLanguage: targetLangForUI,
                    };

                    if (originalItem.entityType === 'character') {
                      await database.updateCharacter(entityId, updateData as any);
                    } else if (originalItem.entityType === 'location') {
                      await database.updateLocation(entityId, updateData as any);
                    } else if (originalItem.entityType === 'item') {
                      await database.updateItem(entityId, updateData as any);
                    } else if (originalItem.entityType === 'storyBeat') {
                      await database.updateStoryBeat(entityId, updateData as any);
                    }
                  }

                  // Refresh story state to show translations in sidebar
                  await story.refreshWorldState();
                  log("World state elements translated", { count: translated.length });
                }
              } catch (error) {
                log("World state translation failed (non-fatal)", error);
              }
            })();
          }

          // Phase 9: Generate images for imageable scenes (background, non-blocking)
          // This runs inside the classification try block because we need the presentCharacterNames
          // If translation is enabled, wait for it so we can embed images in translated text
          if (
            currentStoryRef &&
            settings.systemServicesSettings.imageGeneration.enabled
          ) {
            // Get updated characters from story (includes visual descriptors updates)
            const presentCharacters = story.characters.filter(
              (c) =>
                classificationResult.scene.presentCharacterNames.includes(
                  c.name,
                ) || c.relationship === "self",
            );

            // Build full chat history for image generation context
            const imageGenChatHistory = story.visibleEntries
              .filter((e) => e.type === "user_action" || e.type === "narration")
              .map(
                (e) =>
                  `${e.type === "user_action" ? "USER" : "ASSISTANT"}:\n${e.content}`,
              )
              .join("\n\n");

            // Wait for translation if enabled, so image analyzer can embed in translated text
            let translatedNarrative: string | undefined;
            let translationLanguage: string | undefined;

            if (translationPromise) {
              log("Waiting for translation to complete for image generation...");
              const translationResult = await translationPromise;
              if (translationResult) {
                translatedNarrative = translationResult.translatedContent;
                translationLanguage = translationResult.targetLanguage;
                log("Translation complete, will embed images in translated text", {
                  targetLanguage: translationLanguage,
                });
              }
            }

            const imageGenContext: ImageGenerationContext = {
              storyId: currentStoryRef.id,
              entryId: narrationEntry.id,
              narrativeResponse: fullResponse,
              userAction: userActionContent,
              presentCharacters,
              currentLocation:
                classificationResult.scene.currentLocationName ??
                worldState.currentLocation?.name,
              chatHistory: imageGenChatHistory,
              lorebookContext: lorebookContext ?? undefined,
              translatedNarrative,
              translationLanguage,
            };

            // Store for manual generation if auto-generate is disabled
            lastImageGenContext = imageGenContext;

            if (
              settings.systemServicesSettings.imageGeneration.autoGenerate &&
              aiService.isImageGenerationEnabled()
            ) {
              aiService
                .generateImagesForNarrative(imageGenContext)
                .catch((err) => {
                  log("Image generation failed (non-fatal)", err);
                });
            }
          }
        } catch (classifyError) {
          // Classification failure shouldn't break the main flow
          log("Classification failed (non-fatal)", classifyError);
          console.warn("World state classification failed:", classifyError);
        }

        // Phase 4.1: Update narration entry with timeEnd after classification phase
        // This runs regardless of classification success - timeEnd reflects current story time
        await story.updateEntryTimeEnd(narrationEntry.id);

        // Phase 5: Check if auto-summarization is needed (background, non-blocking)
        if (story.memoryConfig.autoSummarize) {
          checkAutoSummarize().catch((err) => {
            log("Auto-summarize check failed (non-fatal)", err);
          });
        }

        // Phase 6: Generate suggestions for creative writing mode (background, non-blocking)
        if (isCreativeMode && !settings.uiSettings.disableSuggestions) {
          refreshSuggestions().catch((err) => {
            log("Suggestions generation failed (non-fatal)", err);
          });
        }

        // Phase 7: Generate RPG action choices for adventure mode (background, non-blocking)
        if (!isCreativeMode && !settings.uiSettings.disableSuggestions) {
          generateActionChoices(fullResponse, worldState).catch((err) => {
            log("Action choices generation failed (non-fatal)", err);
          });
        }

        // Phase 8: Check if style review should run (background, non-blocking)
        checkStyleReview(countStyleReview, styleReviewSource).catch((err) => {
          log("Style review check failed (non-fatal)", err);
        });
      } else {
        log(
          `No response content after ${MAX_EMPTY_RESPONSE_RETRIES} attempts (fullResponse was empty or whitespace)`,
        );
        // Add a system message to inform the user
        const errorMessage = `The AI returned an empty response after ${MAX_EMPTY_RESPONSE_RETRIES} attempts. Please try again.`;
        const errorEntry = await story.addEntry("system", errorMessage);

        // Store error state for retry button to work
        ui.setGenerationError({
          message: errorMessage,
          errorEntryId: errorEntry.id,
          userActionEntryId: userActionEntryId,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      if (
        stopRequested ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        log("Generation aborted by user");
        return;
      }
      log("Generation failed", error);
      console.error("Generation failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to generate response. Please try again.";
      const errorEntry = await story.addEntry(
        "system",
        `Generation failed: ${errorMessage}`,
      );

      // Store error state for retry
      ui.setGenerationError({
        message: errorMessage,
        errorEntryId: errorEntry.id,
        userActionEntryId: userActionEntryId,
        timestamp: Date.now(),
      });
    } finally {
      ui.endStreaming();
      ui.setGenerating(false);
      ui.setGenerationStatus("");
      activeAbortController = null;
      stopRequested = false;
      log("Generation complete, UI reset");
    }
  }

  async function handleSubmit() {
    log("handleSubmit called", {
      inputValue: inputValue.trim(),
      actionType,
      isCreativeMode,
      isGenerating: ui.isGenerating,
    });

    if (!inputValue.trim() || ui.isGenerating) {
      log("Submit blocked", {
        emptyInput: !inputValue.trim(),
        isGenerating: ui.isGenerating,
      });
      return;
    }

    // Clear any previous error
    ui.clearGenerationError();

    // Reset scroll break - user sending a message means they want to see the response
    ui.resetScrollBreak();

    // Clear suggestions immediately when user sends a message
    ui.clearSuggestions(story.currentStory?.id);

    // Build action content:
    // - Creative writing mode: use raw input as direction
    // - Raw action choice (from ActionChoices): use as-is (already formatted by AI)
    // - Disable action prefixes: use raw input
    // - Adventure mode: apply action prefixes/suffixes
    const rawInput = inputValue.trim();
    const wasRawActionChoice = isRawActionChoice;
    const forceFreeMode = settings.uiSettings.disableActionPrefixes;

    let content: string;
    if (isCreativeMode || wasRawActionChoice || forceFreeMode) {
      content = rawInput;
    } else {
      content =
        actionPrefixes[actionType] + rawInput + actionSuffixes[actionType];
    }

    // Reset the raw action choice flag
    isRawActionChoice = false;

    log("Action content built", {
      content,
      mode: isCreativeMode ? "creative" : "adventure",
      wasRawChoice: wasRawActionChoice,
    });

    // Create a backup of the current state BEFORE adding the user action
    // This allows "retry last message" to restore to this exact point
    if (story.currentStory) {
      // Fetch embedded images for backup (they're not in the story store)
      const embeddedImages = await database.getEmbeddedImagesForStory(
        story.currentStory.id,
      );
      ui.createRetryBackup(
        story.currentStory.id,
        story.entries,
        story.characters,
        story.locations,
        story.items,
        story.storyBeats,
        embeddedImages,
        content,
        rawInput,
        actionType,
        wasRawActionChoice,
        story.currentStory.timeTracker,
      );
    }

    // Translate user input if enabled (keeps original for display, uses English for AI)
    let promptContent = content;
    let originalInput: string | undefined;

    const translationSettings = settings.translationSettings;
    if (TranslationService.shouldTranslateInput(translationSettings)) {
      try {
        log("Translating user input", {
          sourceLanguage: translationSettings.sourceLanguage,
        });
        const result = await aiService.translateInput(
          content,
          translationSettings.sourceLanguage
        );
        originalInput = content;  // Save original for display
        promptContent = result.translatedContent;  // Use English for prompt
        log("Input translated", {
          originalLength: content.length,
          translatedLength: promptContent.length,
        });
      } catch (error) {
        log("Input translation failed (non-fatal), using original", error);
        // Continue with original content if translation fails
      }
    }

    // Add user action to story
    const userActionEntry = await story.addEntry("user_action", promptContent);
    log("User action added to story", { entryId: userActionEntry.id });

    // If translated, store original input for display
    if (originalInput) {
      await database.updateStoryEntry(userActionEntry.id, { originalInput });
      await story.refreshEntry(userActionEntry.id);
    }

    // Emit UserInput event
    emitUserInput(
      content,
      isCreativeMode ? "direction" : forceFreeMode ? "free" : actionType,
    );

    // Clear input
    inputValue = "";

    // Wait for reactive state to synchronize before generation
    // This ensures lorebook entries, characters, etc. are fully loaded
    await tick();

    // Generate AI response with streaming
    if (!settings.needsApiKey) {
      await generateResponse(userActionEntry.id, content);
    } else {
      log("No API key configured");
      await story.addEntry(
        "system",
        "Please configure your API key in settings to enable AI generation.",
      );
    }
  }

  /**
   * Stop the active generation and restore input state.
   */
  async function handleStopGeneration() {
    log("handleStopGeneration called", {
      hasBackup: !!ui.retryBackup,
      isGenerating: ui.isGenerating,
    });

    if (!ui.isGenerating) {
      log("Stop ignored (not generating)");
      return;
    }
    if (ui.isRetryingLastMessage) {
      log("Stop ignored (retrying completed message)");
      return;
    }

    stopRequested = true;
    activeAbortController?.abort();

    ui.endStreaming();
    ui.setGenerating(false);

    const backup = ui.retryBackup;
    if (!backup || !story.currentStory) {
      log("No valid backup for stop restore");
      return;
    }

    if (backup.storyId !== story.currentStory.id) {
      log("Stop backup is for different story, clearing");
      ui.clearRetryBackup();
      return;
    }

    // Clear any error state and stale UI data
    ui.clearGenerationError();
    ui.clearSuggestions(story.currentStory?.id);
    ui.clearActionChoices(story.currentStory?.id);
    if (backup.hasFullState) {
      ui.restoreActivationData(backup.activationData, backup.storyPosition);
    }
    ui.setLastLorebookRetrieval(null);

    try {
      if (backup.hasFullState) {
        await story.restoreFromRetryBackup({
          entries: backup.entries,
          characters: backup.characters,
          locations: backup.locations,
          items: backup.items,
          storyBeats: backup.storyBeats,
          embeddedImages: backup.embeddedImages,
          timeTracker: backup.timeTracker,
        });
      } else {
        // Persistent restore - delete entries and entities created after backup
        // Clear activation data but don't save yet - let the next action rebuild it
        ui.clearActivationData();

        log(
          "Persistent stop restore: deleting entries from position",
          backup.entryCountBeforeAction,
        );
        await story.deleteEntriesFromPosition(backup.entryCountBeforeAction);

        if (backup.hasEntityIds) {
          log(
            "Persistent stop restore: deleting entities created after backup",
          );
          await story.deleteEntitiesCreatedAfterBackup({
            characterIds: backup.characterIds,
            locationIds: backup.locationIds,
            itemIds: backup.itemIds,
            storyBeatIds: backup.storyBeatIds,
            embeddedImageIds: backup.embeddedImageIds,
          });
        } else {
          log(
            "Persistent stop restore: skipping entity cleanup (no ID snapshot)",
          );
        }
        await story.restoreCharacterSnapshots(backup.characterSnapshots);

        // Restore time tracker snapshot after persistent cleanup
        await story.restoreTimeTrackerSnapshot(backup.timeTracker);
      }

      await tick();
      actionType = backup.actionType;
      isRawActionChoice = backup.wasRawActionChoice;
      inputValue = backup.rawInput;
    } catch (error) {
      log("Stop restore failed", error);
      console.error("Stop restore failed:", error);
    } finally {
      ui.clearRetryBackup(true); // Clear from DB since user explicitly stopped
    }
  }

  /**
   * Retry the last failed generation
   */
  async function handleRetry() {
    log("handleRetry called", {
      hasError: !!ui.lastGenerationError,
      isGenerating: ui.isGenerating,
    });

    const error = ui.lastGenerationError;
    if (!error || ui.isGenerating) {
      log("handleRetry early return", {
        hasError: !!error,
        isGenerating: ui.isGenerating,
      });
      return;
    }

    log("Retrying generation", {
      errorEntryId: error.errorEntryId,
      userActionEntryId: error.userActionEntryId,
    });

    // Find the user action content before deleting the error
    const userActionEntry = story.entries.find(
      (e) => e.id === error.userActionEntryId,
    );
    if (!userActionEntry) {
      log("User action entry not found for retry");
      ui.clearGenerationError();
      return;
    }

    // Delete the error entry
    await story.deleteEntry(error.errorEntryId);
    ui.clearGenerationError();

    // Retry generation with the same user action
    if (!settings.needsApiKey) {
      await generateResponse(userActionEntry.id, userActionEntry.content, {
        countStyleReview: false,
        styleReviewSource: "retry-error",
      });
    }
  }

  /**
   * Dismiss the error without retrying
   */
  function dismissError() {
    ui.clearGenerationError();
  }

  /**
   * Retry the last user message by restoring to the backup state
   * and regenerating with the same user action.
   * Supports both full state restore (in-memory backup) and entry-only restore (persistent backup).
   */
  async function handleRetryLastMessage() {
    log("handleRetryLastMessage called", {
      hasBackup: !!ui.retryBackup,
      isGenerating: ui.isGenerating,
      storyId: story.currentStory?.id,
    });

    const backup = ui.retryBackup;
    if (!backup || ui.isGenerating || !story.currentStory) {
      log("handleRetryLastMessage early return");
      return;
    }

    // Verify backup is for current story
    if (backup.storyId !== story.currentStory.id) {
      log("Backup is for different story, clearing");
      ui.clearRetryBackup(false); // Just clear in-memory, don't touch DB
      return;
    }

    // Debug: Log character state before restore
    const currentCharDescriptors = story.characters.map((c) => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    const backupCharDescriptors = backup.characters.map((c) => ({
      name: c.name,
      visualDescriptors: [...c.visualDescriptors],
    }));
    log("RETRY DEBUG - Before restore:", {
      hasFullState: backup.hasFullState,
      currentCharDescriptors,
      backupCharDescriptors,
      characterSnapshots: backup.characterSnapshots?.map((s) => ({
        id: s.id,
        visualDescriptors: s.visualDescriptors,
      })),
    });

    log("Restoring from backup and regenerating", {
      hasFullState: backup.hasFullState,
      backupEntriesCount: backup.entries.length,
      entryCountBeforeAction: backup.entryCountBeforeAction,
      currentEntriesCount: story.entries.length,
      userAction: backup.userActionContent.substring(0, 50),
    });

    // Clear any error state
    ui.clearGenerationError();

    // Clear suggestions and action choices
    ui.clearSuggestions(story.currentStory?.id);
    ui.clearActionChoices(story.currentStory?.id);

    // Clear lorebook retrieval debug state since it's now stale
    ui.setLastLorebookRetrieval(null);

    // Clear stale image generation context (contains old portrait state)
    lastImageGenContext = null;

    try {
      if (backup.hasFullState) {
        // Full state restore (in-memory backup with snapshots)
        // Restore activation data from backup to preserve lorebook stickiness state
        ui.restoreActivationData(backup.activationData, backup.storyPosition);

        // Restore story state from backup (this locks editing internally)
        await story.restoreFromRetryBackup({
          entries: backup.entries,
          characters: backup.characters,
          locations: backup.locations,
          items: backup.items,
          storyBeats: backup.storyBeats,
          embeddedImages: backup.embeddedImages,
          timeTracker: backup.timeTracker,
        });
      } else {
        // Persistent restore (backup without full snapshots, but with entity IDs)
        // Lock editing for persistent restore path
        story.lockRetryInProgress();

        // Clear activation data but don't save yet - generation will rebuild it
        ui.clearActivationData();

        log(
          "Persistent restore: deleting entries from position",
          backup.entryCountBeforeAction,
        );
        await story.deleteEntriesFromPosition(backup.entryCountBeforeAction);

        if (backup.hasEntityIds) {
          // Delete entities that were created after the backup (AI extractions)
          log("Persistent restore: deleting entities created after backup");
          await story.deleteEntitiesCreatedAfterBackup({
            characterIds: backup.characterIds,
            locationIds: backup.locationIds,
            itemIds: backup.itemIds,
            storyBeatIds: backup.storyBeatIds,
            embeddedImageIds: backup.embeddedImageIds,
          });
        } else {
          log("Persistent restore: skipping entity cleanup (no ID snapshot)");
        }
        await story.restoreCharacterSnapshots(backup.characterSnapshots);

        // Restore time tracker snapshot after persistent cleanup
        await story.restoreTimeTrackerSnapshot(backup.timeTracker);
      }

      // Wait for state to sync
      await tick();

      // Debug: Log character state after restore
      const postRestoreCharDescriptors = story.characters.map((c) => ({
        name: c.name,
        visualDescriptors: [...c.visualDescriptors],
      }));
      log("RETRY DEBUG - After restore:", {
        postRestoreCharDescriptors,
      });

      // Translate user input if enabled (same logic as handleSubmit)
      let promptContent = backup.userActionContent;
      let originalInput: string | undefined;

      const translationSettings = settings.translationSettings;
      if (TranslationService.shouldTranslateInput(translationSettings)) {
        try {
          log("Retry: Translating user input", {
            sourceLanguage: translationSettings.sourceLanguage,
          });
          const result = await aiService.translateInput(
            backup.userActionContent,
            translationSettings.sourceLanguage
          );
          originalInput = backup.userActionContent;  // Save original for display
          promptContent = result.translatedContent;  // Use English for prompt
          log("Retry: Input translated", {
            originalLength: backup.userActionContent.length,
            translatedLength: promptContent.length,
          });
        } catch (error) {
          log("Retry: Input translation failed (non-fatal), using original", error);
          // Continue with original content if translation fails
        }
      }

      // Re-add the user action with translated content
      const userActionEntry = await story.addEntry(
        "user_action",
        promptContent,
      );
      log("User action re-added", { entryId: userActionEntry.id });

      // If translated, store original input for display
      if (originalInput) {
        await database.updateStoryEntry(userActionEntry.id, { originalInput });
        await story.refreshEntry(userActionEntry.id);
      }

      // Emit UserInput event (use original content for event)
      emitUserInput(
        backup.userActionContent,
        isCreativeMode ? "direction" : backup.actionType,
      );

      // Wait for state to sync again
      await tick();

      // Regenerate
      if (!settings.needsApiKey) {
        ui.setRetryingLastMessage(true);
        try {
          await generateResponse(userActionEntry.id, promptContent, {
            countStyleReview: false,
            styleReviewSource: "retry-last-message",
          });
        } finally {
          ui.setRetryingLastMessage(false);
        }
      }
    } catch (error) {
      log("Retry last message failed", error);
      console.error("Retry last message failed:", error);
    } finally {
      // Unlock editing if it was locked by persistent restore path
      // (Full state restore unlocks internally in restoreFromRetryBackup)
      if (backup && !backup.hasFullState) {
        story.unlockRetryInProgress();
      }
    }
  }

  /**
   * Dismiss the retry backup (user doesn't want to retry)
   */
  function dismissRetryBackup() {
    ui.clearRetryBackup(true); // Clear from DB since user explicitly dismissed
  }

  function handleKeydown(event: KeyboardEvent) {
    const isMobile = isTouchDevice();
    
    // On mobile: Enter = new line, Shift+Enter = send
    // On desktop: Enter = send, Shift+Enter = new line
    const shouldSubmit = isMobile 
      ? (event.key === "Enter" && event.shiftKey)
      : (event.key === "Enter" && !event.shiftKey);
    
    if (shouldSubmit) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function autoResize(node: HTMLTextAreaElement, _value?: string) {
    function resize() {
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }

    // Resize initially
    resize();

    // Resize on input (user typing)
    node.addEventListener("input", resize);

    return {
      update(_newValue?: string) {
        // Resize when value changes programmatically (e.g. suggestions)
        resize();
      },
      destroy() {
        node.removeEventListener("input", resize);
      },
    };
  }
</script>

<div class="space-y-3">
  <!-- Error retry banner -->
  {#if ui.lastGenerationError && !ui.isGenerating}
    <div
      class="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3"
    >
      <div class="flex items-center gap-2 text-sm text-red-400">
        <span>Generation failed. Would you like to try again?</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={handleRetry}
          class="btn flex items-center gap-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30"
        >
          <RefreshCw class="h-4 w-4" />
          Retry
        </button>
        <button
          onclick={dismissError}
          class="p-1.5 rounded text-surface-400 hover:bg-surface-700 hover:text-surface-200"
          title="Dismiss"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>
  {/if}

  {#if isCreativeMode}
    <!-- Creative Writing Mode: Direction Input -->
    <div
      class="rounded-lg border-l-0 sm:border-l-4 {ui.isGenerating
        ? 'sm:border-l-surface-600 bg-surface-400/5'
        : 'border-l-accent-500 sm:bg-surface-400/5'} transition-colors duration-200 relative"
    >
      <!-- Mobile Word Count Pill -->
      {#if settings.uiSettings.showWordCount}
        <div class="absolute top-2 right-0 sm:hidden">
          <div
            class="bg-surface-700 px-2 py-0.5 rounded-b-lg rounded-t-md text-[10px] text-surface-400"
          >
            {story.wordCount} wc
          </div>
        </div>
      {/if}

      <!-- Creative Writing Mode: Suggestions (Header) -->
      {#if !settings.uiSettings.disableSuggestions}
        <div class="border-b border-surface-700/30">
          <Suggestions
            suggestions={ui.suggestions}
            loading={ui.suggestionsLoading}
            onSelect={handleSuggestionSelect}
            onRefresh={refreshSuggestions}
          />
        </div>
      {/if}

      <div class="flex items-end gap-1 p-0.5 mb-3 sm:mb-2 sm:p-1.5">
        <div class="relative flex-1 min-w-0">
          <textarea
            bind:value={inputValue}
            use:autoResize={inputValue}
            onkeydown={handleKeydown}
            disabled={ui.isGenerating}
            placeholder="Describe what happens next in the story..."
            class="w-full bg-transparent border-none focus:ring-0 px-2 min-h-[24px] sm:min-h-[24px] max-h-[160px] resize-none text-base text-surface-200 placeholder-surface-500 focus:outline-none leading-relaxed"
            rows="1"
          ></textarea>
          <!-- Character Count -->
          <div
            class="absolute bottom-0 right-0 text-[10px] text-surface-500 pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity"
          >
            {inputValue.length}
          </div>
        </div>

        {#if ui.isGenerating}
          {#if !ui.isRetryingLastMessage}
            <button
              onclick={handleStopGeneration}
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 transition-all active:scale-95 flex-shrink-0 animate-pulse"
              title="Stop generation"
            >
              <Square class="h-6 w-6" />
            </button>
          {:else}
            <button
              disabled
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 opacity-50 cursor-not-allowed flex-shrink-0"
              title="Stop disabled during retry"
            >
              <Square class="h-6 w-6" />
            </button>
          {/if}
        {:else}
          <button
            onclick={handleSubmit}
            disabled={!inputValue.trim()}
            class="h-11 w-11 p-0 flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 flex-shrink-0 text-accent-400 hover:text-accent-300 hover:bg-accent-500/10"
            title="Send direction ({sendKeyHint})"
          >
            <Send class="h-6 w-6" />
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Grammar Check -->
    <GrammarCheck
      text={inputValue}
      onApplySuggestion={(newText) => (inputValue = newText)}
    />

    <!-- Adventure Mode: Redesigned Input -->
    <div
      class="rounded-lg border-l-0 sm:border-l-4 sm:bg-surface-400/5 {ui.isGenerating
        ? 'sm:border-l-surface-60'
        : `${actionBorderColors[actionType]}`} transition-colors duration-200 relative"
    >
      <!-- Mobile Word Count Pill -->
      {#if settings.uiSettings.showWordCount}
        <div class="absolute -top-[2.05rem] -right-3 sm:hidden">
          <div
            class="bg-surface-800 px-2 py-0.5 border border-surface-500/30 border-b-0 rounded-tl-md text-sm text-surface-400"
          >
            {story.wordCount} words
          </div>
        </div>
      {/if}

      <!-- Action type selector row (Top - both mobile and desktop) -->
      {#if !settings.uiSettings.disableActionPrefixes}
        <div
          class="flex items-center gap-1 border-b border-surface-700/30 px-1 pt-0 pb-2 sm:px-2 sm:py-1"
        >
          {#each actionTypes as type}
            {@const Icon = actionIcons[type]}
            <button
              class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-1 sm:px-3 sm:py-1 rounded-md
                     text-[10px] sm:text-xs font-medium transition-all duration-150
                     {actionType === type
                ? actionActiveStyles[type]
                : 'text-surface-500 hover:text-surface-300 hover:bg-surface-700/50'}"
              onclick={() => (actionType = type)}
            >
              <Icon class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>{actionLabels[type]}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Main input row -->
      <div class="flex items-end gap-1 p-0.5 mb-3 sm:mb-2 sm:p-1.5">
        <!-- Textarea -->
        <div class="relative flex-1 min-w-0">
          <textarea
            bind:value={inputValue}
            use:autoResize={inputValue}
            onkeydown={handleKeydown}
            placeholder={actionType === "story"
              ? "Describe what happens..."
              : actionType === "say"
                ? "What do you say?"
                : actionType === "think"
                  ? "What are you thinking?"
                  : actionType === "free"
                    ? "Write anything..."
                    : "What do you do?"}
            class="w-full bg-transparent border-none focus:ring-0 px-2 min-h-[24px] sm:min-h-[24px] max-h-[160px] resize-none text-base text-surface-200 placeholder-surface-500 focus:outline-none leading-relaxed"
            rows="1"
            disabled={ui.isGenerating}
          ></textarea>
        </div>

        <!-- Submit/Stop button -->
        {#if ui.isGenerating}
          {#if !ui.isRetryingLastMessage}
            <button
              onclick={handleStopGeneration}
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 transition-all active:scale-95 flex-shrink-0 animate-pulse"
              title="Stop generation"
            >
              <Square class="h-6 w-6" />
            </button>
          {:else}
            <button
              disabled
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 opacity-50 cursor-not-allowed flex-shrink-0"
              title="Stop disabled during retry"
            >
              <Square class="h-6 w-6" />
            </button>
          {/if}
        {:else}
          <button
            onclick={handleSubmit}
            disabled={!inputValue.trim()}
            class="h-11 w-11 p-0 flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 flex-shrink-0 {actionButtonStyles[
              actionType
            ]}"
            title="Send ({sendKeyHint})"
          >
            <Send class="h-6 w-6" />
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if canShowManualImageGen}
    <div class="flex justify-end">
      <button
        onclick={handleManualImageGeneration}
        disabled={manualImageGenDisabled}
        class="btn btn-secondary text-xs flex items-center gap-1.5"
        title={manualImageGenDisabled &&
        !settings.systemServicesSettings.imageGeneration.nanoGptApiKey
          ? "Add a NanoGPT API key in Settings to generate images"
          : "Generate images for the last narration"}
      >
        <ImageIcon class="h-4 w-4" />
        {isManualImageGenRunning ? "Generating..." : "Generate Images"}
      </button>
    </div>
  {/if}
</div>
