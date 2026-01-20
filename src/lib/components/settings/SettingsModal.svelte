<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import {
    settings,
    getDefaultInteractiveLorebookSettings,
  } from "$lib/stores/settings.svelte";
  import {
    OpenAIProvider,
    OPENROUTER_API_URL,
  } from "$lib/services/ai/openrouter";
  import type { ProviderInfo } from "$lib/services/ai/types";
  import { DEFAULT_PROVIDERS } from "$lib/services/ai/providers";
  import type { ThemeId } from "$lib/types";
  import {
    type AdvancedWizardSettings,
    SCENARIO_MODEL,
    SCENARIO_PROVIDER,
  } from "$lib/services/ai/scenario";
  import { serializeManualBody } from "$lib/services/ai/requestOverrides";
  import type { ReasoningEffort } from "$lib/types";
  import {
    X,
    Key,
    Cpu,
    Palette,
    RefreshCw,
    Settings2,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    Download,
    Upload,
    Loader2,
    Scroll,
    Image,
    Volume2,
  } from "lucide-svelte";
  import {
    promptService,
    type PromptTemplate,
    type MacroOverride,
    type Macro,
    type SimpleMacro,
    type ComplexMacro,
  } from "$lib/services/prompts";
  import { promptExportService } from "$lib/services/promptExport";
  import PromptEditor from "../prompts/PromptEditor.svelte";
  import MacroChip from "../prompts/MacroChip.svelte";
  import MacroEditor from "../prompts/MacroEditor.svelte";
  import ComplexMacroEditor from "../prompts/ComplexMacroEditor.svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import ProfileModal from "./ProfileModal.svelte";
  import PromptImportModal from "./PromptImportModal.svelte";
  import FontSelector from "./FontSelector.svelte";
  import TTSSettings from "./TTSSettings.svelte";
  import MainNarrative from "./MainNarrative.svelte";
  import AgentProfiles from "./AgentProfiles.svelte";
  import AdvancedSettings from "./AdvancedSettings.svelte";
  import type { APIProfile } from "$lib/types";
  import {
    updaterService,
    type UpdateInfo,
    type UpdateProgress,
  } from "$lib/services/updater";

  const baseTabs = [
    { id: "api", label: "API Connection", icon: Key },
    { id: "ui", label: "Interface", icon: Palette },
    { id: "generation", label: "Generation", icon: Cpu },
    { id: "prompts", label: "Prompts", icon: Scroll },
    { id: "images", label: "Images", icon: Image },
    { id: "tts", label: "Text to Speech", icon: Volume2 },
    { id: "advanced", label: "Advanced", icon: Settings2 },
  ] as const;

  // Filter out advanced tab if not needed (for now, keeping it but we could remove it per user request)
  // const tabs = baseTabs.filter(t => t.id !== 'advanced');
  const tabs = baseTabs;

  let activeTab = $state<
    "api" | "generation" | "ui" | "prompts" | "images" | "tts" | "advanced"
  >("api");

  // Track slide direction for content animation
  let slideDirection = $state<"left" | "right">("right");
  let isAnimating = $state(false);

  // Get current tab index for carousel transform
  const activeTabIndex = $derived(tabs.findIndex((t) => t.id === activeTab));

  function setActiveTab(
    newTab:
      | "api"
      | "generation"
      | "ui"
      | "prompts"
      | "images"
      | "tts"
      | "advanced",
  ) {
    if (newTab === activeTab || isAnimating) return;
    const oldIndex = tabs.findIndex((t) => t.id === activeTab);
    const newIndex = tabs.findIndex((t) => t.id === newTab);
    slideDirection = newIndex > oldIndex ? "left" : "right";
    isAnimating = true;
    activeTab = newTab;
    // Reset animation state after transition
    setTimeout(() => {
      isAnimating = false;
    }, 200);
  }

  // Prompts tab state
  let selectedTemplateId = $state<string | null>(null);
  let editingMacro = $state<Macro | null>(null);
  let showMacroEditor = $state(false);
  let showComplexMacroEditor = $state(false);
  let promptsCategory = $state<"story" | "service" | "wizard">("story");

  let isExporting = $state(false);
  let promptImportModalOpen = $state(false);

  // Get all templates grouped by category
  const allTemplates = $derived(promptService.getAllTemplates());
  const storyTemplates = $derived(
    allTemplates.filter((t) => t.category === "story"),
  );
  const serviceTemplates = $derived(
    allTemplates.filter((t) => t.category === "service"),
  );
  const wizardTemplates = $derived(
    allTemplates.filter((t) => t.category === "wizard"),
  );
  const allMacros = $derived(promptService.getAllMacros());

  // Get templates for current category
  function getTemplatesForCategory() {
    if (promptsCategory === "story") return storyTemplates;
    if (promptsCategory === "service") return serviceTemplates;
    return wizardTemplates;
  }

  // Get category label
  function getCategoryLabel() {
    if (promptsCategory === "story") return "Story Templates";
    if (promptsCategory === "service") return "Service Templates";
    return "Wizard Templates";
  }

  // Get current template content (with overrides)
  function getTemplateContent(templateId: string): string {
    const override = settings.promptSettings.templateOverrides.find(
      (o) => o.templateId === templateId,
    );
    if (override) return override.content;
    const template = allTemplates.find((t) => t.id === templateId);
    return template?.content ?? "";
  }

  // Get current user content (with overrides)
  function getUserContent(templateId: string): string | undefined {
    const template = allTemplates.find((t) => t.id === templateId);
    if (!template?.userContent) return undefined;

    // Check for user content override (stored as templateId-user)
    const override = settings.promptSettings.templateOverrides.find(
      (o) => o.templateId === `${templateId}-user`,
    );
    if (override) return override.content;
    return template.userContent;
  }

  // Check if template is modified
  function isTemplateModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some(
      (o) => o.templateId === templateId,
    );
  }

  // Check if user content is modified
  function isUserContentModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some(
      (o) => o.templateId === `${templateId}-user`,
    );
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
    const existingIndex = settings.promptSettings.macroOverrides.findIndex(
      (o) => o.macroId === override.macroId,
    );
    if (existingIndex >= 0) {
      // Use spread operator to trigger Svelte reactivity
      const updated = [...settings.promptSettings.macroOverrides];
      updated[existingIndex] = override;
      settings.promptSettings.macroOverrides = updated;
    } else {
      settings.promptSettings.macroOverrides = [
        ...settings.promptSettings.macroOverrides,
        override,
      ];
    }
    settings.savePromptSettings();
  }

  // Handle macro reset
  function handleMacroReset(macroId: string) {
    settings.promptSettings.macroOverrides =
      settings.promptSettings.macroOverrides.filter(
        (o) => o.macroId !== macroId,
      );
    settings.savePromptSettings();
  }

  // Find macro override
  function findMacroOverride(macroId: string): MacroOverride | undefined {
    return settings.promptSettings.macroOverrides.find(
      (o) => o.macroId === macroId,
    );
  }

  // Process labels for UI
  const processLabels: Record<keyof AdvancedWizardSettings, string> = {
    settingExpansion: "Setting Expansion",
    settingRefinement: "Setting Refinement",
    protagonistGeneration: "Protagonist Generation",
    characterElaboration: "Character Elaboration",
    characterRefinement: "Character Refinement",
    supportingCharacters: "Supporting Characters",
    openingGeneration: "Opening Generation",
    openingRefinement: "Opening Refinement",
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

  let isLoadingProviders = $state(false);
  let providerError = $state<string | null>(null);
  let providerOptions = $state<ProviderInfo[]>(DEFAULT_PROVIDERS);
  let manualBodyEditorOpen = $state(false);
  let manualBodyEditorTitle = $state("Manual Request Body");
  let manualBodyEditorValue = $state("");
  let manualBodyEditorSave = $state<(value: string) => void>((_) => {});

  const reasoningLevels: ReasoningEffort[] = ["off", "low", "medium", "high"];
  const reasoningLabels: Record<ReasoningEffort, string> = {
    off: "Off",
    low: "Low",
    medium: "Medium",
    high: "High",
  };

  // Get models from main narrative profile (sorted by provider priority)
  let profileModels = $derived.by(() => {
    const profile = settings.getMainNarrativeProfile();
    if (!profile) return [];
    // Combine fetched and custom models, removing duplicates
    const models = [
      ...new Set([...profile.fetchedModels, ...profile.customModels]),
    ];

    // Sort: prioritize popular providers, then alphabetically
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

      // Update profile with fetched models
      await settings.updateProfile(profile.id, {
        fetchedModels: filteredModelIds,
      });

      console.log(
        `[SettingsModal] Fetched ${filteredModelIds.length} models to profile`,
      );
    } catch (error) {
      console.error("[SettingsModal] Failed to fetch models:", error);
      modelError =
        error instanceof Error ? error.message : "Failed to load models.";
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
      console.error("[SettingsModal] Failed to fetch providers:", error);
      providerError =
        error instanceof Error ? error.message : "Failed to load providers.";
      providerOptions = DEFAULT_PROVIDERS;
    } finally {
      isLoadingProviders = false;
    }
  }

  function getReasoningIndex(value?: ReasoningEffort): number {
    const index = reasoningLevels.indexOf(value ?? "off");
    return index === -1 ? 0 : index;
  }

  function getReasoningValue(index: number): ReasoningEffort {
    const clamped = Math.min(Math.max(0, index), reasoningLevels.length - 1);
    return reasoningLevels[clamped];
  }

  function getOpeningProvider(modelId: string): Record<string, unknown> {
    const isZAI = modelId.startsWith("z-ai/") || modelId.startsWith("zai-org/");
    return isZAI
      ? { order: ["z-ai"], require_parameters: true }
      : SCENARIO_PROVIDER;
  }

  function seedManualBody(
    target: { manualBody?: string },
    defaults: Parameters<typeof serializeManualBody>[0],
  ): boolean {
    if (target.manualBody && target.manualBody.trim()) return false;
    target.manualBody = serializeManualBody(defaults);
    return true;
  }

  function openManualBodyEditor(
    title: string,
    value: string,
    onSave: (next: string) => void,
  ) {
    manualBodyEditorTitle = title;
    manualBodyEditorValue = value;
    manualBodyEditorSave = onSave;
    manualBodyEditorOpen = true;
  }

  function closeManualBodyEditor() {
    manualBodyEditorOpen = false;
    manualBodyEditorTitle = "Manual Request Body";
    manualBodyEditorValue = "";
    manualBodyEditorSave = (_) => {};
  }

  function applyManualBodyEditor() {
    manualBodyEditorSave(manualBodyEditorValue);
    closeManualBodyEditor();
  }

  async function seedAllManualBodies() {
    const baseNarrativeProvider = { order: ["z-ai"], require_parameters: true };
    if (
      seedManualBody(settings.apiSettings, {
        model: settings.apiSettings.defaultModel,
        temperature: settings.apiSettings.temperature,
        maxTokens: settings.apiSettings.maxTokens,
        baseProvider: baseNarrativeProvider,
        reasoningEffort: settings.apiSettings.reasoningEffort,
        providerOnly: settings.apiSettings.providerOnly,
      })
    ) {
      await settings.setMainManualBody(settings.apiSettings.manualBody);
    }

    let wizardChanged = false;
    const processDefaults: Record<
      keyof AdvancedWizardSettings,
      { model: string; temperature: number; maxTokens: number; topP?: number }
    > = {
      settingExpansion: {
        model: "deepseek/deepseek-v3.2",
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      settingRefinement: {
        model: "deepseek/deepseek-v3.2",
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      protagonistGeneration: {
        model: "deepseek/deepseek-v3.2",
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      characterElaboration: {
        model: "deepseek/deepseek-v3.2",
        temperature: 0.3,
        maxTokens: 8192,
        topP: 0.95,
      },
      characterRefinement: {
        model: "deepseek/deepseek-v3.2",
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
        model: "z-ai/glm-4.7",
        temperature: 0.8,
        maxTokens: 8192,
        topP: 0.95,
      },
      openingRefinement: {
        model: "z-ai/glm-4.7",
        temperature: 0.8,
        maxTokens: 8192,
        topP: 0.95,
      },
    };

    for (const processKey of Object.keys(
      processLabels,
    ) as (keyof AdvancedWizardSettings)[]) {
      const processSettings = settings.wizardSettings[processKey];
      const defaults = processDefaults[processKey];
      const model = processSettings.model ?? defaults.model;
      if (
        seedManualBody(processSettings, {
          model,
          temperature: processSettings.temperature ?? defaults.temperature,
          maxTokens: processSettings.maxTokens ?? defaults.maxTokens,
          topP: processSettings.topP ?? defaults.topP,
          baseProvider:
            processKey === "openingGeneration" ||
            processKey === "openingRefinement"
              ? getOpeningProvider(model)
              : SCENARIO_PROVIDER,
          reasoningEffort: processSettings.reasoningEffort,
          providerOnly: processSettings.providerOnly,
        })
      ) {
        wizardChanged = true;
      }
    }
    if (wizardChanged) {
      await settings.saveWizardSettings();
    }

    let servicesChanged = false;
    const services = settings.systemServicesSettings;

    servicesChanged =
      seedManualBody(services.lorebookClassifier, {
        model: services.lorebookClassifier.model,
        temperature: services.lorebookClassifier.temperature,
        maxTokens: services.lorebookClassifier.maxTokens,
        reasoningEffort: services.lorebookClassifier.reasoningEffort,
        providerOnly: services.lorebookClassifier.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.classifier, {
        model: services.classifier.model,
        temperature: services.classifier.temperature,
        maxTokens: services.classifier.maxTokens,
        reasoningEffort: services.classifier.reasoningEffort,
        providerOnly: services.classifier.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.memory, {
        model: services.memory.model,
        temperature: services.memory.temperature,
        maxTokens: 8192,
        reasoningEffort: services.memory.reasoningEffort,
        providerOnly: services.memory.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.suggestions, {
        model: services.suggestions.model,
        temperature: services.suggestions.temperature,
        maxTokens: services.suggestions.maxTokens,
        reasoningEffort: services.suggestions.reasoningEffort,
        providerOnly: services.suggestions.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.actionChoices, {
        model: services.actionChoices.model,
        temperature: services.actionChoices.temperature,
        maxTokens: services.actionChoices.maxTokens,
        reasoningEffort: services.actionChoices.reasoningEffort,
        providerOnly: services.actionChoices.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.styleReviewer, {
        model: services.styleReviewer.model,
        temperature: services.styleReviewer.temperature,
        maxTokens: services.styleReviewer.maxTokens,
        reasoningEffort: services.styleReviewer.reasoningEffort,
        providerOnly: services.styleReviewer.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.entryRetrieval, {
        model: services.entryRetrieval.model,
        temperature: services.entryRetrieval.temperature,
        maxTokens: 8192,
        reasoningEffort: services.entryRetrieval.reasoningEffort,
        providerOnly: services.entryRetrieval.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.loreManagement, {
        model: services.loreManagement.model,
        temperature: services.loreManagement.temperature,
        maxTokens: 8192,
        reasoningEffort: services.loreManagement.reasoningEffort,
        providerOnly: services.loreManagement.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.timelineFill, {
        model: services.timelineFill.model,
        temperature: services.timelineFill.temperature,
        maxTokens: 8192,
        reasoningEffort: services.timelineFill.reasoningEffort,
        providerOnly: services.timelineFill.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.chapterQuery, {
        model: services.chapterQuery.model,
        temperature: services.chapterQuery.temperature,
        maxTokens: 8192,
        reasoningEffort: services.chapterQuery.reasoningEffort,
        providerOnly: services.chapterQuery.providerOnly,
      }) || servicesChanged;

    servicesChanged =
      seedManualBody(services.agenticRetrieval, {
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
      title: "Delete Profile",
      kind: "warning",
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
      "Reset all settings to their default values?\n\nYour API key will be preserved, but all other settings (models, temperatures, prompts, UI preferences) will be reset.\n\nThis cannot be undone.",
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
      updateError =
        error instanceof Error ? error.message : "Failed to check for updates";
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
          `Update ${updateInfo.version} has been downloaded.\n\nRestart now to apply the update?`,
        );
        if (restart) {
          await updaterService.relaunch();
        }
      }
    } catch (error) {
      updateError =
        error instanceof Error ? error.message : "Failed to download update";
    } finally {
      isDownloadingUpdate = false;
      downloadProgress = null;
    }
  }

  function formatLastChecked(timestamp: number | null): string {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  // Handle touch/swipe
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;
  const SWIPE_THRESHOLD = 50;
  const SWIPE_TIMEOUT = 400; // Max time in ms for a valid swipe

  // Elements that should not trigger swipe gestures
  const INTERACTIVE_SELECTORS =
    'input[type="range"], input[type="text"], input[type="number"], textarea, select, button, a';

  function handleTouchStart(e: TouchEvent) {
    // Check if touch started on an interactive element
    const target = e.target as HTMLElement;
    if (target.closest(INTERACTIVE_SELECTORS)) {
      isSwiping = false;
      return;
    }

    const touch = e.changedTouches[0];
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
    touchStartTime = Date.now();
    isSwiping = true;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (!isSwiping) return;
    isSwiping = false;

    // Check if swipe took too long
    if (Date.now() - touchStartTime > SWIPE_TIMEOUT) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.screenX - touchStartX;
    const deltaY = touch.screenY - touchStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // Only trigger swipe if horizontal movement is dominant (> 1.5x vertical)
    // This prevents diagonal scrolling from triggering tab switches
    if (absX < SWIPE_THRESHOLD || absX < absY * 1.5) return;

    if (deltaX < -SWIPE_THRESHOLD) {
      // Swipe Left -> Next Tab
      const idx = tabs.findIndex((t) => t.id === activeTab);
      if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
    } else if (deltaX > SWIPE_THRESHOLD) {
      // Swipe Right -> Previous Tab
      const idx = tabs.findIndex((t) => t.id === activeTab);
      if (idx > 0) setActiveTab(tabs[idx - 1].id);
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  onclick={() => safeClose()}
>
  <div
    class="card w-full px-0 pb-0 max-w-5xl h-[85vh] overflow-hidden flex flex-col shadow-2xl"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-surface-700 px-3 py-2 md:py-3 -mt-3.5 flex-shrink-0 bg-surface-800"
    >
      <div class="flex items-center gap-2">
        <h2
          class="text-lg font-semibold text-surface-100 flex items-center gap-2"
        >
          <Settings2 class="h-4 w-4 text-surface-400" />
          Settings
        </h2>
      </div>
      <button
        class="btn-ghost rounded-lg p-1.5 -mt-1 -mr-5 sm:mr-0 hover:bg-surface-700 transition-colors"
        onclick={() => safeClose()}
        disabled={isResettingSettings}
      >
        <X class="h-4 w-4" />
      </button>
    </div>

    <div class="flex flex-1 min-h-0 relative">
      <!-- Mobile Floating Navigation -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 md:hidden">
        <div
          class="flex items-center bg-surface-800/95 backdrop-blur-md p-1 rounded-full border border-surface-700 shadow-xl"
        >
          {#each tabs as tab}
            <button
              class="relative flex items-center justify-center rounded-full transition-all duration-300 ease-out"
              class:bg-accent-600={activeTab === tab.id}
              class:text-white={activeTab === tab.id}
              class:text-surface-400={activeTab !== tab.id}
              class:px-3={activeTab === tab.id}
              class:py-2={activeTab === tab.id}
              class:p-2={activeTab !== tab.id}
              onclick={() => setActiveTab(tab.id)}
            >
              <tab.icon class="h-4 w-4 flex-shrink-0" />
              {#if activeTab === tab.id}
                <span
                  class="ml-1.5 text-xs font-medium whitespace-nowrap overflow-hidden transition-all duration-300"
                  style="max-width: 100px;">{tab.label}</span
                >
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Desktop Sidebar -->
      <div
        class="hidden md:flex flex-col border-r border-surface-700 bg-surface-800/30 overflow-y-auto p-2 gap-0.5 flex-shrink-0 w-44"
      >
        {#each tabs as tab}
          <button
            class="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-surface-700"
            class:bg-surface-700={activeTab === tab.id}
            class:text-surface-100={activeTab === tab.id}
            class:text-surface-400={activeTab !== tab.id}
            class:hover:text-surface-200={activeTab !== tab.id}
            onclick={() => setActiveTab(tab.id)}
          >
            <tab.icon class="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
            <span class="truncate">{tab.label}</span>
          </button>
        {/each}

        <div class="flex-1"></div>

        <button
          class="flex items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-400 bg-red-500/10 hover:bg-red-500/15 hover:text-red-300 transition-colors mt-auto"
          onclick={handleResetAll}
        >
          <RotateCcw class="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
          <span>Reset All</span>
        </button>
      </div>

      <!-- Content Area -->
      <div
        class="flex-1 overflow-x-hidden md:p-8 bg-surface-900/50 min-w-0 md:relative relative"
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
      >
        {#key activeTab}
          <div
            class="px-3 py-4 pb-20 md:p-0 h-full overflow-y-auto absolute inset-0 md:static md:h-auto md:overflow-visible slide-panel"
            style="--slide-x: {slideDirection === 'left'
              ? '80px'
              : '-80px'}; --slide-x-out: {slideDirection === 'left'
              ? '-80px'
              : '80px'};"
          >
            <div class="max-w-3xl mx-auto">
              {#if activeTab === "api"}
                <div class="space-y-4">
                  <!-- API Profiles Management Section -->
                  <div>
                    <div class="mb-3 flex items-center justify-between">
                      <label class="text-sm font-medium text-surface-300">
                        API Profiles
                      </label>
                      <button
                        class="btn btn-secondary text-xs"
                        onclick={() => {
                          editingProfile = null;
                          showProfileModal = true;
                        }}
                        title="Create new profile"
                      >
                        + New Profile
                      </button>
                    </div>

                    <p class="mb-3 text-xs text-surface-500">
                      Manage your API endpoint configurations. Each profile can
                      have its own URL, API key, and model list. Select which
                      profile to use for each service in the Generation and
                      Advanced tabs.
                    </p>

                    <!-- List of profiles -->
                    <div class="space-y-2">
                      {#each settings.apiSettings.profiles as profile (profile.id)}
                        <div
                          class="flex items-center justify-between rounded-lg bg-surface-800 p-3 border border-surface-700"
                        >
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <span
                                class="font-medium text-surface-200 truncate"
                                >{profile.name}</span
                              >
                              {#if profile.id === settings.getDefaultProfileIdForProvider()}
                                <span
                                  class="text-xs bg-accent-600/20 text-accent-400 px-1.5 py-0.5 rounded"
                                  >Default</span
                                >
                              {/if}
                            </div>
                            <div
                              class="text-xs text-surface-500 truncate mt-0.5"
                            >
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
                            onclick={() => {
                              editingProfile = profile;
                              showProfileModal = true;
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      {/each}
                    </div>

                    <!-- Quick link for OpenRouter -->
                    <p class="mt-4 text-sm text-surface-500">
                      Get an API key from <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        class="text-accent-400 hover:underline">openrouter.ai</a
                      >
                      or
                      <a
                        href="https://nano-gpt.com/subscription"
                        target="_blank"
                        class="text-accent-400 hover:underline">nano-gpt.com</a
                      >
                    </p>
                  </div>
                </div>
              {:else if activeTab === "generation"}
                <div class="space-y-6">
                  <MainNarrative
                    {providerOptions}
                    onOpenManualBodyEditor={openManualBodyEditor}
                  />
                  <AgentProfiles
                    {providerOptions}
                    onManageProfiles={() => {
                      showProfileModal = true;
                      editingProfile = null;
                    }}
                  />
                </div>
              {:else if activeTab === "ui"}
                <div class="space-y-4">
                  <div>
                    <label
                      class="mb-2 block text-sm font-medium text-surface-300"
                    >
                      Theme
                    </label>
                    <select
                      class="input"
                      value={settings.uiSettings.theme}
                      onchange={(e) =>
                        settings.setTheme(e.currentTarget.value as ThemeId)}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light (Paper)</option>
                      <option value="light-solarized">Light (Solarized)</option>
                      <option value="retro-console">Retro Console</option>
                      <option value="fallen-down">Fallen Down</option>
                    </select>
                    {#if settings.uiSettings.theme === "retro-console"}
                      <p class="mt-1 text-xs text-surface-400">
                        CRT aesthetic inspired by PS2-era games and Serial
                        Experiments Lain
                      </p>
                    {:else if settings.uiSettings.theme === "light"}
                      <p class="mt-1 text-xs text-surface-400">
                        Clean paper-like warm tones with amber accents
                      </p>
                    {:else if settings.uiSettings.theme === "light-solarized"}
                      <p class="mt-1 text-xs text-surface-400">
                        Classic Solarized color scheme with cream backgrounds
                      </p>
                    {:else if settings.uiSettings.theme === "fallen-down"}
                      <p class="mt-1 text-xs text-surface-400">
                        * The shadows deepen. Your adventure continues.
                      </p>
                    {/if}
                  </div>

                  <div>
                    <label
                      class="mb-2 block text-sm font-medium text-surface-300"
                    >
                      Font Size
                    </label>
                    <select
                      class="input"
                      value={settings.uiSettings.fontSize}
                      onchange={(e) =>
                        settings.setFontSize(
                          e.currentTarget.value as "small" | "medium" | "large",
                        )}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                  </div>

                  <div class="border-t border-surface-700 pt-4 mt-4">
                    <h3 class="text-sm font-medium text-surface-200 mb-3">
                      Story Font
                    </h3>
                    <FontSelector />
                  </div>

                  <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-surface-300"
                      >Show Word Count</label
                    >
                    <input
                      type="checkbox"
                      checked={settings.uiSettings.showWordCount}
                      onchange={() => {
                        settings.uiSettings.showWordCount =
                          !settings.uiSettings.showWordCount;
                      }}
                      class="h-5 w-5 rounded border-surface-600 bg-surface-700"
                    />
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <label class="text-sm font-medium text-surface-300"
                        >Spellcheck</label
                      >
                      <p class="text-xs text-surface-500">
                        Grammar and spelling suggestions while typing
                      </p>
                    </div>
                    <button
                      class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      class:bg-accent-600={settings.uiSettings
                        .spellcheckEnabled}
                      class:bg-surface-600={!settings.uiSettings
                        .spellcheckEnabled}
                      onclick={() =>
                        settings.setSpellcheckEnabled(
                          !settings.uiSettings.spellcheckEnabled,
                        )}
                      aria-label="Toggle spellcheck"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        class:translate-x-6={settings.uiSettings
                          .spellcheckEnabled}
                        class:translate-x-1={!settings.uiSettings
                          .spellcheckEnabled}
                      ></span>
                    </button>
                  </div>

                  <!-- Updates Section -->
                  <div class="flex items-center justify-between">
                    <div>
                      <label class="text-sm font-medium text-surface-300"
                        >Disable Suggestions</label
                      >
                      <p class="text-xs text-surface-500">
                        Hide AI-generated action choices and plot suggestions
                      </p>
                    </div>
                    <button
                      class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      class:bg-accent-600={settings.uiSettings
                        .disableSuggestions}
                      class:bg-surface-600={!settings.uiSettings
                        .disableSuggestions}
                      onclick={() =>
                        settings.setDisableSuggestions(
                          !settings.uiSettings.disableSuggestions,
                        )}
                      aria-label="Toggle disable suggestions"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        class:translate-x-6={settings.uiSettings
                          .disableSuggestions}
                        class:translate-x-1={!settings.uiSettings
                          .disableSuggestions}
                      ></span>
                    </button>
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <label class="text-sm font-medium text-surface-300"
                        >Disable Action Prefixes</label
                      >
                      <p class="text-xs text-surface-500">
                        Hide Do/Say/Think buttons and use raw input
                      </p>
                    </div>
                    <button
                      class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      class:bg-accent-600={settings.uiSettings
                        .disableActionPrefixes}
                      class:bg-surface-600={!settings.uiSettings
                        .disableActionPrefixes}
                      onclick={() =>
                        settings.setDisableActionPrefixes(
                          !settings.uiSettings.disableActionPrefixes,
                        )}
                      aria-label="Toggle disable action prefixes"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        class:translate-x-6={settings.uiSettings
                          .disableActionPrefixes}
                        class:translate-x-1={!settings.uiSettings
                          .disableActionPrefixes}
                      ></span>
                    </button>
                  </div>

                  <div class="flex items-center justify-between">
                    <div>
                      <label class="text-sm font-medium text-surface-300"
                        >Show Reasoning Block</label
                      >
                      <p class="text-xs text-surface-500">
                        Show thought process display
                      </p>
                    </div>
                    <button
                      class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                      class:bg-accent-600={settings.uiSettings.showReasoning}
                      class:bg-surface-600={!settings.uiSettings.showReasoning}
                      onclick={() =>
                        settings.setShowReasoning(
                          !settings.uiSettings.showReasoning,
                        )}
                      aria-label="Toggle show reasoning"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        class:translate-x-6={settings.uiSettings.showReasoning}
                        class:translate-x-1={!settings.uiSettings.showReasoning}
                      ></span>
                    </button>
                  </div>

                  <div class="border-t border-surface-700 pt-4 mt-4">
                    <div class="flex items-center gap-2 mb-3">
                      <Download class="h-5 w-5 text-accent-400" />
                      <h3 class="text-sm font-medium text-surface-200">
                        Updates
                      </h3>
                    </div>

                    <!-- Update Status -->
                    <div class="card bg-surface-900 p-3 mb-3">
                      <div class="flex items-c11enter justify-between mb-2">
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
                            Last checked: {formatLastChecked(
                              settings.updateSettings.lastChecked,
                            )}
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
                            <p
                              class="text-xs text-surface-400 mb-3 line-clamp-3"
                            >
                              {updateInfo.body}
                            </p>
                          {/if}

                          {#if isDownloadingUpdate && downloadProgress}
                            <div class="mb-2">
                              <div
                                class="flex justify-between text-xs text-surface-400 mb-1"
                              >
                                <span>Downloading...</span>
                                <span>
                                  {#if downloadProgress.total}
                                    {Math.round(
                                      (downloadProgress.downloaded /
                                        downloadProgress.total) *
                                        100,
                                    )}%
                                  {:else}
                                    {Math.round(
                                      downloadProgress.downloaded / 1024 / 1024,
                                    )}MB
                                  {/if}
                                </span>
                              </div>
                              <div
                                class="h-2 bg-surface-700 rounded-full overflow-hidden"
                              >
                                <div
                                  class="h-full bg-accent-500 transition-all duration-300"
                                  style="width: {downloadProgress.total
                                    ? (downloadProgress.downloaded /
                                        downloadProgress.total) *
                                      100
                                    : 50}%"
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
                          <label class="text-sm font-medium text-surface-300"
                            >Check on startup</label
                          >
                          <p class="text-xs text-surface-500">
                            Automatically check for updates when the app opens
                          </p>
                        </div>
                        <button
                          class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                          class:bg-accent-600={settings.updateSettings
                            .autoCheck}
                          class:bg-surface-600={!settings.updateSettings
                            .autoCheck}
                          onclick={() =>
                            settings.setAutoCheck(
                              !settings.updateSettings.autoCheck,
                            )}
                          aria-label="Toggle auto-check updates"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                            class:translate-x-6={settings.updateSettings
                              .autoCheck}
                            class:translate-x-1={!settings.updateSettings
                              .autoCheck}
                          ></span>
                        </button>
                      </div>

                      <div class="flex items-center justify-between">
                        <div>
                          <label class="text-sm font-medium text-surface-300"
                            >Auto-download updates</label
                          >
                          <p class="text-xs text-surface-500">
                            Download updates automatically in the background
                          </p>
                        </div>
                        <button
                          class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                          class:bg-accent-600={settings.updateSettings
                            .autoDownload}
                          class:bg-surface-600={!settings.updateSettings
                            .autoDownload}
                          onclick={() =>
                            settings.setAutoDownload(
                              !settings.updateSettings.autoDownload,
                            )}
                          aria-label="Toggle auto-download updates"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                            class:translate-x-6={settings.updateSettings
                              .autoDownload}
                            class:translate-x-1={!settings.updateSettings
                              .autoDownload}
                          ></span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              {:else if activeTab === "prompts"}
                <div class="space-y-6">
                  <!-- Category Toggle -->
                  <div
                    class="flex items-center gap-2 border-b border-surface-700 pb-3 overflow-x-auto"
                  >
                    <button
                      class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
                      class:bg-surface-700={promptsCategory === "story"}
                      class:text-surface-100={promptsCategory === "story"}
                      class:text-surface-400={promptsCategory !== "story"}
                      onclick={() => (promptsCategory = "story")}
                    >
                      Story
                    </button>
                    <button
                      class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
                      class:bg-surface-700={promptsCategory === "service"}
                      class:text-surface-100={promptsCategory === "service"}
                      class:text-surface-400={promptsCategory !== "service"}
                      onclick={() => (promptsCategory = "service")}
                    >
                      Services
                    </button>
                    <button
                      class="px-3 py-1.5 text-sm rounded-lg transition-colors flex-shrink-0"
                      class:bg-surface-700={promptsCategory === "wizard"}
                      class:text-surface-100={promptsCategory === "wizard"}
                      class:text-surface-400={promptsCategory !== "wizard"}
                      onclick={() => (promptsCategory = "wizard")}
                    >
                      Wizard
                    </button>
                  </div>

                  <!-- Templates List -->
                  <div class="space-y-4 !mt-0 sm:!mt-3">
                    <div
                      class="flex items-center justify-between -mb-3 sm:-mb-1"
                    >
                      <h3 class="text-sm font-medium text-surface-200">
                        {getCategoryLabel()}
                      </h3>
                      <div class="flex items-center">
                        <button
                          class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1 px-2 py-1"
                          onclick={() => {
                            getTemplatesForCategory().forEach((t) => {
                              handleTemplateReset(t.id);
                              handleUserContentReset(t.id);
                            });
                          }}
                        >
                          <RotateCcw class="h-3 w-3" />
                          Reset All
                        </button>
                        <button
                          class="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                          onclick={async () => {
                            isExporting = true;
                            try {
                              await promptExportService.exportPrompts();
                            } finally {
                              isExporting = false;
                            }
                          }}
                          disabled={isExporting}
                        >
                          {#if isExporting}
                            <Loader2 class="h-3.5 w-3.5 animate-spin" />
                          {:else}
                            <Download class="h-3.5 w-3.5" />
                          {/if}
                          Export
                        </button>
                        <button
                          class="btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                          onclick={() => (promptImportModalOpen = true)}
                        >
                          <Upload class="h-3.5 w-3.5" />
                          Import
                        </button>
                      </div>
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
                            macroOverrides={settings.promptSettings
                              .macroOverrides}
                            onChange={(content) =>
                              handleTemplateChange(template.id, content)}
                            onUserChange={(content) =>
                              handleUserContentChange(template.id, content)}
                            onReset={() => handleTemplateReset(template.id)}
                            onUserReset={() =>
                              handleUserContentReset(template.id)}
                            onMacroOverride={handleMacroOverride}
                            onMacroReset={handleMacroReset}
                          />
                          <button
                            class="mt-3 text-xs text-surface-400 hover:text-surface-200"
                            onclick={() => (selectedTemplateId = null)}
                          >
                            Collapse
                          </button>
                        {:else}
                          <div class="flex items-center justify-between">
                            <div>
                              <div class="flex items-center gap-2">
                                <span
                                  class="text-sm font-medium text-surface-200"
                                  >{template.name}</span
                                >
                                {#if isTemplateModified(template.id)}
                                  <span
                                    class="text-xs px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 border border-amber-700/30"
                                  >
                                    Modified
                                  </span>
                                {/if}
                              </div>
                              <p class="text-xs text-surface-500 mt-0.5">
                                {template.description}
                              </p>
                            </div>
                            <button
                              class="text-xs text-accent-400 hover:text-accent-300"
                              onclick={() => (selectedTemplateId = template.id)}
                            >
                              Edit
                            </button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>

                  <!-- Macros Section -->
                  <div class="border-t border-surface-700 pt-4 space-y-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <h3 class="text-sm font-medium text-surface-200">
                          Macro Library
                        </h3>
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
                      <h4 class="text-xs font-medium text-surface-400 mb-3">
                        Simple Macros
                      </h4>
                      <div class="flex flex-wrap gap-2">
                        {#each allMacros.filter((m) => m.type === "simple") as macro}
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
                      <h4 class="text-xs font-medium text-surface-400 mb-3">
                        Complex Macros (Variant-based)
                      </h4>
                      <div class="flex flex-wrap gap-2">
                        {#each allMacros.filter((m) => m.type === "complex") as macro}
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
              {:else if activeTab === "images"}
                <div class="space-y-4">
                  <!-- Enable Image Generation Toggle -->
                  <div class="border-b border-surface-700 pb-4">
                    <div class="flex items-center justify-between">
                      <div>
                        <h3 class="text-sm font-medium text-surface-200">
                          Automatic Image Generation
                        </h3>
                        <p class="text-xs text-surface-500">
                          Generate images for visually striking moments in the
                          narrative.
                        </p>
                      </div>
                      <button
                        class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                        class:bg-accent-600={settings.systemServicesSettings
                          .imageGeneration.enabled}
                        class:bg-surface-600={!settings.systemServicesSettings
                          .imageGeneration.enabled}
                        onclick={() => {
                          settings.systemServicesSettings.imageGeneration.enabled =
                            !settings.systemServicesSettings.imageGeneration
                              .enabled;
                          settings.saveSystemServicesSettings();
                        }}
                        aria-label="Toggle image generation"
                      >
                        <span
                          class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                          class:translate-x-6={settings.systemServicesSettings
                            .imageGeneration.enabled}
                          class:translate-x-1={!settings.systemServicesSettings
                            .imageGeneration.enabled}
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
                      <p class="text-xs text-surface-500">
                        Select the image generation service to use.
                      </p>
                      <select
                        class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                        value={settings.systemServicesSettings.imageGeneration
                          .imageProvider ?? "nanogpt"}
                        onchange={(e) => {
                          const provider = e.currentTarget.value as
                            | "nanogpt"
                            | "chutes";
                          settings.systemServicesSettings.imageGeneration.imageProvider =
                            provider;
                          // Update default models based on provider
                          if (provider === "chutes") {
                            settings.systemServicesSettings.imageGeneration.referenceModel =
                              "qwen-image-edit-2511";
                          } else {
                            settings.systemServicesSettings.imageGeneration.referenceModel =
                              "qwen-image";
                          }
                          settings.saveSystemServicesSettings();
                        }}
                      >
                        <option value="nanogpt">NanoGPT</option>
                        <option value="chutes">Chutes</option>
                      </select>
                    </div>

                    <!-- NanoGPT API Key (shown when NanoGPT is selected) -->
                    {#if (settings.systemServicesSettings.imageGeneration.imageProvider ?? "nanogpt") === "nanogpt"}
                      <div class="space-y-2">
                        <label class="text-sm font-medium text-surface-300">
                          NanoGPT API Key
                        </label>
                        <p class="text-xs text-surface-500">
                          API key for NanoGPT image generation.
                        </p>
                        <div class="flex gap-2">
                          <input
                            type="password"
                            class="input input-sm flex-1 bg-surface-800 border-surface-600 text-surface-100"
                            value={settings.systemServicesSettings
                              .imageGeneration.nanoGptApiKey}
                            oninput={(e) => {
                              settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
                                e.currentTarget.value;
                              settings.saveSystemServicesSettings();
                            }}
                            placeholder="Enter your NanoGPT API key"
                          />
                          {#if settings.apiSettings.profiles.some((p) => p.baseUrl?.includes("nano-gpt.com") && p.apiKey)}
                            <button
                              class="btn btn-secondary text-xs whitespace-nowrap"
                              onclick={() => {
                                const nanoProfile =
                                  settings.apiSettings.profiles.find(
                                    (p) =>
                                      p.baseUrl?.includes("nano-gpt.com") &&
                                      p.apiKey,
                                  );
                                if (nanoProfile?.apiKey) {
                                  settings.systemServicesSettings.imageGeneration.nanoGptApiKey =
                                    nanoProfile.apiKey;
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
                    {#if settings.systemServicesSettings.imageGeneration.imageProvider === "chutes"}
                      <div class="space-y-2">
                        <label class="text-sm font-medium text-surface-300">
                          Chutes API Key
                        </label>
                        <p class="text-xs text-surface-500">
                          API key for Chutes image generation.
                        </p>
                        <input
                          type="password"
                          class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                          value={settings.systemServicesSettings.imageGeneration
                            .chutesApiKey}
                          oninput={(e) => {
                            settings.systemServicesSettings.imageGeneration.chutesApiKey =
                              e.currentTarget.value;
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
                        <p class="text-xs text-surface-500">
                          The image model to use for generation.
                        </p>
                        <input
                          type="text"
                          class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                          value={settings.systemServicesSettings.imageGeneration
                            .model}
                          oninput={(e) => {
                            settings.systemServicesSettings.imageGeneration.model =
                              e.currentTarget.value;
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
                      <p class="text-xs text-surface-500">
                        Visual style for generated images. Edit styles in the
                        Prompts tab.
                      </p>
                      <select
                        class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                        value={settings.systemServicesSettings.imageGeneration
                          .styleId}
                        onchange={(e) => {
                          settings.systemServicesSettings.imageGeneration.styleId =
                            e.currentTarget.value;
                          settings.saveSystemServicesSettings();
                        }}
                      >
                        <option value="image-style-soft-anime"
                          >Soft Anime</option
                        >
                        <option value="image-style-semi-realistic"
                          >Semi-realistic Anime</option
                        >
                        <option value="image-style-photorealistic"
                          >Photorealistic</option
                        >
                      </select>
                    </div>

                    <!-- Image Size -->
                    <div class="space-y-2">
                      <label class="text-sm font-medium text-surface-300">
                        Image Size
                      </label>
                      <select
                        class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                        value={settings.systemServicesSettings.imageGeneration
                          .size}
                        onchange={(e) => {
                          settings.systemServicesSettings.imageGeneration.size =
                            e.currentTarget.value as "512x512" | "1024x1024";
                          settings.saveSystemServicesSettings();
                        }}
                      >
                        <option value="512x512">512x512 (Faster)</option>
                        <option value="1024x1024"
                          >1024x1024 (Higher Quality)</option
                        >
                      </select>
                    </div>

                    <!-- Max Images Per Message -->
                    <div class="space-y-2">
                      <label class="text-sm font-medium text-surface-300">
                        Max Images Per Message: {settings.systemServicesSettings
                          .imageGeneration.maxImagesPerMessage === 0
                          ? "Unlimited"
                          : settings.systemServicesSettings.imageGeneration
                              .maxImagesPerMessage}
                      </label>
                      <p class="text-xs text-surface-500">
                        Maximum images per narrative (0 = unlimited).
                      </p>
                      <input
                        type="range"
                        min="0"
                        max="5"
                        step="1"
                        class="range range-xs range-accent w-full"
                        value={settings.systemServicesSettings.imageGeneration
                          .maxImagesPerMessage}
                        oninput={(e) => {
                          settings.systemServicesSettings.imageGeneration.maxImagesPerMessage =
                            parseInt(e.currentTarget.value);
                          settings.saveSystemServicesSettings();
                        }}
                      />
                    </div>

                    <!-- Auto Generate Toggle -->
                    <div class="border-t border-surface-700 pt-4">
                      <div class="flex items-center justify-between">
                        <div>
                          <h3 class="text-sm font-medium text-surface-200">
                            Auto-Generate
                          </h3>
                          <p class="text-xs text-surface-500">
                            Automatically generate images after each narration.
                          </p>
                        </div>
                        <button
                          class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                          class:bg-accent-600={settings.systemServicesSettings
                            .imageGeneration.autoGenerate}
                          class:bg-surface-600={!settings.systemServicesSettings
                            .imageGeneration.autoGenerate}
                          onclick={() => {
                            settings.systemServicesSettings.imageGeneration.autoGenerate =
                              !settings.systemServicesSettings.imageGeneration
                                .autoGenerate;
                            settings.saveSystemServicesSettings();
                          }}
                          aria-label="Toggle auto-generate"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                            class:translate-x-6={settings.systemServicesSettings
                              .imageGeneration.autoGenerate}
                            class:translate-x-1={!settings
                              .systemServicesSettings.imageGeneration
                              .autoGenerate}
                          ></span>
                        </button>
                      </div>
                    </div>

                    <!-- Portrait Reference Mode -->
                    <div class="border-t border-surface-700 pt-4 mt-4">
                      <div class="flex items-center justify-between">
                        <div>
                          <h3 class="text-sm font-medium text-surface-200">
                            Portrait Reference Mode
                          </h3>
                          <p class="text-xs text-surface-500">
                            Use character portraits as reference images when
                            generating story images.
                          </p>
                        </div>
                        <button
                          class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                          class:bg-accent-600={settings.systemServicesSettings
                            .imageGeneration.portraitMode}
                          class:bg-surface-600={!settings.systemServicesSettings
                            .imageGeneration.portraitMode}
                          onclick={() => {
                            settings.systemServicesSettings.imageGeneration.portraitMode =
                              !settings.systemServicesSettings.imageGeneration
                                .portraitMode;
                            settings.saveSystemServicesSettings();
                          }}
                          aria-label="Toggle portrait mode"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                            class:translate-x-6={settings.systemServicesSettings
                              .imageGeneration.portraitMode}
                            class:translate-x-1={!settings
                              .systemServicesSettings.imageGeneration
                              .portraitMode}
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
                        <p class="text-xs text-surface-500">
                          Model used when generating character portraits from
                          visual descriptors.
                        </p>
                        <input
                          type="text"
                          class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                          value={settings.systemServicesSettings.imageGeneration
                            .portraitModel}
                          oninput={(e) => {
                            settings.systemServicesSettings.imageGeneration.portraitModel =
                              e.currentTarget.value;
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
                        <p class="text-xs text-surface-500">
                          Model used for story images when a character portrait
                          is attached as reference.
                        </p>
                        <input
                          type="text"
                          class="input input-sm w-full bg-surface-800 border-surface-600 text-surface-100"
                          value={settings.systemServicesSettings.imageGeneration
                            .referenceModel}
                          oninput={(e) => {
                            settings.systemServicesSettings.imageGeneration.referenceModel =
                              e.currentTarget.value;
                            settings.saveSystemServicesSettings();
                          }}
                          placeholder="qwen-image"
                        />
                      </div>
                    {/if}

                    <!-- Background image generation enabled -->
                    <div class="border-t border-surface-700 pt-4 mt-4">
                      <div class="flex items-center justify-between">
                        <div>
                          <h3 class="text-sm font-medium text-surface-200">
                            Background image generation enabled
                          </h3>
                          <p class="text-xs text-surface-500">
                            Generate background images on location changes.
                          </p>
                        </div>
                        <button
                          class="relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors"
                          class:bg-accent-600={settings.systemServicesSettings
                            .imageGeneration.backgroundImagesEnabled}
                          class:bg-surface-600={!settings.systemServicesSettings
                            .imageGeneration.backgroundImagesEnabled}
                          onclick={() => {
                            settings.systemServicesSettings.imageGeneration.backgroundImagesEnabled =
                              !settings.systemServicesSettings.imageGeneration
                                .backgroundImagesEnabled;
                            settings.saveSystemServicesSettings();
                          }}
                          aria-label="Toggle background image generation"
                        >
                          <span
                            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                            class:translate-x-6={settings.systemServicesSettings
                              .imageGeneration.backgroundImagesEnabled}
                            class:translate-x-1={!settings
                              .systemServicesSettings.imageGeneration
                              .backgroundImagesEnabled}
                          ></span>
                        </button>
                      </div>
                    </div>

                    <!-- Reset Button -->
                    <div class="border-t border-surface-700 pt-4 mt-4">
                      <button
                        class="btn btn-secondary text-xs flex items-center gap-1"
                        onclick={() => settings.resetImageGenerationSettings()}
                      >
                        <RotateCcw class="h-3 w-3 mr-1" />
                        Reset to Defaults
                      </button>
                    </div>
                  {/if}
                </div>
              {:else if activeTab === "tts"}
                <TTSSettings />
              {:else if activeTab === "advanced"}
                <div class="space-y-4">
                  <AdvancedSettings />

                  <!-- Reset All Settings -->
                  <div class="mt-6 pt-6 border-t border-red-500/30">
                    <div class="flex items-center justify-between">
                      <div>
                        <h3 class="text-sm font-medium text-red-400">
                          Reset All Settings
                        </h3>
                        <p class="text-xs text-surface-500 mt-1">
                          Reset all settings to their default values. Your API
                          key will be preserved.
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
                          <RotateCcw class="ml-2 h-4 w-4" />
                          Reset
                        {/if}
                      </button>
                    </div>
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/key}
      </div>
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
        <div
          class="flex items-center justify-between border-b border-surface-700 px-4 py-3"
        >
          <h3 class="text-sm font-medium text-surface-200">
            {manualBodyEditorTitle}
          </h3>
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
            Overrides request parameters; messages and tools are managed by
            Aventuras.
          </p>
        </div>
        <div
          class="border-t border-surface-700 px-4 py-3 flex items-center justify-end gap-2"
        >
          <button
            class="btn btn-secondary text-sm"
            onclick={closeManualBodyEditor}>Cancel</button
          >
          <button
            class="btn btn-primary text-sm"
            onclick={applyManualBodyEditor}>Save</button
          >
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Profile Modal -->
<ProfileModal
  isOpen={showProfileModal}
  {editingProfile}
  onClose={() => {
    showProfileModal = false;
    editingProfile = null;
  }}
  onSave={handleProfileSave}
/>

<!-- Prompt Import Modal -->
<PromptImportModal
  open={promptImportModalOpen}
  onClose={() => (promptImportModalOpen = false)}
/>

<!-- Macro Editor Modals -->
{#if editingMacro && editingMacro.type === "simple"}
  <MacroEditor
    isOpen={showMacroEditor}
    macro={editingMacro as SimpleMacro}
    currentOverride={findMacroOverride(editingMacro.id)}
    onClose={() => {
      showMacroEditor = false;
      editingMacro = null;
    }}
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

{#if editingMacro && editingMacro.type === "complex"}
  <ComplexMacroEditor
    isOpen={showComplexMacroEditor}
    macro={editingMacro as ComplexMacro}
    currentOverride={findMacroOverride(editingMacro.id)}
    onClose={() => {
      showComplexMacroEditor = false;
      editingMacro = null;
    }}
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

<style>
  /* Mobile-only slide animations */
  @keyframes slideIn {
    from {
      transform: translateX(var(--slide-x));
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(var(--slide-x-out));
      opacity: 0;
    }
  }

  .slide-panel {
    animation: slideIn 200ms ease-out forwards;
  }

  /* Disable animations on desktop */
  @media (min-width: 768px) {
    .slide-panel {
      animation: none;
    }
  }
</style>
