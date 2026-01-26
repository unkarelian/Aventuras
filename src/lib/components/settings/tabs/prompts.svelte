<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import {
    promptService,
    type MacroOverride,
    type Macro,
    type MacroVariant,
  } from "$lib/services/prompts";
  import { promptExportService } from "$lib/services/promptExport";
  import PromptEditor from "$lib/components/prompts/PromptEditor.svelte";
  import MacroChip from "$lib/components/prompts/MacroChip.svelte";
  import MacroInspector from "$lib/components/prompts/MacroInspector.svelte";
  import {
    RotateCcw,
    Download,
    Upload,
    Loader2,
    ListFilter,
    X,
    Check,
  } from "lucide-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Accordion from "$lib/components/ui/accordion";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";

  interface Props {
    openImportModal: () => void;
  }

  let { openImportModal }: Props = $props();

  // Prompts tab state
  let promptsCategory = $state<"story" | "service" | "wizard">("story");
  let isExporting = $state(false);

  // Macro Library State
  let libraryEditingMacro = $state<Macro | null>(null);

  let confirmingCategoryReset = $state(false);
  let confirmingMacroReset = $state(false);

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

  // Handle Library Macro Save
  function handleLibraryMacroSave(value: string | MacroVariant[]) {
    if (!libraryEditingMacro) return;

    if (libraryEditingMacro.type === "simple" && typeof value === "string") {
      handleMacroOverride({
        macroId: libraryEditingMacro.id,
        value,
      });
    } else if (libraryEditingMacro.type === "complex" && Array.isArray(value)) {
      handleMacroOverride({
        macroId: libraryEditingMacro.id,
        variantOverrides: value,
      });
    }
    libraryEditingMacro = null;
  }
</script>

<div class="space-y-4">
  <!-- Header Actions -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <h3 class="text-lg font-medium">Prompt Templates</h3>
    </div>
    <div class="flex items-center gap-2">
      {#if confirmingCategoryReset}
        <div
          class="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200"
        >
          <span
            class="text-xs font-medium text-muted-foreground hidden sm:inline"
          >
            Reset all in category?
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
            onclick={() => (confirmingCategoryReset = false)}
            title="Cancel"
          >
            <X class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 hover:bg-transparent text-destructive"
            onclick={() => {
              getTemplatesForCategory().forEach((t) => {
                handleTemplateReset(t.id);
                handleUserContentReset(t.id);
              });
              confirmingCategoryReset = false;
            }}
            title="Confirm Reset"
          >
            <Check class="h-4 w-4" />
          </Button>
        </div>
      {:else}
        <Button
          variant="destructive"
          size="sm"
          onclick={() => (confirmingCategoryReset = true)}
        >
          <RotateCcw class="h-4 w-4" />
          <span class="hidden sm:inline leading-snug">Reset Category</span>
        </Button>
      {/if}
      <Button
        variant="outline"
        size="sm"
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
          <Loader2 class="h-4 w-4 animate-spin" />
        {:else}
          <Download class="h-4 w-4" />
        {/if}
        <span class="hidden sm:inline">Export</span>
      </Button>
      <Button variant="outline" size="sm" onclick={openImportModal}>
        <Upload class="h-4 w-4" />
        <span class="hidden sm:inline">Import</span>
      </Button>
    </div>
  </div>

  <!-- Category Tabs -->
  <Tabs.Root
    value={promptsCategory}
    onValueChange={(v) =>
      (promptsCategory = v as "story" | "service" | "wizard")}
  >
    <Tabs.List class="grid w-full grid-cols-3">
      <Tabs.Trigger value="story">Story</Tabs.Trigger>
      <Tabs.Trigger value="service">Services</Tabs.Trigger>
      <Tabs.Trigger value="wizard">Wizard</Tabs.Trigger>
    </Tabs.List>

    <!-- Templates List (Accordion) -->
    <Tabs.Content value={promptsCategory} class="mt-4">
      <Accordion.Root type="single" collapsible class="w-full space-y-2">
        {#each getTemplatesForCategory() as template}
          <Accordion.Item
            value={template.id}
            class="border rounded-lg bg-card px-3 shadow-sm"
          >
            <Accordion.Trigger class="hover:no-underline py-3">
              <div class="flex items-center gap-2 text-left">
                <span class="font-medium">{template.name}</span>
                {#if isTemplateModified(template.id)}
                  <Badge
                    variant="outline"
                    class="text-amber-500 border-amber-500/50 text-[10px] h-5"
                  >
                    Modified
                  </Badge>
                {/if}
              </div>
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="pb-4 pt-0">
                <PromptEditor
                  {template}
                  content={getTemplateContent(template.id)}
                  userContent={getUserContent(template.id)}
                  isModified={isTemplateModified(template.id)}
                  isUserModified={isUserContentModified(template.id)}
                  macroOverrides={settings.promptSettings.macroOverrides}
                  onChange={(content) =>
                    handleTemplateChange(template.id, content)}
                  onUserChange={(content) =>
                    handleUserContentChange(template.id, content)}
                  onReset={() => handleTemplateReset(template.id)}
                  onUserReset={() => handleUserContentReset(template.id)}
                  onMacroOverride={handleMacroOverride}
                  onMacroReset={handleMacroReset}
                />
              </div>
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>
    </Tabs.Content>
  </Tabs.Root>

  <!-- Macro Library Section -->
  <div class="flex items-center justify-between mb-4">
    <div>
      <h3 class="text-lg font-medium">Macro Library</h3>
      <p class="text-sm text-muted-foreground">
        Global variables used across templates. Click to edit defaults.
      </p>
    </div>
    {#if confirmingMacroReset}
      <div
        class="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200"
      >
        <span
          class="text-xs font-medium text-muted-foreground hidden sm:inline"
        >
          Reset all macros?
        </span>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 hover:bg-transparent text-muted-foreground hover:text-foreground"
          onclick={() => (confirmingMacroReset = false)}
          title="Cancel"
        >
          <X class="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="h-8 w-8 p-0 hover:bg-transparent text-destructive"
          onclick={() => {
            settings.promptSettings.macroOverrides = [];
            settings.savePromptSettings();
            confirmingMacroReset = false;
          }}
          title="Confirm Reset"
        >
          <Check class="h-4 w-4" />
        </Button>
      </div>
    {:else}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => (confirmingMacroReset = true)}
      >
        <RotateCcw class="h-4 w-4" />
        Reset All Macros
      </Button>
    {/if}
  </div>

  <!-- Inspector Area (Shows when editing) -->
  {#if libraryEditingMacro}
    <div class="mb-6 animate-in slide-in-from-top-2 fade-in duration-200">
      <MacroInspector
        macro={libraryEditingMacro}
        override={findMacroOverride(libraryEditingMacro.id)}
        onSave={handleLibraryMacroSave}
        onReset={() => handleMacroReset(libraryEditingMacro!.id)}
        onClose={() => (libraryEditingMacro = null)}
      />
    </div>
  {/if}

  <div class="grid gap-6 md:grid-cols-2">
    <!-- Simple Macros -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">Simple Macros</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="flex flex-wrap gap-2">
          {#each allMacros.filter((m) => m.type === "simple") as macro}
            <MacroChip
              {macro}
              interactive={true}
              onClick={() => {
                // Toggle editing
                if (libraryEditingMacro?.id === macro.id) {
                  libraryEditingMacro = null;
                } else {
                  libraryEditingMacro = macro;
                }
              }}
              class={libraryEditingMacro?.id === macro.id
                ? "ring-2 ring-primary ring-offset-1"
                : ""}
            />
          {/each}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- Complex Macros -->
    <Card.Root>
      <Card.Header>
        <Card.Title class="text-base">Complex Macros</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="flex flex-wrap gap-2">
          {#each allMacros.filter((m) => m.type === "complex") as macro}
            <MacroChip
              {macro}
              interactive={true}
              onClick={() => {
                // Toggle editing
                if (libraryEditingMacro?.id === macro.id) {
                  libraryEditingMacro = null;
                } else {
                  libraryEditingMacro = macro;
                }
              }}
              class={libraryEditingMacro?.id === macro.id
                ? "ring-2 ring-primary ring-offset-1"
                : ""}
            />
          {/each}
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>
