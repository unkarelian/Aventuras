<script lang="ts">
  import { onMount } from 'svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings, DEFAULT_SERVICE_PROMPTS } from '$lib/stores/settings.svelte';
  import { OpenRouterProvider } from '$lib/services/ai/openrouter';
  import type { ModelInfo } from '$lib/services/ai/types';
  import type { ThemeId } from '$lib/types';
  import {
    type AdvancedWizardSettings,
    SCENARIO_MODEL,
  } from '$lib/services/ai/scenario';
  import { X, Key, Cpu, Palette, RefreshCw, Search, Settings2, RotateCcw, ChevronDown, ChevronUp, Brain, BookOpen, Lightbulb, Sparkles, Clock } from 'lucide-svelte';

  let activeTab = $state<'api' | 'generation' | 'ui' | 'advanced'>('api');

  // Advanced settings section state
  let showStoryGenSection = $state(true);
  let showWizardSection = $state(false);
  let showClassifierSection = $state(false);
  let showMemorySection = $state(false);
  let showSuggestionsSection = $state(false);
  let showStyleReviewerSection = $state(false);
  let showTimelineFillSection = $state(false);
  let editingStoryPrompt = $state<'adventure' | 'creativeWriting' | null>(null);
  let editingProcess = $state<keyof AdvancedWizardSettings | null>(null);
  let editingClassifierPrompt = $state(false);
  let editingMemoryPrompt = $state<'chapterAnalysis' | 'chapterSummarization' | 'retrievalDecision' | null>(null);
  let editingSuggestionsPrompt = $state(false);
  let editingStyleReviewerPrompt = $state(false);
  let editingTimelineFillPrompt = $state<'system' | 'answer' | null>(null);

  // Process labels for UI
  const processLabels: Record<keyof AdvancedWizardSettings, string> = {
    settingExpansion: 'Setting Expansion',
    protagonistGeneration: 'Protagonist Generation',
    characterElaboration: 'Character Elaboration',
    supportingCharacters: 'Supporting Characters',
    openingGeneration: 'Opening Generation',
  };

  // Local state for API key (to avoid showing actual key)
  let apiKeyInput = $state('');
  let apiKeySet = $state(false);

  // Model fetching state
  let models = $state<ModelInfo[]>([]);
  let isLoadingModels = $state(false);
  let modelError = $state<string | null>(null);
  let modelSearch = $state('');

  // Fallback models if API fetch fails
  const fallbackModels: ModelInfo[] = [
    { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', contextLength: 131072 },
    { id: 'x-ai/grok-4.1-fast', name: 'Grok 4.1 Fast', contextLength: 131072 },
    { id: 'x-ai/grok-4.1', name: 'Grok 4.1', contextLength: 131072 },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4', contextLength: 200000 },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', contextLength: 200000 },
    { id: 'openai/gpt-4o', name: 'GPT-4o', contextLength: 128000 },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', contextLength: 1000000 },
    { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', contextLength: 131072 },
  ];

  // Filtered and sorted models
  let filteredModels = $derived.by(() => {
    let result = models.length > 0 ? [...models] : [...fallbackModels];

    // Filter by search term
    if (modelSearch.trim()) {
      const search = modelSearch.toLowerCase();
      result = result.filter(m =>
        m.id.toLowerCase().includes(search) ||
        m.name.toLowerCase().includes(search)
      );
    }

    // Sort: prioritize popular providers, then alphabetically
    const providerPriority: Record<string, number> = {
      'x-ai': 1,
      'anthropic': 2,
      'openai': 3,
      'google': 4,
      'meta-llama': 5,
      'mistralai': 6,
    };

    return result.sort((a, b) => {
      const providerA = a.id.split('/')[0];
      const providerB = b.id.split('/')[0];
      const priorityA = providerPriority[providerA] ?? 99;
      const priorityB = providerPriority[providerB] ?? 99;

      if (priorityA !== priorityB) return priorityA - priorityB;
      return a.name.localeCompare(b.name);
    });
  });

  $effect(() => {
    apiKeySet = !!settings.apiSettings.openrouterApiKey;
  });

  // Fetch models on mount (public endpoint, no API key needed)
  onMount(() => {
    console.log('[SettingsModal] onMount - starting model fetch');
    fetchModels();
  });

  async function fetchModels() {
    console.log('[SettingsModal] fetchModels called', { isLoadingModels });

    if (isLoadingModels) {
      console.log('[SettingsModal] Already loading, skipping');
      return;
    }

    isLoadingModels = true;
    modelError = null;

    try {
      console.log('[SettingsModal] Creating OpenRouterProvider...');
      // Models endpoint is public, doesn't need API key
      const provider = new OpenRouterProvider('');

      console.log('[SettingsModal] Calling listModels...');
      const fetchedModels = await provider.listModels();
      console.log('[SettingsModal] Received models:', fetchedModels.length);

      // Filter to only include text/chat models (exclude image, embedding, etc.)
      models = fetchedModels.filter(m => {
        const id = m.id.toLowerCase();
        // Exclude non-chat models
        if (id.includes('embedding') || id.includes('vision-only') || id.includes('tts') || id.includes('whisper')) {
          return false;
        }
        return true;
      });

      console.log(`[SettingsModal] Filtered to ${models.length} text/chat models`);
    } catch (error) {
      console.error('[SettingsModal] Failed to fetch models:', error);
      modelError = error instanceof Error ? error.message : 'Failed to load models. Using defaults.';
      models = [];
    } finally {
      isLoadingModels = false;
      console.log('[SettingsModal] fetchModels complete', { modelCount: models.length, error: modelError });
    }
  }

  async function saveApiKey() {
    if (apiKeyInput.trim()) {
      await settings.setApiKey(apiKeyInput.trim());
      apiKeyInput = '';
    }
  }

  function handleRefreshModels() {
    models = [];
    fetchModels();
  }

  async function clearApiKey() {
    await settings.setApiKey('');
    apiKeySet = false;
    models = [];
  }

  function formatContextLength(length: number): string {
    if (length >= 1000000) return `${(length / 1000000).toFixed(1)}M`;
    if (length >= 1000) return `${Math.round(length / 1000)}K`;
    return length.toString();
  }

  async function handleResetAll() {
    const confirmed = confirm(
      'Reset all settings to their default values?\n\nYour API key will be preserved, but all other settings (models, temperatures, prompts, UI preferences) will be reset.\n\nThis cannot be undone.'
    );
    if (!confirmed) return;

    await settings.resetAllSettings(true);
  }
</script>

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onclick={() => ui.closeSettings()}>
  <div
    class="card w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[80vh] overflow-hidden rounded-b-none sm:rounded-b-xl flex flex-col"
    onclick={(e) => e.stopPropagation()}
  >
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-3 sm:pb-4 flex-shrink-0">
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
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              OpenRouter API Key
            </label>
            {#if apiKeySet}
              <div class="flex items-center gap-2">
                <div class="input flex-1 bg-surface-700 text-surface-400">
                  ••••••••••••••••••••
                </div>
                <button class="btn btn-secondary" onclick={clearApiKey}>
                  Clear
                </button>
              </div>
              <p class="mt-1 text-sm text-green-400">API key configured</p>
            {:else}
              <div class="flex gap-2">
                <input
                  type="password"
                  bind:value={apiKeyInput}
                  placeholder="sk-or-..."
                  class="input flex-1"
                />
                <button
                  class="btn btn-primary"
                  onclick={saveApiKey}
                  disabled={!apiKeyInput.trim()}
                >
                  Save
                </button>
              </div>
            {/if}
            <p class="mt-2 text-sm text-surface-500">
              Get your API key from <a href="https://openrouter.ai/keys" target="_blank" class="text-accent-400 hover:underline">openrouter.ai</a>
            </p>
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="text-sm font-medium text-surface-300">
                Default Model
              </label>
              <button
                class="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 disabled:opacity-50"
                onclick={handleRefreshModels}
                disabled={isLoadingModels}
              >
                <span class={isLoadingModels ? 'animate-spin' : ''}>
                  <RefreshCw class="h-3 w-3" />
                </span>
                Refresh
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
              {:else}
                {#each filteredModels as model}
                  <option value={model.id}>
                    {model.name} ({formatContextLength(model.contextLength)} ctx)
                  </option>
                {/each}
              {/if}
            </select>

            {#if models.length > 0}
              <p class="mt-1 text-xs text-surface-500">
                {models.length} models available
              </p>
            {/if}
          </div>
        </div>
      {:else if activeTab === 'generation'}
        <div class="space-y-4">
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Temperature: {settings.apiSettings.temperature.toFixed(1)}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.apiSettings.temperature}
              oninput={(e) => settings.setTemperature(parseFloat(e.currentTarget.value))}
              class="w-full"
            />
            <div class="flex justify-between text-xs text-surface-500">
              <span>Focused</span>
              <span>Creative</span>
            </div>
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Max Tokens: {settings.apiSettings.maxTokens}
            </label>
            <input
              type="range"
              min="256"
              max="4096"
              step="128"
              value={settings.apiSettings.maxTokens}
              oninput={(e) => settings.setMaxTokens(parseInt(e.currentTarget.value))}
              class="w-full"
            />
            <div class="flex justify-between text-xs text-surface-500">
              <span>Shorter</span>
              <span>Longer</span>
            </div>
          </div>

          <!-- Extended Thinking Toggle -->
          <div class="border-t border-surface-700 pt-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Sparkles class="h-5 w-5 text-amber-400" />
                <div>
                  <label class="text-sm font-medium text-surface-300">Extended Thinking</label>
                  <p class="text-xs text-surface-500">
                    Enable reasoning for supported models (e.g., GLM 4.7, DeepSeek v3.2)
                  </p>
                </div>
              </div>
              <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                class:bg-accent-600={settings.apiSettings.enableThinking}
                class:bg-surface-600={!settings.apiSettings.enableThinking}
                onclick={() => settings.setEnableThinking(!settings.apiSettings.enableThinking)}
                aria-label="Toggle extended thinking"
              >
                <span
                  class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                  class:translate-x-6={settings.apiSettings.enableThinking}
                  class:translate-x-1={!settings.apiSettings.enableThinking}
                ></span>
              </button>
            </div>
            {#if settings.apiSettings.enableThinking}
              <p class="mt-2 text-xs text-amber-400/80 ml-8">
                The model will use internal reasoning to improve responses. Reasoning is not shown or stored.
              </p>
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
        </div>
      {:else if activeTab === 'advanced'}
        <div class="space-y-4">
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
                        <!-- Model Selection -->
                        <div>
                          <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                          <input
                            type="text"
                            bind:value={settings.wizardSettings[process].model}
                            onblur={() => settings.saveWizardSettings()}
                            placeholder={SCENARIO_MODEL}
                            class="input text-sm"
                          />
                          <p class="text-xs text-surface-500 mt-1">
                            Default: {SCENARIO_MODEL}
                          </p>
                        </div>

                        <!-- Temperature -->
                        <div>
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
                            class="w-full h-2"
                          />
                          <div class="flex justify-between text-xs text-surface-500">
                            <span>Focused</span>
                            <span>Creative</span>
                          </div>
                        </div>

                        <!-- Max Tokens -->
                        <div>
                          <label class="mb-1 block text-xs font-medium text-surface-400">
                            Max Tokens: {processSettings.maxTokens ?? 1000}
                          </label>
                          <input
                            type="range"
                            min="256"
                            max="4096"
                            step="128"
                            bind:value={settings.wizardSettings[process].maxTokens}
                            onchange={() => settings.saveWizardSettings()}
                            class="w-full h-2"
                          />
                          <div class="flex justify-between text-xs text-surface-500">
                            <span>256</span>
                            <span>4096</span>
                          </div>
                        </div>

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
              </div>
            {/if}
          </div>

          <!-- Classifier Section -->
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
                  <!-- Model and Temperature Row -->
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                      <input
                        type="text"
                        bind:value={settings.systemServicesSettings.classifier.model}
                        onblur={() => settings.saveSystemServicesSettings()}
                        placeholder="deepseek/deepseek-v3.2"
                        class="input text-sm"
                      />
                    </div>
                    <div>
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
                        class="w-full h-2"
                      />
                    </div>
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3">
                    <label class="mb-1 block text-xs font-medium text-surface-400">
                      Max Tokens: {settings.systemServicesSettings.classifier.maxTokens}
                    </label>
                    <input
                      type="range"
                      min="500"
                      max="4000"
                      step="100"
                      bind:value={settings.systemServicesSettings.classifier.maxTokens}
                      onchange={() => settings.saveSystemServicesSettings()}
                      class="w-full h-2"
                    />
                  </div>

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
                  <!-- Model and Temperature Row -->
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                      <input
                        type="text"
                        bind:value={settings.systemServicesSettings.memory.model}
                        onblur={() => settings.saveSystemServicesSettings()}
                        placeholder="deepseek/deepseek-v3.2"
                        class="input text-sm"
                      />
                    </div>
                    <div>
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
                        class="w-full h-2"
                      />
                    </div>
                  </div>

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
                  <!-- Model, Temperature, and Max Tokens Row -->
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                      <input
                        type="text"
                        bind:value={settings.systemServicesSettings.suggestions.model}
                        onblur={() => settings.saveSystemServicesSettings()}
                        placeholder="deepseek/deepseek-v3.2"
                        class="input text-sm"
                      />
                    </div>
                    <div>
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
                        class="w-full h-2"
                      />
                    </div>
                  </div>

                  <!-- Max Tokens -->
                  <div class="mb-3">
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
                      class="w-full h-2"
                    />
                  </div>

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
                  <!-- Model and Temperature Row -->
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                      <input
                        type="text"
                        bind:value={settings.systemServicesSettings.styleReviewer.model}
                        onblur={() => settings.saveSystemServicesSettings()}
                        placeholder="x-ai/grok-4.1-fast"
                        class="input text-sm"
                      />
                    </div>
                    <div>
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
                        class="w-full h-2"
                      />
                    </div>
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
                  <div class="mb-3">
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
                      class="w-full h-2"
                    />
                  </div>

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
                  <p class="text-xs text-surface-500">Retrieves context from past chapters (default)</p>
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
                    Timeline Fill generates targeted questions about past chapters based on the current scene,
                    then retrieves answers to inject into the narrator's context. This is the default
                    memory retrieval method (over agentic retrieval).
                  </p>

                  <!-- Model and Temperature Row -->
                  <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Model</label>
                      <input
                        type="text"
                        bind:value={settings.systemServicesSettings.timelineFill.model}
                        onblur={() => settings.saveSystemServicesSettings()}
                        placeholder="deepseek/deepseek-v3.2"
                        class="input text-sm"
                      />
                    </div>
                    <div>
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
                        class="w-full h-2"
                      />
                    </div>
                  </div>

                  <!-- Max Queries -->
                  <div class="mb-3">
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

                  <!-- Query Generation Prompt -->
                  <div class="mb-3 border-t border-surface-700 pt-3">
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
</div>
