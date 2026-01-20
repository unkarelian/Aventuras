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
  } from "lucide-svelte";
  import ModelSelector from "./ModelSelector.svelte";

  interface Props {
    providerOptions: ProviderInfo[];
    onManageProfiles: () => void;
  }

  let { providerOptions, onManageProfiles }: Props = $props();

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
    {
      id: "backgroundImageGeneration",
      label: "Background Image Gen",
      icon: Wand2,
      description: "Generates background image prompts",
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
  ] as const;

  // State
  let editingPresetId = $state<string | null>(null);
  let tempPreset = $state<GenerationPreset | null>(null);
  let activeTaskMenu = $state<string | null>(null); // Just stores serviceId now

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
    backgroundImageGeneration: "suggestions",
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
    const confirmed = await ask(
      "Reset all profiles to their default values and task assignments?",
      {
        title: "Reset Profiles",
        kind: "warning",
      },
    );
    if (!confirmed) return;

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
</script>

<div class="border-t border-surface-700 pt-6">
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-sm font-medium text-surface-200">Agent Profiles</h3>
      <p class="text-xs text-surface-500">
        Click a task to move it between profiles.
      </p>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="btn btn-ghost text-xs flex items-center gap-1 text-surface-400 hover:text-surface-200"
        onclick={handleResetProfiles}
        title="Reset all profiles to defaults"
      >
        <RotateCcw class="h-3 w-3" />
        Reset
      </button>
      <button class="btn btn-secondary text-xs" onclick={createNewPreset}>
        + New Profile
      </button>
    </div>
  </div>

  {#if editingPresetId && tempPreset}
    <div class="card bg-surface-800 p-4 border border-surface-600 mb-6">
      <div class="space-y-4">
        <div class="flex justify-between items-start">
          <h4 class="text-sm font-medium text-surface-100">
            {tempPreset.id === editingPresetId &&
            !settings.generationPresets.find((p) => p.id === tempPreset!.id)
              ? "Create Profile"
              : "Edit Profile"}
          </h4>
          <button
            class="text-surface-400 hover:text-surface-200"
            onclick={cancelEditingPreset}
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-surface-400">Name</label>
            <input
              type="text"
              class="input input-sm w-full mt-1"
              bind:value={tempPreset.name}
              placeholder="e.g. Classification, Memory"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-surface-400"
              >Description</label
            >
            <input
              type="text"
              class="input input-sm w-full mt-1"
              bind:value={tempPreset.description}
              placeholder="Brief description"
            />
          </div>
        </div>

        <ModelSelector
          profileId={tempPreset?.profileId ?? null}
          model={tempPreset?.model ?? ''}
          onProfileChange={(id) => {
            if (tempPreset) tempPreset.profileId = id;
          }}
          onModelChange={(m) => {
            if (tempPreset) tempPreset.model = m;
          }}
          {onManageProfiles}
        />

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400">
              Temperature: {tempPreset.temperature.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              bind:value={tempPreset.temperature}
              class="w-full h-2"
            />
          </div>
          <div>
            <label class="mb-1 block text-xs font-medium text-surface-400">
              Max Tokens: {tempPreset.maxTokens}
            </label>
            <input
              type="range"
              min="256"
              max="32000"
              step="256"
              bind:value={tempPreset.maxTokens}
              class="w-full h-2"
            />
          </div>
        </div>

        <div>
          <label class="mb-1 block text-xs font-medium text-surface-400">
            Thinking: {reasoningLabels[tempPreset.reasoningEffort]}
          </label>
          <input
            type="range"
            min="0"
            max="3"
            step="1"
            value={getReasoningIndex(tempPreset.reasoningEffort)}
            onchange={(e) => {
              if (tempPreset)
                tempPreset.reasoningEffort = getReasoningValue(
                  parseInt(e.currentTarget.value),
                ) as any;
            }}
            class="w-full h-2"
          />
        </div>

        {#if settings.advancedRequestSettings.manualMode}
          <div class="pt-2 border-t border-surface-700">
            <label class="mb-1 block text-xs font-medium text-surface-400">
              Manual Request Body (JSON)
            </label>
            <textarea
              bind:value={tempPreset.manualBody}
              class="input text-xs min-h-[100px] resize-y font-mono w-full"
              rows="4"
              placeholder={'{"temperature": 0.7, "top_p": 0.9}'}
            ></textarea>
            <p class="text-xs text-surface-500 mt-1">
              Overrides request parameters; messages and tools are managed by
              Aventuras.
            </p>
          </div>
        {/if}

        <div class="flex justify-end gap-2 pt-2">
          <button class="btn btn-ghost text-xs" onclick={cancelEditingPreset}
            >Cancel</button
          >
          <button class="btn btn-primary text-xs" onclick={handleSavePreset}
            >Save Profile</button
          >
        </div>
      </div>
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
    {#each settings.generationPresets as preset (preset.id)}
      {#if preset.id !== editingPresetId}
        <div
          class="card p-3 flex flex-col gap-3 transition-colors border-2 border-transparent bg-surface-800"
          role="region"
          aria-label="{preset.name} Profile"
        >
          <div
            class="flex justify-between items-start border-b border-surface-700 pb-2"
          >
            <div class="min-w-0">
              <div
                class="font-medium text-surface-100 text-sm truncate"
                title={preset.name}
              >
                {preset.name}
              </div>
              <div
                class="text-xs text-surface-500 truncate"
                title={preset.model}
              >
                {preset.model}
              </div>
            </div>
            <div class="flex gap-1 shrink-0 ml-2">
              <button
                class="p-1 hover:text-accent-400 text-surface-400 transition-colors"
                onclick={() => startEditingPreset(preset)}
                title="Edit Profile"
              >
                <Settings2 class="h-3 w-3" />
              </button>
              <button
                class="p-1 hover:text-red-400 text-surface-400 transition-colors"
                onclick={() => handleDeletePreset(preset.id)}
                title="Delete Profile"
              >
                <X class="h-3 w-3" />
              </button>
            </div>
          </div>

          <div
            class="flex-1 flex flex-col gap-2 min-h-[60px] bg-surface-900/30 rounded p-2"
          >
            {#each getServicesForProfile(preset.id) as service (service.id)}
              <div
                class="flex flex-col rounded bg-surface-700 border border-surface-600 shadow-sm transition-all overflow-hidden"
                class:bg-surface-600={isTaskMenuOpen(service.id)}
                class:border-surface-500={isTaskMenuOpen(service.id)}
              >
                <button
                  class="flex items-center gap-2 p-2 select-none text-left w-full transition-colors group"
                  onclick={(e) => handleTaskClick(e, service.id)}
                  title={service.description}
                >
                  <service.icon class="h-3 w-3 text-accent-400 shrink-0" />
                  <span class="text-xs text-surface-100 truncate"
                    >{service.label}</span
                  >
                  <ChevronDown
                    class="h-3 w-3 text-surface-500 ml-auto transition-transform {isTaskMenuOpen(
                      service.id,
                    )
                      ? 'rotate-180'
                      : ''}"
                  />
                </button>

                {#if isTaskMenuOpen(service.id)}
                  <div
                    class="bg-surface-900/20 border-t border-surface-600/50 p-1 flex flex-col gap-0.5"
                  >
                    <div
                      class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                    >
                      Move to...
                    </div>
                    {#each settings.generationPresets as targetPreset}
                      {#if targetPreset.id !== preset.id}
                        <button
                          class="text-left px-2 py-1.5 text-xs text-surface-200 hover:bg-surface-500/20 rounded transition-colors truncate"
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
                      class="text-left px-2 py-1.5 text-xs text-surface-400 hover:bg-surface-500/20 rounded transition-colors border-t border-surface-600/50 mt-1 pt-1"
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
                class="flex-1 flex items-center justify-center text-xs text-surface-600 italic py-2"
              >
                No tasks assigned
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}

    <!-- Unassigned Card -->
    <div
      class="card p-3 flex flex-col gap-3 border-2 border-dashed border-surface-600 bg-surface-900/20"
      role="region"
      aria-label="Unassigned Tasks"
    >
      <div
        class="font-medium text-surface-300 text-sm pb-2 border-b border-surface-700/50"
      >
        Unassigned
      </div>
      <div
        class="flex-1 flex flex-col gap-2 rounded p-2 transition-all {getServicesForProfile(
          'custom',
        ).length > 0
          ? 'bg-surface-900/30 min-h-[60px]'
          : ''}"
      >
        {#if getServicesForProfile("custom").length > 0}
          <div
            class="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 mb-2"
          >
            Unassigned agents will not work. Assign them to a profile.
          </div>
        {/if}
        {#each getServicesForProfile("custom") as service (service.id)}
          <div
            class="flex flex-col rounded bg-surface-700 border border-surface-600 shadow-sm transition-all overflow-hidden"
            class:bg-surface-600={isTaskMenuOpen(service.id)}
            class:border-surface-500={isTaskMenuOpen(service.id)}
          >
            <button
              class="flex items-center gap-2 p-2 select-none text-left w-full transition-colors group"
              onclick={(e) => handleTaskClick(e, service.id)}
              title={service.description}
            >
              <service.icon class="h-3 w-3 text-surface-400 shrink-0" />
              <span class="text-xs text-surface-100 truncate"
                >{service.label}</span
              >
              <ChevronDown
                class="h-3 w-3 text-surface-500 ml-auto transition-transform {isTaskMenuOpen(
                  service.id,
                )
                  ? 'rotate-180'
                  : ''}"
              />
            </button>

            {#if isTaskMenuOpen(service.id)}
              <div
                class="bg-surface-900/20 border-t border-surface-600/50 p-1 flex flex-col gap-0.5"
              >
                <div
                  class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-surface-500"
                >
                  Move to...
                </div>
                {#each settings.generationPresets as targetPreset}
                  <button
                    class="text-left px-2 py-1.5 text-xs text-surface-200 hover:bg-surface-500/20 rounded transition-colors truncate"
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
            class="flex-1 flex items-center justify-center text-xs text-surface-600 italic py-2 -mt-1.5"
          >
            All tasks assigned
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
