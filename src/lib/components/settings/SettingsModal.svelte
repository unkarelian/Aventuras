<script lang="ts">
  import { ui } from "$lib/stores/ui.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { ProviderInfo } from "$lib/services/ai/types";
  import { DEFAULT_PROVIDERS } from "$lib/services/ai/providers";
  import {
    Settings2,
    RotateCcw,
    Loader2,
    Key,
    Cpu,
    Palette,
    Scroll,
    Image,
    Volume2,
    Settings as SettingsIcon,
    X,
  } from "lucide-svelte";

  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
  } from "$lib/components/ui/tabs";
  import { Switch } from "$lib/components/ui/switch";
  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Toggle } from "$lib/components/ui/toggle";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";

  import ApiConnectionTab from "./tabs/api-connection.svelte";
  import GenerationTab from "./tabs/generation.svelte";
  import InterfaceTab from "./tabs/interface.svelte";
  import ImagesTab from "./tabs/images.svelte";
  import PromptsTab from "./tabs/prompts.svelte";
  import TTSSettings from "./TTSSettings.svelte";
  import AdvancedSettings from "./AdvancedSettings.svelte";
  import PromptImportModal from "./PromptImportModal.svelte";

  const tabs = [
    { id: "api", label: "API", icon: Key },
    { id: "generation", label: "Generation", icon: Cpu },
    { id: "interface", label: "Interface", icon: Palette },
    { id: "prompts", label: "Prompts", icon: Scroll },
    { id: "images", label: "Images", icon: Image },
    { id: "tts", label: "TTS", icon: Volume2 },
    { id: "advanced", label: "Advanced", icon: SettingsIcon },
  ] as const;

  let activeTab = $state<
    | "api"
    | "generation"
    | "interface"
    | "prompts"
    | "images"
    | "tts"
    | "advanced"
  >("api");
  let promptImportModalOpen = $state(false);
  let providerOptions = $state<ProviderInfo[]>(DEFAULT_PROVIDERS);

  let manualBodyEditorOpen = $state(false);
  let manualBodyEditorTitle = $state("Manual Request Body");
  let manualBodyEditorValue = $state("");
  let manualBodyEditorSave = $state<(value: string) => void>((_) => {});

  let isResettingSettings = $state(false);

  // Swipe handling
  let touchStartX = $state(0);
  let touchStartY = $state(0);
  let touchEndX = $state(0);
  let touchEndY = $state(0);
  let isInteractiveTouch = $state(false);
  let slideDirection = $state<"left" | "right" | "none">("none");
  const SWIPE_THRESHOLD = 50;
  const DIAGONAL_TOLERANCE = 0.5;

  function handleTouchStart(e: TouchEvent) {
    const touch = e.changedTouches[0];
    const target = e.target as HTMLElement;
    const interactiveSelector =
      'input, textarea, select, [role="slider"], [role="switch"], button, a';

    isInteractiveTouch = !!target.closest(interactiveSelector);
    if (isInteractiveTouch) return;

    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
  }

  function handleTouchEnd(e: TouchEvent) {
    if (isInteractiveTouch) return;

    const touch = e.changedTouches[0];
    touchEndX = touch.screenX;
    touchEndY = touch.screenY;
    handleSwipe();
    isInteractiveTouch = false;
  }

  function handleSwipe() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (absDeltaX < SWIPE_THRESHOLD) return;

    const diagonalRatio = absDeltaY / absDeltaX;
    if (diagonalRatio > DIAGONAL_TOLERANCE) return;

    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (deltaX > 0 && currentIndex > 0) {
      slideDirection = "right";
      activeTab = tabs[currentIndex - 1].id;
      setTimeout(() => (slideDirection = "none"), 300);
    } else if (deltaX < 0 && currentIndex < tabs.length - 1) {
      slideDirection = "left";
      activeTab = tabs[currentIndex + 1].id;
      setTimeout(() => (slideDirection = "none"), 300);
    }
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

  function safeClose() {
    if (isResettingSettings) return;
    ui.closeSettings();
  }

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
</script>

<ResponsiveModal.Root
  open={ui.settingsModalOpen}
  onOpenChange={(v) => !v && safeClose()}
>
  <ResponsiveModal.Content
    class="max-w-6xl h-[90vh] flex flex-col overflow-hidden p-0"
  >
    <ResponsiveModal.Header class="px-6 pb-4">
      <div class="flex items-center gap-3">
        <div
          class="hidden md:flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
        >
          <Settings2 class="h-5 w-5 text-primary" />
        </div>
        <div class="flex-1 text-center md:text-left">
          <ResponsiveModal.Title class="text-2xl sm:text-xl font-semibold"
            >Settings</ResponsiveModal.Title
          >
          <p class="hidden md:block text-sm text-muted-foreground">
            Configure your Aventuras experience
          </p>
        </div>
      </div>
    </ResponsiveModal.Header>

    <div class="flex flex-1 min-h-0 overflow-hidden">
      <ScrollArea
        class="hidden md:block w-64 border-r border-border bg-muted/30"
      >
        <div class="p-4 space-y-1">
          {#each tabs as tab}
            <button
              class="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent/50 hover:text-foreground"
              class:bg-accent={activeTab === tab.id}
              class:text-accent-foreground={activeTab === tab.id}
              class:text-muted-foreground={activeTab !== tab.id}
              onclick={() => (activeTab = tab.id)}
            >
              <tab.icon class="h-4 w-4" />
              {tab.label}
            </button>
          {/each}

          <Separator class="my-3" />

          <Button
            variant="destructive"
            class="w-full justify-start items-center"
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
          </Button>
        </div>
      </ScrollArea>

      <ScrollArea
        class="flex-1"
        ontouchstart={handleTouchStart}
        ontouchend={handleTouchEnd}
        style="touch-action: pan-y pinch-zoom;"
      >
        <div class="mx-auto px-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={(v) => (activeTab = v as any)}>
            {#each tabs as tab}
              <TabsContent value={tab.id} class="mt-0">
                <div
                  class={activeTab === tab.id && slideDirection === "left"
                    ? "slide-in-right"
                    : activeTab === tab.id && slideDirection === "right"
                      ? "slide-in-left"
                      : ""}
                >
                  {#if tab.id === "api"}
                    <ApiConnectionTab {providerOptions} />
                  {:else if tab.id === "generation"}
                    <GenerationTab
                      {providerOptions}
                      onOpenManualBodyEditor={openManualBodyEditor}
                    />
                  {:else if tab.id === "interface"}
                    <InterfaceTab />
                  {:else if tab.id === "prompts"}
                    <PromptsTab
                      openImportModal={() => (promptImportModalOpen = true)}
                    />
                  {:else if tab.id === "images"}
                    <ImagesTab />
                  {:else if tab.id === "tts"}
                    <TTSSettings />
                  {:else if tab.id === "advanced"}
                    <div class="space-y-6">
                      <AdvancedSettings />

                      <div class="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
                        <div class="space-y-0.5">
                          <p class="font-medium text-destructive">Reset All Settings</p>
                          <p class="text-xs text-muted-foreground">
                            Resets all settings to defaults. API key is preserved.
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onclick={handleResetAll}
                          disabled={isResettingSettings}
                        >
                          {#if isResettingSettings}
                            <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                            Resetting...
                          {:else}
                            <RotateCcw class="mr-2 h-4 w-4" />
                            Reset
                          {/if}
                        </Button>
                      </div>
                    </div>
                  {/if}
                </div></TabsContent
              >
            {/each}
          </Tabs>
        </div>
      </ScrollArea>
    </div>

    <div class="md:hidden border-t border-border bg-background p-1">
      <div class="flex justify-center gap-0 overflow-x-auto pb-0.5">
        {#each tabs as tab}
          <Toggle
            pressed={activeTab === tab.id}
            onPressedChange={(pressed) => pressed && (activeTab = tab.id)}
            size="sm"
            class="shrink-0 px-2"
          >
            <tab.icon class="h-4 w-4" />
            <span
              class="text-xs whitespace-nowrap overflow-hidden transition-all duration-300 ease-in-out {activeTab ===
              tab.id
                ? 'max-w-20 opacity-100'
                : 'max-w-0 opacity-0'}"
            >
              {tab.label}
            </span>
          </Toggle>
        {/each}
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<Dialog.Root open={manualBodyEditorOpen} onOpenChange={closeManualBodyEditor}>
  <Dialog.Content class="max-w-3xl max-h-[90vh] flex flex-col">
    <Dialog.Header>
      <Dialog.Title>{manualBodyEditorTitle}</Dialog.Title>
      <Dialog.Description>
        Edit the manual request body. This overrides request parameters;
        messages and tools are managed by Aventuras.
      </Dialog.Description>
    </Dialog.Header>

    <div class="flex-1 overflow-hidden py-4">
      <Textarea
        bind:value={manualBodyEditorValue}
        class="h-full min-h-[50vh] resize-none font-mono text-sm"
        placeholder="Enter JSON request body..."
      />
    </div>

    <Dialog.Footer>
      <Button variant="outline" onclick={closeManualBodyEditor}>Cancel</Button>
      <Button onclick={applyManualBodyEditor}>Save</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<PromptImportModal
  open={promptImportModalOpen}
  onClose={() => (promptImportModalOpen = false)}
/>

<style>
  .slide-in-right {
    animation: slideInRight 0.3s ease-out;
  }
  .slide-in-left {
    animation: slideInLeft 0.3s ease-out;
  }
  @keyframes slideInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes slideInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
</style>
