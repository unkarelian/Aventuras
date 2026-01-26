<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Loader2,
    Check,
    Sparkles,
    X,
    PenTool,
    Wand2,
    Rocket,
    Search,
    Skull,
    Heart,
    Building,
    Archive,
    ChevronDown,
    Send,
    MapPin,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import { scenarioVault } from "$lib/stores/scenarioVault.svelte";
  import type { VaultScenario } from "$lib/types";
  import type { ExpandedSetting, GeneratedCharacter } from "../wizardTypes";
  import { QUICK_START_SEEDS } from "$lib/services/templates";

  // Shadcn Components
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";
  import { Badge } from "$lib/components/ui/badge";
  import * as Collapsible from "$lib/components/ui/collapsible";

  interface Props {
    settingSeed: string;
    expandedSetting: ExpandedSetting | null;
    settingElaborationGuidance: string;
    isExpandingSetting: boolean;
    isRefiningSetting: boolean;
    settingError: string | null;
    isEditingSetting: boolean;
    selectedScenarioId: string | null;
    importedCardNpcs: GeneratedCharacter[];
    cardImportError: string | null;
    isImportingCard: boolean;
    savedScenarioToVaultConfirm: boolean;
    showScenarioVaultPicker: boolean;
    customGenre: string; // NEW
    onSettingSeedChange: (value: string) => void;
    onGuidanceChange: (value: string) => void;
    onCustomGenreChange: (value: string) => void; // NEW
    onUseAsIs: () => void;
    onExpandSetting: () => void;
    onExpandFurther: () => void;
    onEditSetting: () => void;
    onCancelEdit: () => void;
    onSelectScenario: (id: string) => void;
    onCardImport: (event: Event) => void;
    onClearCardImport: () => void;
    onSaveToVault: () => void;
    onShowVaultPickerChange: (show: boolean) => void;
    onSelectFromVault: (scenario: VaultScenario) => void;
    cardImportFileInputRef: (el: HTMLInputElement | null) => void;
    scenarioCarouselRef: (el: HTMLDivElement | null) => void;
    onCarouselScroll: () => void;
    onNavigateToVault?: () => void;
  }

  let {
    settingSeed,
    expandedSetting,
    settingElaborationGuidance,
    isExpandingSetting,
    isRefiningSetting,
    settingError,
    isEditingSetting,
    selectedScenarioId,
    importedCardNpcs,
    cardImportError,
    isImportingCard,
    savedScenarioToVaultConfirm,
    showScenarioVaultPicker,
    customGenre,
    onSettingSeedChange,
    onGuidanceChange,
    onCustomGenreChange,
    onUseAsIs,
    onExpandSetting,
    onExpandFurther,
    onEditSetting,
    onCancelEdit,
    onSelectScenario,
    onCardImport,
    onClearCardImport,
    onSaveToVault,
    onShowVaultPickerChange,
    onSelectFromVault,
    cardImportFileInputRef,
    scenarioCarouselRef,
    onCarouselScroll,
    onNavigateToVault,
  }: Props = $props();

  const templateIcons: Record<string, typeof Wand2> = {
    "fantasy-adventure": Wand2,
    "scifi-exploration": Rocket,
    "mystery-investigation": Search,
    "horror-survival": Skull,
    "slice-of-life": Heart,
    "historical-drama": Building,
  };

  const hasUserPlaceholder = $derived(settingSeed.includes("{{user}}"));
  const hasVaultScenarios = $derived(
    scenarioVault.isLoaded && scenarioVault.scenarios.length > 0,
  );

  let showExpandOptions = $state(false);
  let loadedVaultScenarioId = $state<string | null>(null);
  let editDescription = $state("");
  let isEditingDescription = $state(false);

  function handleSelectFromVault(scenario: VaultScenario) {
    loadedVaultScenarioId = scenario.id;
    onSelectFromVault(scenario);
  }

  function handleEditDescription() {
    editDescription = expandedSetting?.description ?? "";
    isEditingDescription = true;
  }

  function handleSaveDescription() {
    if (editDescription.trim()) {
      onSettingSeedChange(editDescription);
      onUseAsIs();
    }
    isEditingDescription = false;
  }
</script>

<div class="space-y-1 pb-3">
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
      open={showScenarioVaultPicker}
      onOpenChange={onShowVaultPickerChange}
    >
      <div class="flex items-center p-3 pl-4 gap-3">
        <Collapsible.Trigger
          class="flex items-center gap-2 flex-1 text-left group/trigger w-full justify-between"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 transition-colors"
            >
              <MapPin class="h-4 w-4 text-primary" />
            </div>
            <div class="text-left">
              <div class="font-medium text-sm">
                {selectedScenarioId && loadedVaultScenarioId
                  ? "Scenario Selected"
                  : "Select a Scenario"}
              </div>
              <div class="text-xs text-muted-foreground">
                {selectedScenarioId && loadedVaultScenarioId
                  ? "Click to change selection"
                  : "Browse your saved worlds"}
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
            type="scenario"
            onSelect={handleSelectFromVault}
            selectedId={loadedVaultScenarioId}
            {onNavigateToVault}
          />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
</div>
<h4
  class="text-sm font-medium text-muted-foreground flex items-center gap-2 pb-2"
>
  <MapPin class="h-4 w-4" />
  Quick Start Templates
</h4>
<div class="grid gap-2 grid-cols-2 sm:grid-cols-3 pb-4">
  {#each QUICK_START_SEEDS as seed (seed.id)}
    {@const Icon = templateIcons[seed.id] ?? Sparkles}
    <button
      onclick={() => onSelectScenario(seed.id)}
      class="group relative flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-all hover:bg-accent hover:text-accent-foreground {selectedScenarioId ===
      seed.id
        ? 'border-primary bg-primary/5 ring-1 ring-primary'
        : 'bg-muted/20 hover:bg-muted/40 border-muted-foreground/20'}"
    >
      <div class="flex items-center gap-2 min-w-0">
        <Icon
          class="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
        />
        <span class="text-sm font-medium leading-none truncate"
          >{seed.name}</span
        >
      </div>
      {#if selectedScenarioId === seed.id}
        <Check class="h-3 w-3 text-primary shrink-0" />
      {/if}
    </button>
  {/each}
</div>

<!-- SECTION 2: Customization (Genre & Setting) -->
<div class="grid gap-4 sm:grid-cols-1">
  <!-- Genre Input -->
  <div class="space-y-1">
    <Input
      label="Genre"
      id="genre-input"
      value={customGenre}
      oninput={(e) => onCustomGenreChange(e.currentTarget.value)}
      placeholder="e.g. Dark Fantasy, Cyberpunk Noir, etc."
    />
    <p class="text-[0.8rem] text-muted-foreground">
      A short tag describing the style/tone of your story.
    </p>
  </div>

  <!-- Setting Description -->
  <div class="space-y-2">
    <Label for="setting-input">World Description</Label>
    <Textarea
      id="setting-input"
      value={settingSeed}
      oninput={(e) => onSettingSeedChange(e.currentTarget.value)}
      placeholder="Describe your world... (e.g., A kingdom where music is magic)"
      class="min-h-25 resize-none mt-1"
    />

    {#if hasUserPlaceholder}
      <div
        class="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground"
      >
        <Badge variant="outline" class="font-mono text-[10px] h-5"
          >{"{{user}}"}</Badge
        >
        <span>will be replaced with your character's name</span>
      </div>
    {/if}

    <div class="flex items-center justify-between gap-2 pt-1">
      <Button
        variant="outline"
        size="sm"
        class="gap-2 text-muted-foreground"
        onclick={() => (showExpandOptions = !showExpandOptions)}
      >
        <Sparkles class="h-3.5 w-3.5" />
        {showExpandOptions ? "Hide AI Options" : "Expand with AI"}
        <ChevronDown
          class="h-3 w-3 transition-transform {showExpandOptions
            ? 'rotate-180'
            : ''}"
        />
      </Button>

      <Button
        size="sm"
        onclick={onUseAsIs}
        disabled={!settingSeed.trim()}
        class="gap-2"
      >
        <Check class="h-3.5 w-3.5" />
        Use Description
      </Button>
    </div>

    <!-- AI Expansion Panel -->
    {#if showExpandOptions}
      <div
        class="rounded-lg border text-card-foreground shadow-sm px-3 pt-1 pb-3 space-y-3 bg-muted/10"
        transition:slide={{ duration: 150 }}
      >
        <div class="space-y-1.5">
          <Label for="ai-guidance" class="text-xs">AI Guidance (Optional)</Label
          >
          <Textarea
            id="ai-guidance"
            value={settingElaborationGuidance}
            oninput={(e) => onGuidanceChange(e.currentTarget.value)}
            placeholder="e.g., Focus on dark gothic atmosphere, add steampunk elements..."
            class="h-16 resize-none text-sm mt-1"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          class="w-full gap-2"
          onclick={onExpandSetting}
          disabled={isExpandingSetting || !settingSeed.trim()}
        >
          {#if isExpandingSetting}
            <Loader2 class="h-3.5 w-3.5 animate-spin" />
            Expanding...
          {:else}
            <Sparkles class="h-3.5 w-3.5" />
            Generate Expanded World
          {/if}
        </Button>
      </div>
    {/if}

    {#if settingError}
      <p class="text-sm text-destructive">{settingError}</p>
    {/if}
  </div>
</div>

<!-- Card Import Status -->
{#if importedCardNpcs.length > 0}
  <div
    class="flex items-center justify-between rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm"
  >
    <span class="flex items-center gap-2 text-green-500">
      <Check class="h-4 w-4" />
      Imported NPCs: {importedCardNpcs.map((n) => n.name).join(", ")}
    </span>
    <Button
      variant="ghost"
      size="icon"
      class="h-6 w-6 text-muted-foreground hover:text-foreground"
      onclick={onClearCardImport}
    >
      <X class="h-3.5 w-3.5" />
    </Button>
  </div>
{/if}
{#if cardImportError}
  <p class="text-sm text-destructive">{cardImportError}</p>
{/if}

<!-- Selected Expanded Setting Display -->
{#if expandedSetting}
  <Separator class="my-4" />
  <div
    class="rounded-lg border bg-card text-card-foreground shadow-sm space-y-2 p-2"
    transition:slide
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Check class="h-4 w-4 text-green-500" />
        <span class="font-medium">Active World Setting</span>
      </div>

      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 {savedScenarioToVaultConfirm
            ? 'text-green-500 hover:text-green-600'
            : 'text-muted-foreground'}"
          onclick={onSaveToVault}
          disabled={!settingSeed.trim() || savedScenarioToVaultConfirm}
        >
          {#if savedScenarioToVaultConfirm}
            <Check class="h-3.5 w-3.5" /> Saved
          {:else}
            <Archive class="h-3.5 w-3.5" /> Save
          {/if}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1.5 text-muted-foreground"
          onclick={isEditingDescription
            ? handleSaveDescription
            : handleEditDescription}
        >
          {#if isEditingDescription}
            <Check class="h-3.5 w-3.5" /> Done
          {:else}
            <PenTool class="h-3.5 w-3.5" /> Edit
          {/if}
        </Button>
      </div>
    </div>

    <!-- Content -->
    <div class="space-y-3">
      {#if isEditingDescription}
        <Textarea
          value={editDescription}
          oninput={(e) => (editDescription = e.currentTarget.value)}
          class="min-h-37.5"
        />
      {:else}
        <div
          class="prose prose-sm dark:prose-invert max-w-none text-muted-foreground"
        >
          <p class="whitespace-pre-wrap">{expandedSetting.description}</p>
        </div>
      {/if}

      <!-- Locations -->
      {#if expandedSetting.keyLocations.length > 0}
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="font-medium text-foreground py-0.5">Locations:</span>
          {#each expandedSetting.keyLocations as loc}
            <Badge variant="secondary" class="font-normal">{loc.name}</Badge>
          {/each}
        </div>
      {/if}

      <!-- Themes -->
      {#if expandedSetting.themes.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each expandedSetting.themes as theme}
            <Badge variant="outline" class="text-[10px]">{theme}</Badge>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Refine -->
    <div class="flex gap-2">
      <Input
        value={settingElaborationGuidance}
        oninput={(e) => onGuidanceChange(e.currentTarget.value)}
        placeholder="Refinement notes..."
        class="h-8 text-xs"
      />
      <Button
        variant="outline"
        size="sm"
        class="h-8 w-8 p-0"
        onclick={onExpandFurther}
        disabled={isRefiningSetting}
        title="Refine with AI"
      >
        {#if isRefiningSetting}
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
        {:else}
          <Sparkles class="h-3.5 w-3.5" />
        {/if}
      </Button>
    </div>
  </div>
{/if}
