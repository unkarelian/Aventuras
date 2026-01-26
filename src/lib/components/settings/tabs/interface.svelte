<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import type { ThemeId } from "$lib/types";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import * as Select from "$lib/components/ui/select";
  import { Button } from "$lib/components/ui/button";
  import { getSupportedLanguages } from "$lib/services/ai/translation";
  import { Download, RefreshCw, Loader2, Languages } from "lucide-svelte";

  const themes: Array<{ value: ThemeId; label: string; description: string }> =
    [
      { value: "dark", label: "Dark", description: "Modern dark theme" },
      {
        value: "light",
        label: "Light (Paper)",
        description: "Clean paper-like warm tones with amber accents",
      },
      {
        value: "light-solarized",
        label: "Light (Solarized)",
        description: "Classic Solarized color scheme with cream backgrounds",
      },
      {
        value: "retro-console",
        label: "Retro Console",
        description:
          "CRT aesthetic inspired by PS2-era games and Serial Experiments Lain",
      },
      {
        value: "fallen-down",
        label: "Fallen Down",
        description: "* The shadows deepen. Your adventure continues.",
      },
    ];

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
      onValueChange={(v) => settings.setTheme(v as ThemeId)}
    >
      <Select.Trigger class="h-10 w-full">
        {themes.find((t) => t.value === settings.uiSettings.theme)?.label ??
          "Select theme"}
      </Select.Trigger>
      <Select.Content>
        {#each themes as theme}
          <Select.Item value={theme.value} label={theme.label}>
            {theme.label}
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    <p class="mt-1 text-xs text-muted-foreground">
      {themes.find((t) => t.value === settings.uiSettings.theme)?.description ??
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
</div>
