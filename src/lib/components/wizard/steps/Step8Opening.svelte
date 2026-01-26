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
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as Card from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import * as ScrollArea from "$lib/components/ui/scroll-area";
  import { Badge } from "$lib/components/ui/badge";

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

<div class="space-y-4 p-1">
  <p class="text-muted-foreground">
    Give your story a title and either write your own opening scene or generate
    one with AI.
  </p>

  <div class="space-y-2">
    <Label>Story Title</Label>
    <Input
      type="text"
      value={storyTitle}
      oninput={(e) => onTitleChange(e.currentTarget.value)}
      placeholder="Enter a title for your adventure..."
    />
  </div>

  <!-- Imported Opening Scene from Character Card -->
  {#if cardImportedFirstMessage}
    <Card.Root class="bg-surface-800/50 border-surface-700">
      <Card.Content class="p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <FileJson class="h-4 w-4 text-accent-400" />
            <h4 class="font-medium text-foreground">Imported Opening Scene</h4>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            onclick={onClearCardOpening}
          >
            Clear
          </Button>
        </div>

        <!-- Greeting Selection (if alternate greetings exist) -->
        {#if cardImportedAlternateGreetings.length > 0}
          <div>
            <Label class="mb-2 block text-xs font-medium text-muted-foreground"
              >Select Opening</Label
            >
            <div class="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={selectedGreetingIndex === 0 ? "default" : "secondary"}
                class="h-7 text-xs"
                onclick={() => onSelectedGreetingChange(0)}
              >
                Default
              </Button>
              {#each cardImportedAlternateGreetings as _, i}
                <Button
                  size="sm"
                  variant={selectedGreetingIndex === i + 1
                    ? "default"
                    : "secondary"}
                  class="h-7 text-xs"
                  onclick={() => onSelectedGreetingChange(i + 1)}
                >
                  Alt {i + 1}
                </Button>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Preview of selected opening -->
        <Card.Root class="bg-surface-900 border-none">
          <Card.Content class="p-3">
            <ScrollArea.Root class="h-48">
              <div class="text-sm text-muted-foreground whitespace-pre-wrap">
                {@html styleUserPlaceholders(
                  selectedGreetingIndex === 0
                    ? cardImportedFirstMessage || ""
                    : cardImportedAlternateGreetings[
                        selectedGreetingIndex - 1
                      ] || "",
                )}
              </div>
            </ScrollArea.Root>
          </Card.Content>
        </Card.Root>

        {#if (selectedGreetingIndex === 0 ? cardImportedFirstMessage : cardImportedAlternateGreetings[selectedGreetingIndex - 1])?.includes("{{user}}")}
          <p class="text-xs text-muted-foreground flex items-center gap-1">
            <Badge
              variant="outline"
              class="px-1 py-0.5 text-[10px] bg-primary/20 text-primary font-mono border-primary/30 rounded"
            >
              {"{{user}}"}
            </Badge>
            will be replaced with your character's name
          </p>
        {/if}

        <Button size="sm" class="gap-2" onclick={onUseCardOpening}>
          <Check class="h-3 w-3" />
          Use This Opening
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Opening Scene Guidance (Creative Writing Mode Only) -->
  {#if selectedMode === "creative-writing"}
    <Card.Root class="bg-surface-900 border-surface-700">
      <Card.Content class="p-4 space-y-3">
        <div class="flex items-center gap-2">
          <Feather class="h-4 w-4 text-secondary-400" />
          <h4 class="font-medium text-foreground">Opening Scene Guidance</h4>
          <span class="text-xs text-muted-foreground">(Optional)</span>
        </div>
        <p class="text-sm text-muted-foreground">
          As the author, describe what you want to happen in the opening scene.
          Include setting details, character positions, mood, or specific
          events.
        </p>
        <Textarea
          value={openingGuidance}
          oninput={(e) => onGuidanceChange(e.currentTarget.value)}
          placeholder="e.g., The scene opens at night in a crowded tavern. Sarah sits alone in a corner, nursing a drink, when a mysterious stranger approaches her table with urgent news about her missing brother..."
          class="min-h-[100px] resize-y text-sm"
          rows={4}
        />
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Manual Opening Entry or AI Generation -->
  {#if storyTitle.trim()}
    <Card.Root class="bg-surface-900 border-surface-700">
      <Card.Content class="p-4 space-y-3">
        <h4 class="font-medium text-foreground">Opening Scene</h4>
        <p class="text-sm text-muted-foreground">
          Write your own opening scene or generate one with AI
        </p>

        <!-- Manual Text Entry -->
        <div class="space-y-2">
          <Label>Write Your Own Opening</Label>
          <Textarea
            value={manualOpeningText}
            oninput={(e) => onManualOpeningChange(e.currentTarget.value)}
            placeholder="Write the opening scene of your story here... Describe the setting, introduce your character, set the mood. This will be the first entry in your adventure."
            class="min-h-[140px] resize-y text-sm"
            rows={6}
            disabled={isGeneratingOpening ||
              isRefiningOpening ||
              generatedOpening !== null}
          />
          {#if generatedOpening}
            <p class="text-xs text-amber-400">
              AI-generated opening active. Clear it below to write your own.
            </p>
          {:else if manualOpeningText.trim()}
            <p class="text-xs text-green-400">✓ Custom opening ready</p>
          {/if}
        </div>

        <!-- Divider -->
        <div class="flex items-center gap-3">
          <Separator class="flex-1" />
          <span class="text-xs text-muted-foreground">OR</span>
          <Separator class="flex-1" />
        </div>

        <!-- AI Generation Button -->
        <div class="flex flex-col gap-3">
          <div class="flex gap-2">
            <Button
              variant="secondary"
              class="flex-1 gap-2"
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
            </Button>
            {#if generatedOpening}
              <Button
                variant="secondary"
                size="icon"
                onclick={onClearGenerated}
                title="Clear AI-generated opening"
              >
                <X class="h-4 w-4" />
              </Button>
            {/if}
          </div>
          {#if !generatedOpening && !isGeneratingOpening && !manualOpeningText.trim() && !cardImportedFirstMessage}
            <span class="text-sm text-amber-400 text-center">
              Either write your own opening or generate one with AI
            </span>
          {/if}
        </div>
      </Card.Content>
    </Card.Root>
  {:else}
    <p class="text-sm text-muted-foreground -mt-3">
      Enter a title to continue*
    </p>
  {/if}

  {#if openingError}
    <p class="text-sm text-red-400">{openingError}</p>
  {/if}

  {#if generatedOpening}
    <Card.Root class="bg-surface-900 border-surface-700">
      <Card.Content class="p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-semibold text-foreground">
            {generatedOpening?.title || storyTitle}
          </h3>
          {#if !isEditingOpening}
            <div class="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                class="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground gap-1"
                onclick={onStartEdit}
                title="Edit the opening text"
              >
                <PenTool class="h-3 w-3" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-auto px-2 py-1 text-xs text-accent-400 hover:text-accent-300 hover:bg-accent-950/20 gap-1"
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
              </Button>
            </div>
          {/if}
        </div>
        {#if isEditingOpening}
          <Textarea
            value={openingDraft ?? ""}
            oninput={(e) => onDraftChange(e.currentTarget.value)}
            class="min-h-[140px] resize-y text-sm"
            rows={6}
          />
          <div class="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onclick={onCancelEdit}>
              Cancel
            </Button>
            <Button
              size="sm"
              onclick={onSaveEdit}
              disabled={!openingDraft?.trim()}
            >
              Save Changes
            </Button>
          </div>
        {:else}
          <ScrollArea.Root class="h-64">
            <div class="prose prose-invert prose-sm max-w-none">
              <p class="text-muted-foreground whitespace-pre-wrap">
                {generatedOpening?.scene || ""}
              </p>
            </div>
          </ScrollArea.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}

  <!-- Summary -->
  <Card.Root class="bg-surface-800 border-surface-700">
    <Card.Content class="p-4 space-y-2 text-sm">
      <h4 class="font-medium text-foreground">Story Summary</h4>
      <div class="grid grid-cols-2 gap-2 text-muted-foreground">
        <div>
          <strong class="text-foreground">Mode:</strong>
          {selectedMode === "adventure" ? "Adventure" : "Creative Writing"}
        </div>
        <div>
          <strong class="text-foreground">Genre:</strong>
          {selectedGenre === "custom" ? customGenre : selectedGenre}
        </div>
        <div>
          <strong class="text-foreground">POV:</strong>
          {povOptions.find((p) => p.id === selectedPOV)?.label}
        </div>
        <div>
          <strong class="text-foreground">Tense:</strong>
          {tenseOptions.find((t) => t.id === selectedTense)?.label}
        </div>
        {#if expandedSetting}
          <div class="col-span-2">
            <strong class="text-foreground">Setting:</strong>
            {expandedSetting.name}
          </div>
        {/if}
        {#if protagonist}
          <div class="col-span-2">
            <strong class="text-foreground">Protagonist:</strong>
            {protagonist.name}
          </div>
        {/if}
        {#if importedEntriesCount > 0}
          <div class="col-span-2 flex items-center gap-2">
            <Book class="h-4 w-4 text-accent-400" />
            <strong class="text-foreground">Lorebook:</strong>
            {importedEntriesCount} entries to import
          </div>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>
</div>
