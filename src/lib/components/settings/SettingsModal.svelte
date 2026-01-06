<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { onMount } from 'svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { OpenAIProvider, OPENROUTER_API_URL } from '$lib/services/ai/openrouter';
  import type { ProviderInfo } from '$lib/services/ai/types';
  import { DEFAULT_PROVIDERS } from '$lib/services/ai/providers';
  import type { ThemeId } from '$lib/types';
  import {
    type AdvancedWizardSettings,
    SCENARIO_MODEL,
    SCENARIO_PROVIDER,
  } from '$lib/services/ai/scenario';
  import { serializeManualBody } from '$lib/services/ai/requestOverrides';
  import type { ReasoningEffort } from '$lib/types';
  import { X, Key, Cpu, Palette, RefreshCw, Search, Settings2, RotateCcw, ChevronDown, ChevronUp, Brain, BookOpen, Lightbulb, Sparkles, Clock, Download, Loader2, Save, FolderOpen, ListChecks } from 'lucide-svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import ProfileModal from './ProfileModal.svelte';
  import ModelSelector from './ModelSelector.svelte';
  import ProviderOnlySelector from './ProviderOnlySelector.svelte';
  import type { APIProfile } from '$lib/types';
  import { swipe } from '$lib/utils/swipe';
  import { updaterService, type UpdateInfo, type UpdateProgress } from '$lib/services/updater';

  let activeTab = $state<'api' | 'generation' | 'ui' | 'advanced'>('api');

  // Advanced settings section state
  let showStoryGenSection = $state(true);
  let showWizardSection = $state(false);
  let showClassifierSection = $state(false);
  let showMemorySection = $state(false);
  let showSuggestionsSection = $state(false);
  let showActionChoicesSection = $state(false);
  let showStyleReviewerSection = $state(false);
  let showEntryRetrievalSection = $state(false);
  let showLoreManagementSection = $state(false);
  let showTimelineFillSection = $state(false);
  let editingStoryPrompt = $state<'adventure' | 'creativeWriting' | null>(null);
  let editingProcess = $state<keyof AdvancedWizardSettings | null>(null);
  let editingClassifierPrompt = $state(false);
  let editingLorebookClassifier = $state(false);
  let editingLorebookClassifierPrompt = $state(false);
  let editingMemoryPrompt = $state<'chapterAnalysis' | 'chapterSummarization' | 'retrievalDecision' | null>(null);
  let editingSuggestionsPrompt = $state(false);
  let editingStyleReviewerPrompt = $state(false);
  let editingLoreManagementPrompt = $state(false);
  let editingTimelineFillPrompt = $state<'system' | 'answer' | null>(null);
  let editingAgenticRetrievalPrompt = $state(false);

  // Process labels for UI
  const processLabels: Record<keyof AdvancedWizardSettings, string> = {
    settingExpansion: 'Setting Expansion',
    protagonistGeneration: 'Protagonist Generation',
    characterElaboration: 'Character Elaboration',
    supportingCharacters: 'Supporting Characters',
    openingGeneration: 'Opening Generation',
  };

  // Profile state
  let showProfileModal = $state(false);
  let editingProfile = $state<APIProfile | null>(null);

  // Update checking state
  let updateInfo = $state<UpdateInfo | null>(null);
  let isCheckingUpdates = $state(false);
  let isDownloadingUpdate = $state(false);
  let downloadProgress = $state<UpdateProgress | null>(null);
  let updateError = $state<string | null>(null);

  // Model fetching state
  let isLoadingModels = $state(false);
  let modelError = $state<string | null>(null);
  let modelSearch = $state('');

  let isLoadingProviders = $state(false);
  let providerError = $state<string | null>(null);
  let providerOptions = $state<ProviderInfo[]>(DEFAULT_PROVIDERS);
  let manualBodyEditorOpen = $state(false);
  let manualBodyEditorTitle = $state('Manual Request Body');
  let manualBodyEditorValue = $state('');
  let manualBodyEditorSave = $state<(value: string) => void>((_) => {});

  const reasoningLevels: ReasoningEffort[] = ['off', 'low', 'medium', 'high'];
  const reasoningLabels: Record<ReasoningEffort, string> = {
    off: 'Off',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
  };

  // Get models from main narrative profile
  let profileModels = $derived.by(() => {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return [];
    // Combine fetched and custom models, removing duplicates
    return [...new Set([...profile.fetchedModels, ...profile.customModels])];
  });

  // Filtered and sorted models from profile
  let filteredModels = $derived.by(() => {
    let result = [...profileModels];

    // Filter by search term
    if (modelSearch.trim()) {
      const search = modelSearch.toLowerCase();
      result = result.filter(m => m.toLowerCase().includes(search));
    }

    // Sort: prioritize popular providers, then alphabetically
    const providerPriority: Record<string, number> = {
      'x-ai': 1,
      'deepseek': 2,
      'openai': 3,
      'anthropic': 4,
      'google': 5,
      'meta-llama': 6,
      'mistralai': 7,
    };

    return result.sort((a, b) => {
      const providerA = a.split('/')[0];
      const providerB = b.split('/')[0];
      const priorityA = providerPriority[providerA] ?? 99;
      const priorityB = providerPriority[providerB] ?? 99;

      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.localeCompare(b);
    });
  });

  // Fetch models and save to main narrative profile
  async function fetchModelsToProfile() {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return;

    if (isLoadingModels) return;

    isLoadingModels = true;
    modelError = null;

    try {
      // Use the main narrative profile's credentials
      const apiSettings = settings.getApiSettingsForProfile(profile.id);
      const provider = new OpenAIProvider(apiSettings);
      const fetchedModels = await provider.listModels();

      // Filter to only include text/chat models (exclude image, embedding, etc.)
      const filteredModelIds = fetchedModels
        .filter(m => {
          const id = m.id.toLowerCase();
          if (id.includes('embedding') || id.includes('vision-only') || id.includes('tts') || id.includes('whisper')) {
            return false;
          }
          return true;
        })
        .map(m => m.id);

      // Update profile with fetched models
      await settings.updateProfile(profile.id, {
        fetchedModels: filteredModelIds,
      });

      console.log(`[SettingsModal] Fetched ${filteredModelIds.length} models to profile`);
    } catch (error) {
      console.error('[SettingsModal] Failed to fetch models:', error);
      modelError = error instanceof Error ? error.message : 'Failed to load models.';
    } finally {
      isLoadingModels = false;
    }
  }

  async function fetchProviders() {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return;

    if (isLoadingProviders) return;

    isLoadingProviders = true;
    providerError = null;

    try {
      const apiSettings = settings.getApiSettingsForProfile(profile.id);
      const provider = new OpenAIProvider(apiSettings);
      const fetched = await provider.listProviders?.();
      if (fetched && fetched.length > 0) {
        providerOptions = fetched;
      } else {
        providerOptions = DEFAULT_PROVIDERS;
      }
    } catch (error) {
      console.error('[SettingsModal] Failed to fetch providers:', error);
      providerError = error instanceof Error ? error.message : 'Failed to load providers.';
      providerOptions = DEFAULT_PROVIDERS;
    } finally {
      isLoadingProviders = false;
    }
  }

  function getReasoningIndex(value?: ReasoningEffort): number {
    const index = reasoningLevels.indexOf(value ?? 'off');
    return index === -1 ? 0 : index;
  }

  function getReasoningValue(index: number): ReasoningEffort {
    const clamped = Math.min(Math.max(0, index), reasoningLevels.length - 1);
    return reasoningLevels[clamped];
  }

  function getOpeningProvider(modelId: string): Record<string, unknown> {
    const isZAI = modelId.startsWith('z-ai/') || modelId.startsWith('zai-org/');
    return isZAI ? { order: ['z-ai'], require_parameters: true } : SCENARIO_PROVIDER;
  }

  function seedManualBody(target: { manualBody?: string }, defaults: Parameters<typeof serializeManualBody>[0]): boolean {
    if (target.manualBody && target.manualBody.trim()) return false;
    target.manualBody = serializeManualBody(defaults);
    return true;
  }

  function openManualBodyEditor(title: string, value: string, onSave: (next: string) => void) {
    manualBodyEditorTitle = title;
    manualBodyEditorValue = value;
    manualBodyEditorSave = onSave;
    manualBodyEditorOpen = true;
  }

  function closeManualBodyEditor() {
    manualBodyEditorOpen = false;
    manualBodyEditorTitle = 'Manual Request Body';
    manualBodyEditorValue = '';
    manualBodyEditorSave = (_) => {};
  }

  function applyManualBodyEditor() {
    manualBodyEditorSave(manualBodyEditorValue);
    closeManualBodyEditor();
  }

  async function seedAllManualBodies() {
    const baseNarrativeProvider = { order: ['z-ai'], require_parameters: true };
    if (seedManualBody(settings.apiSettings, {
      model: settings.apiSettings.defaultModel,
      temperature: settings.apiSettings.temperature,
      maxTokens: settings.apiSettings.maxTokens,
      baseProvider: baseNarrativeProvider,
      reasoningEffort: settings.apiSettings.reasoningEffort,
      providerOnly: settings.apiSettings.providerOnly,
    })) {
      await settings.setMainManualBody(settings.apiSettings.manualBody);
    }

    let wizardChanged = false;
    const processDefaults: Record<keyof AdvancedWizardSettings, { model: string; temperature: number; maxTokens: number; topP?: number }> = {
      settingExpansion: {
        model: 'deepseek/deepseek-v3.2',
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      protagonistGeneration: {
        model: 'deepseek/deepseek-v3.2',
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      characterElaboration: {
        model: 'deepseek/deepseek-v3.2',
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      supportingCharacters: {
        model: SCENARIO_MODEL,
        temperature: 0.3,
        maxTokens: 8192,
      },
      openingGeneration: {
        model: 'z-ai/glm-4.7',
        temperature: 0.8,
        maxTokens: 8192,
        topP: 0.95,
      },
    };

    for (const processKey of Object.keys(processLabels) as (keyof AdvancedWizardSettings)[]) {
      const processSettings = settings.wizardSettings[processKey];
      const defaults = processDefaults[processKey];
      const model = processSettings.model ?? defaults.model;
      if (seedManualBody(processSettings, {
        model,
        temperature: processSettings.temperature ?? defaults.temperature,
        maxTokens: processSettings.maxTokens ?? defaults.maxTokens,
        topP: processSettings.topP ?? defaults.topP,
        baseProvider: processKey === 'openingGeneration'
          ? getOpeningProvider(model)
          : SCENARIO_PROVIDER,
        reasoningEffort: processSettings.reasoningEffort,
        providerOnly: processSettings.providerOnly,
      })) {
        wizardChanged = true;
      }
    }
    if (wizardChanged) {
      await settings.saveWizardSettings();
    }

    let servicesChanged = false;
    const services = settings.systemServicesSettings;

    servicesChanged = seedManualBody(services.lorebookClassifier, {
      model: services.lorebookClassifier.model,
      temperature: services.lorebookClassifier.temperature,
      maxTokens: services.lorebookClassifier.maxTokens,
      reasoningEffort: services.lorebookClassifier.reasoningEffort,
      providerOnly: services.lorebookClassifier.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.classifier, {
      model: services.classifier.model,
      temperature: services.classifier.temperature,
      maxTokens: services.classifier.maxTokens,
      reasoningEffort: services.classifier.reasoningEffort,
      providerOnly: services.classifier.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.memory, {
      model: services.memory.model,
      temperature: services.memory.temperature,
      maxTokens: 8192,
      reasoningEffort: services.memory.reasoningEffort,
      providerOnly: services.memory.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.suggestions, {
      model: services.suggestions.model,
      temperature: services.suggestions.temperature,
      maxTokens: services.suggestions.maxTokens,
      reasoningEffort: services.suggestions.reasoningEffort,
      providerOnly: services.suggestions.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.actionChoices, {
      model: services.actionChoices.model,
      temperature: services.actionChoices.temperature,
      maxTokens: services.actionChoices.maxTokens,
      reasoningEffort: services.actionChoices.reasoningEffort,
      providerOnly: services.actionChoices.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.styleReviewer, {
      model: services.styleReviewer.model,
      temperature: services.styleReviewer.temperature,
      maxTokens: services.styleReviewer.maxTokens,
      reasoningEffort: services.styleReviewer.reasoningEffort,
      providerOnly: services.styleReviewer.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.entryRetrieval, {
      model: services.entryRetrieval.model,
      temperature: services.entryRetrieval.temperature,
      maxTokens: 8192,
      reasoningEffort: services.entryRetrieval.reasoningEffort,
      providerOnly: services.entryRetrieval.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.loreManagement, {
      model: services.loreManagement.model,
      temperature: services.loreManagement.temperature,
      maxTokens: 8192,
      reasoningEffort: services.loreManagement.reasoningEffort,
      providerOnly: services.loreManagement.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.timelineFill, {
      model: services.timelineFill.model,
      temperature: services.timelineFill.temperature,
      maxTokens: 8192,
      reasoningEffort: services.timelineFill.reasoningEffort,
      providerOnly: services.timelineFill.providerOnly,
    }) || servicesChanged;

    servicesChanged = seedManualBody(services.agenticRetrieval, {
      model: services.agenticRetrieval.model,
      temperature: services.agenticRetrieval.temperature,
      maxTokens: 8192,
      reasoningEffort: services.agenticRetrieval.reasoningEffort,
      providerOnly: services.agenticRetrieval.providerOnly,
    }) || servicesChanged;

    if (servicesChanged) {
      await settings.saveSystemServicesSettings();
    }
  }

  // Set the main narrative profile
  async function handleSetMainNarrativeProfile(profileId: string) {
    await settings.setMainNarrativeProfile(profileId);
  }

  async function handleProfileSave(profile: APIProfile) {
    if (editingProfile) {
      await settings.updateProfile(profile.id, profile);
    } else {
      await settings.addProfile(profile);
    }
    showProfileModal = false;
    editingProfile = null;
  }

  async function handleDeleteProfile(profileId: string, profileName: string) {
    const confirmed = await ask(`Delete profile "${profileName}"?`, {
      title: 'Delete Profile',
      kind: 'warning',
    });
    if (confirmed) {
      await settings.deleteProfile(profileId);
    }
  }

  function handleRefreshModels() {
    fetchModelsToProfile();
  }

  async function handleManualModeToggle() {
    const next = !settings.advancedRequestSettings.manualMode;
    await settings.setAdvancedManualMode(next);
    if (next) {
      await seedAllManualBodies();
    }
  }

  onMount(() => {
    fetchProviders();
    if (settings.advancedRequestSettings.manualMode) {
      seedAllManualBodies();
    }
  });

  async function handleResetAll() {
    const confirmed = confirm(
      'Reset all settings to their default values?\n\nYour API key will be preserved, but all other settings (models, temperatures, prompts, UI preferences) will be reset.\n\nThis cannot be undone.'
    );
    if (!confirmed) return;

    await settings.resetAllSettings(true);
  }

  async function handleCheckForUpdates() {
    isCheckingUpdates = true;
    updateError = null;

    try {
      updateInfo = await updaterService.checkForUpdates();
      await settings.setLastChecked(Date.now());
    } catch (error) {
      updateError = error instanceof Error ? error.message : 'Failed to check for updates';
    } finally {
      isCheckingUpdates = false;
    }
  }

  async function handleDownloadAndInstall() {
    if (!updateInfo?.available) return;

    isDownloadingUpdate = true;
    updateError = null;

    try {
      const success = await updaterService.downloadAndInstall((progress) => {
        downloadProgress = progress;
      });

      if (success) {
        // Prompt user to restart
        const restart = confirm(
          `Update ${updateInfo.version} has been downloaded.\n\nRestart now to apply the update?`
        );
        if (restart) {
          await updaterService.relaunch();
        }
      }
    } catch (error) {
      updateError = error instanceof Error ? error.message : 'Failed to download update';
    } finally {
      isDownloadingUpdate = false;
      downloadProgress = null;
    }
  }

  function formatLastChecked(timestamp: number | null): string {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  // Swipe down to dismiss modal on mobile
  function handleSwipeDown() {
    ui.closeSettings();
  }
</script>

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onclick={() => ui.closeSettings()}>
  <div
    class="card w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[80vh] overflow-hidden rounded-b-none sm:rounded-b-xl flex flex-col"
    onclick={(e) => e.stopPropagation()}
    use:swipe={{ onSwipeDown: handleSwipeDown, threshold: 50 }}
  >
    <!-- Mobile swipe handle indicator -->
    <div class="sm:hidden flex justify-center pt-2 pb-1">
      <div class="w-10 h-1 rounded-full bg-surface-600"></div>
    </div>

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-3 sm:pb-4 pt-0 sm:pt-0 flex-shrink-0">
      <h2 class="text-lg sm:text-xl font-semibold text-surface-100">Settings</h2>
      <button class="btn-ghost rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" onclick={() => ui.closeSettings()}>
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-surface-700 py-2 overflow-x-auto scrollbar-hide flex-shrink-0 -mx-4 px-4 sm:mx-0 sm:px-0">
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'api'}
        class:text-surface-100={activeTab === 'api'}
        class:text-surface-400={activeTab !== 'api'}
        onclick={() => activeTab = 'api'}
      >
        <Key class="h-4 w-4" />
        <span>API</span>
      </button>
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'generation'}
        class:text-surface-100={activeTab === 'generation'}
        class:text-surface-400={activeTab !== 'generation'}
        onclick={() => activeTab = 'generation'}
      >
        <Cpu class="h-4 w-4" />
        <span class="hidden xs:inline">Generation</span>
        <span class="xs:hidden">Gen</span>
      </button>
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'ui'}
        class:text-surface-100={activeTab === 'ui'}
        class:text-surface-400={activeTab !== 'ui'}
        onclick={() => activeTab = 'ui'}
      >
        <Palette class="h-4 w-4" />
        <span class="hidden xs:inline">Interface</span>
        <span class="xs:hidden">UI</span>
      </button>
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'advanced'}
        class:text-surface-100={activeTab === 'advanced'}
        class:text-surface-400={activeTab !== 'advanced'}
        onclick={() => activeTab = 'advanced'}
      >
        <Settings2 class="h-4 w-4" />
        <span class="hidden xs:inline">Advanced</span>
        <span class="xs:hidden">Adv</span>
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto py-4 min-h-0">
      {#if activeTab === 'api'}
        <div class="space-y-4">
          <!-- API Profiles Management Section -->
          <div>
            <div class="mb-3 flex items-center justify-between">
              <label class="text-sm font-medium text-surface-300">
                API Profiles
              </label>
              <button
                class="btn btn-secondary text-xs"
                onclick={() => { editingProfile = null; showProfileModal = true; }}
                title="Create new profile"
              >
                + New Profile
              </button>
            </div>

            <p class="mb-3 text-xs text-surface-500">
              Manage your API endpoint configurations. Each profile can have its own URL, API key, and model list.
              Select which profile to use for each service in the Generation and Advanced tabs.
            </p>

            <!-- List of profiles -->
            <div class="space-y-2">
              {#each settings.apiSettings.profiles as profile (profile.id)}
                <div class="flex items-center justify-between rounded-lg bg-surface-800 p-3 border border-surface-700">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-surface-200 truncate">{profile.name}</span>
                      {#if profile.id === settings.getDefaultProfileIdForProvider()}
                        <span class="text-xs bg-accent-600/20 text-accent-400 px-1.5 py-0.5 rounded">Default</span>
                      {/if}
                    </div>
                    <div class="text-xs text-surface-500 truncate mt-0.5">
                      {profile.baseUrl}
                      {#if profile.apiKey}
                        <span class="text-green-400 ml-2">Key set</span>
                      {:else}
                        <span class="text-amber-400 ml-2">No key</span>
                      {/if}
                    </div>
                  </div>
                  <button
                    class="btn btn-secondary text-xs ml-2 shrink-0"
                    onclick={() => { editingProfile = profile; showProfileModal = true; }}
                  >
                    Edit
                  </button>
                </div>
              {/each}
            </div>

            <!-- Quick link for OpenRouter -->
            <p class="mt-4 text-sm text-surface-500">
              Get an API key from <a href="https://openrouter.ai/keys" target="_blank" class="text-accent-400 hover:underline">openrouter.ai</a>
            </p>
          </div>
        </div>
      {:else if activeTab === 'generation'}
        <div class="space-y-4">
          <!-- Main Narrative Profile -->
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Main Narrative Profile
            </label>
            <select
              class="input"
              value={settings.apiSettings.mainNarrativeProfileId}
              onchange={(e) => handleSetMainNarrativeProfile(e.currentTarget.value)}
            >
              {#each settings.apiSettings.profiles as profile (profile.id)}
                <option value={profile.id}>
                  {profile.name}
                  {#if profile.id === settings.getDefaultProfileIdForProvider()} (Default){/if}
                </option>
              {/each}
            </select>
            <p class="mt-1 text-xs text-surface-500">
              API endpoint used for story generation
            </p>
          </div>

          <!-- Main Narrative Model -->
          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-medium text-surface-300">
                Main Narrative Model
              </label>
              <button
                class="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 disabled:opacity-50"
                onclick={handleRefreshModels}
                disabled={isLoadingModels}
              >
                <span class={isLoadingModels ? 'animate-spin' : ''}>
                  <RefreshCw class="h-3 w-3" />
                </span>
                Refresh Models
              </button>
            </div>

            {#if modelError}
              <p class="mb-2 text-xs text-amber-400">{modelError}</p>
            {/if}

            <!-- Search input -->
            <div class="relative mb-2">
              <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500" />
              <input
                type="text"
                bind:value={modelSearch}
                placeholder="Search models..."
                class="input pl-9 text-sm"
              />
            </div>

            <!-- Model select -->
            <select
              class="input"
              value={settings.apiSettings.defaultModel}
              onchange={(e) => settings.setDefaultModel(e.currentTarget.value)}
              disabled={isLoadingModels}
            >
              {#if isLoadingModels}
                <option>Loading models...</option>
              {:else if filteredModels.length === 0}
                <option value="">No models available - click Refresh</option>
              {:else}
                {#each filteredModels as modelId}
                  <option value={modelId}>
                    {modelId}
                  </option>
                {/each}
              {/if}
            </select>

            {#if profileModels.length > 0}
              <p class="mt-1 text-xs text-surface-500">
                {profileModels.length} models available from selected profile
              </p>
            {/if}
          </div>

          <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Temperature: {settings.apiSettings.temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.apiSettings.temperature}
              oninput={(e) => settings.setTemperature(parseFloat(e.currentTarget.value))}
              disabled={settings.advancedRequestSettings.manualMode}
              class="w-full"
            />
            <div class="flex justify-between text-xs text-surface-500">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>

          <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Max Tokens: {settings.apiSettings.maxTokens}
            </label>
            <input
              type="range"
              min="256"
              max="8192"
              step="128"
              value={settings.apiSettings.maxTokens}
              oninput={(e) => settings.setMaxTokens(parseInt(e.currentTarget.value))}
              disabled={settings.advancedRequestSettings.manualMode}
              class="w-full"
            />
            <div class="flex justify-between text-xs text-surface-500">
              <span>Shorter</span>
              <span>Longer</span>
            </div>
          </div>

          <div class="border-t border-surface-700 pt-4 space-y-3">
            <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
              <label class="mb-1 block text-sm font-medium text-surface-300">
                Thinking: {reasoningLabels[settings.apiSettings.reasoningEffort]}
              </label>
              <input
                type="range"
                min="0"
                max="3"
                step="1"
                value={getReasoningIndex(settings.apiSettings.reasoningEffort)}
                onchange={(e) => settings.setMainReasoningEffort(getReasoningValue(parseInt(e.currentTarget.value)))}
                disabled={settings.advancedRequestSettings.manualMode}
                class="w-full"
              />
              <div class="flex justify-between text-xs text-surface-500">
                <span>Off</span>
                <span>Low</span>
                <span>Medium</span>
                <span>High</span>
              </div>
            </div>

            <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
              <ProviderOnlySelector
                providers={providerOptions}
                selected={settings.apiSettings.providerOnly}
                disabled={settings.advancedRequestSettings.manualMode}
                onChange={(next) => {
                  settings.setMainProviderOnly(next);
                }}
              />
            </div>

            {#if settings.advancedRequestSettings.manualMode}
              <div class="border-t border-surface-700 pt-3">
                <div class="mb-1 flex items-center justify-between">
                  <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                  <button
                    class="text-xs text-accent-400 hover:text-accent-300"
                    onclick={() => openManualBodyEditor('Main Narrative', settings.apiSettings.manualBody, (next) => {
                      settings.apiSettings.manualBody = next;
                      settings.setMainManualBody(next);
                    })}
                  >
                    Pop out
                  </button>
                </div>
                <textarea
                  bind:value={settings.apiSettings.manualBody}
                  onblur={() => settings.setMainManualBody(settings.apiSettings.manualBody)}
                  class="input text-xs min-h-[140px] resize-y font-mono w-full"
                  rows="6"
                ></textarea>
                <p class="text-xs text-surface-500 mt-1">
                  Overrides request parameters; messages and tools are managed by Aventura.
                </p>
              </div>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'ui'}
        <div class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Theme
            </label>
            <select
              class="input"
              value={settings.uiSettings.theme}
              onchange={(e) => settings.setTheme(e.currentTarget.value as ThemeId)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="retro-console">Retro Console</option>
            </select>
            {#if settings.uiSettings.theme === 'retro-console'}
              <p class="mt-1 text-xs text-surface-400">
                CRT aesthetic inspired by PS2-era games and Serial Experiments Lain
              </p>
            {/if}
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Font Size
            </label>
            <select
              class="input"
              value={settings.uiSettings.fontSize}
              onchange={(e) => settings.setFontSize(e.currentTarget.value as 'small' | 'medium' | 'large')}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>

          <div class="flex items-center justify-between">
            <label class="text-sm font-medium text-surface-300">Show Word Count</label>
            <input
              type="checkbox"
              checked={settings.uiSettings.showWordCount}
              onchange={() => {
                settings.uiSettings.showWordCount = !settings.uiSettings.showWordCount;
              }}
              class="h-5 w-5 rounded border-surface-600 bg-surface-700"
            />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium text-surface-300">Spellcheck</label>
              <p class="text-xs text-surface-500">Grammar and spelling suggestions while typing</p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              class:bg-accent-600={settings.uiSettings.spellcheckEnabled}
              class:bg-surface-600={!settings.uiSettings.spellcheckEnabled}
              onclick={() => settings.setSpellcheckEnabled(!settings.uiSettings.spellcheckEnabled)}
              aria-label="Toggle spellcheck"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                class:translate-x-6={settings.uiSettings.spellcheckEnabled}
                class:translate-x-1={!settings.uiSettings.spellcheckEnabled}
              ></span>
            </button>
          </div>

          <!-- Updates Section -->
          <div class="border-t border-surface-700 pt-4 mt-4">
            <div class="flex items-center gap-2 mb-3">
              <Download class="h-5 w-5 text-accent-400" />
              <h3 class="text-sm font-medium text-surface-200">Updates</h3>
            </div>

            <!-- Update Status -->
            <div class="card bg-surface-900 p-3 mb-3">
              <div class="flex items-center justify-between mb-2">
                <div>
                  <p class="text-sm text-surface-200">
                    {#if updateInfo?.available}
                      Update available: v{updateInfo.version}
                    {:else if updateInfo !== null}
                      You're up to date
                    {:else}
                      Check for updates
                    {/if}
                  </p>
                  <p class="text-xs text-surface-500">
                    Last checked: {formatLastChecked(settings.updateSettings.lastChecked)}
                  </p>
                </div>
                <button
                  class="btn btn-secondary text-sm flex items-center gap-2"
                  onclick={handleCheckForUpdates}
                  disabled={isCheckingUpdates || isDownloadingUpdate}
                >
                  {#if isCheckingUpdates}
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Checking...
                  {:else}
                    <RefreshCw class="h-4 w-4" />
                    Check
                  {/if}
                </button>
              </div>

              {#if updateError}
                <p class="text-xs text-red-400 mt-2">{updateError}</p>
              {/if}

              {#if updateInfo?.available}
                <div class="mt-3 pt-3 border-t border-surface-700">
                  {#if updateInfo.body}
                    <p class="text-xs text-surface-400 mb-3 line-clamp-3">{updateInfo.body}</p>
                  {/if}

                  {#if isDownloadingUpdate && downloadProgress}
                    <div class="mb-2">
                      <div class="flex justify-between text-xs text-surface-400 mb-1">
                        <span>Downloading...</span>
                        <span>
                          {#if downloadProgress.total}
                            {Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)}%
                          {:else}
                            {Math.round(downloadProgress.downloaded / 1024 / 1024)}MB
                          {/if}
                        </span>
                      </div>
                      <div class="h-2 bg-surface-700 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-accent-500 transition-all duration-300"
                          style="width: {downloadProgress.total ? (downloadProgress.downloaded / downloadProgress.total) * 100 : 50}%"
                        ></div>
                      </div>
                    </div>
                  {:else}
                    <button
                      class="btn btn-primary text-sm w-full flex items-center justify-center gap-2"
                      onclick={handleDownloadAndInstall}
                      disabled={isDownloadingUpdate}
                    >
                      <Download class="h-4 w-4" />
                      Download & Install v{updateInfo.version}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Auto-update Settings -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium text-surface-300">Check on startup</label>
                  <p class="text-xs text-surface-500">Automatically check for updates when the app opens</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.updateSettings.autoCheck}
                  class:bg-surface-600={!settings.updateSettings.autoCheck}
                  onclick={() => settings.setAutoCheck(!settings.updateSettings.autoCheck)}
                  aria-label="Toggle auto-check updates"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    class:translate-x-6={settings.updateSettings.autoCheck}
                    class:translate-x-1={!settings.updateSettings.autoCheck}
                  ></span>
                </button>
              </div>

              <div class="flex items-center justify-between">
                <div>
                  <label class="text-sm font-medium text-surface-300">Auto-download updates</label>
                  <p class="text-xs text-surface-500">Download updates automatically in the background</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.updateSettings.autoDownload}
                  class:bg-surface-600={!settings.updateSettings.autoDownload}
                  onclick={() => settings.setAutoDownload(!settings.updateSettings.autoDownload)}
                  aria-label="Toggle auto-download updates"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    class:translate-x-6={settings.updateSettings.autoDownload}
                    class:translate-x-1={!settings.updateSettings.autoDownload}
                  ></span>
                </button>
              </div>
            </div>
          </div>
        </div>
      {:else if activeTab === 'advanced'}
        <div class="space-y-4">
          <div class="border-b border-surface-700 pb-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-surface-200">Manual Request Mode</h3>
                <p class="text-xs text-surface-500">Edit full request body parameters for advanced models.</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                class:bg-accent-600={settings.advancedRequestSettings.manualMode}
                class:bg-surface-600={!settings.advancedRequestSettings.manualMode}
                onclick={handleManualModeToggle}
                aria-label="Toggle manual request mode"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  class:translate-x-6={settings.advancedRequestSettings.manualMode}
                  class:translate-x-1={!settings.advancedRequestSettings.manualMode}
                ></span>
              </button>
            </div>
            {#if settings.advancedRequestSettings.manualMode}
              <p class="mt-2 text-xs text-amber-400/80">
                Manual mode uses your JSON overrides. Reasoning, provider-only, temperature, and max token controls are locked.
              </p>
            {/if}
            {#if isLoadingProviders}
              <p class="mt-2 text-xs text-surface-500">Loading provider list...</p>
            {:else if providerError}
              <p class="mt-2 text-xs text-red-400">{providerError} Using fallback list.</p>
            {/if}
          </div>
          <!-- Story Generation Section -->
          <div class="border-b border-surface-700 pb-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showStoryGenSection = !showStoryGenSection}
              >
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Story Generation</h3>
                  <p class="text-xs text-surface-500">Main AI prompts for gameplay</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetStoryGenerationSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showStoryGenSection = !showStoryGenSection}>
                  {#if showStoryGenSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showStoryGenSection}
              <div class="mt-3 space-y-3">
                <!-- Adventure Mode Prompt -->
                <div class="card bg-surface-900 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-surface-200">Adventure Mode Prompt</span>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => editingStoryPrompt = editingStoryPrompt === 'adventure' ? null : 'adventure'}
                    >
                      {editingStoryPrompt === 'adventure' ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {#if editingStoryPrompt === 'adventure'}
                    <textarea
                      bind:value={settings.storyGenerationSettings.adventurePrompt}
                      onblur={() => settings.saveStoryGenerationSettings()}
                      class="input text-xs min-h-[200px] resize-y font-mono w-full"
                      rows="10"
                    ></textarea>
                  {:else}
                    <p class="text-xs text-surface-400 line-clamp-2">
                      {settings.storyGenerationSettings.adventurePrompt.slice(0, 150)}...
                    </p>
                  {/if}
                </div>

                <!-- Creative Writing Mode Prompt -->
                <div class="card bg-surface-900 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-sm font-medium text-surface-200">Creative Writing Mode Prompt</span>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => editingStoryPrompt = editingStoryPrompt === 'creativeWriting' ? null : 'creativeWriting'}
                    >
                      {editingStoryPrompt === 'creativeWriting' ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {#if editingStoryPrompt === 'creativeWriting'}
                    <textarea
                      bind:value={settings.storyGenerationSettings.creativeWritingPrompt}
                      onblur={() => settings.saveStoryGenerationSettings()}
                      class="input text-xs min-h-[200px] resize-y font-mono w-full"
                      rows="10"
                    ></textarea>
                  {:else}
                    <p class="text-xs text-surface-400 line-clamp-2">
                      {settings.storyGenerationSettings.creativeWritingPrompt.slice(0, 150)}...
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Wizard Generation Section -->
          <div>
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showWizardSection = !showWizardSection}
              >
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Story Wizard</h3>
                  <p class="text-xs text-surface-500">Models and prompts for wizard generation</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetAllWizardSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showWizardSection = !showWizardSection}>
                  {#if showWizardSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showWizardSection}
              <div class="mt-3 space-y-3">
                {#each Object.entries(processLabels) as [processKey, label]}
                  {@const process = processKey as keyof AdvancedWizardSettings}
                  {@const processSettings = settings.wizardSettings[process]}
                  <div class="card bg-surface-900 p-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-sm font-medium text-surface-200">{label}</span>
                      <div class="flex items-center gap-2">
                        <button
                          class="text-xs text-surface-400 hover:text-surface-200"
                          onclick={() => settings.resetWizardProcess(process)}
                          title="Reset to default"
                        >
                          <RotateCcw class="h-3 w-3" />
                        </button>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => editingProcess = editingProcess === process ? null : process}
                        >
                          {editingProcess === process ? 'Close' : 'Edit'}
                        </button>
                      </div>
                    </div>

                    {#if editingProcess === process}
                      <div class="space-y-3 pt-2 border-t border-surface-700">
                        <!-- Profile and Model Selection -->
                        <ModelSelector
                          profileId={settings.wizardSettings[process].profileId ?? null}
                          model={settings.wizardSettings[process].model ?? SCENARIO_MODEL}
                          onProfileChange={(id) => {
                            settings.wizardSettings[process].profileId = id;
                            settings.saveWizardSettings();
                          }}
                          onModelChange={(m) => {
                            settings.wizardSettings[process].model = m;
                            settings.saveWizardSettings();
                          }}
                          onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                        />

                        <!-- Temperature -->
                        <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Temperature: {processSettings.temperature?.toFixed(2) ?? 0.8}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            bind:value={settings.wizardSettings[process].temperature}
                            onchange={() => settings.saveWizardSettings()}
                            disabled={settings.advancedRequestSettings.manualMode}
                            class="w-full h-2"
                          />
                          <div class="flex justify-between text-xs text-surface-500">
                            <span>Focused</span>
                            <span>Creative</span>
                          </div>
                        </div>

                        <!-- Max Tokens -->
                        <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Max Tokens: {processSettings.maxTokens ?? 1000}
                          </label>
                          <input
                            type="range"
                            min="256"
                            max="8192"
                            step="128"
                            bind:value={settings.wizardSettings[process].maxTokens}
                            onchange={() => settings.saveWizardSettings()}
                            disabled={settings.advancedRequestSettings.manualMode}
                            class="w-full h-2"
                          />
                          <div class="flex justify-between text-xs text-surface-500">
                            <span>256</span>
                            <span>8192</span>
                          </div>
                        </div>

                        <!-- Thinking -->
                        <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Thinking: {reasoningLabels[processSettings.reasoningEffort ?? 'off']}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="1"
                            value={getReasoningIndex(processSettings.reasoningEffort)}
                            onchange={(e) => {
                              settings.wizardSettings[process].reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                              settings.saveWizardSettings();
                            }}
                            disabled={settings.advancedRequestSettings.manualMode}
                            class="w-full h-2"
                          />
                          <div class="flex justify-between text-xs text-surface-500">
                            <span>Off</span>
                            <span>Low</span>
                            <span>Medium</span>
                            <span>High</span>
                          </div>
                        </div>

                        <!-- Provider Only -->
                        <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <ProviderOnlySelector
                            providers={providerOptions}
                            selected={processSettings.providerOnly ?? []}
                            disabled={settings.advancedRequestSettings.manualMode}
                            onChange={(next) => {
                              settings.wizardSettings[process].providerOnly = next;
                              settings.saveWizardSettings();
                            }}
                          />
                        </div>

                        {#if settings.advancedRequestSettings.manualMode}
                          <div class="border-t border-surface-700 pt-3">
                            <div class="mb-1 flex items-center justify-between">
                              <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                              <button
                                class="text-xs text-accent-400 hover:text-accent-300"
                                onclick={() => openManualBodyEditor(`Wizard: ${processLabels[process]}`, settings.wizardSettings[process].manualBody ?? '', (next) => {
                                  settings.wizardSettings[process].manualBody = next;
                                  settings.saveWizardSettings();
                                })}
                              >
                                Pop out
                              </button>
                            </div>
                            <textarea
                              bind:value={settings.wizardSettings[process].manualBody}
                              onblur={() => settings.saveWizardSettings()}
                              class="input text-xs min-h-[140px] resize-y font-mono w-full"
                              rows="6"
                            ></textarea>
                            <p class="text-xs text-surface-500 mt-1">
                              Overrides request parameters; messages and tools are managed by Aventura.
                            </p>
                          </div>
                        {/if}

                        <!-- System Prompt -->
                        <div>
                          <label class="mb-1 block text-xs font-medium text-surface-400">System Prompt</label>
                          <textarea
                            bind:value={settings.wizardSettings[process].systemPrompt}
                            onblur={() => settings.saveWizardSettings()}
                            class="input text-xs min-h-[120px] resize-y font-mono"
                            rows="6"
                          ></textarea>
                          <p class="text-xs text-surface-500 mt-1">
                            {#if process === 'openingGeneration'}
                              Placeholders: {'{userName}'}, {'{genreLabel}'}, {'{mode}'}, {'{tense}'}, {'{tone}'}
                            {:else}
                              Customize the system prompt for this process.
                            {/if}
                          </p>
                        </div>
                      </div>
                    {:else}
                      <div class="text-xs text-surface-400">
                        <span class="text-surface-500">Model:</span> {processSettings.model || SCENARIO_MODEL}
                        <span class="mx-2">•</span>
                        <span class="text-surface-500">Temp:</span> {processSettings.temperature?.toFixed(1) ?? 0.8}
                        <span class="mx-2">•</span>
                        <span class="text-surface-500">Tokens:</span> {processSettings.maxTokens ?? 1000}
                      </div>
                    {/if}
                  </div>
                {/each}

                <!-- Lorebook Import Classification Subsection -->
                <div class="card bg-surface-900 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <FolderOpen class="h-4 w-4 text-green-400" />
                      <span class="text-sm font-medium text-surface-200">Lorebook Import Classification</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        class="text-xs text-surface-400 hover:text-surface-200"
                        onclick={() => settings.resetLorebookClassifierSettings()}
                        title="Reset to default"
                      >
                        <RotateCcw class="h-3 w-3" />
                      </button>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => editingLorebookClassifier = !editingLorebookClassifier}
                      >
                        {editingLorebookClassifier ? 'Close' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {#if editingLorebookClassifier}
                    <div class="space-y-3 mt-3 pt-3 border-t border-surface-700">
                      <!-- Profile and Model Selector -->
                      <ModelSelector
                        profileId={settings.systemServicesSettings.lorebookClassifier?.profileId ?? settings.apiSettings.mainNarrativeProfileId}
                        model={settings.systemServicesSettings.lorebookClassifier?.model ?? 'x-ai/grok-4.1-fast'}
                        onProfileChange={(id) => {
                          settings.systemServicesSettings.lorebookClassifier.profileId = id;
                          settings.saveSystemServicesSettings();
                        }}
                        onModelChange={(m) => {
                          settings.systemServicesSettings.lorebookClassifier.model = m;
                          settings.saveSystemServicesSettings();
                        }}
                        onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                      />

                      <!-- Temperature -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Temperature: {(settings.systemServicesSettings.lorebookClassifier?.temperature ?? 0.1).toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.systemServicesSettings.lorebookClassifier?.temperature ?? 0.1}
                          oninput={(e) => {
                            settings.systemServicesSettings.lorebookClassifier.temperature = parseFloat(e.currentTarget.value);
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                      </div>

                      <!-- Batch Size -->
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Batch Size: {settings.systemServicesSettings.lorebookClassifier?.batchSize ?? 50}
                        </label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="10"
                          value={settings.systemServicesSettings.lorebookClassifier?.batchSize ?? 50}
                          oninput={(e) => {
                            settings.systemServicesSettings.lorebookClassifier.batchSize = parseInt(e.currentTarget.value);
                            settings.saveSystemServicesSettings();
                          }}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Smaller batches</span>
                          <span>Larger batches</span>
                        </div>
                      </div>

                      <!-- Max Concurrent -->
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Max Concurrent: {settings.systemServicesSettings.lorebookClassifier?.maxConcurrent ?? 5}
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={settings.systemServicesSettings.lorebookClassifier?.maxConcurrent ?? 5}
                          oninput={(e) => {
                            settings.systemServicesSettings.lorebookClassifier.maxConcurrent = parseInt(e.currentTarget.value);
                            settings.saveSystemServicesSettings();
                          }}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Sequential</span>
                          <span>Parallel</span>
                        </div>
                      </div>

                      <!-- Thinking -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Thinking: {reasoningLabels[settings.systemServicesSettings.lorebookClassifier.reasoningEffort]}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={getReasoningIndex(settings.systemServicesSettings.lorebookClassifier.reasoningEffort)}
                          onchange={(e) => {
                            settings.systemServicesSettings.lorebookClassifier.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Off</span>
                          <span>Low</span>
                          <span>Medium</span>
                          <span>High</span>
                        </div>
                      </div>

                      <!-- Provider Only -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <ProviderOnlySelector
                          providers={providerOptions}
                          selected={settings.systemServicesSettings.lorebookClassifier.providerOnly}
                          disabled={settings.advancedRequestSettings.manualMode}
                          onChange={(next) => {
                            settings.systemServicesSettings.lorebookClassifier.providerOnly = next;
                            settings.saveSystemServicesSettings();
                          }}
                        />
                      </div>

                      {#if settings.advancedRequestSettings.manualMode}
                        <div class="border-t border-surface-700 pt-3">
                          <div class="mb-1 flex items-center justify-between">
                            <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                            <button
                              class="text-xs text-accent-400 hover:text-accent-300"
                              onclick={() => openManualBodyEditor('Lorebook Import Classification', settings.systemServicesSettings.lorebookClassifier.manualBody, (next) => {
                                settings.systemServicesSettings.lorebookClassifier.manualBody = next;
                                settings.saveSystemServicesSettings();
                              })}
                            >
                              Pop out
                            </button>
                          </div>
                          <textarea
                            value={settings.systemServicesSettings.lorebookClassifier.manualBody}
                            oninput={(e) => {
                              settings.systemServicesSettings.lorebookClassifier.manualBody = e.currentTarget.value;
                            }}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[140px] resize-y font-mono w-full"
                            rows="6"
                          ></textarea>
                          <p class="text-xs text-surface-500 mt-1">
                            Overrides request parameters; messages and tools are managed by Aventura.
                          </p>
                        </div>
                      {/if}

                      <!-- System Prompt -->
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">System Prompt</label>
                        <textarea
                          value={settings.systemServicesSettings.lorebookClassifier?.systemPrompt ?? ''}
                          oninput={(e) => {
                            settings.systemServicesSettings.lorebookClassifier.systemPrompt = e.currentTarget.value;
                          }}
                          onblur={() => settings.saveSystemServicesSettings()}
                          class="input text-xs min-h-[100px] resize-y font-mono w-full"
                          rows="5"
                        ></textarea>
                      </div>
                    </div>
                  {:else}
                    <div class="text-xs text-surface-400">
                      <span class="text-surface-500">Model:</span> {settings.systemServicesSettings.lorebookClassifier?.model ?? 'x-ai/grok-4.1-fast'}
                      <span class="mx-2">•</span>
                      <span class="text-surface-500">Temp:</span> {(settings.systemServicesSettings.lorebookClassifier?.temperature ?? 0.1).toFixed(1)}
                      <span class="mx-2">•</span>
                      <span class="text-surface-500">Batch:</span> {settings.systemServicesSettings.lorebookClassifier?.batchSize ?? 50}
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- World State Classifier Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showClassifierSection = !showClassifierSection}
              >
                <Brain class="h-4 w-4 text-purple-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">World State Classifier</h3>
                  <p class="text-xs text-surface-500">Extracts entities from narrative responses</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetClassifierSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showClassifierSection = !showClassifierSection}>
                  {#if showClassifierSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showClassifierSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.classifier.profileId}
                      model={settings.systemServicesSettings.classifier.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.classifier.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.classifier.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.classifier.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.classifier.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tokens: {settings.systemServicesSettings.classifier.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="8192"
                      step="100"
                      bind:value={settings.systemServicesSettings.classifier.maxTokens}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.classifier.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.classifier.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.classifier.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.classifier.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.classifier.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3 mb-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('World State Classifier', settings.systemServicesSettings.classifier.manualBody, (next) => {
                            settings.systemServicesSettings.classifier.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.classifier.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- System Prompt -->
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-surface-400">System Prompt</span>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => editingClassifierPrompt = !editingClassifierPrompt}
                    >
                      {editingClassifierPrompt ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {#if editingClassifierPrompt}
                    <textarea
                      bind:value={settings.systemServicesSettings.classifier.systemPrompt}
                      onblur={() => settings.saveSystemServicesSettings()}
                      class="input text-xs min-h-[200px] resize-y font-mono w-full"
                      rows="10"
                    ></textarea>
                  {:else}
                    <p class="text-xs text-surface-400 line-clamp-2">
                      {settings.systemServicesSettings.classifier.systemPrompt.slice(0, 150)}...
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Memory Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showMemorySection = !showMemorySection}
              >
                <BookOpen class="h-4 w-4 text-blue-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Memory & Chapters</h3>
                  <p class="text-xs text-surface-500">Chapter analysis, summarization, and retrieval</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetMemorySettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showMemorySection = !showMemorySection}>
                  {#if showMemorySection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showMemorySection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.memory.profileId}
                      model={settings.systemServicesSettings.memory.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.memory.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.memory.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.memory.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.memory.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.memory.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.memory.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.memory.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.memory.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.memory.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3 mb-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Memory & Chapters', settings.systemServicesSettings.memory.manualBody, (next) => {
                            settings.systemServicesSettings.memory.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.memory.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- Chapter Analysis Prompt -->
                  <div class="mb-3 border-t border-surface-700 pt-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-medium text-surface-400">Chapter Analysis Prompt</span>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => editingMemoryPrompt = editingMemoryPrompt === 'chapterAnalysis' ? null : 'chapterAnalysis'}
                      >
                        {editingMemoryPrompt === 'chapterAnalysis' ? 'Close' : 'Edit'}
                      </button>
                    </div>
                    {#if editingMemoryPrompt === 'chapterAnalysis'}
                      <textarea
                        bind:value={settings.systemServicesSettings.memory.chapterAnalysisPrompt}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[100px] resize-y font-mono w-full"
                        rows="5"
                      ></textarea>
                    {:else}
                      <p class="text-xs text-surface-400 line-clamp-2">
                        {settings.systemServicesSettings.memory.chapterAnalysisPrompt.slice(0, 100)}...
                      </p>
                    {/if}
                  </div>

                  <!-- Chapter Summarization Prompt -->
                  <div class="mb-3 border-t border-surface-700 pt-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-medium text-surface-400">Chapter Summarization Prompt</span>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => editingMemoryPrompt = editingMemoryPrompt === 'chapterSummarization' ? null : 'chapterSummarization'}
                      >
                        {editingMemoryPrompt === 'chapterSummarization' ? 'Close' : 'Edit'}
                      </button>
                    </div>
                    {#if editingMemoryPrompt === 'chapterSummarization'}
                      <textarea
                        bind:value={settings.systemServicesSettings.memory.chapterSummarizationPrompt}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[100px] resize-y font-mono w-full"
                        rows="5"
                      ></textarea>
                    {:else}
                      <p class="text-xs text-surface-400 line-clamp-2">
                        {settings.systemServicesSettings.memory.chapterSummarizationPrompt.slice(0, 100)}...
                      </p>
                    {/if}
                  </div>

                  <!-- Retrieval Decision Prompt -->
                  <div class="border-t border-surface-700 pt-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-medium text-surface-400">Retrieval Decision Prompt</span>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => editingMemoryPrompt = editingMemoryPrompt === 'retrievalDecision' ? null : 'retrievalDecision'}
                      >
                        {editingMemoryPrompt === 'retrievalDecision' ? 'Close' : 'Edit'}
                      </button>
                    </div>
                    {#if editingMemoryPrompt === 'retrievalDecision'}
                      <textarea
                        bind:value={settings.systemServicesSettings.memory.retrievalDecisionPrompt}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[100px] resize-y font-mono w-full"
                        rows="5"
                      ></textarea>
                    {:else}
                      <p class="text-xs text-surface-400 line-clamp-2">
                        {settings.systemServicesSettings.memory.retrievalDecisionPrompt.slice(0, 100)}...
                      </p>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Suggestions Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showSuggestionsSection = !showSuggestionsSection}
              >
                <Lightbulb class="h-4 w-4 text-yellow-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Story Suggestions</h3>
                  <p class="text-xs text-surface-500">Generates story direction suggestions</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetSuggestionsSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showSuggestionsSection = !showSuggestionsSection}>
                  {#if showSuggestionsSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showSuggestionsSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.suggestions.profileId}
                      model={settings.systemServicesSettings.suggestions.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.suggestions.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.suggestions.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.suggestions.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.suggestions.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tokens: {settings.systemServicesSettings.suggestions.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="200"
                      max="2000"
                      step="100"
                      bind:value={settings.systemServicesSettings.suggestions.maxTokens}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.suggestions.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.suggestions.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.suggestions.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.suggestions.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.suggestions.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3 mb-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Story Suggestions', settings.systemServicesSettings.suggestions.manualBody, (next) => {
                            settings.systemServicesSettings.suggestions.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.suggestions.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- System Prompt -->
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-surface-400">System Prompt</span>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => editingSuggestionsPrompt = !editingSuggestionsPrompt}
                    >
                      {editingSuggestionsPrompt ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {#if editingSuggestionsPrompt}
                    <textarea
                      bind:value={settings.systemServicesSettings.suggestions.systemPrompt}
                      onblur={() => settings.saveSystemServicesSettings()}
                      class="input text-xs min-h-[100px] resize-y font-mono w-full"
                      rows="5"
                    ></textarea>
                  {:else}
                    <p class="text-xs text-surface-400 line-clamp-2">
                      {settings.systemServicesSettings.suggestions.systemPrompt.slice(0, 100)}...
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Action Choices Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showActionChoicesSection = !showActionChoicesSection}
              >
                <ListChecks class="h-4 w-4 text-emerald-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Action Choices</h3>
                  <p class="text-xs text-surface-500">RPG-style options for adventure mode</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetActionChoicesSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showActionChoicesSection = !showActionChoicesSection}>
                  {#if showActionChoicesSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showActionChoicesSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.actionChoices.profileId}
                      model={settings.systemServicesSettings.actionChoices.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.actionChoices.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.actionChoices.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.actionChoices.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.actionChoices.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tokens: {settings.systemServicesSettings.actionChoices.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="8192"
                      step="128"
                      bind:value={settings.systemServicesSettings.actionChoices.maxTokens}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.actionChoices.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.actionChoices.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.actionChoices.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.actionChoices.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.actionChoices.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Action Choices', settings.systemServicesSettings.actionChoices.manualBody, (next) => {
                            settings.systemServicesSettings.actionChoices.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.actionChoices.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Style Reviewer Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showStyleReviewerSection = !showStyleReviewerSection}
              >
                <Sparkles class="h-4 w-4 text-pink-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Style Reviewer</h3>
                  <p class="text-xs text-surface-500">Analyzes prose for repetitive phrases</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <!-- Enable/Disable Toggle -->
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.systemServicesSettings.styleReviewer.enabled}
                  class:bg-surface-600={!settings.systemServicesSettings.styleReviewer.enabled}
                  onclick={async () => {
                    settings.systemServicesSettings.styleReviewer.enabled =
                      !settings.systemServicesSettings.styleReviewer.enabled;
                    await settings.saveSystemServicesSettings();
                  }}
                  aria-label="Toggle style reviewer"
                >
                  <span
                    class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                    class:translate-x-5={settings.systemServicesSettings.styleReviewer.enabled}
                    class:translate-x-1={!settings.systemServicesSettings.styleReviewer.enabled}
                  ></span>
                </button>
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetStyleReviewerSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showStyleReviewerSection = !showStyleReviewerSection}>
                  {#if showStyleReviewerSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showStyleReviewerSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.styleReviewer.profileId}
                      model={settings.systemServicesSettings.styleReviewer.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.styleReviewer.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.styleReviewer.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.styleReviewer.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.styleReviewer.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Trigger Interval -->
                  <div class="mb-3">
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Review Interval: Every {settings.systemServicesSettings.styleReviewer.triggerInterval} messages
                    </label>
                    <input
                      type="range"
                      min="3"
                      max="15"
                      step="1"
                      bind:value={settings.systemServicesSettings.styleReviewer.triggerInterval}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>More Frequent</span>
                      <span>Less Frequent</span>
                    </div>
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tokens: {settings.systemServicesSettings.styleReviewer.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="3000"
                      step="100"
                      bind:value={settings.systemServicesSettings.styleReviewer.maxTokens}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.styleReviewer.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.styleReviewer.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.styleReviewer.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.styleReviewer.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.styleReviewer.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3 mb-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Style Reviewer', settings.systemServicesSettings.styleReviewer.manualBody, (next) => {
                            settings.systemServicesSettings.styleReviewer.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.styleReviewer.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- System Prompt -->
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-medium text-surface-400">System Prompt</span>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => editingStyleReviewerPrompt = !editingStyleReviewerPrompt}
                    >
                      {editingStyleReviewerPrompt ? 'Close' : 'Edit'}
                    </button>
                  </div>
                  {#if editingStyleReviewerPrompt}
                    <textarea
                      bind:value={settings.systemServicesSettings.styleReviewer.systemPrompt}
                      onblur={() => settings.saveSystemServicesSettings()}
                      class="input text-xs min-h-[150px] resize-y font-mono w-full"
                      rows="8"
                    ></textarea>
                  {:else}
                    <p class="text-xs text-surface-400 line-clamp-2">
                      {settings.systemServicesSettings.styleReviewer.systemPrompt.slice(0, 100)}...
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Lorebook Retrieval Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showEntryRetrievalSection = !showEntryRetrievalSection}
              >
                <Search class="h-4 w-4 text-emerald-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Lorebook Retrieval</h3>
                  <p class="text-xs text-surface-500">Tiered lorebook entry selection (fast model recommended)</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <!-- Enable/Disable Tier 3 LLM Selection -->
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.systemServicesSettings.entryRetrieval.enableLLMSelection}
                  class:bg-surface-600={!settings.systemServicesSettings.entryRetrieval.enableLLMSelection}
                  onclick={async () => {
                    settings.systemServicesSettings.entryRetrieval.enableLLMSelection =
                      !settings.systemServicesSettings.entryRetrieval.enableLLMSelection;
                    await settings.saveSystemServicesSettings();
                  }}
                  aria-label="Toggle Tier 3 LLM selection"
                >
                  <span
                    class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                    class:translate-x-5={settings.systemServicesSettings.entryRetrieval.enableLLMSelection}
                    class:translate-x-1={!settings.systemServicesSettings.entryRetrieval.enableLLMSelection}
                  ></span>
                </button>
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetEntryRetrievalSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showEntryRetrievalSection = !showEntryRetrievalSection}>
                  {#if showEntryRetrievalSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showEntryRetrievalSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <p class="text-xs text-surface-400 mb-3">
                    Uses a lightweight model to select contextually relevant lorebook entries
                    that did not match keywords (Tier 3). Tier 1 and Tier 2 still run regardless.
                  </p>

                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.entryRetrieval.profileId}
                      model={settings.systemServicesSettings.entryRetrieval.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.entryRetrieval.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.entryRetrieval.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.entryRetrieval.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.entryRetrieval.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.entryRetrieval.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.entryRetrieval.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.entryRetrieval.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.entryRetrieval.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.entryRetrieval.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3 mb-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Lorebook Retrieval', settings.systemServicesSettings.entryRetrieval.manualBody, (next) => {
                            settings.systemServicesSettings.entryRetrieval.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.entryRetrieval.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- Max Tier 3 Entries -->
                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tier 3 Entries: {settings.systemServicesSettings.entryRetrieval.maxTier3Entries === 0 ? 'Unlimited' : settings.systemServicesSettings.entryRetrieval.maxTier3Entries}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="1"
                      bind:value={settings.systemServicesSettings.entryRetrieval.maxTier3Entries}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>0 = unlimited</span>
                      <span>50 max</span>
                    </div>
                  </div>

                  <!-- Truncation -->
                  <div class="mt-3">
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Truncation (max words per entry): {settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry === 0 ? 'Unlimited' : settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="10"
                      bind:value={settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>0 = unlimited</span>
                      <span>500 max</span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Lore Management Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showLoreManagementSection = !showLoreManagementSection}
              >
                <FolderOpen class="h-4 w-4 text-amber-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Lorebook Management</h3>
                  <p class="text-xs text-surface-500">Agentic updates to keep lore entries current</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetLoreManagementSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showLoreManagementSection = !showLoreManagementSection}>
                  {#if showLoreManagementSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showLoreManagementSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <p class="text-xs text-surface-400 mb-3">
                    Runs a tool-calling loop that scans story content and updates lore entries for consistency.
                  </p>

                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={settings.systemServicesSettings.loreManagement.profileId}
                      model={settings.systemServicesSettings.loreManagement.model}
                      onProfileChange={(id) => {
                        settings.systemServicesSettings.loreManagement.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        settings.systemServicesSettings.loreManagement.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {settings.systemServicesSettings.loreManagement.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      bind:value={settings.systemServicesSettings.loreManagement.temperature}
                      onchange={() => settings.saveSystemServicesSettings()}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Max Iterations -->
                  <div class="mb-3">
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Iterations: {settings.systemServicesSettings.loreManagement.maxIterations}
                    </label>
                    <input
                      type="range"
                      min="5"
                      max="75"
                      step="1"
                      bind:value={settings.systemServicesSettings.loreManagement.maxIterations}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Fewer iterations</span>
                      <span>More thorough</span>
                    </div>
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[settings.systemServicesSettings.loreManagement.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(settings.systemServicesSettings.loreManagement.reasoningEffort)}
                      onchange={(e) => {
                        settings.systemServicesSettings.loreManagement.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>Off</span>
                      <span>Low</span>
                      <span>Medium</span>
                      <span>High</span>
                    </div>
                  </div>

                  <!-- Provider Only -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <ProviderOnlySelector
                      providers={providerOptions}
                      selected={settings.systemServicesSettings.loreManagement.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        settings.systemServicesSettings.loreManagement.providerOnly = next;
                        settings.saveSystemServicesSettings();
                      }}
                    />
                  </div>

                  {#if settings.advancedRequestSettings.manualMode}
                    <div class="border-t border-surface-700 pt-3">
                      <div class="mb-1 flex items-center justify-between">
                        <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => openManualBodyEditor('Lorebook Management', settings.systemServicesSettings.loreManagement.manualBody, (next) => {
                            settings.systemServicesSettings.loreManagement.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        bind:value={settings.systemServicesSettings.loreManagement.manualBody}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[140px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                      <p class="text-xs text-surface-500 mt-1">
                        Overrides request parameters; messages and tools are managed by Aventura.
                      </p>
                    </div>
                  {/if}

                  <!-- System Prompt -->
                  <div class="border-t border-surface-700 pt-3">
                    <div class="flex items-center justify-between mb-2">
                      <span class="text-xs font-medium text-surface-400">Lore Management Prompt</span>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => editingLoreManagementPrompt = !editingLoreManagementPrompt}
                      >
                        {editingLoreManagementPrompt ? 'Close' : 'Edit'}
                      </button>
                    </div>
                    {#if editingLoreManagementPrompt}
                      <textarea
                        bind:value={settings.systemServicesSettings.loreManagement.systemPrompt}
                        onblur={() => settings.saveSystemServicesSettings()}
                        class="input text-xs min-h-[120px] resize-y font-mono w-full"
                        rows="6"
                      ></textarea>
                    {:else}
                      <p class="text-xs text-surface-400 line-clamp-2">
                        {settings.systemServicesSettings.loreManagement.systemPrompt.slice(0, 100)}...
                      </p>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Timeline Fill Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showTimelineFillSection = !showTimelineFillSection}
              >
                <Clock class="h-4 w-4 text-cyan-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Timeline Fill</h3>
                  <p class="text-xs text-surface-500">Retrieves context from past chapters</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <!-- Enable/Disable Toggle -->
                <button
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.systemServicesSettings.timelineFill.enabled}
                  class:bg-surface-600={!settings.systemServicesSettings.timelineFill.enabled}
                  onclick={async () => {
                    settings.systemServicesSettings.timelineFill.enabled =
                      !settings.systemServicesSettings.timelineFill.enabled;
                    await settings.saveSystemServicesSettings();
                  }}
                  aria-label="Toggle timeline fill"
                >
                  <span
                    class="inline-block h-3 w-3 transform rounded-full bg-white transition-transform"
                    class:translate-x-5={settings.systemServicesSettings.timelineFill.enabled}
                    class:translate-x-1={!settings.systemServicesSettings.timelineFill.enabled}
                  ></span>
                </button>
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetTimelineFillSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showTimelineFillSection = !showTimelineFillSection}>
                  {#if showTimelineFillSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showTimelineFillSection}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <p class="text-xs text-surface-400 mb-3">
                    Timeline Fill retrieves context from past chapters to maintain story consistency.
                    Choose between static (faster, one-shot queries) or agentic (iterative tool-calling) mode.
                  </p>

                  <!-- Mode Selector -->
                  <div class="mb-3">
                    <label class="mb-2 block text-xs font-medium text-surface-400">Retrieval Mode</label>
                    <div class="flex gap-2">
                      <button
                        class="flex-1 px-3 py-2 text-xs rounded-lg border transition-colors"
                        class:bg-accent-600={settings.systemServicesSettings.timelineFill.mode === 'static'}
                        class:border-accent-500={settings.systemServicesSettings.timelineFill.mode === 'static'}
                        class:text-white={settings.systemServicesSettings.timelineFill.mode === 'static'}
                        class:bg-surface-700={settings.systemServicesSettings.timelineFill.mode !== 'static'}
                        class:border-surface-600={settings.systemServicesSettings.timelineFill.mode !== 'static'}
                        class:text-surface-300={settings.systemServicesSettings.timelineFill.mode !== 'static'}
                        onclick={async () => {
                          settings.systemServicesSettings.timelineFill.mode = 'static';
                          await settings.saveSystemServicesSettings();
                        }}
                      >
                        <div class="font-medium">Static</div>
                        <div class="text-xs opacity-75 mt-0.5">One-shot queries (default)</div>
                      </button>
                      <button
                        class="flex-1 px-3 py-2 text-xs rounded-lg border transition-colors"
                        class:bg-accent-600={settings.systemServicesSettings.timelineFill.mode === 'agentic'}
                        class:border-accent-500={settings.systemServicesSettings.timelineFill.mode === 'agentic'}
                        class:text-white={settings.systemServicesSettings.timelineFill.mode === 'agentic'}
                        class:bg-surface-700={settings.systemServicesSettings.timelineFill.mode !== 'agentic'}
                        class:border-surface-600={settings.systemServicesSettings.timelineFill.mode !== 'agentic'}
                        class:text-surface-300={settings.systemServicesSettings.timelineFill.mode !== 'agentic'}
                        onclick={async () => {
                          settings.systemServicesSettings.timelineFill.mode = 'agentic';
                          await settings.saveSystemServicesSettings();
                        }}
                      >
                        <div class="font-medium">Agentic</div>
                        <div class="text-xs opacity-75 mt-0.5">Iterative tool-calling</div>
                      </button>
                    </div>
                  </div>

                  {#if settings.systemServicesSettings.timelineFill.mode === 'static'}
                    <!-- Static Mode Settings -->
                    <div class="border-t border-surface-700 pt-3 space-y-3">
                      <!-- Profile and Model Selector -->
                      <div class="mb-3">
                        <ModelSelector
                          profileId={settings.systemServicesSettings.timelineFill.profileId}
                          model={settings.systemServicesSettings.timelineFill.model}
                          onProfileChange={(id) => {
                            settings.systemServicesSettings.timelineFill.profileId = id;
                            settings.saveSystemServicesSettings();
                          }}
                          onModelChange={(m) => {
                            settings.systemServicesSettings.timelineFill.model = m;
                            settings.saveSystemServicesSettings();
                          }}
                          onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                        />
                      </div>

                      <!-- Temperature -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Temperature: {settings.systemServicesSettings.timelineFill.temperature.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          bind:value={settings.systemServicesSettings.timelineFill.temperature}
                          onchange={() => settings.saveSystemServicesSettings()}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                      </div>

                      <!-- Max Queries -->
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Max Queries: {settings.systemServicesSettings.timelineFill.maxQueries}
                        </label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          bind:value={settings.systemServicesSettings.timelineFill.maxQueries}
                          onchange={() => settings.saveSystemServicesSettings()}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Fewer (faster)</span>
                          <span>More (thorough)</span>
                        </div>
                      </div>

                      <!-- Thinking -->
                      <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Thinking: {reasoningLabels[settings.systemServicesSettings.timelineFill.reasoningEffort]}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={getReasoningIndex(settings.systemServicesSettings.timelineFill.reasoningEffort)}
                          onchange={(e) => {
                            settings.systemServicesSettings.timelineFill.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Off</span>
                          <span>Low</span>
                          <span>Medium</span>
                          <span>High</span>
                        </div>
                      </div>

                      <!-- Provider Only -->
                      <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <ProviderOnlySelector
                          providers={providerOptions}
                          selected={settings.systemServicesSettings.timelineFill.providerOnly}
                          disabled={settings.advancedRequestSettings.manualMode}
                          onChange={(next) => {
                            settings.systemServicesSettings.timelineFill.providerOnly = next;
                            settings.saveSystemServicesSettings();
                          }}
                        />
                      </div>

                      {#if settings.advancedRequestSettings.manualMode}
                        <div class="border-t border-surface-700 pt-3">
                          <div class="mb-1 flex items-center justify-between">
                            <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                            <button
                              class="text-xs text-accent-400 hover:text-accent-300"
                              onclick={() => openManualBodyEditor('Timeline Fill', settings.systemServicesSettings.timelineFill.manualBody, (next) => {
                                settings.systemServicesSettings.timelineFill.manualBody = next;
                                settings.saveSystemServicesSettings();
                              })}
                            >
                              Pop out
                            </button>
                          </div>
                          <textarea
                            bind:value={settings.systemServicesSettings.timelineFill.manualBody}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[140px] resize-y font-mono w-full"
                            rows="6"
                          ></textarea>
                          <p class="text-xs text-surface-500 mt-1">
                            Overrides request parameters; messages and tools are managed by Aventura.
                          </p>
                        </div>
                      {/if}

                      <!-- Query Generation Prompt -->
                      <div class="border-t border-surface-700 pt-3">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-xs font-medium text-surface-400">Query Generation Prompt</span>
                          <button
                            class="text-xs text-accent-400 hover:text-accent-300"
                            onclick={() => editingTimelineFillPrompt = editingTimelineFillPrompt === 'system' ? null : 'system'}
                          >
                            {editingTimelineFillPrompt === 'system' ? 'Close' : 'Edit'}
                          </button>
                        </div>
                        {#if editingTimelineFillPrompt === 'system'}
                          <textarea
                            bind:value={settings.systemServicesSettings.timelineFill.systemPrompt}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[150px] resize-y font-mono w-full"
                            rows="8"
                          ></textarea>
                        {:else}
                          <p class="text-xs text-surface-400 line-clamp-2">
                            {settings.systemServicesSettings.timelineFill.systemPrompt.slice(0, 100)}...
                          </p>
                        {/if}
                      </div>

                      <!-- Query Answer Prompt -->
                      <div class="border-t border-surface-700 pt-3">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-xs font-medium text-surface-400">Query Answer Prompt</span>
                          <button
                            class="text-xs text-accent-400 hover:text-accent-300"
                            onclick={() => editingTimelineFillPrompt = editingTimelineFillPrompt === 'answer' ? null : 'answer'}
                          >
                            {editingTimelineFillPrompt === 'answer' ? 'Close' : 'Edit'}
                          </button>
                        </div>
                        {#if editingTimelineFillPrompt === 'answer'}
                          <textarea
                            bind:value={settings.systemServicesSettings.timelineFill.queryAnswerPrompt}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[100px] resize-y font-mono w-full"
                            rows="5"
                          ></textarea>
                        {:else}
                          <p class="text-xs text-surface-400 line-clamp-2">
                            {settings.systemServicesSettings.timelineFill.queryAnswerPrompt.slice(0, 100)}...
                          </p>
                        {/if}
                      </div>
                    </div>
                  {:else}
                    <!-- Agentic Mode Settings -->
                    <div class="border-t border-surface-700 pt-3 space-y-3">
                      <!-- Profile and Model Selector -->
                      <div class="mb-3">
                        <ModelSelector
                          profileId={settings.systemServicesSettings.agenticRetrieval.profileId}
                          model={settings.systemServicesSettings.agenticRetrieval.model}
                          onProfileChange={(id) => {
                            settings.systemServicesSettings.agenticRetrieval.profileId = id;
                            settings.saveSystemServicesSettings();
                          }}
                          onModelChange={(m) => {
                            settings.systemServicesSettings.agenticRetrieval.model = m;
                            settings.saveSystemServicesSettings();
                          }}
                          onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                        />
                      </div>

                      <!-- Temperature -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Temperature: {settings.systemServicesSettings.agenticRetrieval.temperature.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          bind:value={settings.systemServicesSettings.agenticRetrieval.temperature}
                          onchange={() => settings.saveSystemServicesSettings()}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                      </div>

                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Max Iterations: {settings.systemServicesSettings.agenticRetrieval.maxIterations}
                        </label>
                        <input
                          type="range"
                          min="3"
                          max="30"
                          step="1"
                          bind:value={settings.systemServicesSettings.agenticRetrieval.maxIterations}
                          onchange={() => settings.saveSystemServicesSettings()}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Fewer iterations</span>
                          <span>More thorough</span>
                        </div>
                      </div>

                      <!-- Thinking -->
                      <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Thinking: {reasoningLabels[settings.systemServicesSettings.agenticRetrieval.reasoningEffort]}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={getReasoningIndex(settings.systemServicesSettings.agenticRetrieval.reasoningEffort)}
                          onchange={(e) => {
                            settings.systemServicesSettings.agenticRetrieval.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>Off</span>
                          <span>Low</span>
                          <span>Medium</span>
                          <span>High</span>
                        </div>
                      </div>

                      <!-- Provider Only -->
                      <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <ProviderOnlySelector
                          providers={providerOptions}
                          selected={settings.systemServicesSettings.agenticRetrieval.providerOnly}
                          disabled={settings.advancedRequestSettings.manualMode}
                          onChange={(next) => {
                            settings.systemServicesSettings.agenticRetrieval.providerOnly = next;
                            settings.saveSystemServicesSettings();
                          }}
                        />
                      </div>

                      {#if settings.advancedRequestSettings.manualMode}
                        <div class="border-t border-surface-700 pt-3">
                          <div class="mb-1 flex items-center justify-between">
                            <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                            <button
                              class="text-xs text-accent-400 hover:text-accent-300"
                              onclick={() => openManualBodyEditor('Agentic Retrieval', settings.systemServicesSettings.agenticRetrieval.manualBody, (next) => {
                                settings.systemServicesSettings.agenticRetrieval.manualBody = next;
                                settings.saveSystemServicesSettings();
                              })}
                            >
                              Pop out
                            </button>
                          </div>
                          <textarea
                            bind:value={settings.systemServicesSettings.agenticRetrieval.manualBody}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[140px] resize-y font-mono w-full"
                            rows="6"
                          ></textarea>
                          <p class="text-xs text-surface-500 mt-1">
                            Overrides request parameters; messages and tools are managed by Aventura.
                          </p>
                        </div>
                      {/if}

                      <div class="border-t border-surface-700 pt-3">
                        <div class="flex items-center justify-between mb-2">
                          <span class="text-xs font-medium text-surface-400">Agentic Prompt</span>
                          <button
                            class="text-xs text-accent-400 hover:text-accent-300"
                            onclick={() => editingAgenticRetrievalPrompt = !editingAgenticRetrievalPrompt}
                          >
                            {editingAgenticRetrievalPrompt ? 'Close' : 'Edit'}
                          </button>
                        </div>
                        {#if editingAgenticRetrievalPrompt}
                          <textarea
                            bind:value={settings.systemServicesSettings.agenticRetrieval.systemPrompt}
                            onblur={() => settings.saveSystemServicesSettings()}
                            class="input text-xs min-h-[120px] resize-y font-mono w-full"
                            rows="6"
                          ></textarea>
                        {:else}
                          <p class="text-xs text-surface-400 line-clamp-2">
                            {settings.systemServicesSettings.agenticRetrieval.systemPrompt.slice(0, 100)}...
                          </p>
                        {/if}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Reset All Settings -->
          <div class="mt-6 pt-6 border-t border-red-500/30">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-red-400">Reset All Settings</h3>
                <p class="text-xs text-surface-500 mt-1">
                  Reset all settings to their default values. Your API key will be preserved.
                </p>
              </div>
              <button
                class="px-4 py-2 text-sm font-medium text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-2"
                onclick={handleResetAll}
              >
                <RotateCcw class="h-4 w-4" />
                Reset All
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
  {#if manualBodyEditorOpen}
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      onclick={(e) => {
        e.stopPropagation();
        closeManualBodyEditor();
      }}
    >
      <div
        class="card w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] rounded-none sm:rounded-xl flex flex-col overflow-hidden"
        onclick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between border-b border-surface-700 px-4 py-3">
          <h3 class="text-sm font-medium text-surface-200">{manualBodyEditorTitle}</h3>
          <button
            class="btn-ghost rounded-lg p-2 min-h-[40px] min-w-[40px] flex items-center justify-center"
            onclick={closeManualBodyEditor}
            aria-label="Close manual body editor"
          >
            <X class="h-4 w-4" />
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <textarea
            bind:value={manualBodyEditorValue}
            class="input text-xs min-h-[60vh] sm:min-h-[45vh] resize-y font-mono w-full"
            rows="12"
          ></textarea>
          <p class="text-xs text-surface-500 mt-2">
            Overrides request parameters; messages and tools are managed by Aventura.
          </p>
        </div>
        <div class="border-t border-surface-700 px-4 py-3 flex items-center justify-end gap-2">
          <button class="btn btn-secondary text-sm" onclick={closeManualBodyEditor}>Cancel</button>
          <button class="btn btn-primary text-sm" onclick={applyManualBodyEditor}>Save</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Profile Modal -->
<ProfileModal
  isOpen={showProfileModal}
  editingProfile={editingProfile}
  onClose={() => { showProfileModal = false; editingProfile = null; }}
  onSave={handleProfileSave}
/>
