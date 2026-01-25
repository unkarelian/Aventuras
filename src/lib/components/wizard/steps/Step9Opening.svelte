<script lang="ts">
  import {
    FileJson,
    Feather,
    Loader2,
    Check,
    Sparkles,
    PenTool,
    Book,
    X,
  } from "lucide-svelte";
  import type {
    StoryMode,
    Genre,
    POV,
    Tense,
    ExpandedSetting,
    GeneratedProtagonist,
    GeneratedOpening,
    ImportedEntry,
    POVOption,
    TenseOption,
  } from "../wizardTypes";
  import { styleUserPlaceholders, tenseOptions } from "../wizardTypes";

  interface Props {
    // State
    storyTitle: string;
    openingGuidance: string;
    generatedOpening: GeneratedOpening | null;
    isGeneratingOpening: boolean;
    isRefiningOpening: boolean;
    isEditingOpening: boolean;
    openingDraft: string;
    openingError: string | null;
    manualOpeningText: string;
    
    // Card import
    cardImportedFirstMessage: string | null;
    cardImportedAlternateGreetings: string[];
    selectedGreetingIndex: number;
    
    // Story context for summary
    selectedMode: StoryMode;
    selectedGenre: Genre;
    customGenre: string;
    selectedPOV: POV;
    selectedTense: Tense;
    expandedSetting: ExpandedSetting | null;
    protagonist: GeneratedProtagonist | null;
    importedEntriesCount: number;
    
    // Handlers
    onTitleChange: (value: string) => void;
    onGuidanceChange: (value: string) => void;
    onSelectedGreetingChange: (index: number) => void;
    onGenerateOpening: () => void;
    onRefineOpening: () => void;
    onStartEdit: () => void;
    onCancelEdit: () => void;
    onSaveEdit: () => void;
    onDraftChange: (value: string) => void;
    onUseCardOpening: () => void;
    onClearCardOpening: () => void;
    onManualOpeningChange: (value: string) => void;
    onClearGenerated: () => void;
  }

  let {
    storyTitle,
    openingGuidance,
    generatedOpening,
    isGeneratingOpening,
    isRefiningOpening,
    isEditingOpening,
    openingDraft,
    openingError,
    manualOpeningText,
    cardImportedFirstMessage,
    cardImportedAlternateGreetings,
    selectedGreetingIndex,
    selectedMode,
    selectedGenre,
    customGenre,
    selectedPOV,
    selectedTense,
    expandedSetting,
    protagonist,
    importedEntriesCount,
    onTitleChange,
    onGuidanceChange,
    onSelectedGreetingChange,
    onGenerateOpening,
    onRefineOpening,
    onStartEdit,
    onCancelEdit,
    onSaveEdit,
    onDraftChange,
    onUseCardOpening,
    onClearCardOpening,
    onClearGenerated,
    onManualOpeningChange,
  }: Props = $props();

  // POV options for summary
  const povOptions: POVOption[] = [
    { id: "first", label: "1st Person", example: "" },
    { id: "second", label: "2nd Person", example: "" },
    { id: "third", label: "3rd Person", example: "" },
  ];
</script>

<div class="space-y-4">
  <p class="text-surface-400">
    Give your story a title and either write your own opening scene or generate one with AI.
  </p>

  <div>
    <label class="mb-2 block text-sm font-medium text-surface-300"
      >Story Title</label
    >
    <input
      type="text"
      value={storyTitle}
      oninput={(e) => onTitleChange(e.currentTarget.value)}
      placeholder="Enter a title for your adventure..."
      class="input"
    />
  </div>

  <!-- Imported Opening Scene from Character Card -->
  {#if cardImportedFirstMessage}
    <div class="card bg-surface-800/50 p-4 space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FileJson class="h-4 w-4 text-accent-400" />
          <h4 class="font-medium text-surface-200">
            Imported Opening Scene
          </h4>
        </div>
        <button
          class="text-xs text-surface-400 hover:text-surface-200"
          onclick={onClearCardOpening}
        >
          Clear
        </button>
      </div>

      <!-- Greeting Selection (if alternate greetings exist) -->
      {#if cardImportedAlternateGreetings.length > 0}
        <div>
          <label class="mb-2 block text-xs font-medium text-surface-400"
            >Select Opening</label
          >
          <div class="flex flex-wrap gap-2">
            <button
              class="px-3 py-1.5 rounded text-xs transition-colors {selectedGreetingIndex ===
              0
                ? 'bg-accent-600 text-white'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
              onclick={() => onSelectedGreetingChange(0)}
            >
              Default
            </button>
            {#each cardImportedAlternateGreetings as _, i}
              <button
                class="px-3 py-1.5 rounded text-xs transition-colors {selectedGreetingIndex ===
                i + 1
                  ? 'bg-accent-600 text-white'
                  : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
                onclick={() => onSelectedGreetingChange(i + 1)}
              >
                Alt {i + 1}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Preview of selected opening -->
      <div class="card bg-surface-900 p-3 max-h-48 overflow-y-auto">
        <p class="text-sm text-surface-300 whitespace-pre-wrap">
          {@html styleUserPlaceholders(
            selectedGreetingIndex === 0
              ? cardImportedFirstMessage || ""
              : cardImportedAlternateGreetings[
                  selectedGreetingIndex - 1
                ] || "",
          )}
        </p>
      </div>
      {#if (selectedGreetingIndex === 0 ? cardImportedFirstMessage : cardImportedAlternateGreetings[selectedGreetingIndex - 1])?.includes("{{user}}")}
        <p class="text-xs text-surface-500 flex items-center gap-1">
          <span
            class="inline-flex items-center px-1 py-0.5 rounded bg-primary-600/30 text-primary-300 text-[10px] font-mono border border-primary-500/40"
            >{"{{user}}"}</span
          >
          will be replaced with your character's name
        </p>
      {/if}

      <button
        class="btn btn-primary btn-sm flex items-center gap-2"
        onclick={onUseCardOpening}
      >
        <Check class="h-3 w-3" />
        Use This Opening
      </button>
    </div>
  {/if}

  <!-- Opening Scene Guidance (Creative Writing Mode Only) -->
  {#if selectedMode === "creative-writing"}
    <div class="card bg-surface-900 p-4 space-y-3">
      <div class="flex items-center gap-2">
        <Feather class="h-4 w-4 text-secondary-400" />
        <h4 class="font-medium text-surface-200">
          Opening Scene Guidance
        </h4>
        <span class="text-xs text-surface-500">(Optional)</span>
      </div>
      <p class="text-sm text-surface-400">
        As the author, describe what you want to happen in the opening
        scene. Include setting details, character positions, mood, or
        specific events.
      </p>
      <textarea
        value={openingGuidance}
        oninput={(e) => onGuidanceChange(e.currentTarget.value)}
        placeholder="e.g., The scene opens at night in a crowded tavern. Sarah sits alone in a corner, nursing a drink, when a mysterious stranger approaches her table with urgent news about her missing brother..."
        class="input min-h-[100px] resize-y text-sm"
        rows="4"
      ></textarea>
    </div>
  {/if}

  <!-- Manual Opening Entry or AI Generation -->
  {#if storyTitle.trim()}
    <div class="card bg-surface-900 p-4 space-y-3">
      <h4 class="font-medium text-surface-200">Opening Scene</h4>
      <p class="text-sm text-surface-400">
        Write your own opening scene or generate one with AI
      </p>
      
      <!-- Manual Text Entry -->
      <div>
        <label class="mb-2 block text-sm font-medium text-surface-300">
          Write Your Own Opening
        </label>
        <textarea
          value={manualOpeningText}
          oninput={(e) => onManualOpeningChange(e.currentTarget.value)}
          placeholder="Write the opening scene of your story here... Describe the setting, introduce your character, set the mood. This will be the first entry in your adventure."
          class="input min-h-[140px] resize-y text-sm"
          rows="6"
          disabled={isGeneratingOpening || isRefiningOpening || generatedOpening !== null}
        ></textarea>
        {#if generatedOpening}
          <p class="mt-2 text-xs text-amber-400">
            AI-generated opening active. Clear it below to write your own.
          </p>
        {:else if manualOpeningText.trim()}
          <p class="mt-2 text-xs text-green-400">
            ✓ Custom opening ready
          </p>
        {/if}
      </div>

      <!-- Divider -->
      <div class="flex items-center gap-3">
        <div class="flex-1 border-t border-surface-700"></div>
        <span class="text-xs text-surface-500">OR</span>
        <div class="flex-1 border-t border-surface-700"></div>
      </div>

      <!-- AI Generation Button -->
      <div class="flex flex-col gap-3">
        <div class="flex gap-2">
          <button
            class="btn btn-secondary flex-1 flex items-center justify-center gap-2"
            onclick={onGenerateOpening}
            disabled={isGeneratingOpening || isRefiningOpening}
          >
            {#if isGeneratingOpening}
              <Loader2 class="h-4 w-4 animate-spin" />
              Generating Opening...
            {:else}
              <PenTool class="h-4 w-4" />
              {generatedOpening
                ? "Regenerate with AI"
                : "Generate Opening with AI"}
            {/if}
          </button>
          {#if generatedOpening}
            <button
              class="btn btn-secondary px-3"
              onclick={onClearGenerated}
              title="Clear AI-generated opening"
            >
              <X class="h-4 w-4" />
            </button>
          {/if}
        </div>
        {#if !generatedOpening && !isGeneratingOpening && !manualOpeningText.trim() && !cardImportedFirstMessage}
          <span class="text-sm text-amber-400 text-center">
            Either write your own opening or generate one with AI
          </span>
        {/if}
      </div>
    </div>
  {:else}
    <p class="text-sm text-surface-500">
      Enter a title to continue
    </p>
  {/if}

  {#if openingError}
    <p class="text-sm text-red-400">{openingError}</p>
  {/if}

  {#if generatedOpening}
    <div class="card bg-surface-900 p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <h3 class="font-semibold text-surface-100">
          {generatedOpening?.title || storyTitle}
        </h3>
        {#if !isEditingOpening}
          <div class="flex items-center gap-2">
            <button
              class="text-xs text-surface-400 hover:text-surface-200 flex items-center gap-1"
              onclick={onStartEdit}
              title="Edit the opening text"
            >
              <PenTool class="h-3 w-3" />
              Edit
            </button>
            <button
              class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
              onclick={onRefineOpening}
              disabled={isRefiningOpening || isGeneratingOpening}
              title="Refine using the current opening text"
            >
              {#if isRefiningOpening}
                <Loader2 class="h-3 w-3 animate-spin" />
                Refining...
              {:else}
                <Sparkles class="h-3 w-3" />
                Refine Further
              {/if}
            </button>
          </div>
        {/if}
      </div>
      {#if isEditingOpening}
        <textarea
          value={openingDraft ?? ''}
          oninput={(e) => onDraftChange(e.currentTarget.value)}
          class="input min-h-[140px] resize-y text-sm"
          rows="6"
        ></textarea>
        <div class="flex justify-end gap-2">
          <button
            class="btn btn-secondary btn-sm"
            onclick={onCancelEdit}
          >
            Cancel
          </button>
          <button
            class="btn btn-primary btn-sm"
            onclick={onSaveEdit}
            disabled={!openingDraft?.trim()}
          >
            Save Changes
          </button>
        </div>
      {:else}
        <div
          class="prose prose-invert prose-sm max-w-none max-h-64 overflow-y-auto"
        >
          <p class="text-surface-300 whitespace-pre-wrap">
            {generatedOpening?.scene || ""}
          </p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Summary -->
  <div class="card bg-surface-800 p-4 space-y-2 text-sm">
    <h4 class="font-medium text-surface-200">Story Summary</h4>
    <div class="grid grid-cols-2 gap-2 text-surface-400">
      <div>
        <strong>Mode:</strong>
        {selectedMode === "adventure"
          ? "Adventure"
          : "Creative Writing"}
      </div>
      <div>
        <strong>Genre:</strong>
        {selectedGenre === "custom" ? customGenre : selectedGenre}
      </div>
      <div>
        <strong>POV:</strong>
        {povOptions.find((p) => p.id === selectedPOV)?.label}
      </div>
      <div>
        <strong>Tense:</strong>
        {tenseOptions.find((t) => t.id === selectedTense)?.label}
      </div>
      {#if expandedSetting}
        <div class="col-span-2">
          <strong>Setting:</strong>
          {expandedSetting.name}
        </div>
      {/if}
      {#if protagonist}
        <div class="col-span-2">
          <strong>Protagonist:</strong>
          {protagonist.name}
        </div>
      {/if}
      {#if importedEntriesCount > 0}
        <div class="col-span-2 flex items-center gap-2">
          <Book class="h-4 w-4 text-accent-400" />
          <strong>Lorebook:</strong>
          {importedEntriesCount} entries to import
        </div>
      {/if}
    </div>
  </div>
</div>
