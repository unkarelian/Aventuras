<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import {
    ChevronDown,
    ChevronRight,
    RotateCcw,
    FolderOpen,
    BookOpen,
    Brain,
    Search,
    Bug,
    Code2,
  } from "lucide-svelte";
  import { Switch } from "$lib/components/ui/switch";
  import { Label } from "$lib/components/ui/label";
  import { Button } from "$lib/components/ui/button";
  import { Slider } from "$lib/components/ui/slider";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";

  // Section visibility state
  let showLorebookImportSection = $state(false);
  let showLoreManagementSection = $state(false);
  let showClassifierSection = $state(false);
  let showEntryRetrievalSection = $state(false);

  // Manual mode toggle handler
  async function handleManualModeToggle(checked: boolean) {
    await settings.setAdvancedManualMode(checked);
  }

  // Debug mode toggle handler
  function handleDebugModeToggle(checked: boolean) {
    settings.setDebugMode(checked);
  }
</script>

<div class="space-y-6">
  <!-- General Settings -->
  <div class="space-y-4">
    <!-- Manual Request Mode -->
    <div class="flex flex-row items-center justify-between">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Code2 class="h-4 w-4 text-muted-foreground" />
          <Label>Manual Request Mode</Label>
        </div>
        <p class="text-xs text-muted-foreground">
          Edit full request body parameters for advanced models.
        </p>
        {#if settings.advancedRequestSettings.manualMode}
          <p class="text-xs text-amber-500 font-medium pt-1">
            Manual mode active. Temperature and max token controls are locked.
          </p>
        {/if}
      </div>
      <Switch
        checked={settings.advancedRequestSettings.manualMode}
        onCheckedChange={handleManualModeToggle}
      />
    </div>

    <!-- Debug Mode -->
    <div class="flex flex-row items-center justify-between">
      <div class="space-y-0.5">
        <div class="flex items-center gap-2">
          <Bug class="h-4 w-4 text-muted-foreground" />
          <Label>Debug Mode</Label>
        </div>
        <p class="text-xs text-muted-foreground">
          Log API requests and responses for debugging.
        </p>
        {#if settings.uiSettings.debugMode}
          <p class="text-xs text-amber-500 font-medium pt-1">
            Logs are session-only and not persisted.
          </p>
        {/if}
      </div>
      <Switch
        checked={settings.uiSettings.debugMode}
        onCheckedChange={handleDebugModeToggle}
      />
    </div>
  </div>

  <Separator />

  <!-- Service Configurations -->
  <div class="space-y-3">
    <!-- Lorebook Import Settings -->
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
      <Collapsible.Root bind:open={showLorebookImportSection}>
        <div class="flex items-center p-3 pl-4 gap-3">
          <Collapsible.Trigger class="flex items-center gap-2 flex-1 text-left group/trigger">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10 transition-colors group-hover/trigger:bg-green-500/20"
            >
              <FolderOpen class="h-4 w-4 text-green-500" />
            </div>
            <div class="flex-1">
              <Label class="font-medium leading-none">Lorebook Import</Label>
              <p class="text-xs text-muted-foreground mt-1">
                Batch size and concurrency
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetLorebookClassifierSpecificSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger asChild let:builder>
              <Button
                builders={[builder]}
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                {#if showLorebookImportSection}
                  <ChevronDown
                    class="h-4 w-4 rotate-180 transition-transform duration-200"
                  />
                {:else}
                  <ChevronDown
                    class="h-4 w-4 transition-transform duration-200"
                  />
                {/if}
                <span class="sr-only">Toggle</span>
              </Button>
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="border-t bg-muted/10 p-4 space-y-6">
            <!-- Batch Size -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Batch Size</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.serviceSpecificSettings.lorebookClassifier
                    ?.batchSize ?? 50}
                </span>
              </div>
              <Slider
                value={[
                  settings.serviceSpecificSettings.lorebookClassifier
                    ?.batchSize ?? 50,
                ]}
                min={10}
                max={100}
                step={10}
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookClassifier.batchSize =
                    v[0];
                  settings.saveServiceSpecificSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Reliable</span>
                <span>Fast</span>
              </div>
            </div>

            <!-- Max Concurrent -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Concurrent Requests</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.serviceSpecificSettings.lorebookClassifier
                    ?.maxConcurrent ?? 5}
                </span>
              </div>
              <Slider
                value={[
                  settings.serviceSpecificSettings.lorebookClassifier
                    ?.maxConcurrent ?? 5,
                ]}
                min={1}
                max={10}
                step={1}
                onValueChange={(v) => {
                  settings.serviceSpecificSettings.lorebookClassifier.maxConcurrent =
                    v[0];
                  settings.saveServiceSpecificSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Sequential</span>
                <span>Parallel</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Lore Management Settings -->
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
      <Collapsible.Root bind:open={showLoreManagementSection}>
        <div class="flex items-center p-3 pl-4 gap-3">
          <Collapsible.Trigger class="flex items-center gap-2 flex-1 text-left group/trigger">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10 transition-colors group-hover/trigger:bg-purple-500/20"
            >
              <BookOpen class="h-4 w-4 text-purple-500" />
            </div>
            <div class="flex-1">
              <Label class="font-medium leading-none">Lore Management</Label>
              <p class="text-xs text-muted-foreground mt-1">
                Autonomous agent iteration limits
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetLoreManagementSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger asChild let:builder>
              <Button
                builders={[builder]}
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                {#if showLoreManagementSection}
                  <ChevronDown
                    class="h-4 w-4 rotate-180 transition-transform duration-200"
                  />
                {:else}
                  <ChevronDown
                    class="h-4 w-4 transition-transform duration-200"
                  />
                {/if}
                <span class="sr-only">Toggle</span>
              </Button>
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="border-t bg-muted/10 p-4 space-y-6">
            <!-- Max Iterations -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Iterations</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.systemServicesSettings.loreManagement
                    ?.maxIterations ?? 50}
                </span>
              </div>
              <Slider
                value={[
                  settings.systemServicesSettings.loreManagement?.maxIterations ??
                    50,
                ]}
                min={10}
                max={100}
                step={5}
                onValueChange={(v) => {
                  settings.systemServicesSettings.loreManagement.maxIterations =
                    v[0];
                  settings.saveSystemServicesSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Conservative</span>
                <span>Extensive</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Classifier Settings -->
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
      <Collapsible.Root bind:open={showClassifierSection}>
        <div class="flex items-center p-3 pl-4 gap-3">
          <Collapsible.Trigger class="flex items-center gap-2 flex-1 text-left group/trigger">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-500/10 transition-colors group-hover/trigger:bg-cyan-500/20"
            >
              <Brain class="h-4 w-4 text-cyan-500" />
            </div>
            <div class="flex-1">
              <Label class="font-medium leading-none"
                >World State Classifier</Label
              >
              <p class="text-xs text-muted-foreground mt-1">
                Context window management
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetClassifierSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger asChild let:builder>
              <Button
                builders={[builder]}
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                {#if showClassifierSection}
                  <ChevronDown
                    class="h-4 w-4 rotate-180 transition-transform duration-200"
                  />
                {:else}
                  <ChevronDown
                    class="h-4 w-4 transition-transform duration-200"
                  />
                {/if}
                <span class="sr-only">Toggle</span>
              </Button>
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="border-t bg-muted/10 p-4 space-y-6">
            <!-- Chat History Truncation -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Chat History Truncation (Words)</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.systemServicesSettings.classifier
                    ?.chatHistoryTruncation === 0
                    ? "No Limit"
                    : (settings.systemServicesSettings.classifier
                        ?.chatHistoryTruncation ?? 0)}
                </span>
              </div>
              <Slider
                value={[
                  settings.systemServicesSettings.classifier
                    ?.chatHistoryTruncation ?? 0,
                ]}
                min={0}
                max={500}
                step={50}
                onValueChange={(v) => {
                  settings.systemServicesSettings.classifier.chatHistoryTruncation =
                    v[0];
                  settings.saveSystemServicesSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Unlimited</span>
                <span>500 Words</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>

    <!-- Entry Retrieval Settings -->
    <div class="rounded-lg border bg-card text-card-foreground shadow-sm">
      <Collapsible.Root bind:open={showEntryRetrievalSection}>
        <div class="flex items-center p-3 pl-4 gap-3">
          <Collapsible.Trigger class="flex items-center gap-2 flex-1 text-left group/trigger">
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10 transition-colors group-hover/trigger:bg-amber-500/20"
            >
              <Search class="h-4 w-4 text-amber-500" />
            </div>
            <div class="flex-1">
              <Label class="font-medium leading-none">Entry Retrieval</Label>
              <p class="text-xs text-muted-foreground mt-1">
                LLM-based selection settings
              </p>
            </div>
          </Collapsible.Trigger>
          <div class="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onclick={() => settings.resetEntryRetrievalSettings()}
              title="Reset to default"
            >
              <RotateCcw class="h-3.5 w-3.5" />
            </Button>
            <Collapsible.Trigger asChild let:builder>
              <Button
                builders={[builder]}
                variant="ghost"
                size="icon"
                class="h-8 w-8"
              >
                {#if showEntryRetrievalSection}
                  <ChevronDown
                    class="h-4 w-4 rotate-180 transition-transform duration-200"
                  />
                {:else}
                  <ChevronDown
                    class="h-4 w-4 transition-transform duration-200"
                  />
                {/if}
                <span class="sr-only">Toggle</span>
              </Button>
            </Collapsible.Trigger>
          </div>
        </div>

        <Collapsible.Content>
          <div class="border-t bg-muted/10 p-4 space-y-6">
            <!-- Enable LLM Selection -->
            <div class="flex flex-row items-center justify-between">
              <div class="space-y-0.5">
                <Label class="text-sm">Enable LLM Selection</Label>
                <p class="text-xs text-muted-foreground">
                  Use LLM to intelligently select lorebook entries
                </p>
              </div>
              <Switch
                checked={settings.systemServicesSettings.entryRetrieval
                  ?.enableLLMSelection ?? true}
                onCheckedChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.enableLLMSelection =
                    v;
                  settings.saveSystemServicesSettings();
                }}
              />
            </div>

            <!-- Max Tier 3 Entries -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Tier 3 Entries</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.systemServicesSettings.entryRetrieval
                    ?.maxTier3Entries === 0
                    ? "Unlimited"
                    : (settings.systemServicesSettings.entryRetrieval
                        ?.maxTier3Entries ?? 0)}
                </span>
              </div>
              <Slider
                value={[
                  settings.systemServicesSettings.entryRetrieval
                    ?.maxTier3Entries ?? 0,
                ]}
                min={0}
                max={20}
                step={1}
                onValueChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.maxTier3Entries =
                    v[0];
                  settings.saveSystemServicesSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Unlimited</span>
                <span>20 Entries</span>
              </div>
            </div>

            <!-- Max Words Per Entry -->
            <div class="space-y-3">
              <div class="flex justify-between">
                <Label>Max Words Per Entry</Label>
                <span class="text-xs font-medium bg-muted px-2 py-0.5 rounded">
                  {settings.systemServicesSettings.entryRetrieval
                    ?.maxWordsPerEntry === 0
                    ? "Unlimited"
                    : (settings.systemServicesSettings.entryRetrieval
                        ?.maxWordsPerEntry ?? 0)}
                </span>
              </div>
              <Slider
                value={[
                  settings.systemServicesSettings.entryRetrieval
                    ?.maxWordsPerEntry ?? 0,
                ]}
                min={0}
                max={1000}
                step={50}
                onValueChange={(v) => {
                  settings.systemServicesSettings.entryRetrieval.maxWordsPerEntry =
                    v[0];
                  settings.saveSystemServicesSettings();
                }}
              />
              <div
                class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium"
              >
                <span>Unlimited</span>
                <span>1000 Words</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  </div>
</div>

