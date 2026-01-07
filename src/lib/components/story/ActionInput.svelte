<script lang="ts">
  import { tick } from 'svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { aiService } from '$lib/services/ai';
  import { SimpleActivationTracker } from '$lib/services/ai/entryRetrieval';
  import { Send, Wand2, MessageSquare, Brain, Sparkles, Feather, RefreshCw, X, PenLine, Square } from 'lucide-svelte';
  import type { Chapter } from '$lib/types';
  import Suggestions from './Suggestions.svelte';
  import GrammarCheck from './GrammarCheck.svelte';
  import {
    emitUserInput,
    emitNarrativeResponse,
    emitSuggestionsReady,
    eventBus,
    type ResponseStreamingEvent,
    type ClassificationCompleteEvent,
  } from '$lib/services/events';

  function log(...args: any[]) {
    console.log('[ActionInput]', ...args);
  }

  let inputValue = $state('');
  let actionType = $state<'do' | 'say' | 'think' | 'story' | 'free'>('do');
  let isRawActionChoice = $state(false); // True when submitting an AI-generated choice (no prefix/suffix)
  let stopRequested = false;
  let activeAbortController: AbortController | null = null;
  let isRetryingLastMessage = $state(false); // Hide stop button during completed-message retries

  // In creative writing mode, show different input style
  const isCreativeMode = $derived(story.storyMode === 'creative-writing');

  // Register retry callback with UI store so StoryEntry can trigger it
  $effect(() => {
    log('Registering retry callback');
    ui.setRetryCallback(handleRetry);
    return () => {
      log('Unregistering retry callback');
      ui.setRetryCallback(null);
    };
  });

  // Register retry last message callback for edit-and-retry feature
  $effect(() => {
    log('Registering retry last message callback');
    ui.setRetryLastMessageCallback(handleRetryLastMessage);
    return () => {
      log('Unregistering retry last message callback');
      ui.setRetryLastMessageCallback(null);
    };
  });

  // Watch for pending action choice from ActionChoices component
  $effect(() => {
    const pendingAction = ui.pendingActionChoice;
    if (pendingAction && !ui.isGenerating) {
      log('Processing pending action choice:', pendingAction);
      // Set input value and flag as raw (no prefix/suffix needed)
      inputValue = pendingAction;
      isRawActionChoice = true;
      ui.clearPendingActionChoice();
      // handleSubmit now uses tick() to ensure state synchronization
      handleSubmit();
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
      const activeLorebookEntries = (ui.lastLorebookRetrieval?.all ?? []).map(r => r.entry);

      const result = await aiService.generateSuggestions(
        story.entries,
        story.pendingQuests,
        story.currentStory?.genre,
        activeLorebookEntries
      );
      ui.setSuggestions(result.suggestions, story.currentStory?.id);
      log('Suggestions refreshed:', result.suggestions.length, 'with', activeLorebookEntries.length, 'active lorebook entries');

      // Emit SuggestionsReady event
      emitSuggestionsReady(result.suggestions.map(s => ({ text: s.text, type: s.type })));
    } catch (error) {
      log('Failed to generate suggestions:', error);
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
    const input = document.querySelector('textarea');
    input?.focus();
  }

  /**
   * Check if style review should run (every N messages).
   * Runs in background, non-blocking.
   */
  async function checkStyleReview() {
    // Check if style reviewer is enabled
    if (!settings.systemServicesSettings.styleReviewer.enabled) {
      return;
    }

    // Increment counter
    ui.incrementStyleReviewCounter();

    const triggerInterval = settings.systemServicesSettings.styleReviewer.triggerInterval;

    log('checkStyleReview', {
      messagesSinceLastReview: ui.messagesSinceLastStyleReview,
      triggerInterval,
    });

    // Check if we've hit the interval threshold
    if (ui.messagesSinceLastStyleReview >= triggerInterval) {
      log('Triggering style review...');
      ui.setStyleReviewLoading(true);

      try {
        const result = await aiService.analyzeStyle(story.entries);
        ui.setStyleReview(result);
        log('Style review complete', { phrasesFound: result.phrases.length });
      } catch (error) {
        log('Style review failed (non-fatal)', error);
      } finally {
        ui.setStyleReviewLoading(false);
      }
    }
  }

  /**
   * Generate RPG-style action choices for adventure mode.
   */
  async function generateActionChoices(narrativeResponse: string, worldState: any) {
    if (isCreativeMode || story.entries.length === 0) {
      return;
    }

    ui.setActionChoicesLoading(true);
    try {
      // Use only the lorebook entries that were activated for the previous response
      // Extract the Entry objects from RetrievedEntry wrappers
      const activeLorebookEntries = (ui.lastLorebookRetrieval?.all ?? []).map(r => r.entry);

      const result = await aiService.generateActionChoices(
        story.entries,
        worldState,
        narrativeResponse,
        story.pov,
        activeLorebookEntries
      );
      ui.setActionChoices(result.choices, story.currentStory?.id);
      log('Action choices generated:', result.choices.length, 'with', activeLorebookEntries.length, 'active lorebook entries');
    } catch (error) {
      log('Failed to generate action choices:', error);
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

    log('checkAutoSummarize', {
      tokensSinceLastChapter: story.tokensSinceLastChapter,
      tokensOutsideBuffer,
      tokenThreshold: config.tokenThreshold,
      messagesOutsideBuffer: story.messagesSinceLastChapter - config.chapterBuffer,
    });

    // Skip if no tokens outside buffer (all messages are protected)
    if (tokensOutsideBuffer === 0) {
      log('No messages outside buffer, skipping');
      return;
    }

    // Analyze if we should create a chapter (token-based)
    const analysis = await aiService.analyzeForChapter(
      story.entries,
      story.lastChapterEndIndex,
      config,
      tokensOutsideBuffer
    );

    if (!analysis.shouldCreateChapter) {
      log('No chapter needed yet');
      return;
    }

    log('Creating new chapter', { optimalEndIndex: analysis.optimalEndIndex });

    // Get entries for this chapter
    const startIndex = story.lastChapterEndIndex;
    const chapterEntries = story.entries.slice(startIndex, analysis.optimalEndIndex);

    if (chapterEntries.length === 0) {
      log('No entries for chapter');
      return;
    }

    // Get previous chapters for context
    const previousChapters = [...story.chapters].sort((a, b) => a.number - b.number);

    // Generate chapter summary with previous chapters as context
    const summary = await aiService.summarizeChapter(chapterEntries, previousChapters);

    // Create the chapter - use database method to handle deletions correctly
    const chapterNumber = await story.getNextChapterNumber();
    const chapter: Chapter = {
      id: crypto.randomUUID(),
      storyId: story.currentStory.id,
      number: chapterNumber,
      title: analysis.suggestedTitle || summary.title,
      startEntryId: chapterEntries[0].id,
      endEntryId: chapterEntries[chapterEntries.length - 1].id,
      entryCount: chapterEntries.length,
      summary: summary.summary,
      keywords: summary.keywords,
      characters: summary.characters,
      locations: summary.locations,
      plotThreads: summary.plotThreads,
      emotionalTone: summary.emotionalTone,
      createdAt: Date.now(),
    };

    await story.addChapter(chapter);
    log('Chapter created', { number: chapterNumber, title: chapter.title });

    // Trigger lore management after chapter creation
    runLoreManagement().catch(err => {
      console.error('[ActionInput] Lore management failed:', err);
      ui.finishLoreManagement();
    });
  }

  /**
   * Run lore management to review and update lorebook entries.
   * Triggered after chapter creation per design doc section 3.4.
   */
  async function runLoreManagement() {
    if (!story.currentStory) return;

    log('Starting lore management...');
    ui.startLoreManagement();

    let changeCount = 0;
    const bumpChanges = (delta = 1) => {
      changeCount += delta;
      return changeCount;
    };

    try {
      const result = await aiService.runLoreManagement(
        story.currentStory.id,
        [...story.lorebookEntries], // Clone to avoid mutation issues
        [], // Lore management runs without current chat history
        story.chapters,
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
            ui.updateLoreManagementProgress('Creating entries...', bumpChanges());
          },
          onUpdateEntry: async (id, updates) => {
            await story.updateLorebookEntry(id, updates);
            ui.updateLoreManagementProgress('Updating entries...', bumpChanges());
          },
          onDeleteEntry: async (id) => {
            await story.deleteLorebookEntry(id);
            ui.updateLoreManagementProgress('Cleaning up entries...', bumpChanges());
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
            ui.updateLoreManagementProgress('Merging entries...', bumpChanges());
          },
        }
      );

      log('Lore management complete', {
        changesCount: result.changes.length,
        summary: result.summary,
      });

      ui.updateLoreManagementProgress(`Complete: ${result.summary}`, result.changes.length);
    } finally {
      // Give user a moment to see the completion message
      setTimeout(() => {
        ui.finishLoreManagement();
      }, 2000);
    }
  }

  // Get protagonist name for third person POV
  const protagonistName = $derived.by(() => (
    story.characters.find(c => c.relationship === 'self')?.name ?? 'The protagonist'
  ));
  const pov = $derived(story.pov);

  // Generate action prefixes based on POV
  const actionPrefixes = $derived.by(() => {
    switch (pov) {
      case 'third':
        return {
          do: `${protagonistName} `,
          say: `${protagonistName} says, "`,
          think: `${protagonistName} thinks, "`,
          story: '',
          free: '',
        };
      case 'first':
      case 'second':
      default:
        return {
          do: 'I ',
          say: 'I say, "',
          think: 'I think to myself, "',
          story: '',
          free: '',
        };
    }
  });

  const actionSuffixes = {
    do: '',
    say: '"',
    think: '"',
    story: '',
    free: '',
  };

  /**
   * Core generation logic - used by both handleSubmit and retry
   */
  async function generateResponse(userActionEntryId: string, userActionContent: string) {
    log('Starting AI generation...', { userActionEntryId, hasCurrentStory: !!story.currentStory });

    // Ensure we have a current story
    if (!story.currentStory) {
      log('No current story loaded, cannot generate');
      return;
    }

    stopRequested = false;
    activeAbortController = new AbortController();

    ui.setGenerating(true);
    ui.clearGenerationError(); // Clear any previous error
    ui.clearActionChoices(story.currentStory?.id); // Clear previous action choices

    try {
      // Build world state for AI context (including chapters for summarization)
      const worldState = {
        characters: story.characters,
        locations: story.locations,
        items: story.items,
        storyBeats: story.storyBeats,
        currentLocation: story.currentLocation,
        chapters: story.chapters,
        memoryConfig: story.memoryConfig,
        lorebookEntries: story.lorebookEntries,
      };

      log('World state built', {
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

      // Build parallel retrieval tasks
      const retrievalTasks: Promise<void>[] = [];

      // Task 1: Memory retrieval - get relevant chapter context
      // Use timeline fill (default) or basic retrieval depending on settings
      if (story.chapters.length > 0 && story.memoryConfig.enableRetrieval) {
        retrievalTasks.push((async () => {
          try {
            const timelineFillEnabled = settings.systemServicesSettings.timelineFill?.enabled ?? true;
            if (!timelineFillEnabled) {
              log('Timeline fill disabled, skipping memory retrieval');
              return;
            }

            const useAgenticTimelineFill = aiService.shouldUseAgenticRetrieval(story.chapters);

            if (useAgenticTimelineFill) {
              log('Starting agentic timeline fill...', { chaptersCount: story.chapters.length });

              const agenticResult = await aiService.runAgenticRetrieval(
                userActionContent,
                story.visibleEntries,
                story.chapters,
                story.lorebookEntries,
                (chapterNumber, question) =>
                  aiService.answerChapterQuestion(
                    chapterNumber,
                    question,
                    story.chapters,
                    story.entries,
                    activeAbortController?.signal
                  ),
                (startChapter, endChapter, question) =>
                  aiService.answerChapterRangeQuestion(
                    startChapter,
                    endChapter,
                    question,
                    story.chapters,
                    story.entries,
                    activeAbortController?.signal
                  ),
                activeAbortController?.signal
              );

              if (agenticResult.context) {
                retrievedChapterContext = aiService.formatAgenticRetrievalForPrompt(agenticResult);
                log('Agentic timeline fill complete', {
                  iterations: agenticResult.iterations,
                  queriedChapters: agenticResult.queriedChapters.length,
                  contextLength: retrievedChapterContext?.length ?? 0,
                });
              } else {
                log('Agentic timeline fill returned no context');
              }
            } else {
              log('Starting timeline fill...', { chaptersCount: story.chapters.length });

              // Timeline fill: generates queries and executes them in one go
              const timelineResult = await aiService.runTimelineFill(
                userActionContent,
                story.visibleEntries,
                story.chapters,
                story.entries, // All entries for querying chapter content
                activeAbortController?.signal
              );

              if (timelineResult.responses.length > 0) {
                // Calculate positions for prompt injection
                const currentPosition = story.entries.length;
                const firstVisiblePosition = story.entries.length - story.visibleEntries.length + 1;

                retrievedChapterContext = aiService.formatTimelineFillForPrompt(
                  story.chapters,
                  timelineResult,
                  currentPosition,
                  firstVisiblePosition
                );
                log('Timeline fill complete', {
                  queriesGenerated: timelineResult.queries.length,
                  responsesCount: timelineResult.responses.length,
                  contextLength: retrievedChapterContext?.length ?? 0,
                });
              } else {
                log('Timeline fill returned no responses (no relevant queries)');
              }
            }
          } catch (retrievalError) {
            if (retrievalError instanceof Error && retrievalError.name === 'AbortError') {
              log('Memory retrieval aborted');
              return;
            }
            log('Memory retrieval failed (non-fatal)', retrievalError);
            console.warn('Memory retrieval failed:', retrievalError);
          }
        })());
      }

      // Task 2: Lorebook entry retrieval (Tier 3 LLM selection runs here)
      // Pass live-tracked entities for Tier 1 injection
      // Also pass activation tracker for stickiness calculations
      if (story.lorebookEntries.length > 0 || story.characters.length > 0 || story.locations.length > 0 || story.items.length > 0) {
        retrievalTasks.push((async () => {
          try {
            // Create activation tracker for stickiness
            // Current position is the number of story entries (next entry will be at this index)
            const storyPosition = story.entries.length;
            const activationTracker = ui.getActivationTracker(storyPosition) as SimpleActivationTracker;

            log('Starting lorebook retrieval...', {
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
              activeAbortController?.signal
            );
            lorebookContext = entryResult.contextBlock;
            // Store retrieval result for debug panel
            ui.setLastLorebookRetrieval(entryResult);
            // Update activation data with recorded activations (and persist to database)
            ui.updateActivationData(activationTracker, story.currentStory?.id);
            log('Lorebook retrieval complete', {
              tier1: entryResult.tier1.length,
              tier2: entryResult.tier2.length,
              tier3: entryResult.tier3.length,
              contextLength: lorebookContext?.length ?? 0,
            });
          } catch (entryError) {
            if (entryError instanceof Error && entryError.name === 'AbortError') {
              log('Lorebook retrieval aborted');
              return;
            }
            log('Lorebook retrieval failed (non-fatal)', entryError);
            console.warn('Lorebook retrieval failed:', entryError);
          }
        })());
      }

      // Wait for all retrieval tasks to complete (parallel execution)
      if (retrievalTasks.length > 0) {
        log('Waiting for parallel retrieval tasks...', { taskCount: retrievalTasks.length });
        await Promise.all(retrievalTasks);
        log('All retrieval tasks complete');
      }

      if (stopRequested) {
        log('Generation stopped before streaming started');
        return;
      }

      // Combine retrieved contexts
      const combinedRetrievedContext = [retrievedChapterContext, lorebookContext]
        .filter(Boolean)
        .join('\n') || null;

      let fullResponse = '';
      let chunkCount = 0;

      // Capture current story reference for use after streaming
      const currentStoryRef = story.currentStory;

      // Retry logic for empty responses
      const MAX_EMPTY_RESPONSE_RETRIES = 3;
      let retryCount = 0;

      // Start streaming indicator now that retrieval is complete
      ui.startStreaming();

      while (retryCount < MAX_EMPTY_RESPONSE_RETRIES) {
        // Reset for each attempt
        fullResponse = '';
        chunkCount = 0;

        if (retryCount > 0) {
          log(`Retrying generation (attempt ${retryCount + 1}/${MAX_EMPTY_RESPONSE_RETRIES}) due to empty response...`);
          // startStreaming() clears previous content and restarts
          ui.startStreaming();
        }

        // Use streaming response with visible entries only (non-summarized)
        // Per design doc section 3.1.2: summarized entries are excluded from context
        log('Starting stream iteration...', {
          hasStyleReview: !!ui.lastStyleReview,
          visibleEntries: story.visibleEntries.length,
          totalEntries: story.entries.length,
          hasRetrievedContext: !!combinedRetrievedContext,
          hasLorebookContext: !!lorebookContext,
          attempt: retryCount + 1,
        });

        for await (const chunk of aiService.streamResponse(
          story.visibleEntries,
          worldState,
          currentStoryRef,
          true,
          ui.lastStyleReview,
          combinedRetrievedContext,
          activeAbortController?.signal
        )) {
          if (stopRequested) {
            log('Stop requested during streaming');
            break;
          }
          chunkCount++;
          if (chunk.content) {
            fullResponse += chunk.content;
            ui.appendStreamContent(chunk.content);

            // Emit streaming event
            eventBus.emit<ResponseStreamingEvent>({
              type: 'ResponseStreaming',
              chunk: chunk.content,
              accumulated: fullResponse,
            });
          }

          if (chunk.done) {
            log('Stream done signal received');
            break;
          }
        }

        log('Stream complete', { chunkCount, responseLength: fullResponse.length, attempt: retryCount + 1 });

        // Check if we got a valid response
        if (fullResponse.trim()) {
          break; // Success, exit retry loop
        }

        // Empty response, increment retry counter
        retryCount++;
        if (retryCount < MAX_EMPTY_RESPONSE_RETRIES) {
          log(`Empty response received, will retry (${retryCount}/${MAX_EMPTY_RESPONSE_RETRIES})...`);
        }
      }

      // End streaming immediately to prevent duplicate display
      // (StreamingEntry would show alongside the saved entry otherwise)
      ui.endStreaming();

      if (stopRequested) {
        log('Generation stopped after streaming, skipping save');
        return;
      }

      // Save the complete response as a story entry
      if (fullResponse.trim()) {
        log('Saving narration entry...', { contentLength: fullResponse.length });
        const narrationEntry = await story.addEntry('narration', fullResponse);
        log('Narration entry saved', { entryId: narrationEntry.id, entriesCount: story.entries.length });

        // Emit NarrativeResponse event
        emitNarrativeResponse(narrationEntry.id, fullResponse);

        // Phase 3: Classify the response to extract world state changes
        log('Starting classification phase...');
        try {
          const classificationResult = await aiService.classifyResponse(
            fullResponse,
            userActionContent,
            worldState,
            currentStoryRef
          );

          log('Classification complete', {
            newCharacters: classificationResult.entryUpdates.newCharacters.length,
            newLocations: classificationResult.entryUpdates.newLocations.length,
            newItems: classificationResult.entryUpdates.newItems.length,
            newStoryBeats: classificationResult.entryUpdates.newStoryBeats.length,
          });

          // Emit ClassificationComplete event
          eventBus.emit<ClassificationCompleteEvent>({
            type: 'ClassificationComplete',
            messageId: narrationEntry.id,
            result: classificationResult,
          });

          // Phase 4: Apply classification results to world state
          await story.applyClassificationResult(classificationResult);
          log('World state updated from classification');
        } catch (classifyError) {
          // Classification failure shouldn't break the main flow
          log('Classification failed (non-fatal)', classifyError);
          console.warn('World state classification failed:', classifyError);
        }

        // Phase 5: Check if auto-summarization is needed (background, non-blocking)
        if (story.memoryConfig.autoSummarize) {
          checkAutoSummarize().catch(err => {
            log('Auto-summarize check failed (non-fatal)', err);
          });
        }

        // Phase 6: Generate suggestions for creative writing mode (background, non-blocking)
        if (isCreativeMode) {
          refreshSuggestions().catch(err => {
            log('Suggestions generation failed (non-fatal)', err);
          });
        }

        // Phase 7: Generate RPG action choices for adventure mode (background, non-blocking)
        if (!isCreativeMode) {
          generateActionChoices(fullResponse, worldState).catch(err => {
            log('Action choices generation failed (non-fatal)', err);
          });
        }

        // Phase 8: Check if style review should run (background, non-blocking)
        checkStyleReview().catch(err => {
          log('Style review check failed (non-fatal)', err);
        });
      } else {
        log(`No response content after ${MAX_EMPTY_RESPONSE_RETRIES} attempts (fullResponse was empty or whitespace)`);
        // Add a system message to inform the user
        const errorMessage = `The AI returned an empty response after ${MAX_EMPTY_RESPONSE_RETRIES} attempts. Please try again.`;
        const errorEntry = await story.addEntry('system', errorMessage);

        // Store error state for retry button to work
        ui.setGenerationError({
          message: errorMessage,
          errorEntryId: errorEntry.id,
          userActionEntryId: userActionEntryId,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      if (stopRequested || (error instanceof Error && error.name === 'AbortError')) {
        log('Generation aborted by user');
        return;
      }
      log('Generation failed', error);
      console.error('Generation failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate response. Please try again.';
      const errorEntry = await story.addEntry('system', `Generation failed: ${errorMessage}`);

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
      activeAbortController = null;
      stopRequested = false;
      log('Generation complete, UI reset');
    }
  }

  async function handleSubmit() {
    log('handleSubmit called', { inputValue: inputValue.trim(), actionType, isCreativeMode, isGenerating: ui.isGenerating });

    if (!inputValue.trim() || ui.isGenerating) {
      log('Submit blocked', { emptyInput: !inputValue.trim(), isGenerating: ui.isGenerating });
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
    // - Adventure mode: apply action prefixes/suffixes
    const rawInput = inputValue.trim();
    const wasRawActionChoice = isRawActionChoice;
    let content: string;
    if (isCreativeMode || wasRawActionChoice) {
      content = rawInput;
    } else {
      content = actionPrefixes[actionType] + rawInput + actionSuffixes[actionType];
    }

    // Reset the raw action choice flag
    isRawActionChoice = false;

    log('Action content built', { content, mode: isCreativeMode ? 'creative' : 'adventure', wasRawChoice: wasRawActionChoice });

    // Create a backup of the current state BEFORE adding the user action
    // This allows "retry last message" to restore to this exact point
    if (story.currentStory) {
      ui.createRetryBackup(
        story.currentStory.id,
        story.entries,
        story.characters,
        story.locations,
        story.items,
        story.storyBeats,
        story.lorebookEntries,
        content,
        rawInput,
        actionType,
        wasRawActionChoice
      );
    }

    // Add user action to story
    const userActionEntry = await story.addEntry('user_action', content);
    log('User action added to story', { entryId: userActionEntry.id });

    // Emit UserInput event
    emitUserInput(content, isCreativeMode ? 'direction' : actionType);

    // Clear input
    inputValue = '';

    // Wait for reactive state to synchronize before generation
    // This ensures lorebook entries, characters, etc. are fully loaded
    await tick();

    // Generate AI response with streaming
    if (!settings.needsApiKey) {
      await generateResponse(userActionEntry.id, content);
    } else {
      log('No API key configured');
      await story.addEntry('system', 'Please configure your API key in settings to enable AI generation.');
    }
  }

  /**
   * Stop the active generation and restore input state.
   */
  async function handleStopGeneration() {
    log('handleStopGeneration called', { hasBackup: !!ui.retryBackup, isGenerating: ui.isGenerating });

    if (!ui.isGenerating) {
      log('Stop ignored (not generating)');
      return;
    }
    if (isRetryingLastMessage) {
      log('Stop ignored (retrying completed message)');
      return;
    }

    stopRequested = true;
    activeAbortController?.abort();

    ui.endStreaming();
    ui.setGenerating(false);

    const backup = ui.retryBackup;
    if (!backup || !story.currentStory) {
      log('No valid backup for stop restore');
      return;
    }

    if (backup.storyId !== story.currentStory.id) {
      log('Stop backup is for different story, clearing');
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
          lorebookEntries: backup.lorebookEntries,
        });
      } else {
        // Persistent restore - delete entries and entities created after backup
        // Clear activation data but don't save yet - let the next action rebuild it
        ui.clearActivationData();

        log('Persistent stop restore: deleting entries from position', backup.entryCountBeforeAction);
        await story.deleteEntriesFromPosition(backup.entryCountBeforeAction);

        if (backup.hasEntityIds) {
          log('Persistent stop restore: deleting entities created after backup');
          await story.deleteEntitiesCreatedAfterBackup({
            characterIds: backup.characterIds,
            locationIds: backup.locationIds,
            itemIds: backup.itemIds,
            storyBeatIds: backup.storyBeatIds,
            lorebookEntryIds: backup.lorebookEntryIds,
          });
        } else {
          log('Persistent stop restore: skipping entity cleanup (no ID snapshot)');
        }
      }

      await tick();
      actionType = backup.actionType;
      isRawActionChoice = backup.wasRawActionChoice;
      inputValue = backup.rawInput;
    } catch (error) {
      log('Stop restore failed', error);
      console.error('Stop restore failed:', error);
    } finally {
      ui.clearRetryBackup(true); // Clear from DB since user explicitly stopped
    }
  }

  /**
   * Retry the last failed generation
   */
  async function handleRetry() {
    log('handleRetry called', { hasError: !!ui.lastGenerationError, isGenerating: ui.isGenerating });

    const error = ui.lastGenerationError;
    if (!error || ui.isGenerating) {
      log('handleRetry early return', { hasError: !!error, isGenerating: ui.isGenerating });
      return;
    }

    log('Retrying generation', { errorEntryId: error.errorEntryId, userActionEntryId: error.userActionEntryId });

    // Find the user action content before deleting the error
    const userActionEntry = story.entries.find(e => e.id === error.userActionEntryId);
    if (!userActionEntry) {
      log('User action entry not found for retry');
      ui.clearGenerationError();
      return;
    }

    // Delete the error entry
    await story.deleteEntry(error.errorEntryId);
    ui.clearGenerationError();

    // Retry generation with the same user action
    if (!settings.needsApiKey) {
      await generateResponse(userActionEntry.id, userActionEntry.content);
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
    log('handleRetryLastMessage called', {
      hasBackup: !!ui.retryBackup,
      isGenerating: ui.isGenerating,
      storyId: story.currentStory?.id,
    });

    const backup = ui.retryBackup;
    if (!backup || ui.isGenerating || !story.currentStory) {
      log('handleRetryLastMessage early return');
      return;
    }

    // Verify backup is for current story
    if (backup.storyId !== story.currentStory.id) {
      log('Backup is for different story, clearing');
      ui.clearRetryBackup(false); // Just clear in-memory, don't touch DB
      return;
    }

    log('Restoring from backup and regenerating', {
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

    try {
      if (backup.hasFullState) {
        // Full state restore (in-memory backup with snapshots)
        // Restore activation data from backup to preserve lorebook stickiness state
        ui.restoreActivationData(backup.activationData, backup.storyPosition);

        // Restore story state from backup
        await story.restoreFromRetryBackup({
          entries: backup.entries,
          characters: backup.characters,
          locations: backup.locations,
          items: backup.items,
          storyBeats: backup.storyBeats,
          lorebookEntries: backup.lorebookEntries,
        });
      } else {
        // Persistent restore (backup without full snapshots, but with entity IDs)
        // Clear activation data but don't save yet - generation will rebuild it
        ui.clearActivationData();

        log('Persistent restore: deleting entries from position', backup.entryCountBeforeAction);
        await story.deleteEntriesFromPosition(backup.entryCountBeforeAction);

        if (backup.hasEntityIds) {
          // Delete entities that were created after the backup (AI extractions)
          log('Persistent restore: deleting entities created after backup');
          await story.deleteEntitiesCreatedAfterBackup({
            characterIds: backup.characterIds,
            locationIds: backup.locationIds,
            itemIds: backup.itemIds,
            storyBeatIds: backup.storyBeatIds,
            lorebookEntryIds: backup.lorebookEntryIds,
          });
        } else {
          log('Persistent restore: skipping entity cleanup (no ID snapshot)');
        }
      }

      // Wait for state to sync
      await tick();

      // Re-add the user action
      const userActionEntry = await story.addEntry('user_action', backup.userActionContent);
      log('User action re-added', { entryId: userActionEntry.id });

      // Emit UserInput event
      emitUserInput(backup.userActionContent, isCreativeMode ? 'direction' : backup.actionType);

      // Wait for state to sync again
      await tick();

      // Regenerate
      if (!settings.needsApiKey) {
        isRetryingLastMessage = true;
        try {
          await generateResponse(userActionEntry.id, backup.userActionContent);
        } finally {
          isRetryingLastMessage = false;
        }
      }
    } catch (error) {
      log('Retry last message failed', error);
      console.error('Retry last message failed:', error);
    }
  }

  /**
   * Dismiss the retry backup (user doesn't want to retry)
   */
  function dismissRetryBackup() {
    ui.clearRetryBackup(true); // Clear from DB since user explicitly dismissed
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="space-y-3">
  <!-- Error retry banner -->
  {#if ui.lastGenerationError && !ui.isGenerating}
    <div class="flex items-center justify-between gap-3 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
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
    <!-- Creative Writing Mode: Suggestions -->
    <Suggestions
      suggestions={ui.suggestions}
      loading={ui.suggestionsLoading}
      onSelect={handleSuggestionSelect}
      onRefresh={refreshSuggestions}
    />

    <!-- Grammar Check -->
    <GrammarCheck text={inputValue} onApplySuggestion={(newText) => inputValue = newText} />

    <!-- Creative Writing Mode: Direction Input -->
    <div class="flex gap-2">
      <div class="relative flex-1">
        <textarea
          bind:value={inputValue}
          onkeydown={handleKeydown}
          placeholder="Describe what happens next in the story..."
          class="input min-h-[56px] sm:min-h-[60px] resize-none text-base"
          rows="2"
          disabled={ui.isGenerating}
        ></textarea>
      </div>
      {#if ui.isGenerating}
        {#if !isRetryingLastMessage}
          <button
            onclick={handleStopGeneration}
            class="btn self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
            title="Stop generation"
          >
            <Square class="h-5 w-5" />
          </button>
        {:else}
          <button
            disabled
            class="btn self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px] bg-red-500/20 text-red-400 opacity-50 cursor-not-allowed"
            title="Stop disabled during retry"
          >
            <Square class="h-5 w-5" />
          </button>
        {/if}
      {:else}
        <button
          onclick={handleSubmit}
          disabled={!inputValue.trim() || ui.isGenerating}
          class="btn btn-primary self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px]"
          title="Continue story"
        >
          <Feather class="h-5 w-5" />
        </button>
      {/if}
    </div>
  {:else}
    <!-- Adventure Mode: Action type buttons -->
    <div class="action-type-buttons flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      <button
        class="btn flex items-center gap-1 sm:gap-1.5 text-sm flex-shrink-0 min-h-[40px] px-2.5 sm:px-4"
        class:btn-primary={actionType === 'do'}
        class:btn-secondary={actionType !== 'do'}
        onclick={() => actionType = 'do'}
      >
        <Wand2 class="h-4 w-4" />
        <span class="hidden xs:inline">Do</span>
      </button>
      <button
        class="btn flex items-center gap-1 sm:gap-1.5 text-sm flex-shrink-0 min-h-[40px] px-2.5 sm:px-4"
        class:btn-primary={actionType === 'say'}
        class:btn-secondary={actionType !== 'say'}
        onclick={() => actionType = 'say'}
      >
        <MessageSquare class="h-4 w-4" />
        <span class="hidden xs:inline">Say</span>
      </button>
      <button
        class="btn flex items-center gap-1 sm:gap-1.5 text-sm flex-shrink-0 min-h-[40px] px-2.5 sm:px-4"
        class:btn-primary={actionType === 'think'}
        class:btn-secondary={actionType !== 'think'}
        onclick={() => actionType = 'think'}
      >
        <Brain class="h-4 w-4" />
        <span class="hidden xs:inline">Think</span>
      </button>
      <button
        class="btn flex items-center gap-1 sm:gap-1.5 text-sm flex-shrink-0 min-h-[40px] px-2.5 sm:px-4"
        class:btn-primary={actionType === 'story'}
        class:btn-secondary={actionType !== 'story'}
        onclick={() => actionType = 'story'}
      >
        <Sparkles class="h-4 w-4" />
        <span class="hidden xs:inline">Story</span>
      </button>
      <button
        class="btn flex items-center gap-1 sm:gap-1.5 text-sm flex-shrink-0 min-h-[40px] px-2.5 sm:px-4"
        class:btn-primary={actionType === 'free'}
        class:btn-secondary={actionType !== 'free'}
        onclick={() => actionType = 'free'}
      >
        <PenLine class="h-4 w-4" />
        <span class="hidden xs:inline">Free</span>
      </button>
    </div>

    <!-- Grammar Check -->
    <GrammarCheck text={inputValue} onApplySuggestion={(newText) => inputValue = newText} />

    <!-- Adventure Mode: Input area -->
    <div class="flex gap-2">
      <div class="relative flex-1">
        <textarea
          bind:value={inputValue}
          onkeydown={handleKeydown}
          placeholder={actionType === 'story' ? 'Describe what happens...' : actionType === 'free' ? 'Write anything...' : 'What do you do?'}
          class="input min-h-[56px] sm:min-h-[60px] resize-none text-base"
          rows="2"
          disabled={ui.isGenerating}
        ></textarea>
      </div>
      {#if ui.isGenerating}
        {#if !isRetryingLastMessage}
          <button
            onclick={handleStopGeneration}
            class="btn self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px] bg-red-500/20 text-red-400 hover:bg-red-500/30"
            title="Stop generation"
          >
            <Square class="h-5 w-5" />
          </button>
        {:else}
          <button
            disabled
            class="btn self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px] bg-red-500/20 text-red-400 opacity-50 cursor-not-allowed"
            title="Stop disabled during retry"
          >
            <Square class="h-5 w-5" />
          </button>
        {/if}
      {:else}
        <button
          onclick={handleSubmit}
          disabled={!inputValue.trim() || ui.isGenerating}
          class="btn btn-primary self-stretch px-3 sm:px-4 py-3 min-h-[44px] min-w-[44px]"
        >
          <Send class="h-5 w-5" />
        </button>
      {/if}
    </div>
  {/if}
</div>
