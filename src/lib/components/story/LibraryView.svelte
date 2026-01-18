<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { QUICK_START_SEEDS, type QuickStartSeed } from '$lib/services/templates';
  import { exportService } from '$lib/services/export';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { Plus, BookOpen, Trash2, Clock, Sparkles, Wand2, Rocket, Search, Skull, Heart, FileText, Upload, Sword, Feather, User, RefreshCw, Archive } from 'lucide-svelte';
  import type { StoryMode, POV } from '$lib/types';
  import SetupWizard from '../wizard/SetupWizard.svelte';

  // File input for import (HTML-based for mobile compatibility)
  let importFileInput: HTMLInputElement;

  let showNewStoryModal = $state(false);
  let showSetupWizard = $state(false);
  let setupWizardKey = $state(0);
  let selectedSeedId = $state<string | null>(null);
  let selectedMode = $state<StoryMode>('adventure');
  let selectedPOV = $state<POV>('first');

  // Wizard seed data (passed when opening wizard from Quick Start)
  let wizardSeed = $state<QuickStartSeed | null>(null);
  let wizardInitialMode = $state<StoryMode | undefined>(undefined);
  let wizardInitialPov = $state<POV | undefined>(undefined);

  // Derived seed based on selection
  let selectedSeed = $derived(
    selectedSeedId ? QUICK_START_SEEDS.find(t => t.id === selectedSeedId) : null
  );

  const templateIcons: Record<string, typeof Wand2> = {
    'fantasy-adventure': Wand2,
    'scifi-exploration': Rocket,
    'mystery-investigation': Search,
    'horror-survival': Skull,
    'slice-of-life': Heart,
    'custom': FileText,
  };

  // Load stories on mount
  $effect(() => {
    story.loadAllStories();
  });

  // Enforce POV constraints by mode
  $effect(() => {
    if (selectedMode === 'creative-writing') {
      selectedPOV = 'third';
    } else if (selectedPOV === 'second') {
      selectedPOV = 'first';
    }
  });

  function selectSeed(seedId: string) {
    selectedSeedId = seedId;
  }

  function openWizardWithSeed() {
    if (!selectedSeedId) return;

    const seed = QUICK_START_SEEDS.find(s => s.id === selectedSeedId);
    if (!seed) return;

    // Set wizard initialization data
    wizardSeed = seed;
    wizardInitialMode = selectedMode;
    wizardInitialPov = selectedMode === 'creative-writing' ? 'third' : selectedPOV;

    // Close modal and open wizard
    closeModal();
    setupWizardKey += 1;
    showSetupWizard = true;
  }

  function closeModal() {
    showNewStoryModal = false;
    selectedSeedId = null;
    selectedMode = 'adventure';
    selectedPOV = 'first';
  }

  function openSetupWizard() {
    // Clear any seed data for a fresh wizard
    wizardSeed = null;
    wizardInitialMode = undefined;
    wizardInitialPov = undefined;
    setupWizardKey += 1;
    showSetupWizard = true;
  }

  async function openStory(storyId: string) {
    await story.loadStory(storyId);
    ui.setActivePanel('story');
  }

  async function deleteStory(storyId: string, event: MouseEvent) {
    event.stopPropagation();
    const confirmed = await ask('Are you sure you want to delete this story? This action cannot be undone.', {
      title: 'Delete Story',
      kind: 'warning',
    });
    if (confirmed) {
      await story.deleteStory(storyId);
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getGenreColor(genre: string | null): string {
    switch (genre) {
      case 'Fantasy': return 'bg-purple-500/20 text-purple-400';
      case 'Sci-Fi': return 'bg-cyan-500/20 text-cyan-400';
      case 'Mystery': return 'bg-amber-500/20 text-amber-400';
      case 'Horror': return 'bg-red-500/20 text-red-400';
      case 'Slice of Life': return 'bg-green-500/20 text-green-400';
      default: return 'bg-surface-700 text-surface-400';
    }
  }

  let importError = $state<string | null>(null);

  function triggerImport() {
    importFileInput?.click();
  }

  async function handleImportFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importError = null;

    try {
      const content = await file.text();
      const result = await exportService.importFromContent(content);

      if (result.success && result.storyId) {
        await story.loadAllStories();
        await story.loadStory(result.storyId);
        ui.setActivePanel('story');
      } else if (result.error) {
        importError = result.error;
        setTimeout(() => importError = null, 5000);
      }
    } catch (error) {
      importError = error instanceof Error ? error.message : 'Failed to read file';
      setTimeout(() => importError = null, 5000);
    }

    // Reset file input for re-selection
    input.value = '';
  }
</script>

<div class="h-full overflow-y-auto p-4 sm:p-6 relative">
  <div class="mx-auto max-w-4xl">
    <!-- Header -->
    <div class="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-surface-100">Story Library</h1>
        <p class="text-sm sm:text-base text-surface-400">Your adventures await</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <button
          class="btn btn-secondary flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 text-sm"
          onclick={() => ui.openSyncModal()}
          title="Sync stories between devices"
        >
          <RefreshCw class="h-4 w-4 sm:h-5 sm:w-5" />
          <span class="hidden xs:inline">Sync</span>
        </button>
        <button
          class="btn btn-secondary flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 text-sm"
          onclick={() => ui.setActivePanel('vault')}
          title="Vault - Manage reusable characters and lorebooks"
        >
          <Archive class="h-4 w-4 sm:h-5 sm:w-5" />
          <span class="hidden xs:inline">Vault</span>
        </button>
        <button
          class="btn btn-secondary flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 text-sm"
          onclick={triggerImport}
        >
          <Upload class="h-4 w-4 sm:h-5 sm:w-5" />
          <span class="hidden xs:inline">Import</span>
        </button>
        <input
          type="file"
          accept="*/*,.avt,.json,application/json,application/octet-stream"
          class="hidden"
          bind:this={importFileInput}
          onchange={handleImportFileSelect}
        />
        <button
          class="btn btn-secondary flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 text-sm"
          onclick={() => showNewStoryModal = true}
        >
          <Plus class="h-4 w-4 sm:h-5 sm:w-5" />
          <span class="hidden xs:inline">Quick Start</span>
        </button>
        <button
          class="btn btn-primary flex items-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 text-sm"
          onclick={openSetupWizard}
        >
          <Sparkles class="h-4 w-4 sm:h-5 sm:w-5" />
          <span class="xs:hidden">New</span>
          <span class="hidden xs:inline">Create Story</span>
        </button>
      </div>
    </div>

    <!-- Import error message -->
    {#if importError}
      <div class="mb-4 rounded-lg bg-red-500/20 p-3 text-sm text-red-400">
        {importError}
      </div>
    {/if}

    <!-- Stories grid -->
    {#if story.allStories.length === 0}
      <div class="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
        <BookOpen class="mb-4 h-12 w-12 sm:h-16 sm:w-16 text-surface-600" />
        <h2 class="text-lg sm:text-xl font-semibold text-surface-300">No stories yet</h2>
        <p class="mt-2 text-sm sm:text-base text-surface-500">Create your first adventure to get started</p>
        <div class="mt-6 flex flex-col xs:flex-row gap-3 w-full xs:w-auto">
          <button
            class="btn btn-secondary flex items-center justify-center gap-2 min-h-[48px] w-full xs:w-auto"
            onclick={() => showNewStoryModal = true}
          >
            <Plus class="h-5 w-5" />
            Quick Start
          </button>
          <button
            class="btn btn-primary flex items-center justify-center gap-2 min-h-[48px] w-full xs:w-auto"
            onclick={openSetupWizard}
          >
            <Sparkles class="h-5 w-5" />
            Create Story
          </button>
        </div>
      </div>
    {:else}
      <div class="grid gap-3 sm:gap-4 grid-cols-1 xs:grid-cols-2 lg:grid-cols-3">
        {#each story.allStories as s (s.id)}
          <div
            role="button"
            tabindex="0"
            onclick={() => openStory(s.id)}
            onkeydown={(e) => e.key === 'Enter' && openStory(s.id)}
            class="card group cursor-pointer text-left transition-colors hover:border-accent-500/50 hover:bg-surface-700/50 active:bg-surface-700 min-h-[80px]"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-surface-100 group-hover:text-accent-400 truncate">
                  {s.title}
                </h3>
                {#if s.genre}
                  <span class="mt-1 inline-block rounded-full px-2 py-0.5 text-xs {getGenreColor(s.genre)}">
                    {s.genre}
                  </span>
                {/if}
              </div>
              <button
                onclick={(e) => deleteStory(s.id, e)}
                class="rounded p-2 text-surface-500 sm:opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 min-h-[40px] min-w-[40px] flex items-center justify-center -mr-1 -mt-1"
                title="Delete story"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>
            {#if s.description}
              <p class="mt-2 line-clamp-2 text-sm text-surface-400">
                {s.description}
              </p>
            {/if}
            <div class="mt-3 flex items-center gap-1 text-xs text-surface-500">
              <Clock class="h-3 w-3" />
              <span>Updated {formatDate(s.updatedAt)}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Discord Link -->
  <a
    href="https://discord.gg/DqVzhSPC46"
    target="_blank"
    rel="noopener noreferrer"
    class="hidden sm:flex fixed bottom-safe-4 left-safe-4 items-center gap-2 rounded-lg bg-[#5865F2] px-3 py-2 text-sm text-white shadow-lg transition-all hover:bg-[#4752C4] hover:scale-105"
  >
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
    <span class="hidden sm:inline">Official Aventura Discord</span>
  </a>
</div>

<!-- Quick Start Modal - Select a seed to pre-populate the wizard -->
{#if showNewStoryModal}
  <div
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
    role="dialog"
    aria-modal="true"
  >
    <div class="card w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[80vh] overflow-hidden rounded-b-none sm:rounded-b-xl">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-surface-700 pb-4 p-4 sm:p-4 -mx-4 -mt-4 sm:mx-0 sm:mt-0">
        <div>
          <h2 class="text-lg sm:text-xl font-semibold text-surface-100">Quick Start</h2>
          <p class="text-xs sm:text-sm text-surface-400">Choose a scenario to pre-populate the wizard</p>
        </div>
        <button
          class="btn-ghost rounded-lg p-2 text-surface-400 hover:text-surface-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          onclick={closeModal}
        >
          ✕
        </button>
      </div>

      <!-- Seed Selection -->
      <div class="py-4 space-y-4">
        <!-- Mode Selection -->
        <div>
          <span class="mb-2 block text-sm font-medium text-surface-300">
            Story Mode
          </span>
          <div class="grid grid-cols-2 gap-3">
            <button
              class="card p-3 text-left transition-all"
              class:ring-2={selectedMode === 'adventure'}
              class:ring-primary-500={selectedMode === 'adventure'}
              onclick={() => selectedMode = 'adventure'}
            >
              <div class="flex items-center gap-2">
                <Sword class="h-4 w-4 text-primary-400" />
                <span class="font-medium text-surface-100">Adventure</span>
              </div>
            </button>
            <button
              class="card p-3 text-left transition-all"
              class:ring-2={selectedMode === 'creative-writing'}
              class:ring-primary-500={selectedMode === 'creative-writing'}
              onclick={() => selectedMode = 'creative-writing'}
            >
              <div class="flex items-center gap-2">
                <Feather class="h-4 w-4 text-secondary-400" />
                <span class="font-medium text-surface-100">Creative Writing</span>
              </div>
            </button>
          </div>
        </div>

        <!-- POV Selection (Adventure only) -->
        {#if selectedMode === 'adventure'}
          <div>
            <span class="mb-2 block text-sm font-medium text-surface-300">
              Point of View
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button
                class="card p-2 text-center transition-all"
                class:ring-2={selectedPOV === 'first'}
                class:ring-accent-500={selectedPOV === 'first'}
                onclick={() => selectedPOV = 'first'}
              >
                <span class="text-sm font-medium text-surface-100">1st Person</span>
              </button>
              <button
                class="card p-2 text-center transition-all"
                class:ring-2={selectedPOV === 'third'}
                class:ring-accent-500={selectedPOV === 'third'}
                onclick={() => selectedPOV = 'third'}
              >
                <span class="text-sm font-medium text-surface-100">3rd Person</span>
              </button>
            </div>
          </div>
        {/if}

        <!-- Scenario Seeds -->
        <div>
          <span class="mb-2 block text-sm font-medium text-surface-300">
            Choose a Scenario
          </span>
          <div class="grid gap-2 sm:gap-3 grid-cols-1 xs:grid-cols-2 max-h-[40vh] sm:max-h-64 overflow-y-auto">
            {#each QUICK_START_SEEDS as seed}
              {@const Icon = templateIcons[seed.id] ?? Sparkles}
              <button
                onclick={() => selectSeed(seed.id)}
                class="card flex items-start gap-3 p-3 text-left transition-all hover:border-accent-500/50 hover:bg-surface-700/50 {selectedSeedId === seed.id ? 'border-accent-500 bg-accent-500/10' : ''}"
              >
                <div class="rounded-lg bg-surface-700 p-2 shrink-0">
                  <Icon class="h-4 w-4 text-accent-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-medium text-surface-100 text-sm">{seed.name}</h3>
                  <p class="mt-0.5 text-xs text-surface-400 line-clamp-2">{seed.description}</p>
                </div>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 border-t border-surface-700 pt-4 pb-modal-safe">
        <button class="btn btn-secondary" onclick={closeModal}>
          Cancel
        </button>
        <button
          class="btn btn-primary flex items-center gap-2"
          onclick={openWizardWithSeed}
          disabled={!selectedSeedId}
        >
          <Sparkles class="h-4 w-4" />
          Continue to Wizard
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Setup Wizard -->
{#if showSetupWizard}
  {#key setupWizardKey}
    <SetupWizard
      onClose={() => showSetupWizard = false}
      initialSeed={wizardSeed}
      initialMode={wizardInitialMode}
      initialPov={wizardInitialPov}
    />
  {/key}
{/if}
