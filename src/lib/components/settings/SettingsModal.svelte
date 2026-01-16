<script lang="ts">
  import { ui } from '$lib/stores/ui.svelte';
  import { onMount } from 'svelte';
  import { settings, getDefaultInteractiveLorebookSettings } from '$lib/stores/settings.svelte';
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
  import { X, Key, Cpu, Palette, RefreshCw, Search, Settings2, RotateCcw, ChevronDown, ChevronUp, Brain, BookOpen, Lightbulb, Sparkles, Clock, Download, Loader2, Save, FolderOpen, ListChecks, Scroll, Image, HelpCircle, Volume2, Bot } from 'lucide-svelte';
  import { promptService, type PromptTemplate, type MacroOverride, type Macro, type SimpleMacro, type ComplexMacro } from '$lib/services/prompts';
  import PromptEditor from '../prompts/PromptEditor.svelte';
  import MacroChip from '../prompts/MacroChip.svelte';
  import MacroEditor from '../prompts/MacroEditor.svelte';
  import ComplexMacroEditor from '../prompts/ComplexMacroEditor.svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import ProfileModal from './ProfileModal.svelte';
  import ModelSelector from './ModelSelector.svelte';
  import ProviderOnlySelector from './ProviderOnlySelector.svelte';
  import FontSelector from './FontSelector.svelte';
  import TTSSettings from './TTSSettings.svelte';
  import type { APIProfile } from '$lib/types';
  import { updaterService, type UpdateInfo, type UpdateProgress } from '$lib/services/updater';

  let activeTab = $state<'api' | 'generation' | 'ui' | 'prompts' | 'images' | 'tts' | 'advanced'>('api');

  // Advanced settings section state
  let showWizardSection = $state(false);
  let showClassifierSection = $state(false);
  let showMemorySection = $state(false);
  let showSuggestionsSection = $state(false);
  let showActionChoicesSection = $state(false);
  let showStyleReviewerSection = $state(false);
  let showEntryRetrievalSection = $state(false);
  let showLoreManagementSection = $state(false);
  let showInteractiveLorebookSection = $state(false);
  let showTimelineFillSection = $state(false);
  let showChapterQuerySection = $state(false);
  let showSceneAnalysisSection = $state(false);
  let showCharacterCardImportSection = $state(false);
  let editingLorebookClassifier = $state(false);
  let editingProcess = $state<keyof AdvancedWizardSettings | null>(null);

  // Prompts tab state
  let selectedTemplateId = $state<string | null>(null);
  let editingMacro = $state<Macro | null>(null);
  let showMacroEditor = $state(false);
  let showComplexMacroEditor = $state(false);
  let promptsCategory = $state<'story' | 'service' | 'wizard'>('story');

  // Get all templates grouped by category
  const allTemplates = $derived(promptService.getAllTemplates());
  const storyTemplates = $derived(allTemplates.filter(t => t.category === 'story'));
  const serviceTemplates = $derived(allTemplates.filter(t => t.category === 'service'));
  const wizardTemplates = $derived(allTemplates.filter(t => t.category === 'wizard'));
  const allMacros = $derived(promptService.getAllMacros());

  // Get templates for current category
  function getTemplatesForCategory() {
    if (promptsCategory === 'story') return storyTemplates;
    if (promptsCategory === 'service') return serviceTemplates;
    return wizardTemplates;
  }

  // Get category label
  function getCategoryLabel() {
    if (promptsCategory === 'story') return 'Story Templates';
    if (promptsCategory === 'service') return 'Service Templates';
    return 'Wizard Templates';
  }

  // Get current template content (with overrides)
  function getTemplateContent(templateId: string): string {
    const override = settings.promptSettings.templateOverrides.find(o => o.templateId === templateId);
    if (override) return override.content;
    const template = allTemplates.find(t => t.id === templateId);
    return template?.content ?? '';
  }

  // Get current user content (with overrides)
  function getUserContent(templateId: string): string | undefined {
    const template = allTemplates.find(t => t.id === templateId);
    if (!template?.userContent) return undefined;

    // Check for user content override (stored as templateId-user)
    const override = settings.promptSettings.templateOverrides.find(o => o.templateId === `${templateId}-user`);
    if (override) return override.content;
    return template.userContent;
  }

  // Check if template is modified
  function isTemplateModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some(o => o.templateId === templateId);
  }

  // Check if user content is modified
  function isUserContentModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some(o => o.templateId === `${templateId}-user`);
  }

  // Handle template content change
  function handleTemplateChange(templateId: string, content: string) {
    settings.setTemplateOverride(templateId, content);
  }

  // Handle user content change
  function handleUserContentChange(templateId: string, content: string) {
    settings.setTemplateOverride(`${templateId}-user`, content);
  }

  // Handle template reset
  function handleTemplateReset(templateId: string) {
    settings.removeTemplateOverride(templateId);
  }

  // Handle user content reset
  function handleUserContentReset(templateId: string) {
    settings.removeTemplateOverride(`${templateId}-user`);
  }

  // Handle macro override
  function handleMacroOverride(override: MacroOverride) {
    const existingIndex = settings.promptSettings.macroOverrides.findIndex(o => o.macroId === override.macroId);
    if (existingIndex >= 0) {
      // Use spread operator to trigger Svelte reactivity
      const updated = [...settings.promptSettings.macroOverrides];
      updated[existingIndex] = override;
      settings.promptSettings.macroOverrides = updated;
    } else {
      settings.promptSettings.macroOverrides = [...settings.promptSettings.macroOverrides, override];
    }
    settings.savePromptSettings();
  }

  // Handle macro reset
  function handleMacroReset(macroId: string) {
    settings.promptSettings.macroOverrides = settings.promptSettings.macroOverrides.filter(o => o.macroId !== macroId);
    settings.savePromptSettings();
  }

  // Find macro override
  function findMacroOverride(macroId: string): MacroOverride | undefined {
    return settings.promptSettings.macroOverrides.find(o => o.macroId === macroId);
  }

  // Process labels for UI
  const processLabels: Record<keyof AdvancedWizardSettings, string> = {
    settingExpansion: 'Setting Expansion',
    settingRefinement: 'Setting Refinement',
    protagonistGeneration: 'Protagonist Generation',
    characterElaboration: 'Character Elaboration',
    characterRefinement: 'Character Refinement',
    supportingCharacters: 'Supporting Characters',
    openingGeneration: 'Opening Generation',
    openingRefinement: 'Opening Refinement',
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

  // Reset state - prevents modal close during reset operation
  let isResettingSettings = $state(false);

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
      settingRefinement: {
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
      characterRefinement: {
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
      openingRefinement: {
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
        baseProvider: (processKey === 'openingGeneration' || processKey === 'openingRefinement')
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

    servicesChanged = seedManualBody(services.chapterQuery, {
      model: services.chapterQuery.model,
      temperature: services.chapterQuery.temperature,
      maxTokens: 8192,
      reasoningEffort: services.chapterQuery.reasoningEffort,
      providerOnly: services.chapterQuery.providerOnly,
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

    isResettingSettings = true;
    try {
      await settings.resetAllSettings(true);
    } finally {
      isResettingSettings = false;
    }
  }

  // Safe close that prevents closing during reset operations
  function safeClose() {
    if (isResettingSettings) return;
    ui.closeSettings();
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

</script>

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onclick={() => safeClose()}>
  <div
    class="card w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[80vh] overflow-hidden rounded-b-none sm:rounded-b-xl flex flex-col"
    onclick={(e) => e.stopPropagation()}
  >

    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-3 sm:pb-4 pt-0 sm:pt-0 flex-shrink-0">
      <h2 class="text-lg sm:text-xl font-semibold text-surface-100">Settings</h2>
      <button class="btn-ghost rounded-lg p-2 min-h-[44px] min-w-[44px] flex items-center justify-center" onclick={() => safeClose()} disabled={isResettingSettings}>
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-surface-700 py-2 overflow-x-auto flex-shrink-0 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-slim">
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
        class:bg-surface-700={activeTab === 'prompts'}
        class:text-surface-100={activeTab === 'prompts'}
        class:text-surface-400={activeTab !== 'prompts'}
        onclick={() => activeTab = 'prompts'}
      >
        <Scroll class="h-4 w-4" />
        <span class="hidden xs:inline">Prompts</span>
        <span class="xs:hidden">Pmt</span>
      </button>
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'images'}
        class:text-surface-100={activeTab === 'images'}
        class:text-surface-400={activeTab !== 'images'}
        onclick={() => activeTab = 'images'}
      >
        <Image class="h-4 w-4" />
        <span class="hidden xs:inline">Images</span>
        <span class="xs:hidden">Img</span>
      </button>
      <button
        class="flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-4 py-2 text-sm min-h-[40px] flex-shrink-0"
        class:bg-surface-700={activeTab === 'tts'}
        class:text-surface-100={activeTab === 'tts'}
        class:text-surface-400={activeTab !== 'tts'}
        onclick={() => activeTab = 'tts'}
      >
        <Volume2 class="h-4 w-4" />
        <span class="hidden xs:inline">TTS</span>
        <span class="xs:hidden">TTS</span>
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
    <div class="flex-1 overflow-y-auto pt-4 pb-modal-safe min-h-0">
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
            <div class="space-y-2">
              <input
                type="range"
                min="256"
                max="1000000"
                step="1"
                value={settings.apiSettings.maxTokens}
                oninput={(e) => settings.setMaxTokens(parseInt(e.currentTarget.value))}
                disabled={settings.advancedRequestSettings.manualMode}
                class="w-full"
              />
              <input
                type="number"
                min="256"
                max="1000000"
                value={settings.apiSettings.maxTokens}
                oninput={(e) => {
                  const value = parseInt(e.currentTarget.value);
                  if (!isNaN(value) && value >= 256 && value <= 1000000) {
                    settings.setMaxTokens(value);
                  }
                }}
                disabled={settings.advancedRequestSettings.manualMode}
                class="input w-full"
                placeholder="Enter max tokens (256 - 1,000,000)"
              />
            </div>
            <div class="flex justify-between text-xs text-surface-500 mt-1">
              <span>256</span>
              <span>1,000,000</span>
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
              <option value="light">Light (Paper)</option>
              <option value="light-solarized">Light (Solarized)</option>
              <option value="retro-console">Retro Console</option>
              <option value="fallen-down">Fallen Down</option>
            </select>
            {#if settings.uiSettings.theme === 'retro-console'}
              <p class="mt-1 text-xs text-surface-400">
                CRT aesthetic inspired by PS2-era games and Serial Experiments Lain
              </p>
            {:else if settings.uiSettings.theme === 'light'}
              <p class="mt-1 text-xs text-surface-400">
                Clean paper-like warm tones with amber accents
              </p>
            {:else if settings.uiSettings.theme === 'light-solarized'}
              <p class="mt-1 text-xs text-surface-400">
                Classic Solarized color scheme with cream backgrounds
              </p>
            {:else if settings.uiSettings.theme === 'fallen-down'}
              <p class="mt-1 text-xs text-surface-400">
                * The shadows deepen. Your adventure continues.
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

          <div class="border-t border-surface-700 pt-4 mt-4">
            <h3 class="text-sm font-medium text-surface-200 mb-3">Story Font</h3>
            <FontSelector />
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
          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium text-surface-300">Disable Suggestions</label>
              <p class="text-xs text-surface-500">Hide AI-generated action choices and plot suggestions</p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              class:bg-accent-600={settings.uiSettings.disableSuggestions}
              class:bg-surface-600={!settings.uiSettings.disableSuggestions}
              onclick={() => settings.setDisableSuggestions(!settings.uiSettings.disableSuggestions)}
              aria-label="Toggle disable suggestions"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                class:translate-x-6={settings.uiSettings.disableSuggestions}
                class:translate-x-1={!settings.uiSettings.disableSuggestions}
              ></span>
            </button>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium text-surface-300">Disable Action Prefixes</label>
              <p class="text-xs text-surface-500">Hide Do/Say/Think buttons and use raw input</p>
            </div>
            <button
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              class:bg-accent-600={settings.uiSettings.disableActionPrefixes}
              class:bg-surface-600={!settings.uiSettings.disableActionPrefixes}
              onclick={() => settings.setDisableActionPrefixes(!settings.uiSettings.disableActionPrefixes)}
              aria-label="Toggle disable action prefixes"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                class:translate-x-6={settings.uiSettings.disableActionPrefixes}
                class:translate-x-1={!settings.uiSettings.disableActionPrefixes}
              ></span>
            </button>
          </div>

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
      {:else if activeTab === 'prompts'}
        <div class="space-y-6">
          <!-- Category Toggle -->
          <div class="flex items-center gap-2 border-b border-surface-700 pb-3 overflow-x-auto">
            <button
              class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
              class:bg-surface-700={promptsCategory === 'story'}
              class:text-surface-100={promptsCategory === 'story'}
              class:text-surface-400={promptsCategory !== 'story'}
              onclick={() => promptsCategory = 'story'}
            >
              Story
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
              class:bg-surface-700={promptsCategory === 'service'}
              class:text-surface-100={promptsCategory === 'service'}
              class:text-surface-400={promptsCategory !== 'service'}
              onclick={() => promptsCategory = 'service'}
            >
              Services
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
              class:bg-surface-700={promptsCategory === 'wizard'}
              class:text-surface-100={promptsCategory === 'wizard'}
              class:text-surface-400={promptsCategory !== 'wizard'}
              onclick={() => promptsCategory = 'wizard'}
            >
              Wizard
            </button>
          </div>

          <!-- Templates List -->
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-surface-200">
                {getCategoryLabel()}
              </h3>
              <button
                class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                onclick={() => {
                  getTemplatesForCategory().forEach(t => {
                    handleTemplateReset(t.id);
                    handleUserContentReset(t.id);
                  });
                }}
              >
                <RotateCcw class="h-3 w-3" />
                Reset All
              </button>
            </div>

            {#each getTemplatesForCategory() as template}
              <div class="card bg-surface-900 p-4">
                {#if selectedTemplateId === template.id}
                  <PromptEditor
                    {template}
                    content={getTemplateContent(template.id)}
                    userContent={getUserContent(template.id)}
                    isModified={isTemplateModified(template.id)}
                    isUserModified={isUserContentModified(template.id)}
                    macroOverrides={settings.promptSettings.macroOverrides}
                    onChange={(content) => handleTemplateChange(template.id, content)}
                    onUserChange={(content) => handleUserContentChange(template.id, content)}
                    onReset={() => handleTemplateReset(template.id)}
                    onUserReset={() => handleUserContentReset(template.id)}
                    onMacroOverride={handleMacroOverride}
                    onMacroReset={handleMacroReset}
                  />
                  <button
                    class="mt-3 text-xs text-surface-400 hover:text-surface-200"
                    onclick={() => selectedTemplateId = null}
                  >
                    Collapse
                  </button>
                {:else}
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-surface-200">{template.name}</span>
                        {#if isTemplateModified(template.id)}
                          <span class="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30">
                            Modified
                          </span>
                        {/if}
                      </div>
                      <p class="text-xs text-surface-500 mt-0.5">{template.description}</p>
                    </div>
                    <button
                      class="text-xs text-accent-400 hover:text-accent-300"
                      onclick={() => selectedTemplateId = template.id}
                    >
                      Edit
                    </button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Macros Section -->
          <div class="border-t border-surface-700 pt-6 space-y-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-surface-200">Macro Library</h3>
                <p class="text-xs text-surface-500 mt-0.5">
                  Click a macro to view and edit its values
                </p>
              </div>
              <button
                class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                onclick={() => {
                  settings.promptSettings.macroOverrides = [];
                  settings.savePromptSettings();
                }}
              >
                <RotateCcw class="h-3 w-3" />
                Reset All Macros
              </button>
            </div>

            <!-- Simple Macros -->
            <div class="card bg-surface-900 p-4">
              <h4 class="text-xs font-medium text-surface-400 mb-3">Simple Macros</h4>
              <div class="flex flex-wrap gap-2">
                {#each allMacros.filter(m => m.type === 'simple') as macro}
                  <MacroChip
                    {macro}
                    interactive={true}
                    onClick={() => {
                      editingMacro = macro;
                      showMacroEditor = true;
                    }}
                  />
                {/each}
              </div>
            </div>

            <!-- Complex Macros -->
            <div class="card bg-surface-900 p-4">
              <h4 class="text-xs font-medium text-surface-400 mb-3">Complex Macros (Variant-based)</h4>
              <div class="flex flex-wrap gap-2">
                {#each allMacros.filter(m => m.type === 'complex') as macro}
                  <MacroChip
                    {macro}
                    interactive={true}
                    onClick={() => {
                      editingMacro = macro;
                      showComplexMacroEditor = true;
                    }}
                  />
                {/each}
              </div>
            </div>
          </div>
        </div>
      {:else if activeTab === 'images'}
        <div class="space-y-4">
          <!-- Enable Image Generation Toggle -->
          <div class="border-b border-surface-700 pb-4">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-surface-200">Automatic Image Generation</h3>
                <p class="text-xs text-surface-500">Generate images for visually striking moments in the narrative.</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                class:bg-accent-600={settings.systemServicesSettings.imageGeneration.enabled}
                class:bg-surface-600={!settings.systemServicesSettings.imageGeneration.enabled}
                onclick={() => {
                  settings.systemServicesSettings.imageGeneration.enabled = !settings.systemServicesSettings.imageGeneration.enabled;
                  settings.saveSystemServicesSettings();
                }}
                aria-label="Toggle image generation"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  class:translate-x-6={settings.systemServicesSettings.imageGeneration.enabled}
                  class:translate-x-1={!settings.systemServicesSettings.imageGeneration.enabled}
                ></span>
              </button>
            </div>
          </div>

          {#if settings.systemServicesSettings.imageGeneration.enabled}
            <!-- Image Provider Selection -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-surface-300">
                Image Provider
              </label>
              <p class="text-xs text-surface-500">Select the image generation service to use.</p>
              <select
                class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                value={settings.systemServicesSettings.imageGeneration.imageProvider ?? 'nanogpt'}
                onchange={(e) => {
                  const provider = e.currentTarget.value as 'nanogpt' | 'chutes';
                  settings.systemServicesSettings.imageGeneration.imageProvider = provider;
                  // Update default models based on provider
                  if (provider === 'chutes') {
                    settings.systemServicesSettings.imageGeneration.referenceModel = 'qwen-image-edit-2511';
                  } else {
                    settings.systemServicesSettings.imageGeneration.referenceModel = 'qwen-image';
                  }
                  settings.saveSystemServicesSettings();
                }}
              >
                <option value="nanogpt">NanoGPT</option>
                <option value="chutes">Chutes</option>
              </select>
            </div>

            <!-- NanoGPT API Key (shown when NanoGPT is selected) -->
            {#if (settings.systemServicesSettings.imageGeneration.imageProvider ?? 'nanogpt') === 'nanogpt'}
              <div class="space-y-2">
                <label class="text-sm font-medium text-surface-300">
                  NanoGPT API Key
                </label>
                <p class="text-xs text-surface-500">API key for NanoGPT image generation.</p>
                <div class="flex gap-2">
                  <input
                    type="password"
                    class="input input-sm flex-1 bg-surface-800 border-surface-600 text-surface-100"
                    value={settings.systemServicesSettings.imageGeneration.nanoGptApiKey}
                    oninput={(e) => {
                      settings.systemServicesSettings.imageGeneration.nanoGptApiKey = e.currentTarget.value;
                      settings.saveSystemServicesSettings();
                    }}
                    placeholder="Enter your NanoGPT API key"
                  />
                  {#if settings.apiSettings.profiles.some(p => p.baseUrl?.includes('nano-gpt.com') && p.apiKey)}
                    <button
                      class="btn btn-secondary text-xs whitespace-nowrap"
                      onclick={() => {
                        const nanoProfile = settings.apiSettings.profiles.find(p => p.baseUrl?.includes('nano-gpt.com') && p.apiKey);
                        if (nanoProfile?.apiKey) {
                          settings.systemServicesSettings.imageGeneration.nanoGptApiKey = nanoProfile.apiKey;
                          settings.saveSystemServicesSettings();
                        }
                      }}
                    >
                      Autofill from Profile
                    </button>
                  {/if}
                </div>
              </div>
            {/if}

            <!-- Chutes API Key (shown when Chutes is selected) -->
            {#if settings.systemServicesSettings.imageGeneration.imageProvider === 'chutes'}
              <div class="space-y-2">
                <label class="text-sm font-medium text-surface-300">
                  Chutes API Key
                </label>
                <p class="text-xs text-surface-500">API key for Chutes image generation.</p>
                <input
                  type="password"
                  class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                  value={settings.systemServicesSettings.imageGeneration.chutesApiKey}
                  oninput={(e) => {
                    settings.systemServicesSettings.imageGeneration.chutesApiKey = e.currentTarget.value;
                    settings.saveSystemServicesSettings();
                  }}
                  placeholder="Enter your Chutes API key"
                />
              </div>
            {/if}

            <!-- Image Model (hidden when portrait mode is enabled) -->
            {#if !settings.systemServicesSettings.imageGeneration.portraitMode}
              <div class="space-y-2">
                <label class="text-sm font-medium text-surface-300">
                  Image Model
                </label>
                <p class="text-xs text-surface-500">The image model to use for generation.</p>
                <input
                  type="text"
                  class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                  value={settings.systemServicesSettings.imageGeneration.model}
                  oninput={(e) => {
                    settings.systemServicesSettings.imageGeneration.model = e.currentTarget.value;
                    settings.saveSystemServicesSettings();
                  }}
                  placeholder="z-image-turbo"
                />
              </div>
            {/if}

            <!-- Image Style -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-surface-300">
                Image Style
              </label>
              <p class="text-xs text-surface-500">Visual style for generated images. Edit styles in the Prompts tab.</p>
              <select
                class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                value={settings.systemServicesSettings.imageGeneration.styleId}
                onchange={(e) => {
                  settings.systemServicesSettings.imageGeneration.styleId = e.currentTarget.value;
                  settings.saveSystemServicesSettings();
                }}
              >
                <option value="image-style-soft-anime">Soft Anime</option>
                <option value="image-style-semi-realistic">Semi-realistic Anime</option>
                <option value="image-style-photorealistic">Photorealistic</option>
              </select>
            </div>

            <!-- Image Size -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-surface-300">
                Image Size
              </label>
              <select
                class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                value={settings.systemServicesSettings.imageGeneration.size}
                onchange={(e) => {
                  settings.systemServicesSettings.imageGeneration.size = e.currentTarget.value as '512x512' | '1024x1024';
                  settings.saveSystemServicesSettings();
                }}
              >
                <option value="512x512">512x512 (Faster)</option>
                <option value="1024x1024">1024x1024 (Higher Quality)</option>
              </select>
            </div>

            <!-- Max Images Per Message -->
            <div class="space-y-2">
              <label class="text-sm font-medium text-surface-300">
                Max Images Per Message: {settings.systemServicesSettings.imageGeneration.maxImagesPerMessage === 0 ? 'Unlimited' : settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
              </label>
              <p class="text-xs text-surface-500">Maximum images per narrative (0 = unlimited).</p>
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                class="range range-xs range-accent w-full"
                value={settings.systemServicesSettings.imageGeneration.maxImagesPerMessage}
                oninput={(e) => {
                  settings.systemServicesSettings.imageGeneration.maxImagesPerMessage = parseInt(e.currentTarget.value);
                  settings.saveSystemServicesSettings();
                }}
              />
            </div>

            <!-- Auto Generate Toggle -->
            <div class="border-t border-surface-700 pt-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Auto-Generate</h3>
                  <p class="text-xs text-surface-500">Automatically generate images after each narration.</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.systemServicesSettings.imageGeneration.autoGenerate}
                  class:bg-surface-600={!settings.systemServicesSettings.imageGeneration.autoGenerate}
                  onclick={() => {
                    settings.systemServicesSettings.imageGeneration.autoGenerate = !settings.systemServicesSettings.imageGeneration.autoGenerate;
                    settings.saveSystemServicesSettings();
                  }}
                  aria-label="Toggle auto-generate"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    class:translate-x-6={settings.systemServicesSettings.imageGeneration.autoGenerate}
                    class:translate-x-1={!settings.systemServicesSettings.imageGeneration.autoGenerate}
                  ></span>
                </button>
              </div>
            </div>

            <!-- Portrait Reference Mode -->
            <div class="border-t border-surface-700 pt-4 mt-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Portrait Reference Mode</h3>
                  <p class="text-xs text-surface-500">Use character portraits as reference images when generating story images.</p>
                </div>
                <button
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  class:bg-accent-600={settings.systemServicesSettings.imageGeneration.portraitMode}
                  class:bg-surface-600={!settings.systemServicesSettings.imageGeneration.portraitMode}
                  onclick={() => {
                    settings.systemServicesSettings.imageGeneration.portraitMode = !settings.systemServicesSettings.imageGeneration.portraitMode;
                    settings.saveSystemServicesSettings();
                  }}
                  aria-label="Toggle portrait mode"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    class:translate-x-6={settings.systemServicesSettings.imageGeneration.portraitMode}
                    class:translate-x-1={!settings.systemServicesSettings.imageGeneration.portraitMode}
                  ></span>
                </button>
              </div>
            </div>

            {#if settings.systemServicesSettings.imageGeneration.portraitMode}
              <!-- Portrait Generation Model -->
              <div class="space-y-2">
                <label class="text-sm font-medium text-surface-300">
                  Portrait Generation Model
                </label>
                <p class="text-xs text-surface-500">Model used when generating character portraits from visual descriptors.</p>
                <input
                  type="text"
                  class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                  value={settings.systemServicesSettings.imageGeneration.portraitModel}
                  oninput={(e) => {
                    settings.systemServicesSettings.imageGeneration.portraitModel = e.currentTarget.value;
                    settings.saveSystemServicesSettings();
                  }}
                  placeholder="z-image-turbo"
                />
              </div>

              <!-- Reference Image Model -->
              <div class="space-y-2">
                <label class="text-sm font-medium text-surface-300">
                  Reference Image Model
                </label>
                <p class="text-xs text-surface-500">Model used for story images when a character portrait is attached as reference.</p>
                <input
                  type="text"
                  class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                  value={settings.systemServicesSettings.imageGeneration.referenceModel}
                  oninput={(e) => {
                    settings.systemServicesSettings.imageGeneration.referenceModel = e.currentTarget.value;
                    settings.saveSystemServicesSettings();
                  }}
                  placeholder="qwen-image"
                />
              </div>
            {/if}

            <!-- Reset Button -->
            <div class="border-t border-surface-700 pt-4 mt-4">
              <button
                class="btn btn-secondary text-xs"
                onclick={() => settings.resetImageGenerationSettings()}
              >
                <RotateCcw class="h-3 w-3 mr-1" />
                Reset to Defaults
              </button>
            </div>
          {/if}
        </div>
      {:else if activeTab === 'tts'}
        <TTSSettings />
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

          <!-- Debug Mode Toggle -->
          <div class="border-b border-surface-700 pb-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-sm font-medium text-surface-200">Debug Mode</h3>
                <p class="text-xs text-surface-500">Log API requests and responses for debugging.</p>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                class:bg-accent-600={settings.uiSettings.debugMode}
                class:bg-surface-600={!settings.uiSettings.debugMode}
                onclick={() => settings.setDebugMode(!settings.uiSettings.debugMode)}
                aria-label="Toggle debug mode"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  class:translate-x-6={settings.uiSettings.debugMode}
                  class:translate-x-1={!settings.uiSettings.debugMode}
                ></span>
              </button>
            </div>
            {#if settings.uiSettings.debugMode}
              <p class="mt-2 text-xs text-amber-400/80">
                A debug button will appear to view request/response logs. Logs are session-only.
              </p>
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
                      <div class="rounded-lg border border-surface-700 bg-surface-900/40 p-3">
                        <p class="text-xs text-surface-400">
                          This prompt is managed in the Prompts tab.
                        </p>
                        <button
                          class="mt-2 text-xs text-accent-400 hover:text-accent-300"
                          onclick={() => {
                            activeTab = 'prompts';
                            promptsCategory = 'service';
                            selectedTemplateId = 'lorebook-classifier';
                          }}
                        >
                          Open Lorebook Classifier Prompt
                        </button>
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

                <!-- Character Card Import Subsection -->
                <div class="card bg-surface-900 p-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <FolderOpen class="h-4 w-4 text-orange-400" />
                      <span class="text-sm font-medium text-surface-200">Character Card Import</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        class="text-xs text-surface-400 hover:text-surface-200"
                        onclick={() => settings.resetCharacterCardImportSettings()}
                        title="Reset to default"
                      >
                        <RotateCcw class="h-3 w-3" />
                      </button>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => showCharacterCardImportSection = !showCharacterCardImportSection}
                      >
                        {showCharacterCardImportSection ? 'Close' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {#if showCharacterCardImportSection}
                    <div class="space-y-3 mt-3 pt-3 border-t border-surface-700">
                      <!-- Profile and Model Selector -->
                      <ModelSelector
                        profileId={settings.systemServicesSettings.characterCardImport?.profileId ?? settings.apiSettings.mainNarrativeProfileId}
                        model={settings.systemServicesSettings.characterCardImport?.model ?? 'deepseek/deepseek-v3.2'}
                        onProfileChange={(id) => {
                          settings.systemServicesSettings.characterCardImport.profileId = id;
                          settings.saveSystemServicesSettings();
                        }}
                        onModelChange={(m) => {
                          settings.systemServicesSettings.characterCardImport.model = m;
                          settings.saveSystemServicesSettings();
                        }}
                        onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                      />

                      <!-- Temperature -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Temperature: {(settings.systemServicesSettings.characterCardImport?.temperature ?? 0.3).toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={settings.systemServicesSettings.characterCardImport?.temperature ?? 0.3}
                          oninput={(e) => {
                            settings.systemServicesSettings.characterCardImport.temperature = parseFloat(e.currentTarget.value);
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                      </div>

                      <!-- Max Tokens -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Max Tokens: {settings.systemServicesSettings.characterCardImport?.maxTokens ?? 16384}
                        </label>
                        <input
                          type="range"
                          min="2048"
                          max="32768"
                          step="1024"
                          value={settings.systemServicesSettings.characterCardImport?.maxTokens ?? 16384}
                          oninput={(e) => {
                            settings.systemServicesSettings.characterCardImport.maxTokens = parseInt(e.currentTarget.value);
                            settings.saveSystemServicesSettings();
                          }}
                          disabled={settings.advancedRequestSettings.manualMode}
                          class="w-full h-2"
                        />
                        <div class="flex justify-between text-xs text-surface-500">
                          <span>2K</span>
                          <span>32K</span>
                        </div>
                      </div>

                      <!-- Thinking -->
                      <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                        <label class="mb-1 block text-xs font-medium text-surface-400">
                          Thinking: {reasoningLabels[settings.systemServicesSettings.characterCardImport.reasoningEffort]}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={getReasoningIndex(settings.systemServicesSettings.characterCardImport.reasoningEffort)}
                          onchange={(e) => {
                            settings.systemServicesSettings.characterCardImport.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
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
                          selected={settings.systemServicesSettings.characterCardImport.providerOnly}
                          disabled={settings.advancedRequestSettings.manualMode}
                          onChange={(next) => {
                            settings.systemServicesSettings.characterCardImport.providerOnly = next;
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
                              onclick={() => openManualBodyEditor('Character Card Import', settings.systemServicesSettings.characterCardImport.manualBody, (next) => {
                                settings.systemServicesSettings.characterCardImport.manualBody = next;
                                settings.saveSystemServicesSettings();
                              })}
                            >
                              Pop out
                            </button>
                          </div>
                          <textarea
                            value={settings.systemServicesSettings.characterCardImport.manualBody}
                            oninput={(e) => {
                              settings.systemServicesSettings.characterCardImport.manualBody = e.currentTarget.value;
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
                      <div class="rounded-lg border border-surface-700 bg-surface-900/40 p-3">
                        <div class="flex items-center justify-between gap-4">
                          <div class="flex-1">
                            <label class="text-xs font-medium text-surface-400">System Prompt</label>
                            <p class="text-xs text-surface-500 mt-0.5">
                              Configure the cleaning and conversion prompt in the Prompts tab under Wizard Templates.
                            </p>
                          </div>
                          <button
                            class="btn btn-secondary text-xs shrink-0"
                            onclick={() => {
                              activeTab = 'prompts';
                              promptsCategory = 'wizard';
                              selectedTemplateId = 'character-card-import';
                            }}
                          >
                            Go to Prompts
                          </button>
                        </div>
                      </div>
                    </div>
                  {:else}
                    <div class="text-xs text-surface-400">
                      <span class="text-surface-500">Model:</span> {settings.systemServicesSettings.characterCardImport?.model ?? 'deepseek/deepseek-v3.2'}
                      <span class="mx-2">•</span>
                      <span class="text-surface-500">Temp:</span> {(settings.systemServicesSettings.characterCardImport?.temperature ?? 0.3).toFixed(1)}
                      <span class="mx-2">•</span>
                      <span class="text-surface-500">Tokens:</span> {settings.systemServicesSettings.characterCardImport?.maxTokens ?? 16384}
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

                  <!-- Chat History Truncation -->
                  <div class="mb-3">
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Chat History Truncation: {settings.systemServicesSettings.classifier.chatHistoryTruncation === 0 ? 'None' : `${settings.systemServicesSettings.classifier.chatHistoryTruncation} words`}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="500"
                      step="25"
                      bind:value={settings.systemServicesSettings.classifier.chatHistoryTruncation}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                    <div class="flex justify-between text-xs text-surface-500">
                      <span>None</span>
                      <span>500 words</span>
                    </div>
                    <p class="text-xs text-surface-500 mt-1">
                      Max words per message in chat history sent to classifier. 0 = no truncation.
                    </p>
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

                </div>
              </div>
            {/if}
          </div>

          <!-- Interactive Lorebook Section -->
          <div class="border-t border-surface-700 pt-3">
            <div class="flex items-center justify-between">
              <button
                class="flex items-center gap-2 text-left flex-1"
                onclick={() => showInteractiveLorebookSection = !showInteractiveLorebookSection}
              >
                <Bot class="h-4 w-4 text-purple-400" />
                <div>
                  <h3 class="text-sm font-medium text-surface-200">Interactive Lorebook</h3>
                  <p class="text-xs text-surface-500">AI-assisted lorebook creation in vault</p>
                </div>
              </button>
              <div class="flex items-center gap-2">
                <button
                  class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                  onclick={() => settings.resetInteractiveLorebookSettings()}
                >
                  <RotateCcw class="h-3 w-3" />
                  Reset
                </button>
                <button onclick={() => showInteractiveLorebookSection = !showInteractiveLorebookSection}>
                  {#if showInteractiveLorebookSection}
                    <ChevronUp class="h-4 w-4 text-surface-400" />
                  {:else}
                    <ChevronDown class="h-4 w-4 text-surface-400" />
                  {/if}
                </button>
              </div>
            </div>

            {#if showInteractiveLorebookSection}
              {@const ils = settings.systemServicesSettings.interactiveLorebook ?? getDefaultInteractiveLorebookSettings()}
              <div class="mt-3 space-y-3">
                <div class="card bg-surface-900 p-3">
                  <p class="text-xs text-surface-400 mb-3">
                    AI assistant for creating and organizing lorebook entries in the vault.
                  </p>

                  <!-- Profile and Model Selector -->
                  <div class="mb-3">
                    <ModelSelector
                      profileId={ils.profileId ?? settings.apiSettings.mainNarrativeProfileId}
                      model={ils.model}
                      onProfileChange={(id) => {
                        if (!settings.systemServicesSettings.interactiveLorebook) {
                          settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                        }
                        settings.systemServicesSettings.interactiveLorebook.profileId = id;
                        settings.saveSystemServicesSettings();
                      }}
                      onModelChange={(m) => {
                        if (!settings.systemServicesSettings.interactiveLorebook) {
                          settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                        }
                        settings.systemServicesSettings.interactiveLorebook.model = m;
                        settings.saveSystemServicesSettings();
                      }}
                      onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                    />
                  </div>

                  <!-- Temperature -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Temperature: {ils.temperature.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={ils.temperature}
                      onchange={(e) => {
                        if (!settings.systemServicesSettings.interactiveLorebook) {
                          settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                        }
                        settings.systemServicesSettings.interactiveLorebook.temperature = parseFloat(e.currentTarget.value);
                        settings.saveSystemServicesSettings();
                      }}
                      disabled={settings.advancedRequestSettings.manualMode}
                      class="w-full h-2"
                    />
                  </div>

                  <!-- Thinking -->
                  <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Thinking: {reasoningLabels[ils.reasoningEffort]}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="1"
                      value={getReasoningIndex(ils.reasoningEffort)}
                      onchange={(e) => {
                        if (!settings.systemServicesSettings.interactiveLorebook) {
                          settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                        }
                        settings.systemServicesSettings.interactiveLorebook.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
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
                      selected={ils.providerOnly}
                      disabled={settings.advancedRequestSettings.manualMode}
                      onChange={(next) => {
                        if (!settings.systemServicesSettings.interactiveLorebook) {
                          settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                        }
                        settings.systemServicesSettings.interactiveLorebook.providerOnly = next;
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
                          onclick={() => openManualBodyEditor('Interactive Lorebook', ils.manualBody, (next) => {
                            if (!settings.systemServicesSettings.interactiveLorebook) {
                              settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                            }
                            settings.systemServicesSettings.interactiveLorebook.manualBody = next;
                            settings.saveSystemServicesSettings();
                          })}
                        >
                          Pop out
                        </button>
                      </div>
                      <textarea
                        value={ils.manualBody}
                        onchange={(e) => {
                          if (!settings.systemServicesSettings.interactiveLorebook) {
                            settings.systemServicesSettings.interactiveLorebook = getDefaultInteractiveLorebookSettings();
                          }
                          settings.systemServicesSettings.interactiveLorebook.manualBody = e.currentTarget.value;
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

                    </div>
                  {/if}

                  <!-- Chapter Query Sub-Section -->
                  <div class="border-t border-surface-700 pt-3 mt-3">
                    <div class="flex items-center justify-between">
                      <button
                        class="flex items-center gap-2 text-left flex-1"
                        onclick={() => showChapterQuerySection = !showChapterQuerySection}
                      >
                        <HelpCircle class="h-4 w-4 text-amber-400" />
                        <div>
                          <h4 class="text-sm font-medium text-surface-200">Chapter Query Model</h4>
                          <p class="text-xs text-surface-500">Model used to answer questions about specific chapters</p>
                        </div>
                      </button>
                      <div class="flex items-center gap-2">
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                          onclick={() => settings.resetChapterQuerySettings()}
                        >
                          <RotateCcw class="h-3 w-3" />
                          Reset
                        </button>
                        <button onclick={() => showChapterQuerySection = !showChapterQuerySection}>
                          {#if showChapterQuerySection}
                            <ChevronUp class="h-4 w-4 text-surface-400" />
                          {:else}
                            <ChevronDown class="h-4 w-4 text-surface-400" />
                          {/if}
                        </button>
                      </div>
                    </div>

                    {#if showChapterQuerySection}
                      <div class="mt-3 space-y-3 pl-4 border-l border-surface-700">
                        <p class="text-xs text-surface-400">
                          This model answers specific questions about chapter content. Used by both static and agentic modes when querying chapters.
                        </p>

                        <!-- Profile and Model Selector -->
                        <div class="mb-3">
                          <ModelSelector
                            profileId={settings.systemServicesSettings.chapterQuery.profileId}
                            model={settings.systemServicesSettings.chapterQuery.model}
                            onProfileChange={(id) => {
                              settings.systemServicesSettings.chapterQuery.profileId = id;
                              settings.saveSystemServicesSettings();
                            }}
                            onModelChange={(m) => {
                              settings.systemServicesSettings.chapterQuery.model = m;
                              settings.saveSystemServicesSettings();
                            }}
                            onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                          />
                        </div>

                        <!-- Temperature -->
                        <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Temperature: {settings.systemServicesSettings.chapterQuery.temperature.toFixed(2)}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            bind:value={settings.systemServicesSettings.chapterQuery.temperature}
                            onchange={() => settings.saveSystemServicesSettings()}
                            disabled={settings.advancedRequestSettings.manualMode}
                            class="w-full h-2"
                          />
                        </div>

                        <!-- Reasoning Effort -->
                        <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Thinking: {reasoningLabels[settings.systemServicesSettings.chapterQuery.reasoningEffort]}
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="3"
                            step="1"
                            value={getReasoningIndex(settings.systemServicesSettings.chapterQuery.reasoningEffort)}
                            onchange={(e) => {
                              settings.systemServicesSettings.chapterQuery.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
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
                            selected={settings.systemServicesSettings.chapterQuery.providerOnly}
                            disabled={settings.advancedRequestSettings.manualMode}
                            onChange={(next) => {
                              settings.systemServicesSettings.chapterQuery.providerOnly = next;
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
                                onclick={() => openManualBodyEditor('Chapter Query', settings.systemServicesSettings.chapterQuery.manualBody, (next) => {
                                  settings.systemServicesSettings.chapterQuery.manualBody = next;
                                  settings.saveSystemServicesSettings();
                                })}
                              >
                                Pop out
                              </button>
                            </div>
                            <textarea
                              bind:value={settings.systemServicesSettings.chapterQuery.manualBody}
                              onblur={() => settings.saveSystemServicesSettings()}
                              class="input text-xs min-h-[140px] resize-y font-mono w-full"
                              rows="6"
                            ></textarea>
                            <p class="text-xs text-surface-500 mt-1">
                              Overrides request parameters for chapter query calls.
                            </p>
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Scene Analysis Section (for Image Generation) -->
          <div class="border-t border-surface-700 pt-4">
            <button
              class="w-full flex items-center justify-between group"
              onclick={() => showSceneAnalysisSection = !showSceneAnalysisSection}
            >
              <div class="flex items-center gap-2">
                <div class="p-1.5 rounded-lg bg-pink-500/10">
                  <Image class="h-4 w-4 text-pink-400" />
                </div>
                <div class="text-left">
                  <h3 class="text-sm font-medium text-surface-200">Scene Analysis</h3>
                  <p class="text-xs text-surface-500">Model for identifying imageable scenes in narrative.</p>
                </div>
              </div>
              <span>
                {#if showSceneAnalysisSection}
                  <ChevronUp class="h-4 w-4 text-surface-400" />
                {:else}
                  <ChevronDown class="h-4 w-4 text-surface-400" />
                {/if}
              </span>
            </button>

            {#if showSceneAnalysisSection}
              <div class="mt-4 space-y-4 pl-8 border-l border-surface-700 ml-2">
                <p class="text-xs text-surface-500">
                  This model analyzes narrative text to identify visually striking moments for image generation.
                </p>

                <!-- Profile and Model Selector -->
                <div class="mb-3">
                  <ModelSelector
                    profileId={settings.systemServicesSettings.imageGeneration.promptProfileId}
                    model={settings.systemServicesSettings.imageGeneration.promptModel}
                    onProfileChange={(id) => {
                      settings.systemServicesSettings.imageGeneration.promptProfileId = id;
                      settings.saveSystemServicesSettings();
                    }}
                    onModelChange={(m) => {
                      settings.systemServicesSettings.imageGeneration.promptModel = m;
                      settings.saveSystemServicesSettings();
                    }}
                    onManageProfiles={() => { showProfileModal = true; editingProfile = null; }}
                  />
                </div>

                <!-- Temperature -->
                <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                  <label class="mb-1 block text-xs font-medium text-surface-400">
                    Temperature: {settings.systemServicesSettings.imageGeneration.promptTemperature.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    bind:value={settings.systemServicesSettings.imageGeneration.promptTemperature}
                    onchange={() => settings.saveSystemServicesSettings()}
                    class="range range-xs range-accent w-full"
                    disabled={settings.advancedRequestSettings.manualMode}
                  />
                </div>

                <!-- Max Tokens -->
                <div class:opacity-50={settings.advancedRequestSettings.manualMode}>
                  <label class="mb-1 block text-xs font-medium text-surface-400">
                    Max Tokens: {settings.systemServicesSettings.imageGeneration.promptMaxTokens}
                  </label>
                  <input
                    type="range"
                    min="512"
                    max="16384"
                    step="256"
                    bind:value={settings.systemServicesSettings.imageGeneration.promptMaxTokens}
                    onchange={() => settings.saveSystemServicesSettings()}
                    class="range range-xs range-accent w-full"
                    disabled={settings.advancedRequestSettings.manualMode}
                  />
                </div>

                <!-- Provider Only -->
                <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                  <ProviderOnlySelector
                    providers={providerOptions}
                    selected={settings.systemServicesSettings.imageGeneration.providerOnly}
                    onChange={(next) => {
                      settings.systemServicesSettings.imageGeneration.providerOnly = next;
                      settings.saveSystemServicesSettings();
                    }}
                    disabled={settings.advancedRequestSettings.manualMode}
                  />
                </div>

                <!-- Thinking -->
                <div class="mb-3" class:opacity-50={settings.advancedRequestSettings.manualMode}>
                  <label class="mb-1 block text-xs font-medium text-surface-400">
                    Thinking: {reasoningLabels[settings.systemServicesSettings.imageGeneration.reasoningEffort]}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="1"
                    value={getReasoningIndex(settings.systemServicesSettings.imageGeneration.reasoningEffort)}
                    onchange={(e) => {
                      settings.systemServicesSettings.imageGeneration.reasoningEffort = getReasoningValue(parseInt(e.currentTarget.value));
                      settings.saveSystemServicesSettings();
                    }}
                    disabled={settings.advancedRequestSettings.manualMode}
                    class="range range-xs range-accent w-full"
                  />
                  <div class="flex justify-between text-xs text-surface-500">
                    <span>Off</span>
                    <span>Low</span>
                    <span>Medium</span>
                    <span>High</span>
                  </div>
                </div>

                {#if settings.advancedRequestSettings.manualMode}
                  <div class="border-t border-surface-700 pt-3">
                    <div class="mb-1 flex items-center justify-between">
                      <label class="text-xs font-medium text-surface-400">Manual Request Body (JSON)</label>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300"
                        onclick={() => openManualBodyEditor('Scene Analysis', settings.systemServicesSettings.imageGeneration.manualBody, (next) => {
                          settings.systemServicesSettings.imageGeneration.manualBody = next;
                          settings.saveSystemServicesSettings();
                        })}
                      >
                        Pop out
                      </button>
                    </div>
                    <textarea
                      bind:value={settings.systemServicesSettings.imageGeneration.manualBody}
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
                class="px-4 py-2 text-sm font-medium text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={handleResetAll}
                disabled={isResettingSettings}
              >
                {#if isResettingSettings}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Resetting...
                {:else}
                  <RotateCcw class="h-4 w-4" />
                  Reset All
                {/if}
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

<!-- Macro Editor Modals -->
{#if editingMacro && editingMacro.type === 'simple'}
  <MacroEditor
    isOpen={showMacroEditor}
    macro={editingMacro as SimpleMacro}
    currentOverride={findMacroOverride(editingMacro.id)}
    onClose={() => { showMacroEditor = false; editingMacro = null; }}
    onSave={(value) => {
      if (editingMacro) {
        handleMacroOverride({ macroId: editingMacro.id, value });
      }
      showMacroEditor = false;
      editingMacro = null;
    }}
    onReset={() => {
      if (editingMacro) {
        handleMacroReset(editingMacro.id);
      }
      showMacroEditor = false;
      editingMacro = null;
    }}
  />
{/if}

{#if editingMacro && editingMacro.type === 'complex'}
  <ComplexMacroEditor
    isOpen={showComplexMacroEditor}
    macro={editingMacro as ComplexMacro}
    currentOverride={findMacroOverride(editingMacro.id)}
    onClose={() => { showComplexMacroEditor = false; editingMacro = null; }}
    onSave={(variantOverrides) => {
      if (editingMacro) {
        handleMacroOverride({ macroId: editingMacro.id, variantOverrides });
      }
      showComplexMacroEditor = false;
      editingMacro = null;
    }}
    onReset={() => {
      if (editingMacro) {
        handleMacroReset(editingMacro.id);
      }
      showComplexMacroEditor = false;
      editingMacro = null;
    }}
  />
{/if}
