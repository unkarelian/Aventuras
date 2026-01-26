<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { promptExportService } from "$lib/services/promptExport";
  import type {
    ParsedPromptImport,
    ImportPresetConfig,
    ReasoningEffort,
  } from "$lib/types";
  import {
    Upload,
    FileJson,
    Loader2,
    Check,
    AlertCircle,
    AlertTriangle,
    ChevronDown,
    Sparkles,
  } from "lucide-svelte";
  import { fly, fade, slide } from "svelte/transition";

  // Shadcn Components
  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "$lib/components/ui/alert";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Separator } from "$lib/components/ui/separator";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  // State
  let currentStep = $state<1 | 2 | 3>(1);
  let dragOver = $state(false);
  let parseResult = $state<ParsedPromptImport | null>(null);
  let error = $state<string | null>(null);
  let presetConfigs = $state<Map<string, ImportPresetConfig>>(new Map());
  let expandedPreset = $state<string | null>(null);
  let isImporting = $state(false);
  let importSuccess = $state(false);

  // Derived
  const availableProfiles = $derived(
    settings.apiSettings.profiles.map((p) => ({ value: p.id, label: p.name })),
  );

  function getAvailableModelsForProfile(profileId: string) {
    const profile = settings.apiSettings.profiles.find(
      (p) => p.id === profileId,
    );
    if (!profile) return [];
    return [...profile.customModels, ...profile.fetchedModels].map((m) => ({
      value: m,
      label: m,
    }));
  }

  const importStats = $derived.by(() => {
    if (!parseResult?.data) return null;
    const data = parseResult.data;
    return {
      customMacros: data.promptSettings.customMacros.length,
      macroOverrides: data.promptSettings.macroOverrides.length,
      templateOverrides: data.promptSettings.templateOverrides.length,
      presets: data.generationPresets.length,
    };
  });

  const stepTitles = ["Select File", "Configure", "Import"];

  // Functions
  function resetState() {
    currentStep = 1;
    parseResult = null;
    error = null;
    presetConfigs = new Map();
    expandedPreset = null;
    isImporting = false;
    importSuccess = false;
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      resetState();
      onClose();
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  async function processFile(file: File) {
    error = null;
    parseResult = null;

    if (!file.name.endsWith(".json")) {
      error = "Please select a JSON file";
      return;
    }

    try {
      const text = await file.text();
      processContent(text);
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to read file";
    }
  }

  function processContent(text: string) {
    const result = promptExportService.parseImportFile(text);

    if (!result.success) {
      error = result.errors.join(", ");
      return;
    }

    parseResult = result;

    const configs = new Map<string, ImportPresetConfig>();
    const profiles = settings.apiSettings.profiles;
    const defaultProfileId = profiles.length > 0 ? profiles[0].id : "";

    for (const preset of result.data!.generationPresets) {
      configs.set(preset.id, {
        presetId: preset.id,
        presetName: preset.name,
        profileId: defaultProfileId,
        model: preset.model,
        temperature: preset.temperature,
        maxTokens: preset.maxTokens,
        reasoningEffort: preset.reasoningEffort,
        providerOnly: [...preset.providerOnly],
        manualBody: preset.manualBody,
      });
    }
    presetConfigs = configs;
    currentStep = 2;
  }

  async function handleBrowse() {
    error = null;
    parseResult = null;
    try {
      const text = await promptExportService.pickAndReadImportFile();
      if (text) {
        processContent(text);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to read file";
    }
  }

  function updatePresetConfig(
    presetId: string,
    updates: Partial<ImportPresetConfig>,
  ) {
    const newConfigs = new Map(presetConfigs);
    const config = newConfigs.get(presetId)!;
    newConfigs.set(presetId, { ...config, ...updates });
    presetConfigs = newConfigs;
  }

  function togglePresetExpanded(presetId: string) {
    expandedPreset = expandedPreset === presetId ? null : presetId;
  }

  async function handleImport() {
    if (!parseResult?.data) return;

    isImporting = true;
    error = null;

    try {
      await promptExportService.applyImport(parseResult.data, presetConfigs);
      importSuccess = true;
      currentStep = 3;

      setTimeout(() => {
        handleOpenChange(false);
      }, 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : "Import failed";
    } finally {
      isImporting = false;
    }
  }
</script>

<ResponsiveModal.Root {open} onOpenChange={handleOpenChange}>
  <ResponsiveModal.Content class="sm:max-w-xl max-h-[85vh] flex flex-col p-0 gap-0">
    <ResponsiveModal.Header class="px-6 pt-6 pb-4">
      <ResponsiveModal.Title class="flex items-center gap-2">
        <Upload class="h-5 w-5 text-primary" />
        Import Prompts
      </ResponsiveModal.Title>
      <ResponsiveModal.Description>
        {stepTitles[currentStep - 1]}
      </ResponsiveModal.Description>

      <!-- Progress Steps -->
      <div class="flex items-center gap-2 mt-4">
        {#each [1, 2, 3] as step}
          <div class="flex-1 flex items-center gap-2">
            <div
              class="h-1.5 flex-1 rounded-full transition-all duration-300 {step <
              currentStep
                ? 'bg-primary'
                : step === currentStep
                  ? 'bg-primary'
                  : 'bg-muted'}"
            ></div>
          </div>
        {/each}
      </div>
    </ResponsiveModal.Header>

    <div class="flex-1 overflow-y-auto px-6 pb-6">
      <!-- Error Message -->
      {#if error}
        <Alert variant="destructive" class="mb-4">
          <AlertCircle class="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      {/if}

      <!-- Warnings -->
      {#if parseResult?.warnings && parseResult.warnings.length > 0}
        <Alert
          class="mb-4 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20"
        >
          <AlertTriangle class="h-4 w-4 text-amber-500" />
          <AlertTitle>Warnings</AlertTitle>
          <AlertDescription>
            <ul class="list-disc list-inside">
              {#each parseResult.warnings as warning}
                <li>{warning}</li>
              {/each}
            </ul>
          </AlertDescription>
        </Alert>
      {/if}

      <!-- Step 1: File Upload -->
      {#if currentStep === 1}
        <div class="space-y-4" transition:fade={{ duration: 150 }}>
          <button
            class="w-full border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {dragOver
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}"
            ondrop={handleDrop}
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            onclick={handleBrowse}
            onkeydown={(e) => e.key === "Enter" && handleBrowse()}
          >
            <div class="p-4 rounded-full bg-muted">
              <FileJson class="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p class="text-sm font-medium mb-1">Drop your file here</p>
              <p class="text-xs text-muted-foreground">or click to browse</p>
            </div>
          </button>
          <p class="text-center text-xs text-muted-foreground">
            Supports Aventuras prompt export files (.json)
          </p>
        </div>

        <!-- Step 2: Configure Presets -->
      {:else if currentStep === 2 && parseResult?.data}
        <div class="space-y-4" transition:fade={{ duration: 150 }}>
          <!-- Stats Summary -->
          {#if importStats}
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                class="p-3 rounded-lg bg-muted/50 text-center border border-border"
              >
                <div class="text-lg font-bold text-foreground">
                  {importStats.templateOverrides}
                </div>
                <div class="text-xs text-muted-foreground">Prompts</div>
              </div>
              <div
                class="p-3 rounded-lg bg-muted/50 text-center border border-border"
              >
                <div class="text-lg font-bold text-foreground">
                  {importStats.customMacros}
                </div>
                <div class="text-xs text-muted-foreground">Macros</div>
              </div>
              <div
                class="p-3 rounded-lg bg-muted/50 text-center border border-border"
              >
                <div class="text-lg font-bold text-foreground">
                  {importStats.macroOverrides}
                </div>
                <div class="text-xs text-muted-foreground">Overrides</div>
              </div>
              <div
                class="p-3 rounded-lg bg-muted/50 text-center border border-border"
              >
                <div class="text-lg font-bold text-foreground">
                  {importStats.presets}
                </div>
                <div class="text-xs text-muted-foreground">Presets</div>
              </div>
            </div>
          {/if}

          <!-- Presets Configuration -->
          <div>
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-medium text-muted-foreground">
                Generation Presets
              </h3>
            </div>

            <div class="space-y-3">
              {#each parseResult.data.generationPresets as preset (preset.id)}
                {@const config = presetConfigs.get(preset.id)!}
                {@const isExpanded = expandedPreset === preset.id}
                {@const availableModels = getAvailableModelsForProfile(
                  config.profileId,
                )}

                <div
                  class="rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all"
                >
                  <!-- Preset Header -->
                  <button
                    class="w-full px-4 py-3 flex flex-col gap-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg {isExpanded
                      ? ''
                      : 'rounded-b-lg'}"
                    onclick={() => togglePresetExpanded(preset.id)}
                  >
                    <!-- Header Row -->
                    <div class="flex items-center gap-3 w-full min-w-0">
                      <Sparkles class="h-4 w-4 text-primary flex-shrink-0" />
                      <div
                        class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden"
                      >
                        <span class="text-sm font-medium truncate"
                          >{preset.name}</span
                        >
                        <span
                          class="text-xs text-muted-foreground truncate border-l border-border pl-2"
                        >
                          Was: <span class="text-foreground"
                            >{preset.model}</span
                          >
                        </span>
                      </div>
                      <ChevronDown
                        class="h-4 w-4 text-muted-foreground transition-transform flex-shrink-0 {isExpanded
                          ? 'rotate-180'
                          : ''}"
                      />
                    </div>

                    <!-- Controls Row (Always visible now for easier access) -->
                    <div
                      class="flex items-center gap-2 w-full"
                      onclick={(e) => e.stopPropagation()}
                    >
                      <!-- Profile Select -->
                      <div class="flex-1 min-w-0">
                        <Select.Root
                          type="single"
                          value={config.profileId}
                          onValueChange={(v) => {
                            if (!v) return;
                            const models = getAvailableModelsForProfile(v);
                            const newModel =
                              models.length > 0
                                ? models[0].value
                                : config.model;
                            updatePresetConfig(preset.id, {
                              profileId: v,
                              model: newModel,
                            });
                          }}
                        >
                          <Select.Trigger class="h-8 text-xs">
                            <span class="truncate">
                              {availableProfiles.find(
                                (p) => p.value === config.profileId,
                              )?.label || "Select Profile"}
                            </span>
                          </Select.Trigger>
                          <Select.Content>
                            {#each availableProfiles as profile}
                              <Select.Item
                                value={profile.value}
                                label={profile.label}
                                >{profile.label}</Select.Item
                              >
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>

                      <!-- Model Select -->
                      <div class="flex-1 min-w-0">
                        <Select.Root
                          type="single"
                          value={config.model}
                          onValueChange={(v) => {
                            if (v) updatePresetConfig(preset.id, { model: v });
                          }}
                        >
                          <Select.Trigger class="h-8 text-xs">
                            <span class="truncate">
                              {availableModels.find(
                                (m) => m.value === config.model,
                              )?.label ||
                                config.model ||
                                "Select Model"}
                            </span>
                          </Select.Trigger>
                          <Select.Content>
                            {#if availableModels.length > 0}
                              {#each availableModels as model}
                                <Select.Item
                                  value={model.value}
                                  label={model.label}>{model.label}</Select.Item
                                >
                              {/each}
                            {:else}
                              <Select.Item value="nomodel" disabled
                                >No models available</Select.Item
                              >
                            {/if}
                          </Select.Content>
                        </Select.Root>
                      </div>
                    </div>
                  </button>

                  <!-- Expanded Settings -->
                  {#if isExpanded}
                    <div
                      class="px-4 pb-4 pt-2 border-t border-border"
                      transition:slide={{ duration: 200 }}
                    >
                      <div class="grid grid-cols-2 gap-4">
                        <!-- Temperature -->
                        <div class="space-y-1.5">
                          <Label class="text-xs text-muted-foreground"
                            >Temperature</Label
                          >
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="2"
                            class="h-8 text-xs"
                            value={config.temperature}
                            oninput={(e) =>
                              updatePresetConfig(preset.id, {
                                temperature:
                                  parseFloat(e.currentTarget.value) || 0,
                              })}
                          />
                        </div>

                        <!-- Max Tokens -->
                        <div class="space-y-1.5">
                          <Label class="text-xs text-muted-foreground"
                            >Max Tokens</Label
                          >
                          <Input
                            type="number"
                            min="1"
                            class="h-8 text-xs"
                            value={config.maxTokens}
                            oninput={(e) =>
                              updatePresetConfig(preset.id, {
                                maxTokens: parseInt(e.currentTarget.value) || 1,
                              })}
                          />
                        </div>

                        <!-- Reasoning Effort -->
                        <div class="col-span-2 space-y-1.5">
                          <Label class="text-xs text-muted-foreground"
                            >Reasoning Effort</Label
                          >
                          <div class="grid grid-cols-4 gap-2">
                            {#each ["off", "low", "medium", "high"] as level}
                              <Button
                                variant={config.reasoningEffort === level
                                  ? "default"
                                  : "outline"}
                                size="sm"
                                class="h-7 text-xs capitalize"
                                onclick={() =>
                                  updatePresetConfig(preset.id, {
                                    reasoningEffort: level as ReasoningEffort,
                                  })}
                              >
                                {level}
                              </Button>
                            {/each}
                          </div>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>

          <!-- Warning -->
          <Alert
            class="border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20"
          >
            <AlertTriangle class="h-4 w-4 text-amber-500" />
            <AlertDescription class="text-xs">
              Importing will <span class="font-bold">replace</span> all current prompts,
              macros, and presets.
            </AlertDescription>
          </Alert>
        </div>

        <!-- Step 3: Success -->
      {:else if currentStep === 3}
        <div class="py-12 text-center" transition:fade={{ duration: 150 }}>
          <div
            class="inline-flex p-4 rounded-full bg-green-100 dark:bg-green-900/30 mb-4"
          >
            <Check class="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Import Complete!</h3>
          <p class="text-muted-foreground">
            Your prompts have been imported successfully.
          </p>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    {#if currentStep !== 3}
      <ResponsiveModal.Footer class="px-6 py-4 border-t border-border bg-muted/20">
        {#if currentStep === 1}
          <Button variant="ghost" onclick={() => handleOpenChange(false)}>
            Cancel
          </Button>
        {:else if currentStep === 2}
          <Button
            variant="ghost"
            onclick={() => {
              currentStep = 1;
              parseResult = null;
            }}
          >
            Back
          </Button>
          <Button onclick={handleImport} disabled={isImporting}>
            {#if isImporting}
              <Loader2 class="mr-2 h-4 w-4 animate-spin" />
              Importing...
            {:else}
              Import
            {/if}
          </Button>
        {/if}
      </ResponsiveModal.Footer>
    {/if}
  </ResponsiveModal.Content>
</ResponsiveModal.Root>
