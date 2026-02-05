<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import { THEMES } from "../../../../themes/themes";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { Separator } from "$lib/components/ui/separator";
  import { getSupportedLanguages } from "$lib/services/ai/utils/TranslationService";
  import { updaterService } from "$lib/services/updater";
  import { Download, RefreshCw, Loader2, Languages } from "lucide-svelte";

  let isCheckingUpdates = $state(false);
  let updateMessage = $state<string | null>(null);

  async function handleCheckForUpdates() {
    isCheckingUpdates = true;
    updateMessage = null;
    try {
      const info = await updaterService.checkForUpdates();
      if (info.available) {
        updateMessage = `Update available: v${info.version}`;
      } else {
        updateMessage = "You're up to date!";
      }
    } catch (error) {
      updateMessage = "Failed to check for updates";
      console.error("[Interface] Update check failed:", error);
    } finally {
      isCheckingUpdates = false;
    }
  }

  const fontSizes = [
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
  ] as const;
</script>

<div class="space-y-4">
  <!-- Theme Selection -->
  <div>
    <Label class="mb-2 block">Theme</Label>
    <Select.Root
      type="single"
      value={settings.uiSettings.theme}
      onValueChange={(v) => settings.setTheme(v)}
    >
      <Select.Trigger class="h-10 w-full">
        {THEMES.find((t) => t.id === settings.uiSettings.theme)?.label ??
          "Select theme"}
      </Select.Trigger>
      <Select.Content>
        {#each THEMES as theme}
          <Select.Item value={theme.id} label={theme.label}>
            {theme.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
      {THEMES.find((t) => t.id === settings.uiSettings.theme)?.description ??
        ""}
    </p>
  </div>

  <!-- Font Size -->
  <div>
    <Label class="mb-2 block">Font Size</Label>
    <Select.Root
      type="single"
      value={settings.uiSettings.fontSize}
      onValueChange={(v) =>
        settings.setFontSize(v as "small" | "medium" | "large")}
    >
      <Select.Trigger class="h-10 w-full">
        {fontSizes.find((s) => s.value === settings.uiSettings.fontSize)
          ?.label ?? "Select size"}
      </Select.Trigger>
      <Select.Content>
        {#each fontSizes as size}
          <Select.Item value={size.value} label={size.label}>
            {size.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <!-- Word Count Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Word Count</Label>
      <p class="text-xs text-muted-foreground">
        Display current story word count in the status bar
      </p>
    </div>
    <Switch
      checked={settings.uiSettings.showWordCount}
      onCheckedChange={(v) => {
        settings.uiSettings.showWordCount = v;
      }}
    />
  </div>

  <!-- Spellcheck Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Spellcheck</Label>
      <p class="text-xs text-muted-foreground">
        Grammar and spelling suggestions while typing
      </p>
    </div>
    <Switch
      checked={settings.uiSettings.spellcheckEnabled}
      onCheckedChange={(v) => settings.setSpellcheckEnabled(v)}
    />
  </div>

  <!-- Suggestions Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Suggestions</Label>
      <p class="text-xs text-muted-foreground">
        Show AI-generated action choices and plot suggestions
      </p>
    </div>
    <Switch
      checked={!settings.uiSettings.disableSuggestions}
      onCheckedChange={(v) => settings.setDisableSuggestions(!v)}
    />
  </div>

  <!-- Action Prefixes Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Action Prefixes</Label>
      <p class="text-xs text-muted-foreground">
        Show Do/Say/Think buttons for input
      </p>
    </div>
    <Switch
      checked={!settings.uiSettings.disableActionPrefixes}
      onCheckedChange={(v) => settings.setDisableActionPrefixes(!v)}
    />
  </div>

  <!-- Show Reasoning Toggle -->
  <div class="flex items-center justify-between">
    <div>
      <Label>Reasoning Block</Label>
      <p class="text-xs text-muted-foreground">Show thought process display</p>
    </div>
    <Switch
      checked={settings.uiSettings.showReasoning}
      onCheckedChange={(v) => settings.setShowReasoning(v)}
    />
  </div>

  <!-- Translation Section -->
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <Languages class="h-4 w-4 text-muted-foreground" />
      <Label class="text-base font-medium">Translation</Label>
    </div>

    <div class="flex items-center justify-between">
      <div>
        <Label>Enable Translation</Label>
        <p class="text-xs text-muted-foreground">
          Translate AI responses to your language while keeping English prompts
          for optimal LLM performance
        </p>
      </div>
      <Switch
        checked={settings.translationSettings.enabled}
        onCheckedChange={(v) => {
          settings.translationSettings.enabled = v;
          settings.saveTranslationSettings();
        }}
      />
    </div>

    {#if settings.translationSettings.enabled}
      <!-- Target Language -->
      <div>
        <Label class="mb-2 block">Target Language</Label>
        <Select.Root
          type="single"
          value={settings.translationSettings.targetLanguage}
          onValueChange={(v) => {
            settings.translationSettings.targetLanguage = v;
            settings.saveTranslationSettings();
          }}
        >
          <Select.Trigger class="h-10 w-full">
            {getSupportedLanguages().find(
              (l) => l.code === settings.translationSettings.targetLanguage
            )?.name ?? "Select language"}
          </Select.Trigger>
          <Select.Content class="max-h-60">
            {#each getSupportedLanguages() as lang}
              <Select.Item value={lang.code} label={lang.name}>
                {lang.name}
              </Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <p class="mt-1 text-xs text-muted-foreground">
          Language for translated content display
        </p>
      </div>

      <!-- Translate Narration -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Translate Narration</Label>
          <p class="text-xs text-muted-foreground">
            Translate AI-generated story content after generation
          </p>
        </div>
        <Switch
          checked={settings.translationSettings.translateNarration}
          onCheckedChange={(v) => {
            settings.translationSettings.translateNarration = v;
            settings.saveTranslationSettings();
          }}
        />
      </div>

      <!-- Translate User Input -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Translate User Input</Label>
          <p class="text-xs text-muted-foreground">
            Translate your input to English before sending to the AI
          </p>
        </div>
        <Switch
          checked={settings.translationSettings.translateUserInput}
          onCheckedChange={(v) => {
            settings.translationSettings.translateUserInput = v;
            settings.saveTranslationSettings();
          }}
        />
      </div>

      <!-- Translate World State -->
      <div class="flex items-center justify-between">
        <div>
          <Label>Translate World State</Label>
          <p class="text-xs text-muted-foreground">
            Translate character names, locations, and items in the UI
          </p>
        </div>
        <Switch
          checked={settings.translationSettings.translateWorldState}
          onCheckedChange={(v) => {
            settings.translationSettings.translateWorldState = v;
            settings.saveTranslationSettings();
          }}
        />
      </div>
    {/if}
  </div>

  <Separator class="my-4" />

  <!-- Updates Section -->
  <div class="space-y-4">
    <Label class="text-base font-medium">Updates</Label>

    <!-- Check for Updates Button -->
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={handleCheckForUpdates}
        disabled={isCheckingUpdates}
      >
        {#if isCheckingUpdates}
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Checking...
        {:else}
          <RefreshCw class="mr-2 h-4 w-4" />
          Check for Updates
        {/if}
      </Button>
      {#if updateMessage}
        <span class="text-sm text-muted-foreground">{updateMessage}</span>
      {/if}
    </div>

    <!-- Check on Startup Toggle -->
    <div class="flex items-center justify-between">
      <div>
        <Label>Check on Startup</Label>
        <p class="text-xs text-muted-foreground">
          Automatically check for updates when the app starts
        </p>
      </div>
      <Switch
        checked={settings.updateSettings.autoCheck}
        onCheckedChange={(v) => settings.setAutoCheck(v)}
      />
    </div>

    <!-- Auto-download Updates Toggle -->
    <div class="flex items-center justify-between">
      <div>
        <Label>Auto-download Updates</Label>
        <p class="text-xs text-muted-foreground">
          Automatically download updates in the background
        </p>
      </div>
      <Switch
        checked={settings.updateSettings.autoDownload}
        onCheckedChange={(v) => settings.setAutoDownload(v)}
      />
    </div>
  </div>
</div>
