<script lang="ts">
  import {
    settings,
    DEFAULT_OPENROUTER_PROFILE_ID,
  } from "$lib/stores/settings.svelte";
  import { Cpu, RefreshCw } from "lucide-svelte";
  import ProviderOnlySelector from "./ProviderOnlySelector.svelte";
  import type { ProviderInfo } from "$lib/services/ai/types";
  import { OpenAIProvider } from "$lib/services/ai/openrouter";
  import type { ReasoningEffort } from "$lib/types";
  import { cn } from "$lib/utils/cn";

  // Shadcn Components
  import * as Card from "$lib/components/ui/card";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
  import { Button } from "$lib/components/ui/button";
  import { Slider } from "$lib/components/ui/slider";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import ModelSelector from "./ModelSelector.svelte";

  interface Props {
    providerOptions: ProviderInfo[];
    onOpenManualBodyEditor: (
      title: string,
      value: string,
      onSave: (next: string) => void,
    ) => void;
  }

  let { providerOptions, onOpenManualBodyEditor }: Props = $props();

  const reasoningLevels: ReasoningEffort[] = ["off", "low", "medium", "high"];
  const reasoningLabels: Record<ReasoningEffort, string> = {
    off: "Off",
    low: "Low",
    medium: "Medium",
    high: "High",
  };

  let isLoadingModels = $state(false);
  let modelError = $state<string | null>(null);

  // Get models from main narrative profile (sorted by provider priority)
  let profileModels = $derived.by(() => {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return [];
    const models = [
      ...new Set([...profile.fetchedModels, ...profile.customModels]),
    ];

    const providerPriority: Record<string, number> = {
      "x-ai": 1,
      deepseek: 2,
      openai: 3,
      anthropic: 4,
      google: 5,
      "meta-llama": 6,
      mistralai: 7,
    };

    return models.sort((a, b) => {
      const providerA = a.split("/")[0];
      const providerB = b.split("/")[0];
      const priorityA = providerPriority[providerA] ?? 99;
      const priorityB = providerPriority[providerB] ?? 99;

      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.localeCompare(b);
    });
  });

  function getReasoningIndex(value?: ReasoningEffort): number {
    const index = reasoningLevels.indexOf(value ?? "off");
    return index === -1 ? 0 : index;
  }

  function getReasoningValue(index: number): ReasoningEffort {
    const clamped = Math.min(Math.max(0, index), reasoningLevels.length - 1);
    return reasoningLevels[clamped];
  }

  async function handleSetMainNarrativeProfile(profileId: string) {
    await settings.setMainNarrativeProfile(profileId);
  }

  async function fetchModelsToProfile() {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return;
    if (isLoadingModels) return;

    isLoadingModels = true;
    modelError = null;

    try {
      const apiSettings = settings.getApiSettingsForProfile(profile.id);
      const provider = new OpenAIProvider(apiSettings);
      const fetchedModels = await provider.listModels();

      const filteredModelIds = fetchedModels
        .filter((m) => {
          const id = m.id.toLowerCase();
          if (
            id.includes("embedding") ||
            id.includes("vision-only") ||
            id.includes("tts") ||
            id.includes("whisper")
          ) {
            return false;
          }
          return true;
        })
        .map((m) => m.id);

      await settings.updateProfile(profile.id, {
        fetchedModels: filteredModelIds,
      });

      console.log(
        `[MainNarrative] Fetched ${filteredModelIds.length} models to profile`,
      );
    } catch (error) {
      console.error("[MainNarrative] Failed to fetch models:", error);
      modelError =
        error instanceof Error ? error.message : "Failed to load models.";
    } finally {
      isLoadingModels = false;
    }
  }

  let selectedProfileName = $derived(
    settings.apiSettings.profiles.find(
      (p) => p.id === settings.apiSettings.mainNarrativeProfileId,
    )?.name || "Select Profile",
  );

  let isOpenRouter = $derived.by(() => {
    const p = settings.apiSettings.profiles.find(
      (p) => p.id === settings.apiSettings.mainNarrativeProfileId,
    );
    if (!p) return false;
    // Check if it's the default OpenRouter profile OR if the base URL contains openrouter.ai
    return (
      p.id === DEFAULT_OPENROUTER_PROFILE_ID ||
      (p.baseUrl && p.baseUrl.toLowerCase().includes("openrouter"))
    );
  });

  // Proxy states for sliders to ensure correct array type binding
  let tempValue = $state([settings.apiSettings.temperature]);
  let tokensValue = $state([settings.apiSettings.maxTokens]);
  let reasoningValue = $state([
    getReasoningIndex(settings.apiSettings.reasoningEffort),
  ]);

  $effect(() => {
    tempValue = [settings.apiSettings.temperature];
  });

  $effect(() => {
    tokensValue = [settings.apiSettings.maxTokens];
  });

  $effect(() => {
    reasoningValue = [getReasoningIndex(settings.apiSettings.reasoningEffort)];
  });

  function updateTemperature(v: number[]) {
    settings.setTemperature(v[0]);
  }

  function updateTokens(v: number[]) {
    settings.setMaxTokens(v[0]);
  }

  function updateReasoning(v: number[]) {
    settings.setMainReasoningEffort(getReasoningValue(v[0]));
  }
</script>

<Card.Root>
  <Card.Header>
    <Card.Title class="flex items-center gap-2 text-base">
      <Cpu class="h-5 w-5 text-primary" />
      Main Narrative
    </Card.Title>
  </Card.Header>

  <Card.Content class="grid gap-3 pt-4">
    <div class="grid gap-2">
      <ModelSelector
        class="grid-cols-1 md:grid-cols-2"
        profileId={settings.apiSettings.mainNarrativeProfileId}
        model={settings.apiSettings.defaultModel}
        onProfileChange={(id) => handleSetMainNarrativeProfile(id)}
        onModelChange={(m) => settings.setDefaultModel(m)}
        onRefreshModels={fetchModelsToProfile}
        isRefreshingModels={isLoadingModels}
      />
      {#if modelError}
        <p class="text-xs text-destructive">{modelError}</p>
      {/if}
    </div>

    <!-- Temperature & Max Tokens Row -->
    <div
      class={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t",
        settings.advancedRequestSettings.manualMode &&
          "opacity-50 pointer-events-none",
      )}
    >
      <div class="grid gap-4">
        <div class="flex justify-between">
          <Label>Temperature</Label>
          <span class="text-xs text-muted-foreground"
            >{settings.apiSettings.temperature.toFixed(1)}</span
          >
        </div>
        <Slider
          bind:value={tempValue}
          min={0}
          max={2}
          step={0.1}
          onValueChange={updateTemperature}
        />
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Focused</span>
          <span>Creative</span>
        </div>
      </div>

      <div class="grid gap-4">
        <div class="flex justify-between items-center">
          <Label>Max Tokens</Label>
        </div>
        <div class="flex gap-4 pt-0.5 justify-start items-start">
          <div class="flex-1 flex flex-col gap-4.5">
            <Slider
              bind:value={tokensValue}
              min={1024}
              max={128000}
              step={1024}
              onValueChange={updateTokens}
            />
            <div class="flex justify-between text-xs text-muted-foreground">
              <span>1K</span>
              <span>128K</span>
            </div>
          </div>
          <div class="-mt-5.5">
            <Input
              type="number"
              class="w-24 h-8 text-left"
              value={settings.apiSettings.maxTokens}
              oninput={(e) => {
                const value = parseInt(e.currentTarget.value);
                if (!isNaN(value)) {
                  settings.setMaxTokens(value);
                }
              }}
              onchange={(e) => {
                const value = parseInt(e.currentTarget.value);
                if (value < 1024) settings.setMaxTokens(1024);
                if (value > 128000) settings.setMaxTokens(128000);
              }}
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Thinking & Provider Row -->
    <div
      class={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t",
        settings.advancedRequestSettings.manualMode &&
          "opacity-50 pointer-events-none",
      )}
    >
      <div class="grid gap-4">
        <div class="flex justify-between">
          <Label
            >Thinking: {reasoningLabels[
              settings.apiSettings.reasoningEffort
            ]}</Label
          >
        </div>
        <Slider
          bind:value={reasoningValue}
          min={0}
          max={3}
          step={1}
          onValueChange={updateReasoning}
        />
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>Off</span>
          <span>Low</span>
          <span>Med</span>
          <span>High</span>
        </div>
      </div>

      {#if isOpenRouter}
        <div>
          <ProviderOnlySelector
            providers={providerOptions}
            selected={settings.apiSettings.providerOnly}
            disabled={settings.advancedRequestSettings.manualMode}
            onChange={(next) => {
              settings.setMainProviderOnly(next);
            }}
          />
        </div>
      {/if}
    </div>

    {#if settings.advancedRequestSettings.manualMode}
      <div class="mt-4 pt-4 border-t">
        <div class="mb-2 flex items-center justify-between">
          <Label>Manual Request Body (JSON)</Label>
          <Button
            variant="text"
            size="sm"
            class="h-auto p-0"
            onclick={() =>
              onOpenManualBodyEditor(
                "Main Narrative",
                settings.apiSettings.manualBody,
                (next) => {
                  settings.apiSettings.manualBody = next;
                  settings.setMainManualBody(next);
                },
              )}
          >
            Pop out
          </Button>
        </div>
        <Textarea
          bind:value={settings.apiSettings.manualBody}
          onblur={() =>
            settings.setMainManualBody(settings.apiSettings.manualBody)}
          class="min-h-[100px] resize-y font-mono w-full"
          rows={4}
        />
        <p class="text-xs text-muted-foreground mt-1">
          Overrides request parameters; messages and tools are managed by
          Aventuras.
        </p>
      </div>
    {/if}
  </Card.Content>
</Card.Root>
