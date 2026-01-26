<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Archive,
    Loader2,
    Check,
    Sparkles,
    X,
    PenTool,
    User,
    RefreshCw,
    ChevronDown,
    Send,
    AlertCircle,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import type { VaultCharacter } from "$lib/types";
  import type {
    ExpandedSetting,
    GeneratedProtagonist,
    StoryMode,
  } from "../wizardTypes";

  // Shadcn Components
  import * as Card from "$lib/components/ui/card";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Separator } from "$lib/components/ui/separator";
  import { Badge } from "$lib/components/ui/badge";

  interface Props {
    selectedMode: StoryMode;
    expandedSetting: ExpandedSetting | null;
    protagonist: GeneratedProtagonist | null;

    // Manual protagonist input
    manualCharacterName: string;
    manualCharacterDescription: string;
    manualCharacterBackground: string;
    manualCharacterMotivation: string;
    manualCharacterTraits: string;
    characterElaborationGuidance: string;

    // Loading states
    isGeneratingProtagonist: boolean;
    isExpandingCharacter: boolean;
    isRefiningCharacter: boolean;
    protagonistError: string | null;

    // Vault states
    savedToVaultConfirm: boolean;

    // Manual input handlers
    onManualNameChange: (value: string) => void;
    onManualDescriptionChange: (value: string) => void;
    onManualBackgroundChange: (value: string) => void;
    onManualMotivationChange: (value: string) => void;
    onManualTraitsChange: (value: string) => void;
    onCharacterGuidanceChange: (value: string) => void;

    // Action handlers
    onUseManualCharacter: () => void;
    onElaborateCharacter: () => void;
    onElaborateCharacterFurther: () => void;
    onGenerateProtagonist: () => void;
    onSaveToVault: () => void;

    // Vault handlers
    onSelectProtagonistFromVault: (character: VaultCharacter) => void;
    onNavigateToVault?: () => void;
  }

  let {
    selectedMode,
    expandedSetting,
    protagonist,
    manualCharacterName,
    manualCharacterDescription,
    manualCharacterBackground,
    manualCharacterMotivation,
    manualCharacterTraits,
    characterElaborationGuidance,
    isGeneratingProtagonist,
    isExpandingCharacter,
    isRefiningCharacter,
    protagonistError,
    savedToVaultConfirm,
    onManualNameChange,
    onManualDescriptionChange,
    onManualBackgroundChange,
    onManualMotivationChange,
    onManualTraitsChange,
    onCharacterGuidanceChange,
    onUseManualCharacter,
    onElaborateCharacter,
    onElaborateCharacterFurther,
    onGenerateProtagonist,
    onSaveToVault,
    onSelectProtagonistFromVault,
    onNavigateToVault,
  }: Props = $props();

  // Local state
  let showAdjustWithAI = $state(false);
  let showVaultPicker = $state(false);
  let loadedVaultCharacterId = $state<string | null>(null);
  let isEditingProtagonist = $state(false);
  let editName = $state("");
  let editDescription = $state("");
  let editBackground = $state("");
  let editMotivation = $state("");
  let editTraits = $state("");
  let activeElaborationSource = $state<"expand" | "refine" | null>(null);

  const hasVaultCharacters = $derived(
    characterVault.isLoaded && characterVault.characters.length > 0,
  );

  $effect(() => {
    if (!isExpandingCharacter && !isRefiningCharacter) {
      activeElaborationSource = null;
    }
  });

  function handleSelectFromVault(character: VaultCharacter) {
    loadedVaultCharacterId = character.id;
    onSelectProtagonistFromVault(character);
    showVaultPicker = false;
  }

  // Inline editing functions
  function handleStartEdit() {
    if (protagonist) {
      editName = protagonist.name;
      editDescription = protagonist.description;
      editBackground = protagonist.background ?? "";
      editMotivation = protagonist.motivation ?? "";
      
      // Failsafe for traits
      let safeTraits = "";
      if (Array.isArray(protagonist.traits)) {
        safeTraits = protagonist.traits.join(", ");
      } else if (typeof protagonist.traits === "string") {
        safeTraits = protagonist.traits;
      }
      editTraits = safeTraits;
      
      isEditingProtagonist = true;
    }
  }

  function handleSaveEdit() {
    if (editName.trim()) {
      onManualNameChange(editName);
      onManualDescriptionChange(editDescription);
      onManualBackgroundChange(editBackground);
      onManualMotivationChange(editMotivation);
      onManualTraitsChange(editTraits);
      onUseManualCharacter();
    }
    isEditingProtagonist = false;
  }

  function handleCancelEdit() {
    isEditingProtagonist = false;
  }

  function handleElaborate() {
    activeElaborationSource = "expand";
    onElaborateCharacter();
  }

  function handleRefine() {
    activeElaborationSource = "refine";
    onElaborateCharacterFurther();
  }
</script>

<div class="space-y-4">
  {#if !expandedSetting}
    <Alert.Root variant="warning">
      <AlertCircle class="h-4 w-4" />
      <Alert.Title>Missing World Setting</Alert.Title>
      <Alert.Description>
        Go back to Step 3 and expand your setting first. This helps create a
        more fitting character.
      </Alert.Description>
    </Alert.Root>
  {:else}
    <!-- Load from Vault Section -->
    <div class="space-y-1">
      <div class="flex items-center justify-between pb-1">
        <h4
          class="text-sm font-medium text-muted-foreground flex items-center gap-2"
        >
          <Archive class="h-4 w-4" />
          Load from Vault
        </h4>
        <Button
          variant="link"
          size="sm"
          class="h-auto p-0 text-xs"
          onclick={() => onNavigateToVault?.()}
        >
          Manage Vault
        </Button>
      </div>

      <div
        class="rounded-lg border border-muted-foreground/20 bg-muted/10 text-card-foreground shadow-sm"
      >
        <Collapsible.Root
          open={showVaultPicker}
          onOpenChange={(open) => (showVaultPicker = open)}
        >
          <div class="flex items-center p-3 pl-4 gap-3">
            <Collapsible.Trigger
              class="flex items-center gap-2 flex-1 text-left group/trigger w-full justify-between"
            >
              <div class="flex items-center gap-3">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 transition-colors"
                >
                  <User class="h-4 w-4 text-primary" />
                </div>
                <div class="text-left">
                  <div class="font-medium text-sm">
                    {loadedVaultCharacterId
                      ? "Character Selected"
                      : "Select a Character"}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    {loadedVaultCharacterId
                      ? "Click to change selection"
                      : "Browse your saved protagonists"}
                  </div>
                </div>
              </div>
              <div
                class="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover/trigger:bg-muted"
              >
                <ChevronDown
                  class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
                />
              </div>
            </Collapsible.Trigger>
          </div>

          <Collapsible.Content>
            <div class="border-t p-3 h-70">
              <UniversalVaultBrowser
                type="character"
                onSelect={handleSelectFromVault}
                selectedId={loadedVaultCharacterId}
                {onNavigateToVault}
              />
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    </div>

    <Separator class="mt-4 mb-2.5" />

    <!-- Create/Edit Section -->
    {#if !protagonist || isEditingProtagonist}
      <div
        class="rounded-lg border bg-card text-card-foreground shadow-sm p-4 space-y-4"
        transition:slide
      >
        <div class="space-y-1">
          <h4
            class="text-sm font-medium text-foreground flex items-center gap-2"
          >
            <User class="h-4 w-4" />
            {isEditingProtagonist ? "Edit Character" : "Create Character"}
          </h4>
          <p class="text-xs text-muted-foreground">
            {selectedMode === "adventure"
              ? "Create or describe your character for this adventure."
              : "Define the main character for your story."}
          </p>
        </div>

        {#if protagonistError}
          <Alert.Root variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <Alert.Description>{protagonistError}</Alert.Description>
          </Alert.Root>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Name"
            id="char-name"
            value={isEditingProtagonist ? editName : manualCharacterName}
            oninput={(e) =>
              isEditingProtagonist
                ? (editName = e.currentTarget.value)
                : onManualNameChange(e.currentTarget.value)}
            placeholder="e.g., Alex, Jordan..."
          />
          <Input
            label="Motivation"
            id="char-motivation"
            value={isEditingProtagonist
              ? editMotivation
              : manualCharacterMotivation}
            oninput={(e) =>
              isEditingProtagonist
                ? (editMotivation = e.currentTarget.value)
                : onManualMotivationChange(e.currentTarget.value)}
            placeholder="What drives them?"
          />
        </div>

        <div class="space-y-2">
          <Label for="char-desc">Description</Label>
          <Textarea
            id="char-desc"
            value={isEditingProtagonist
              ? editDescription
              : manualCharacterDescription}
            oninput={(e) =>
              isEditingProtagonist
                ? (editDescription = e.currentTarget.value)
                : onManualDescriptionChange(e.currentTarget.value)}
            placeholder="Physical appearance, demeanor..."
            class="min-h-20"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="char-bg">Background</Label>
            <Textarea
              id="char-bg"
              value={isEditingProtagonist
                ? editBackground
                : manualCharacterBackground}
              oninput={(e) =>
                isEditingProtagonist
                  ? (editBackground = e.currentTarget.value)
                  : onManualBackgroundChange(e.currentTarget.value)}
              placeholder="Where they come from..."
              class="min-h-20 resize-none"
            />
          </div>
          <div class="space-y-2">
            <Label for="char-traits">Traits (comma-separated)</Label>
            <Textarea
              id="char-traits"
              value={isEditingProtagonist ? editTraits : manualCharacterTraits}
              oninput={(e) =>
                isEditingProtagonist
                  ? (editTraits = e.currentTarget.value)
                  : onManualTraitsChange(e.currentTarget.value)}
              placeholder="e.g., brave, curious..."
              class="min-h-20 resize-none"
            />
          </div>
        </div>

        {#if protagonistError}
          <Alert.Root variant="destructive">
            <AlertCircle class="h-4 w-4" />
            <Alert.Description>{protagonistError}</Alert.Description>
          </Alert.Root>
        {/if}

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Name"
            id="char-name"
            value={isEditingProtagonist ? editName : manualCharacterName}
            oninput={(e) =>
              isEditingProtagonist
                ? (editName = e.currentTarget.value)
                : onManualNameChange(e.currentTarget.value)}
            placeholder="e.g., Alex, Jordan..."
          />
          <Input
            label="Motivation"
            id="char-motivation"
            value={isEditingProtagonist
              ? editMotivation
              : manualCharacterMotivation}
            oninput={(e) =>
              isEditingProtagonist
                ? (editMotivation = e.currentTarget.value)
                : onManualMotivationChange(e.currentTarget.value)}
            placeholder="What drives them?"
          />
        </div>

        <div class="space-y-2">
          <Label for="char-desc">Description</Label>
          <Textarea
            id="char-desc"
            value={isEditingProtagonist
              ? editDescription
              : manualCharacterDescription}
            oninput={(e) =>
              isEditingProtagonist
                ? (editDescription = e.currentTarget.value)
                : onManualDescriptionChange(e.currentTarget.value)}
            placeholder="Physical appearance, demeanor..."
            class="min-h-20"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="char-bg">Background</Label>
            <Textarea
              id="char-bg"
              value={isEditingProtagonist
                ? editBackground
                : manualCharacterBackground}
              oninput={(e) =>
                isEditingProtagonist
                  ? (editBackground = e.currentTarget.value)
                  : onManualBackgroundChange(e.currentTarget.value)}
              placeholder="Where they come from..."
              class="min-h-20 resize-none"
            />
          </div>
          <div class="space-y-2">
            <Label for="char-traits">Traits (comma-separated)</Label>
            <Textarea
              id="char-traits"
              value={isEditingProtagonist ? editTraits : manualCharacterTraits}
              oninput={(e) =>
                isEditingProtagonist
                  ? (editTraits = e.currentTarget.value)
                  : onManualTraitsChange(e.currentTarget.value)}
              placeholder="e.g., brave, curious..."
              class="min-h-20 resize-none"
            />
          </div>
        </div>

        <!-- AI Options & Actions -->
        <div class="space-y-4 pt-2">
          {#if !isEditingProtagonist}
            <Collapsible.Root
              open={showAdjustWithAI}
              onOpenChange={(open) => (showAdjustWithAI = open)}
            >
              <div class="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-2 text-muted-foreground"
                  onclick={() => (showAdjustWithAI = !showAdjustWithAI)}
                >
                  <Sparkles class="h-3.5 w-3.5" />
                  {showAdjustWithAI ? "Hide AI Options" : "Expand with AI"}
                  <ChevronDown
                    class="h-3 w-3 transition-transform {showAdjustWithAI
                      ? 'rotate-180'
                      : ''}"
                  />
                </Button>

                <Button
                  size="sm"
                  onclick={onUseManualCharacter}
                  disabled={!manualCharacterName.trim()}
                  class="gap-2"
                >
                  <Check class="h-3.5 w-3.5" />
                  Use Character
                </Button>
              </div>

              <Collapsible.Content>
                <div
                  class="rounded-lg border bg-card text-card-foreground shadow-sm mt-3 p-4 space-y-4"
                >
                  <div class="space-y-2">
                    <Label for="ai-guidance" class="text-xs"
                      >AI Guidance (Optional)</Label
                    >
                    <Textarea
                      id="ai-guidance"
                      value={characterElaborationGuidance}
                      oninput={(e) =>
                        onCharacterGuidanceChange(e.currentTarget.value)}
                      placeholder="e.g., Make them more cynical, add a tragic backstory..."
                      class="h-20 resize-none text-sm"
                    />
                  </div>

                  <div class="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      class="flex-1 gap-2"
                      onclick={handleElaborate}
                      disabled={isExpandingCharacter ||
                        (!manualCharacterName.trim() &&
                          !manualCharacterDescription.trim())}
                    >
                      {#if isExpandingCharacter && activeElaborationSource === "expand"}
                        <Loader2 class="h-3.5 w-3.5 animate-spin" />
                        Expanding...
                      {:else}
                        <Sparkles class="h-3.5 w-3.5" />
                        Expand Details
                      {/if}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      class="flex-1 gap-2"
                      onclick={onGenerateProtagonist}
                      disabled={isGeneratingProtagonist}
                    >
                      {#if isGeneratingProtagonist}
                        <RefreshCw class="h-3.5 w-3.5 animate-spin" />
                        Generating...
                      {:else}
                        <RefreshCw class="h-3.5 w-3.5" />
                        Generate New
                      {/if}
                    </Button>
                  </div>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          {:else}
            <!-- Edit Actions -->
            <div class="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onclick={handleCancelEdit}>
                Cancel
              </Button>
              <Button size="sm" onclick={handleSaveEdit}>Save Changes</Button>
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- Display Selected Character -->
      <div transition:slide class="pt-2">
        <Card.Root class="overflow-hidden">
          <Card.Header class="pb-2 pt-3 px-3 bg-muted/30">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20"
                >
                  <User class="h-4 w-4 text-primary" />
                </div>
                <div>
                  <Card.Title class="text-base leading-none"
                    >{protagonist.name}</Card.Title
                  >
                  <Card.Description class="text-xs mt-0.5"
                    >Protagonist</Card.Description
                  >
                </div>
              </div>

              <div class="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onclick={handleStartEdit}
                  title="Edit"
                >
                  <PenTool class="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 {savedToVaultConfirm
                    ? 'text-green-500 hover:text-green-600'
                    : 'text-muted-foreground hover:text-foreground'}"
                  onclick={onSaveToVault}
                  disabled={savedToVaultConfirm}
                  title="Save to Vault"
                >
                  {#if savedToVaultConfirm}
                    <Check class="h-3.5 w-3.5" />
                  {:else}
                    <Archive class="h-3.5 w-3.5" />
                  {/if}
                </Button>
              </div>
            </div>
          </Card.Header>

          <Card.Content class="space-y-3 p-3">
            <div class="prose prose-sm dark:prose-invert max-w-none">
              <p
                class="whitespace-pre-wrap text-muted-foreground leading-snug text-sm"
              >
                {protagonist.description}
              </p>
            </div>

            {#if protagonist.background || protagonist.motivation}
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {#if protagonist.background}
                  <div class="space-y-0.5">
                    <span class="font-medium text-foreground">Background</span>
                    <p class="text-muted-foreground leading-tight">
                      {protagonist.background}
                    </p>
                  </div>
                {/if}
                {#if protagonist.motivation}
                  <div class="space-y-0.5">
                    <span class="font-medium text-foreground">Motivation</span>
                    <p class="text-muted-foreground leading-tight">
                      {protagonist.motivation}
                    </p>
                  </div>
                {/if}
              </div>
            {/if}

            {#if protagonist.traits && (Array.isArray(protagonist.traits) ? protagonist.traits.length > 0 : typeof protagonist.traits === 'string')}
              <div class="flex flex-wrap gap-1.5 pt-0.5">
                {#if Array.isArray(protagonist.traits)}
                  {#each protagonist.traits as trait}
                    <Badge
                      variant="secondary"
                      class="font-normal text-[10px] px-1.5 h-5">{trait}</Badge
                    >
                  {/each}
                {:else if typeof protagonist.traits === "string"}
                  <Badge
                      variant="secondary"
                      class="font-normal text-[10px] px-1.5 h-5">{protagonist.traits}</Badge
                    >
                {/if}
              </div>
            {/if}

            <!-- Refine -->
            <div class="flex gap-2 pt-1">
              <Input
                value={characterElaborationGuidance}
                oninput={(e) =>
                  onCharacterGuidanceChange(e.currentTarget.value)}
                placeholder="Refinement notes..."
                class="h-7 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                class="h-7 w-7 p-0"
                onclick={handleRefine}
                disabled={isRefiningCharacter}
                title="Refine with AI"
              >
                {#if isRefiningCharacter && activeElaborationSource === "refine"}
                  <Loader2 class="h-3 w-3 animate-spin" />
                {:else}
                  <Sparkles class="h-3 w-3" />
                {/if}
              </Button>
            </div>
          </Card.Content>
        </Card.Root>
      </div>
    {/if}
  {/if}
</div>
