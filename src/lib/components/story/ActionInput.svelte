<script lang="ts">
  import { tick } from "svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { story } from "$lib/stores/story.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { aiService } from "$lib/services/ai";
  import { database } from "$lib/services/database";
  import { SimpleActivationTracker } from "$lib/services/ai/retrieval/EntryRetrievalService";
  import { type ImageGenerationContext } from "$lib/services/ai";
  import { hasRequiredCredentials, getProviderDisplayName } from "$lib/services/ai/image";
  import { TranslationService } from "$lib/services/ai/utils/TranslationService";
  import {
    Send,
    Wand2,
    MessageSquare,
    Brain,
    Sparkles,
    RefreshCw,
    X,
    PenLine,
    Square,
    ImageIcon,
    Loader2,
  } from "lucide-svelte";
  import {
    hasDescriptors,
    descriptorsToString,
  } from "$lib/utils/visualDescriptors";
  import Suggestions from "./Suggestions.svelte";
  import GrammarCheck from "./GrammarCheck.svelte";
  import { Button } from "$lib/components/ui/button";
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
  import {
    GenerationPipeline,
    retryService,
    BackgroundTaskCoordinator,
    type PipelineDependencies,
    type PipelineConfig,
    type GenerationContext,
    type GenerationEvent,
    type RetryStoreCallbacks,
    type RetryBackupData,
    type BackgroundTaskDependencies,
    type BackgroundTaskInput,
  } from "$lib/services/generation";
  import { InlineImageTracker } from "$lib/services/ai/image";

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

  const manualImageGenDisabled = $derived.by(() => {
    if (ui.isGenerating || isManualImageGenRunning) return true;
    return !hasRequiredCredentials();
  });

  // In creative writing mode, show different input style
  const isCreativeMode = $derived(story.storyMode === "creative-writing");

  // Keyboard shortcut hint
  const sendKeyHint = $derived(
    isTouchDevice()
      ? "Shift+Enter to send"
      : "Enter to send, Shift+Enter for new line",
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

      // Build complete context for macro expansion
      const protagonist = story.characters.find(
        (c) => c.relationship === "self",
      );
      const promptContext = {
        mode: story.storyMode,
        pov: story.pov,
        tense: story.tense,
        protagonistName: protagonist?.name || "the protagonist",
        genre: story.currentStory?.genre ?? undefined,
        settingDescription: story.currentStory?.description ?? undefined,
        tone: story.currentStory?.settings?.tone ?? undefined,
        themes: story.currentStory?.settings?.themes ?? undefined,
      };

      const result = await aiService.generateSuggestions(
        story.entries,
        story.pendingQuests,
        activeLorebookEntries,
        promptContext,
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
   * Build retry store callbacks for RetryService.
   */
  function buildRetryStoreCallbacks(): RetryStoreCallbacks {
    return {
      restoreFromRetryBackup: story.restoreFromRetryBackup.bind(story),
      deleteEntriesFromPosition: story.deleteEntriesFromPosition.bind(story),
      deleteEntitiesCreatedAfterBackup: story.deleteEntitiesCreatedAfterBackup.bind(story),
      restoreCharacterSnapshots: story.restoreCharacterSnapshots.bind(story),
      restoreTimeTrackerSnapshot: story.restoreTimeTrackerSnapshot.bind(story),
      lockRetryInProgress: story.lockRetryInProgress.bind(story),
      unlockRetryInProgress: story.unlockRetryInProgress.bind(story),
      restoreActivationData: ui.restoreActivationData.bind(ui),
      clearActivationData: ui.clearActivationData.bind(ui),
      setLastLorebookRetrieval: ui.setLastLorebookRetrieval.bind(ui),
    };
  }

  /**
   * Build pipeline dependencies from aiService.
   */
  function buildPipelineDependencies(): PipelineDependencies {
    return {
      // Retrieval dependencies
      shouldUseAgenticRetrieval: (chaptersLength: number) =>
        aiService.shouldUseAgenticRetrieval({ length: chaptersLength } as any),
      runAgenticRetrieval: aiService.runAgenticRetrieval.bind(aiService),
      formatAgenticRetrievalForPrompt: aiService.formatAgenticRetrievalForPrompt.bind(aiService),
      runTimelineFill: aiService.runTimelineFill.bind(aiService),
      answerChapterQuestion: aiService.answerChapterQuestion.bind(aiService),
      answerChapterRangeQuestion: aiService.answerChapterRangeQuestion.bind(aiService),
      getRelevantLorebookEntries: aiService.getRelevantLorebookEntries.bind(aiService),
      // Narrative dependencies
      streamNarrative: aiService.streamNarrative.bind(aiService),
      // Classification dependencies
      classifyResponse: aiService.classifyResponse.bind(aiService),
      // Translation dependencies
      translateNarration: aiService.translateNarration.bind(aiService),
      // Image dependencies
      generateImagesForNarrative: aiService.generateImagesForNarrative.bind(aiService),
      isImageGenerationEnabled: aiService.isImageGenerationEnabled.bind(aiService),
      // Post-generation dependencies
      generateSuggestions: aiService.generateSuggestions.bind(aiService),
      translateSuggestions: aiService.translateSuggestions.bind(aiService),
      generateActionChoices: aiService.generateActionChoices.bind(aiService),
      translateActionChoices: aiService.translateActionChoices.bind(aiService),
    };
  }

  /**
   * Build dependencies for BackgroundTaskCoordinator.
   */
  function buildBackgroundTaskDependencies(): BackgroundTaskDependencies {
    return {
      chapterService: {
        analyzeForChapter: aiService.analyzeForChapter.bind(aiService),
        summarizeChapter: aiService.summarizeChapter.bind(aiService),
        getNextChapterNumber: story.getNextChapterNumber.bind(story),
        addChapter: story.addChapter.bind(story),
      },
      loreManagement: {
        runLoreManagement: aiService.runLoreManagement.bind(aiService),
      },
      styleReview: {
        analyzeStyle: aiService.analyzeStyle.bind(aiService),
      },
    };
  }

  /**
   * Build input for BackgroundTaskCoordinator.
   */
  function buildBackgroundTaskInput(countStyleReview: boolean, styleReviewSource: string): BackgroundTaskInput {
    const storyId = story.currentStory?.id ?? '';
    const mode = story.currentStory?.mode ?? 'adventure';

    return {
      // Style review input
      styleReview: {
        storyId,
        entries: story.entries,
        mode,
        pov: story.pov,
        tense: story.tense,
        enabled: settings.systemServicesSettings.styleReviewer.enabled,
        triggerInterval: settings.systemServicesSettings.styleReviewer.triggerInterval,
        currentCounter: ui.messagesSinceLastStyleReview,
        shouldIncrement: countStyleReview,
        source: styleReviewSource,
      },
      styleReviewCallbacks: {
        incrementCounter: ui.incrementStyleReviewCounter.bind(ui),
        setLoading: ui.setStyleReviewLoading.bind(ui),
        setResult: ui.setStyleReview.bind(ui),
      },

      // Chapter check input
      chapterCheck: {
        storyId,
        currentBranchId: story.currentStory?.currentBranchId ?? null,
        entries: story.entries,
        lastChapterEndIndex: story.lastChapterEndIndex,
        tokensSinceLastChapter: story.tokensSinceLastChapter,
        tokensOutsideBuffer: story.tokensOutsideBuffer,
        messagesSinceLastChapter: story.messagesSinceLastChapter,
        memoryConfig: story.memoryConfig,
        currentBranchChapters: story.currentBranchChapters,
        mode,
        pov: story.pov,
        tense: story.tense,
      },

      // Lore management input
      loreSession: {
        storyId,
        currentBranchId: story.currentStory?.currentBranchId ?? null,
        lorebookEntries: story.lorebookEntries,
        chapters: story.currentBranchChapters,
        mode,
        pov: story.pov,
        tense: story.tense,
      },
      loreCallbacks: {
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
        },
        onUpdateEntry: async (id, updates) => {
          await story.updateLorebookEntry(id, updates);
        },
        onDeleteEntry: async (id) => {
          await story.deleteLorebookEntry(id);
        },
        onMergeEntries: async (entryIds, mergedEntry) => {
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
        },
      },
      loreUICallbacks: {
        onStart: ui.startLoreManagement.bind(ui),
        onProgress: ui.updateLoreManagementProgress.bind(ui),
        onComplete: ui.finishLoreManagement.bind(ui),
      },
    };
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
   * Core generation logic - uses GenerationPipeline for orchestration
   */
  async function generateResponse(
    userActionEntryId: string,
    userActionContent: string,
    options?: { countStyleReview?: boolean; styleReviewSource?: string },
  ) {
    const countStyleReview = options?.countStyleReview ?? true;
    const styleReviewSource =
      options?.styleReviewSource ?? (countStyleReview ? "new" : "regenerate");
    log("Starting AI generation...", { userActionEntryId, hasCurrentStory: !!story.currentStory });

    if (!story.currentStory) {
      log("No current story loaded, cannot generate");
      return;
    }

    stopRequested = false;
    activeAbortController = new AbortController();

    const visualProseMode = story.currentStory?.settings?.visualProseMode ?? false;
    const inlineImageMode = story.currentStory?.settings?.inlineImageMode ?? false;
    const streamingEntryId = crypto.randomUUID();

    // Pre-generate the narration entry ID so we can use it for inline image generation during streaming
    const narrationEntryId = crypto.randomUUID();

    ui.setGenerating(true);
    ui.clearGenerationError();
    ui.clearActionChoices(story.currentStory?.id);
    ui.startStreaming(visualProseMode, streamingEntryId);

    // Capture story reference
    const currentStoryRef = story.currentStory;

    // Create inline image tracker if inline mode is enabled
    let inlineImageTracker: InlineImageTracker | null = null;
    if (inlineImageMode && settings.systemServicesSettings.imageGeneration.enabled) {
      inlineImageTracker = new InlineImageTracker(
        currentStoryRef.id,
        narrationEntryId,
        () => story.characters
      );
      log("Inline image tracker created", { narrationEntryId });
    }

    try {
      // Build world state for AI context
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
        chapters: worldState.chapters.length,
        lorebookEntries: worldState.lorebookEntries.length,
      });

      // Build pipeline context
      const storyPosition = story.entries.length;
      const activationTracker = ui.getActivationTracker(storyPosition) as SimpleActivationTracker;
      const embeddedImages = await database.getEmbeddedImagesForStory(currentStoryRef.id);
      const protagonist = story.characters.find((c) => c.relationship === "self");

      const ctx: GenerationContext = {
        story: currentStoryRef,
        visibleEntries: story.visibleEntries,
        allEntries: story.entries,
        worldState,
        userAction: { entryId: userActionEntryId, content: userActionContent, rawInput: userActionContent },
        abortSignal: activeAbortController.signal,
      };

      const cfg: PipelineConfig = {
        embeddedImages,
        rawInput: userActionContent,
        actionType: actionType,
        wasRawActionChoice: false,
        timelineFillEnabled: settings.systemServicesSettings.timelineFill?.enabled ?? true,
        storyMode: currentStoryRef.mode ?? "adventure",
        pov: story.pov,
        tense: story.tense,
        styleReview: ui.lastStyleReview,
        activationTracker,
        translationSettings: settings.translationSettings,
        imageSettings: {
          enabled: settings.systemServicesSettings.imageGeneration.enabled,
          autoGenerate: settings.systemServicesSettings.imageGeneration.autoGenerate,
          inlineMode: inlineImageMode,
        },
        promptContext: {
          mode: story.storyMode,
          pov: story.pov,
          tense: story.tense,
          protagonistName: protagonist?.name || "the protagonist",
          genre: currentStoryRef.genre ?? undefined,
          settingDescription: currentStoryRef.description ?? undefined,
          tone: currentStoryRef.settings?.tone ?? undefined,
          themes: currentStoryRef.settings?.themes ?? undefined,
        },
        disableSuggestions: settings.uiSettings.disableSuggestions,
        activeThreads: story.pendingQuests,
      };

      // Create and execute pipeline
      const deps = buildPipelineDependencies();
      const pipeline = new GenerationPipeline(deps);

      let fullResponse = "";
      let fullReasoning = "";
      let narrationEntry: Awaited<ReturnType<typeof story.addEntry>> | null = null;

      // Process pipeline events
      for await (const event of pipeline.execute(ctx, cfg)) {
        if (stopRequested) {
          log("Stop requested during pipeline");
          break;
        }

        await handlePipelineEvent(event, {
          fullResponse: () => fullResponse,
          setFullResponse: (v: string) => { fullResponse = v; },
          fullReasoning: () => fullReasoning,
          setFullReasoning: (v: string) => { fullReasoning = v; },
          streamingEntryId,
          visualProseMode,
          activationTracker,
        });

        // Accumulate narrative chunks
        if (event.type === "narrative_chunk") {
          fullResponse += event.content;
          if (event.reasoning) fullReasoning += event.reasoning;

          // Process for inline images during streaming - triggers generation as soon as complete <pic> tags are detected
          if (inlineImageTracker) {
            inlineImageTracker.processChunk(fullResponse);
          }
        }

        // After narrative completes, save entry and store lorebook retrieval
        if (event.type === "phase_complete" && event.phase === "narrative" && fullResponse.trim()) {
          ui.endStreaming();
          // Use pre-generated ID so inline images (which may have started during streaming) are linked correctly
          narrationEntry = await story.addEntry("narration", fullResponse, undefined, fullReasoning || undefined, narrationEntryId);
          log("Narration entry saved", { entryId: narrationEntry.id });
          emitNarrativeResponse(narrationEntry.id, fullResponse);

          // Flush any pending inline images to database now that the entry exists
          if (inlineImageTracker?.hasPendingImages) {
            log("Flushing inline images to database");
            await inlineImageTracker.flushToDatabase();
          }
        }

        // After classification, apply results
        if (event.type === "classification_complete" && narrationEntry) {
          eventBus.emit<ClassificationCompleteEvent>({
            type: "ClassificationComplete",
            messageId: narrationEntry.id,
            result: event.result,
          });
          ui.setGenerationStatus("Updating world...");
          await story.applyClassificationResult(event.result);
          await story.updateEntryTimeEnd(narrationEntry.id);
          ui.setGenerationStatus("Saving...");

          // Build image generation context for manual generation
          if (settings.systemServicesSettings.imageGeneration.enabled) {
            const presentCharacters = story.characters.filter(
              (c) => event.result.scene.presentCharacterNames.includes(c.name) || c.relationship === "self",
            );
            const imageGenChatHistory = story.visibleEntries
              .filter((e) => e.type === "user_action" || e.type === "narration")
              .map((e) => `${e.type === "user_action" ? "USER" : "ASSISTANT"}:\n${e.content}`)
              .join("\n\n");

            lastImageGenContext = {
              storyId: currentStoryRef.id,
              entryId: narrationEntry.id,
              narrativeResponse: fullResponse,
              userAction: userActionContent,
              presentCharacters,
              currentLocation: event.result.scene.currentLocationName ?? worldState.currentLocation?.name,
              chatHistory: imageGenChatHistory,
              lorebookContext: undefined, // Retrieved in pipeline
            };
          }

          // Translate world state elements (non-blocking)
          translateWorldStateElements(event.result).catch((err) =>
            log("World state translation failed (non-fatal)", err),
          );
        }

        // Handle translation result - save to DB
        if (event.type === "phase_complete" && event.phase === "translation" && narrationEntry) {
          const translationResult = event.result as { translated: boolean; translatedContent: string | null; targetLanguage: string | null } | undefined;
          if (translationResult?.translated && translationResult.translatedContent) {
            await database.updateStoryEntry(narrationEntry.id, {
              translatedContent: translationResult.translatedContent,
              translationLanguage: translationResult.targetLanguage,
            });
            await story.refreshEntry(narrationEntry.id);
            log("Narration translated", { entryId: narrationEntry.id });
          }
        }

        // Handle errors
        if (event.type === "error") {
          log(`Phase ${event.phase} error (fatal=${event.fatal}):`, event.error);
          if (event.fatal) break;
        }
      }

      // Update activation data
      ui.updateActivationData(activationTracker, currentStoryRef.id);

      if (stopRequested) {
        log("Generation stopped, skipping post-processing");
        return;
      }

      // Handle empty response case
      if (!fullResponse.trim()) {
        const errorMessage = "The AI returned an empty response after 3 attempts. Please try again.";
        const errorEntry = await story.addEntry("system", errorMessage);
        ui.setGenerationError({
          message: errorMessage,
          errorEntryId: errorEntry.id,
          userActionEntryId: userActionEntryId,
          timestamp: Date.now(),
        });
        return;
      }

      // TTS auto-play
      if (narrationEntry && settings.systemServicesSettings.tts.enabled && settings.systemServicesSettings.tts.autoPlay) {
        emitTTSQueued(narrationEntry.id, fullResponse);
        log("TTS queued for auto-play", { entryId: narrationEntry.id });
      }

      // Post-generation tasks (background, non-blocking)
      // Use coordinator if auto-summarize is enabled (it handles style review too)
      if (story.memoryConfig.autoSummarize) {
        const coordinator = new BackgroundTaskCoordinator(buildBackgroundTaskDependencies());
        const input = buildBackgroundTaskInput(countStyleReview, styleReviewSource);
        coordinator.runBackgroundTasks(input).catch((err) =>
          log("Background tasks failed (non-fatal)", err)
        );
      } else {
        // If auto-summarize disabled, still run style review via coordinator
        const coordinator = new BackgroundTaskCoordinator(buildBackgroundTaskDependencies());
        const input = buildBackgroundTaskInput(countStyleReview, styleReviewSource);
        // Skip chapter check by setting tokensOutsideBuffer to 0
        input.chapterCheck.tokensOutsideBuffer = 0;
        coordinator.runBackgroundTasks(input).catch((err) =>
          log("Background tasks failed (non-fatal)", err)
        );
      }

    } catch (error) {
      if (stopRequested || (error instanceof Error && error.name === "AbortError")) {
        log("Generation aborted by user");
        return;
      }
      log("Generation failed", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate response. Please try again.";
      const errorEntry = await story.addEntry("system", `Generation failed: ${errorMessage}`);
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

  /**
   * Handle pipeline events for UI updates
   */
  async function handlePipelineEvent(
    event: GenerationEvent,
    state: {
      fullResponse: () => string;
      setFullResponse: (v: string) => void;
      fullReasoning: () => string;
      setFullReasoning: (v: string) => void;
      streamingEntryId: string;
      visualProseMode: boolean;
      activationTracker: SimpleActivationTracker;
    },
  ) {
    switch (event.type) {
      case "phase_start":
        if (event.phase === "narrative") {
          ui.startStreaming(state.visualProseMode, state.streamingEntryId);
        } else if (event.phase === "classification") {
          ui.setGenerationStatus("Classifying world state...");
        } else if (event.phase === "post") {
          if (isCreativeMode) {
            ui.setSuggestionsLoading(true);
          } else {
            ui.setActionChoicesLoading(true);
          }
        }
        break;

      case "narrative_chunk":
        if (event.content) {
          ui.appendStreamContent(event.content);
          eventBus.emit<ResponseStreamingEvent>({
            type: "ResponseStreaming",
            chunk: event.content,
            accumulated: state.fullResponse() + event.content,
          });
        }
        if (event.reasoning) {
          ui.appendReasoningContent(event.reasoning);
        }
        break;

      case "phase_complete":
        if (event.phase === "retrieval") {
          // Store lorebook retrieval result for debug panel
          // The actual data comes from the retrieval phase internals
        } else if (event.phase === "post") {
          const postResult = event.result as { suggestions: any[] | null; actionChoices: any[] | null } | undefined;
          if (postResult?.suggestions) {
            ui.setSuggestions(postResult.suggestions, story.currentStory?.id);
            emitSuggestionsReady(postResult.suggestions.map((s: any) => ({ text: s.text, type: s.type })));
            ui.setSuggestionsLoading(false);
          } else if (postResult?.actionChoices) {
            ui.setActionChoices(postResult.actionChoices, story.currentStory?.id);
            ui.setActionChoicesLoading(false);
          } else {
            ui.setSuggestionsLoading(false);
            ui.setActionChoicesLoading(false);
          }
        }
        break;
    }
  }

  /**
   * Translate world state elements from classification result (background)
   */
  async function translateWorldStateElements(classificationResult: any) {
    const translationSettings = settings.translationSettings;
    if (!TranslationService.shouldTranslateWorldState(translationSettings)) return;

    const targetLang = translationSettings.targetLanguage;
    const itemsToTranslate: { id: string; text: string; type: "name" | "description" | "title"; entityType: string; field: string; isArray?: boolean }[] = [];

    // Collect items from classification result
    for (const char of classificationResult.entryUpdates.newCharacters) {
      const dbChar = story.characters.find((c) => c.name === char.name);
      if (dbChar) {
        itemsToTranslate.push({ id: `${dbChar.id}:name`, text: char.name, type: "name", entityType: "character", field: "translatedName" });
        if (char.description) itemsToTranslate.push({ id: `${dbChar.id}:desc`, text: char.description, type: "description", entityType: "character", field: "translatedDescription" });
        if (char.relationship) itemsToTranslate.push({ id: `${dbChar.id}:rel`, text: char.relationship, type: "description", entityType: "character", field: "translatedRelationship" });
        if (char.traits?.length) itemsToTranslate.push({ id: `${dbChar.id}:traits`, text: char.traits.join(", "), type: "description", entityType: "character", field: "translatedTraits", isArray: true });
        if (hasDescriptors(char.visualDescriptors)) itemsToTranslate.push({ id: `${dbChar.id}:visual`, text: descriptorsToString(char.visualDescriptors), type: "description", entityType: "character", field: "translatedVisualDescriptors" });
      }
    }
    for (const loc of classificationResult.entryUpdates.newLocations) {
      const dbLoc = story.locations.find((l) => l.name === loc.name);
      if (dbLoc) {
        itemsToTranslate.push({ id: `${dbLoc.id}:name`, text: loc.name, type: "name", entityType: "location", field: "translatedName" });
        if (loc.description) itemsToTranslate.push({ id: `${dbLoc.id}:desc`, text: loc.description, type: "description", entityType: "location", field: "translatedDescription" });
      }
    }
    for (const item of classificationResult.entryUpdates.newItems) {
      const dbItem = story.items.find((i) => i.name === item.name);
      if (dbItem) {
        itemsToTranslate.push({ id: `${dbItem.id}:name`, text: item.name, type: "name", entityType: "item", field: "translatedName" });
        if (item.description) itemsToTranslate.push({ id: `${dbItem.id}:desc`, text: item.description, type: "description", entityType: "item", field: "translatedDescription" });
      }
    }
    for (const beat of classificationResult.entryUpdates.newStoryBeats) {
      const dbBeat = story.storyBeats.find((b) => b.title === beat.title);
      if (dbBeat) {
        itemsToTranslate.push({ id: `${dbBeat.id}:title`, text: beat.title, type: "title", entityType: "storyBeat", field: "translatedTitle" });
        if (beat.description) itemsToTranslate.push({ id: `${dbBeat.id}:desc`, text: beat.description, type: "description", entityType: "storyBeat", field: "translatedDescription" });
      }
    }

    if (itemsToTranslate.length === 0) return;

    log("Translating world state elements", { count: itemsToTranslate.length, targetLang });
    const uiItems = itemsToTranslate.map((item) => ({ id: item.id, text: item.text, type: item.type }));
    const translated = await aiService.translateUIElements(uiItems, targetLang);

    for (const translatedItem of translated) {
      const [entityId] = translatedItem.id.split(":");
      const originalItem = itemsToTranslate.find((i) => i.id === translatedItem.id);
      if (!originalItem) continue;

      const translatedValue = originalItem.isArray ? translatedItem.text.split(",").map((s) => s.trim()).filter(Boolean) : translatedItem.text;
      const updateData: Record<string, string | string[] | null> = { [originalItem.field]: translatedValue, translationLanguage: targetLang };

      if (originalItem.entityType === "character") await database.updateCharacter(entityId, updateData as any);
      else if (originalItem.entityType === "location") await database.updateLocation(entityId, updateData as any);
      else if (originalItem.entityType === "item") await database.updateItem(entityId, updateData as any);
      else if (originalItem.entityType === "storyBeat") await database.updateStoryBeat(entityId, updateData as any);
    }

    await story.refreshWorldState();
    log("World state elements translated", { count: translated.length });
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
          translationSettings.sourceLanguage,
        );
        originalInput = content; // Save original for display
        promptContent = result.translatedContent; // Use English for prompt
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

    const storyId = story.currentStory.id;

    try {
      const result = await retryService.handleStopGeneration(
        backup as RetryBackupData,
        buildRetryStoreCallbacks(),
        {
          clearGenerationError: () => ui.clearGenerationError(),
          clearSuggestions: () => ui.clearSuggestions(storyId),
          clearActionChoices: () => ui.clearActionChoices(storyId),
        },
      );

      if (result.success) {
        await tick();
        actionType = result.restoredActionType ?? actionType;
        isRawActionChoice = result.restoredWasRawActionChoice ?? false;
        inputValue = result.restoredRawInput ?? "";
      } else {
        log("Stop restore failed", result.error);
      }
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

    const storyId = story.currentStory.id;

    // Debug: Log character state before restore
    const currentCharDescriptors = story.characters.map((c) => ({
      name: c.name,
      visualDescriptors: { ...c.visualDescriptors },
    }));
    const backupCharDescriptors = backup.characters.map((c) => ({
      name: c.name,
      visualDescriptors: { ...c.visualDescriptors },
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

    try {
      // Use RetryService to perform restore
      const result = await retryService.handleRetryLastMessage(
        backup as RetryBackupData,
        buildRetryStoreCallbacks(),
        {
          clearGenerationError: () => ui.clearGenerationError(),
          clearSuggestions: () => ui.clearSuggestions(storyId),
          clearActionChoices: () => ui.clearActionChoices(storyId),
          clearImageContext: () => { lastImageGenContext = null; },
        },
      );

      if (!result.success) {
        log("Retry restore failed", result.error);
        return;
      }

      // Wait for state to sync
      await tick();

      // Debug: Log character state after restore
      const postRestoreCharDescriptors = story.characters.map((c) => ({
        name: c.name,
        visualDescriptors: { ...c.visualDescriptors },
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
          const translationResult = await aiService.translateInput(
            backup.userActionContent,
            translationSettings.sourceLanguage,
          );
          originalInput = backup.userActionContent; // Save original for display
          promptContent = translationResult.translatedContent; // Use English for prompt
          log("Retry: Input translated", {
            originalLength: backup.userActionContent.length,
            translatedLength: promptContent.length,
          });
        } catch (error) {
          log(
            "Retry: Input translation failed (non-fatal), using original",
            error,
          );
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
      ? event.key === "Enter" && event.shiftKey
      : event.key === "Enter" && !event.shiftKey;

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

<div class="space-y-3 ml-1">
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

  <!-- Grammar Check (shown in both modes) -->
  <GrammarCheck
    text={inputValue}
    onApplySuggestion={(newText) => (inputValue = newText)}
  />

  {#if isCreativeMode}
    <!-- Creative Writing Mode: Direction Input -->
    <div
      class="rounded-lg sm:border sm:border-border border-l-0 sm:border-l-4 sm:shadow-sm {ui.isGenerating
        ? 'sm:border-l-surface-600 bg-surface-400/5'
        : 'border-l-accent-500 bg-card'} transition-colors duration-200 relative"
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

      <!-- Creative Writing Mode: Suggestions (Header) -->
      {#if !settings.uiSettings.disableSuggestions}
        <div class="sm:border-b border-surface-700/30">
          <Suggestions
            suggestions={ui.suggestions}
            loading={ui.suggestionsLoading}
            onSelect={handleSuggestionSelect}
            onRefresh={refreshSuggestions}
          />
        </div>
      {/if}

      <div class="flex items-center sm:items-end gap-1 mb-3 sm:mb-0 sm:p-1">
        <div class="relative flex-1 min-w-0">
          <textarea
            bind:value={inputValue}
            use:autoResize={inputValue}
            onkeydown={handleKeydown}
            disabled={ui.isGenerating}
            placeholder="Describe what happens next in the story..."
            class="w-full bg-transparent border-none focus:ring-0 px-2 min-h-6 sm:min-h-6 max-h-40 resize-none text-base text-surface-200 placeholder-surface-500 focus:outline-none leading-relaxed"
            rows="1"
          ></textarea>
        </div>

        {#if ui.isGenerating}
          {#if !ui.isRetryingLastMessage}
            <button
              onclick={handleStopGeneration}
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 transition-all active:scale-95 flex-shrink-0 animate-pulse -translate-y-0.5 sm:translate-y-0"
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
            class="h-11 w-11 p-0 flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 flex-shrink-0 text-accent-400 hover:text-accent-300 hover:bg-accent-500/10 -translate-y-0.5 sm:translate-y-0"
            title="Send direction ({sendKeyHint})"
          >
            <Send class="h-6 w-6" />
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Adventure Mode: Redesigned Input -->
    <div
      class="rounded-lg sm:border sm:border-border border-l-0 sm:border-l-4 sm:shadow-sm {ui.isGenerating
        ? 'sm:border-l-surface-60'
        : `${actionBorderColors[actionType]}`} bg-card transition-colors duration-200 relative"
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
          class="flex items-center gap-1 sm:border-b border-surface-700/30 px-1 pt-0 pb-0 sm:px-2 sm:py-1"
        >
          {#each actionTypes as type}
            {@const Icon = actionIcons[type]}
            <button
              class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 py-1 sm:px-3 sm:py-1 rounded-md
                     text-[10px] sm:text-xs font-medium transition-all duration-150
                     {actionType === type
                ? actionActiveStyles[type]
                : `text-surface-500 hover:${actionButtonStyles[type]}`}"
              onclick={() => (actionType = type)}
            >
              <Icon class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>{actionLabels[type]}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- Main input row -->
      <div class="flex items-center sm:items-end gap-1 mb-3 sm:mb-0 sm:p-1">
        <!-- Textarea -->
        <div class="relative flex-1 self-center min-w-0">
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
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 transition-all active:scale-95 shrink-0 animate-pulse -translate-y-0.5 sm:translate-y-0"
              title="Stop generation"
            >
              <Square class="h-6 w-6" />
            </button>
          {:else}
            <button
              disabled
              class="h-11 w-11 p-0 flex items-center justify-center rounded-lg text-red-400 opacity-50 cursor-not-allowed shrink-0"
              title="Stop disabled during retry"
            >
              <Square class="h-6 w-6" />
            </button>
          {/if}
        {:else}
          <button
            onclick={handleSubmit}
            disabled={!inputValue.trim()}
            class="h-11 w-11 p-0 flex items-center justify-center rounded-lg transition-all active:scale-95 disabled:opacity-50 shrink-0 {actionButtonStyles[
              actionType
            ]} -translate-y-0.5 sm:translate-y-0"
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
      <Button
        variant="secondary"
        size="sm"
        onclick={handleManualImageGeneration}
        disabled={manualImageGenDisabled}
        title={manualImageGenDisabled &&
        !hasRequiredCredentials()
          ? `Add a ${getProviderDisplayName()} API key in Settings to generate images`
          : "Generate images for the last narration"}
        class="text-xs gap-1.5"
      >
        {#if isManualImageGenRunning}
          <Loader2 class="h-4 w-4 animate-spin" />
        {:else}
          <ImageIcon class="h-4 w-4" />
        {/if}
        {isManualImageGenRunning ? "Generating..." : "Generate Images"}
      </Button>
    </div>
  {/if}
</div>
