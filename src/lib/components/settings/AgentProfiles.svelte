<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import type { GenerationPreset } from "$lib/types";
  import type { ProviderInfo } from "$lib/services/ai/types";
  import { ask } from "@tauri-apps/plugin-dialog";
  import {
    X,
    Settings2,
    RotateCcw,
    ChevronDown,
    Bot,
    BookOpen,
    Brain,
    Lightbulb,
    ListChecks,
    Sparkles,
    Search,
    Clock,
    Download,
    Wand2,
    Languages,
    Plus,
    Trash2,
    Check,
  } from "lucide-svelte";
  import ModelSelector from "./ModelSelector.svelte";

  // Shadcn Components
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Slider } from "$lib/components/ui/slider";
  import { Textarea } from "$lib/components/ui/textarea";
  import { cn } from "$lib/utils/cn";

  interface Props {
    providerOptions: ProviderInfo[];
  }

  let { providerOptions }: Props = $props();

  const reasoningLevels = ["off", "low", "medium", "high"] as const;
  const reasoningLabels: Record<string, string> = {
    off: "Off",
    low: "Low",
    medium: "Medium",
    high: "High",
  };

  // All system services that can be assigned to profiles
  const systemServices = [
    // Classification tasks
    {
      id: "classifier",
      label: "World State",
      icon: Bot,
      description: "Extracts entities and world state",
    },
    {
      id: "lorebookClassifier",
      label: "Lorebook Import",
      icon: BookOpen,
      description: "Classifies imported entries",
    },
    {
      id: "entryRetrieval",
      label: "Entry Retrieval",
      icon: Search,
      description: "Selects relevant lorebook entries",
    },
    {
      id: "characterCardImport",
      label: "Card Import",
      icon: Download,
      description: "Converts character cards",
    },
    // Memory & Context tasks
    {
      id: "memory",
      label: "Memory System",
      icon: Brain,
      description: "Analyzes chapters and context",
    },
    {
      id: "chapterQuery",
      label: "Chapter Query",
      icon: Search,
      description: "Queries chapter details",
    },
    {
      id: "timelineFill",
      label: "Timeline Fill",
      icon: Clock,
      description: "Fills timeline gaps",
    },
    // Suggestions tasks
    {
      id: "suggestions",
      label: "Suggestions",
      icon: Lightbulb,
      description: "Generates plot suggestions",
    },
    {
      id: "actionChoices",
      label: "Action Choices",
      icon: ListChecks,
      description: "Generates RPG choices",
    },
    {
      id: "styleReviewer",
      label: "Style Reviewer",
      icon: Sparkles,
      description: "Analyzes prose quality",
    },
    {
      id: "imageGeneration",
      label: "Image Gen",
      icon: Wand2,
      description: "Generates image prompts",
    },
    // Agentic tasks
    {
      id: "loreManagement",
      label: "Lore Manager",
      icon: BookOpen,
      description: "Autonomous lore maintenance",
    },
    {
      id: "agenticRetrieval",
      label: "Agentic Retrieval",
      icon: Search,
      description: "Active context search",
    },
    {
      id: "interactiveLorebook",
      label: "Interactive Lore",
      icon: BookOpen,
      description: "Assists creating entries",
    },
    // Wizard tasks
    {
      id: "wizard:settingExpansion",
      label: "Setting Expansion",
      icon: Wand2,
      description: "Expands story settings",
    },
    {
      id: "wizard:settingRefinement",
      label: "Setting Refinement",
      icon: Wand2,
      description: "Refines story settings",
    },
    {
      id: "wizard:protagonistGeneration",
      label: "Protagonist Gen",
      icon: Wand2,
      description: "Generates protagonists",
    },
    {
      id: "wizard:characterElaboration",
      label: "Character Elaboration",
      icon: Wand2,
      description: "Elaborates characters",
    },
    {
      id: "wizard:characterRefinement",
      label: "Character Refinement",
      icon: Wand2,
      description: "Refines characters",
    },
    {
      id: "wizard:supportingCharacters",
      label: "Supporting Cast",
      icon: Wand2,
      description: "Generates NPCs",
    },
    {
      id: "wizard:openingGeneration",
      label: "Opening Gen",
      icon: Wand2,
      description: "Generates story opening",
    },
    {
      id: "wizard:openingRefinement",
      label: "Opening Refinement",
      icon: Wand2,
      description: "Refines story opening",
    },
    // Translation tasks
    {
      id: "translation:narration",
      label: "Translate Narration",
      icon: Languages,
      description: "Translates AI responses",
    },
    {
      id: "translation:input",
      label: "Translate Input",
      icon: Languages,
      description: "Translates user input to English",
    },
    {
      id: "translation:ui",
      label: "Translate UI",
      icon: Languages,
      description: "Translates world state elements",
    },
    {
      id: "translation:suggestions",
      label: "Translate Suggestions",
      icon: Languages,
      description: "Translates plot suggestions",
    },
    {
      id: "translation:actionChoices",
      label: "Translate Choices",
      icon: Languages,
      description: "Translates action choices",
    },
    {
      id: "translation:wizard",
      label: "Translate Wizard",
      icon: Languages,
      description: "Translates wizard content",
    },
  ] as const;

  // State
  let editingPresetId = $state<string | null>(null);
  let tempPreset = $state<GenerationPreset | null>(null);
  let activeTaskMenu = $state<string | null>(null); // Just stores serviceId now
  let resettingProfiles = $state(false);

  // Default profile assignments
  const defaultAssignments: Record<string, string> = {
    // Classification
    classifier: "classification",
    lorebookClassifier: "classification",
    entryRetrieval: "classification",
    characterCardImport: "classification",
    // Memory
    memory: "memory",
    chapterQuery: "memory",
    timelineFill: "memory",
    // Suggestions
    suggestions: "suggestions",
    actionChoices: "suggestions",
    styleReviewer: "suggestions",
    imageGeneration: "suggestions",
    // Agentic
    loreManagement: "agentic",
    agenticRetrieval: "agentic",
    interactiveLorebook: "agentic",
    // Wizard
    "wizard:settingExpansion": "wizard",
    "wizard:settingRefinement": "wizard",
    "wizard:protagonistGeneration": "wizard",
    "wizard:characterElaboration": "wizard",
    "wizard:characterRefinement": "wizard",
    "wizard:supportingCharacters": "wizard",
    "wizard:openingGeneration": "wizard",
    "wizard:openingRefinement": "wizard",
    // Translation
    "translation:narration": "translation",
    "translation:input": "translation",
    "translation:ui": "translation",
    "translation:suggestions": "translation",
    "translation:actionChoices": "translation",
    "translation:wizard": "translation",
  };

  function getReasoningIndex(value?: string): number {
    const index = reasoningLevels.indexOf((value ?? "off") as any);
    return index === -1 ? 0 : index;
  }

  function getReasoningValue(index: number): string {
    const clamped = Math.min(Math.max(0, index), reasoningLevels.length - 1);
    return reasoningLevels[clamped];
  }

  function getServiceSettings(serviceId: string): any {
    const presetId = settings.servicePresetAssignments[serviceId];
    if (!presetId) return null;
    const preset = settings.generationPresets.find((p) => p.id === presetId);
    return preset ? { presetId: preset.id, ...preset } : null;
  }

  function getServicesForProfile(profileId: string | "custom") {
    return systemServices.filter((service) => {
      const assignedPresetId = settings.servicePresetAssignments[service.id];
      if (profileId === "custom") {
        return !assignedPresetId;
      }
      return assignedPresetId === profileId;
    });
  }

  function createNewPreset() {
    const newId = `preset-${Date.now()}`;
    const defaultProfile = settings.getMainNarrativeProfile();
    tempPreset = {
      id: newId,
      name: "New Profile",
      description: "",
      profileId:
        defaultProfile?.id ?? settings.getDefaultProfileIdForProvider(),
      model: settings.apiSettings.defaultModel ?? "",
      temperature: 0.7,
      maxTokens: 4096,
      reasoningEffort: "off",
      providerOnly: [],
      manualBody: "",
    };
    editingPresetId = newId;
  }

  function startEditingPreset(preset: GenerationPreset) {
    tempPreset = { ...preset, providerOnly: [...preset.providerOnly] };
    editingPresetId = preset.id;
  }

  function cancelEditingPreset() {
    editingPresetId = null;
    tempPreset = null;
  }

  async function handleSavePreset() {
    if (!tempPreset) return;
    if (!tempPreset.model) {
      await ask("Please select or enter a model.", {
        title: "Validation Error",
        kind: "error",
      });
      return;
    }

    const index = settings.generationPresets.findIndex(
      (p) => p.id === tempPreset!.id,
    );
    if (index >= 0) {
      settings.generationPresets[index] = tempPreset;
    } else {
      settings.generationPresets = [...settings.generationPresets, tempPreset];
    }
    await settings.saveGenerationPresets();

    editingPresetId = null;
    tempPreset = null;
  }

  async function handleDeletePreset(presetId: string) {
    const preset = settings.generationPresets.find((p) => p.id === presetId);
    if (!preset) return;

    const confirmed = await ask(
      `Delete profile "${preset.name}"? Tasks assigned to it will revert to Unassigned.`,
      {
        title: "Delete Profile",
        kind: "warning",
      },
    );

    if (confirmed) {
      settings.generationPresets = settings.generationPresets.filter(
        (p) => p.id !== presetId,
      );
      await settings.saveGenerationPresets();

      // Reset assignments
      for (const service of systemServices) {
        if (settings.servicePresetAssignments[service.id] === presetId) {
          settings.setServicePresetId(service.id, "");
        }
      }
    }
  }

  async function handleAssignPreset(
    serviceId: string,
    presetId: string | "custom",
  ) {
    settings.setServicePresetId(
      serviceId,
      presetId === "custom" ? "" : presetId,
    );
  }

  async function handleResetProfiles() {
    await settings.resetGenerationPresets();

    // Assign tasks to their default profiles
    for (const service of systemServices) {
      const presetId = defaultAssignments[service.id] || "";
      settings.setServicePresetId(service.id, presetId);
    }
  }

  function handleTaskClick(e: MouseEvent, serviceId: string) {
    e.stopPropagation();
    // Toggle the menu - if clicking same task, close it
    if (activeTaskMenu === serviceId) {
      activeTaskMenu = null;
    } else {
      activeTaskMenu = serviceId;
    }
  }

  async function moveTask(
    serviceId: string,
    targetProfileId: string | "custom",
  ) {
    await handleAssignPreset(serviceId, targetProfileId);
    activeTaskMenu = null;
  }

  // Helper to render a task item with inline menu
  function isTaskMenuOpen(serviceId: string): boolean {
    return activeTaskMenu === serviceId;
  }

  // Proxy states for sliders when editing
  let tempPresetTemperature = $state([0.7]);
  let tempPresetMaxTokens = $state([4096]);
  let tempPresetReasoning = $state([0]);

  $effect(() => {
    if (tempPreset) {
      tempPresetTemperature = [tempPreset.temperature];
      tempPresetMaxTokens = [tempPreset.maxTokens];
      tempPresetReasoning = [getReasoningIndex(tempPreset.reasoningEffort)];
    }
  });

  function updateTempPresetTemperature(v: number[]) {
    if (tempPreset) tempPreset.temperature = v[0];
  }

  function updateTempPresetMaxTokens(v: number[]) {
    if (tempPreset) tempPreset.maxTokens = v[0];
  }

  function updateTempPresetReasoning(v: number[]) {
    if (tempPreset) tempPreset.reasoningEffort = getReasoningValue(v[0]) as any;
  }
</script>

<div class="pt-6 border-t">
  <div class="flex items-start sm:items-center justify-between mb-4">
    <div>
      <h3 class="text-base font-medium">Agent Profiles</h3>
      <p class="text-xs text-muted-foreground">
        Click a task to move it between profiles.
      </p>
    </div>
    <div class="flex items-center gap-2">
      {#if resettingProfiles}
        <span class="text-xs font-medium text-muted-foreground">
          Reset all?
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="hover:bg-transparent text-muted-foreground hover:text-foreground w-5 px-0"
          onclick={() => (resettingProfiles = false)}
          title="Cancel"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="hover:bg-transparent text-destructive w-5 px-0"
          onclick={() => {
            resettingProfiles = false;
            handleResetProfiles();
          }}
          title="Confirm Reset"
        >
          <Check class="h-3.5 w-3.5" />
        </Button>
      {:else}
        <Button
          variant="ghost"
          size="sm"
          onclick={() => (resettingProfiles = true)}
          title="Reset all profiles to defaults"
          class="text-xs"
        >
          <RotateCcw class="h-3 w-3 mr-1" />
          Reset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onclick={createNewPreset}
          class="text-xs"
        >
          <Plus class="h-3 w-3 mr-1" />
          New Profile
        </Button>
      {/if}
    </div>
  </div>

  {#if editingPresetId && tempPreset}
    <Card.Root class="mb-6">
      <Card.Header class="pb-3">
        <div class="flex justify-between items-start">
          <Card.Title class="text-base">
            {tempPreset.id === editingPresetId &&
            !settings.generationPresets.find((p) => p.id === tempPreset!.id)
              ? "Create Profile"
              : "Edit Profile"}
          </Card.Title>
          <Button
            variant="text"
            size="icon"
            class="h-6 w-6 -mr-2 -mt-2"
            onclick={cancelEditingPreset}
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      </Card.Header>

      <Card.Content class="grid gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-2">
            <Label>Name</Label>
            <Input
              type="text"
              bind:value={tempPreset.name}
              placeholder="e.g. Classification, Memory"
            />
          </div>
          <div class="grid gap-2">
            <Label>Description</Label>
            <Input
              type="text"
              bind:value={tempPreset.description}
              placeholder="Brief description"
            />
          </div>
        </div>

        <ModelSelector
          profileId={tempPreset?.profileId ?? null}
          model={tempPreset?.model ?? ""}
          onProfileChange={(id) => {
            if (tempPreset) tempPreset.profileId = id;
          }}
          onModelChange={(m) => {
            if (tempPreset) tempPreset.model = m;
          }}
        />

        <div class="grid grid-cols-2 gap-6">
          <div class="grid gap-4">
            <div class="flex justify-between">
              <Label>Temperature</Label>
              <span class="text-xs text-muted-foreground"
                >{tempPreset.temperature.toFixed(2)}</span
              >
            </div>
            <Slider
              bind:value={tempPresetTemperature}
              min={0}
              max={2}
              step={0.05}
              onValueChange={updateTempPresetTemperature}
            />
          </div>

          <div class="grid gap-4">
            <div class="flex justify-between">
              <Label>Max Tokens</Label>
              <span class="text-xs text-muted-foreground"
                >{tempPreset.maxTokens}</span
              >
            </div>
            <Slider
              bind:value={tempPresetMaxTokens}
              min={256}
              max={32000}
              step={256}
              onValueChange={updateTempPresetMaxTokens}
            />
          </div>
        </div>

        <div class="grid gap-4">
          <div class="flex justify-between">
            <Label
              >Thinking: {reasoningLabels[tempPreset.reasoningEffort]}</Label
            >
          </div>
          <Slider
            bind:value={tempPresetReasoning}
            min={0}
            max={3}
            step={1}
            onValueChange={updateTempPresetReasoning}
          />
          <div class="flex justify-between text-xs text-muted-foreground px-1">
            <span>Off</span>
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
          </div>
        </div>

        {#if settings.advancedRequestSettings.manualMode}
          <div class="pt-2 border-t">
            <Label class="mb-2 block">Manual Request Body (JSON)</Label>
            <Textarea
              bind:value={tempPreset.manualBody}
              class="min-h-[100px] font-mono text-xs"
              rows={4}
              placeholder={'{"temperature": 0.7, "top_p": 0.9}'}
            />
            <p class="text-xs text-muted-foreground mt-1">
              Overrides request parameters; messages and tools are managed by
              Aventuras.
            </p>
          </div>
        {/if}
      </Card.Content>

      <Card.Footer class="flex justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onclick={cancelEditingPreset}
          >Cancel</Button
        >
        <Button
          size="sm"
          onclick={handleSavePreset}
          disabled={!tempPreset?.model}>Save Profile</Button
        >
      </Card.Footer>
    </Card.Root>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
    {#each settings.generationPresets as preset (preset.id)}
      {#if preset.id !== editingPresetId}
        <Card.Root class="flex flex-col h-full">
          <div class="flex justify-between items-start border-b p-3 pb-2">
            <div class="min-w-0">
              <div class="font-medium text-sm truncate" title={preset.name}>
                {preset.name}
              </div>
              <div
                class="text-xs text-muted-foreground truncate"
                title={preset.model}
              >
                {preset.model}
              </div>
            </div>
            <div class="flex gap-1 shrink-0 ml-2">
              <Button
                variant="text"
                size="icon"
                class="h-6 w-6 text-muted-foreground hover:text-foreground"
                onclick={() => startEditingPreset(preset)}
                title="Edit Profile"
              >
                <Settings2 class="h-3 w-3" />
              </Button>
              <Button
                variant="text"
                size="icon"
                class="h-6 w-6 text-muted-foreground hover:text-red-500"
                onclick={() => handleDeletePreset(preset.id)}
                title="Delete Profile"
              >
                <Trash2 class="h-3 w-3" />
              </Button>
            </div>
          </div>

          <Card.Content class="flex-1 flex flex-col gap-2 p-3 bg-muted/30">
            {#each getServicesForProfile(preset.id) as service (service.id)}
              <div
                class="flex flex-col rounded-md bg-background border shadow-sm transition-all overflow-hidden"
              >
                <button
                  class="flex items-center gap-2 p-2 select-none text-left w-full transition-colors group hover:bg-muted/50"
                  onclick={(e) => handleTaskClick(e, service.id)}
                  title={service.description}
                >
                  <service.icon class="h-3 w-3 text-primary shrink-0" />
                  <span class="text-xs truncate flex-1">{service.label}</span>
                  <ChevronDown
                    class="h-3 w-3 text-muted-foreground ml-auto transition-transform {isTaskMenuOpen(
                      service.id,
                    )
                      ? 'rotate-180'
                      : ''}"
                  />
                </button>

                {#if isTaskMenuOpen(service.id)}
                  <div class="bg-muted/50 border-t p-1 flex flex-col gap-0.5">
                    <div
                      class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Move to...
                    </div>
                    {#each settings.generationPresets as targetPreset}
                      {#if targetPreset.id !== preset.id}
                        <button
                          class="text-left px-2 py-1.5 text-xs hover:bg-background rounded-sm transition-colors truncate w-full"
                          onclick={(e) => {
                            e.stopPropagation();
                            moveTask(service.id, targetPreset.id);
                          }}
                        >
                          {targetPreset.name}
                        </button>
                      {/if}
                    {/each}
                    <button
                      class="text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-background rounded-sm transition-colors border-t mt-1 pt-1 w-full"
                      onclick={(e) => {
                        e.stopPropagation();
                        moveTask(service.id, "custom");
                      }}
                    >
                      Unassigned
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
            {#if getServicesForProfile(preset.id).length === 0}
              <div
                class="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-2"
              >
                No tasks assigned
              </div>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}
    {/each}

    <!-- Unassigned Card -->
    <Card.Root class="flex flex-col h-full border-dashed bg-muted/20">
      <div class="border-b p-3 pb-2">
        <div class="font-medium text-muted-foreground text-sm">Unassigned</div>
      </div>
      <Card.Content
        class="flex-1 flex flex-col gap-2 p-3 transition-all {getServicesForProfile(
          'custom',
        ).length > 0
          ? 'bg-muted/30'
          : ''}"
      >
        {#if getServicesForProfile("custom").length > 0}
          <div
            class="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1.5 mb-2"
          >
            Unassigned agents will not work. Assign them to a profile.
          </div>
        {/if}
        {#each getServicesForProfile("custom") as service (service.id)}
          <div
            class="flex flex-col rounded-md bg-background border shadow-sm transition-all overflow-hidden"
          >
            <button
              class="flex items-center gap-2 p-2 select-none text-left w-full transition-colors group hover:bg-muted/50"
              onclick={(e) => handleTaskClick(e, service.id)}
              title={service.description}
            >
              <service.icon class="h-3 w-3 text-muted-foreground shrink-0" />
              <span class="text-xs truncate flex-1">{service.label}</span>
              <ChevronDown
                class="h-3 w-3 text-muted-foreground ml-auto transition-transform {isTaskMenuOpen(
                  service.id,
                )
                  ? 'rotate-180'
                  : ''}"
              />
            </button>

            {#if isTaskMenuOpen(service.id)}
              <div class="bg-muted/50 border-t p-1 flex flex-col gap-0.5">
                <div
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Move to...
                </div>
                {#each settings.generationPresets as targetPreset}
                  <button
                    class="text-left px-2 py-1.5 text-xs hover:bg-background rounded-sm transition-colors truncate w-full"
                    onclick={(e) => {
                      e.stopPropagation();
                      moveTask(service.id, targetPreset.id);
                    }}
                  >
                    {targetPreset.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
        {#if getServicesForProfile("custom").length === 0}
          <div
            class="flex-1 flex items-center justify-center text-xs text-muted-foreground italic py-2"
          >
            All tasks assigned
          </div>
        {/if}
      </Card.Content>
    </Card.Root>
  </div>
</div>
