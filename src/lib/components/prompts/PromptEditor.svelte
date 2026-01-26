<script lang="ts">
  import { Code, Eye, Plus, RotateCcw, ChevronDown, Info } from "lucide-svelte";
  import {
    promptService,
    type Macro,
    type PromptTemplate,
    type MacroOverride,
    type ContextPlaceholder,
    getPlaceholderByToken,
    type MacroVariant,
  } from "$lib/services/prompts";
  import MacroChip from "./MacroChip.svelte";
  import MacroInspector from "./MacroInspector.svelte";
  import PlaceholderInfo from "./PlaceholderInfo.svelte";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Popover from "$lib/components/ui/popover";
  import * as Command from "$lib/components/ui/command";

  interface Props {
    /** The prompt template being edited */
    template: PromptTemplate;
    /** Current system prompt content (may be overridden) */
    content: string;
    /** Current user prompt content (may be overridden) */
    userContent?: string;
    /** Whether the system content has been modified from default */
    isModified?: boolean;
    /** Whether the user content has been modified from default */
    isUserModified?: boolean;
    /** Current story context for complex macro preview */
    currentContext?: {
      mode?: "adventure" | "creative-writing";
      pov?: "first" | "second" | "third";
      tense?: "past" | "present";
    };
    /** Macro overrides for display */
    macroOverrides?: MacroOverride[];
    /** Callback when system content changes */
    onChange: (content: string) => void;
    /** Callback when user content changes */
    onUserChange?: (content: string) => void;
    /** Callback to reset system content to default */
    onReset: () => void;
    /** Callback to reset user content to default */
    onUserReset?: () => void;
    /** Callback when a macro override changes */
    onMacroOverride?: (override: MacroOverride) => void;
    /** Callback when a macro override is reset */
    onMacroReset?: (macroId: string) => void;
  }

  let {
    template,
    content,
    userContent,
    isModified = false,
    isUserModified = false,
    currentContext,
    macroOverrides = [],
    onChange,
    onUserChange,
    onReset,
    onUserReset,
    onMacroOverride,
    onMacroReset,
  }: Props = $props();

  // Check if template has user content
  const hasUserPrompt = $derived(
    template.userContent !== undefined && template.userContent.length > 0,
  );

  // Active prompt tab (system or user)
  let activeTab = $state<"system" | "user">("system");

  // Get the current content based on active tab
  const currentContent = $derived(
    activeTab === "system" ? content : (userContent ?? ""),
  );
  const currentIsModified = $derived(
    activeTab === "system" ? isModified : isUserModified,
  );

  // View mode state
  let viewMode = $state<"visual" | "raw">("visual");
  let showMacroMenu = $state(false);

  // Editor state
  let editingMacro = $state<Macro | null>(null);

  // Placeholder info
  let viewingPlaceholder = $state<ContextPlaceholder | null>(null);
  let showPlaceholderInfo = $state(false);

  // Get all available macros
  const allMacros = $derived(promptService.getAllMacros());

  // Parse content into segments (text, macros, and placeholders)
  let segments = $derived.by(() => {
    const textToParse = currentContent;
    const result: Array<{
      type: "text" | "macro" | "placeholder";
      content: string;
      macro?: Macro;
      placeholder?: ContextPlaceholder;
    }> = [];
    const regex = /\{\{(\w+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(textToParse)) !== null) {
      // Add text before the token
      if (match.index > lastIndex) {
        result.push({
          type: "text",
          content: textToParse.slice(lastIndex, match.index),
        });
      }

      // Find if this is a macro or a context placeholder
      const token = match[1];
      const macro = allMacros.find((m) => m.token === token);
      const placeholder = getPlaceholderByToken(token);

      if (macro) {
        result.push({
          type: "macro",
          content: match[0],
          macro,
        });
      } else if (placeholder) {
        result.push({
          type: "placeholder",
          content: match[0],
          placeholder,
        });
      } else {
        // Unknown token - treat as text
        result.push({
          type: "text",
          content: match[0],
        });
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < textToParse.length) {
      result.push({
        type: "text",
        content: textToParse.slice(lastIndex),
      });
    }

    return result;
  });

  // Handle content change based on active tab
  function handleContentChange(newContent: string) {
    if (activeTab === "system") {
      onChange(newContent);
    } else {
      onUserChange?.(newContent);
    }
  }

  // Handle reset based on active tab
  function handleReset() {
    if (activeTab === "system") {
      onReset();
    } else {
      onUserReset?.();
    }
  }

  // Find macro override
  function findMacroOverride(macroId: string): MacroOverride | undefined {
    return macroOverrides.find((o) => o.macroId === macroId);
  }

  // Handle macro chip click
  function handleMacroClick(macro: Macro) {
    // If we're already editing this macro, close it. Otherwise open it.
    if (editingMacro?.id === macro.id) {
      editingMacro = null;
    } else {
      editingMacro = macro;
    }
  }

  // Handle macro save
  function handleMacroSave(value: string | MacroVariant[]) {
    if (!editingMacro) return;

    if (editingMacro.type === "simple" && typeof value === "string") {
      onMacroOverride?.({
        macroId: editingMacro.id,
        value,
      });
    } else if (editingMacro.type === "complex" && Array.isArray(value)) {
      onMacroOverride?.({
        macroId: editingMacro.id,
        variantOverrides: value,
      });
    }

    editingMacro = null;
  }

  // Handle macro reset
  function handleMacroReset() {
    if (!editingMacro) return;
    onMacroReset?.(editingMacro.id);
    editingMacro = null;
  }

  // Insert macro at cursor position (raw mode)
  let textareaRef = $state<HTMLTextAreaElement | null>(null);

  function insertMacro(macro: Macro) {
    if (viewMode !== "raw" || !textareaRef) {
      // In visual mode, just append
      handleContentChange(currentContent + `{{${macro.token}}}`);
    } else {
      const start = textareaRef.selectionStart;
      const end = textareaRef.selectionEnd;
      const newContent =
        currentContent.slice(0, start) +
        `{{${macro.token}}}` +
        currentContent.slice(end);
      handleContentChange(newContent);

      // Restore cursor position after the inserted macro
      requestAnimationFrame(() => {
        if (textareaRef) {
          const newPos = start + macro.token.length + 4; // +4 for {{ and }}
          textareaRef.setSelectionRange(newPos, newPos);
          textareaRef.focus();
        }
      });
    }
    showMacroMenu = false;
  }

  function handlePlaceholderClick(placeholder: ContextPlaceholder) {
    // Currently using legacy modal, but we should probably refactor this too.
    // For now, let's just use the legacy modal but triggered differently or inline.
    // Or just ignore it for this plan as macro editing was the main focus.
    viewingPlaceholder = placeholder;
    showPlaceholderInfo = true;
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Header Actions -->
  <div class="flex items-start justify-between gap-4">
    <p class="text-base text-muted-foreground">{template.description}</p>
    <div class="flex items-center gap-1 shrink-0">
      <!-- View Toggle -->
      <div class="flex items-center border rounded-md p-0.5 bg-muted/50">
        <Button
          variant={viewMode === "visual" ? "secondary" : "ghost"}
          size="icon"
          class={viewMode === "visual" ? "h-7 w-7 text-primary" : "h-7 w-7 text-muted-foreground"}
          title="Visual Mode"
          onclick={() => (viewMode = "visual")}
        >
          <Eye class="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "raw" ? "secondary" : "ghost"}
          size="icon"
          class={viewMode === "raw" ? "h-7 w-7 text-primary" : "h-7 w-7 text-muted-foreground"}
          title="Raw Mode"
          onclick={() => (viewMode = "raw")}
        >
          <Code class="h-4 w-4" />
        </Button>
      </div>

      <!-- Macro Insert Menu -->
      <Popover.Root bind:open={showMacroMenu}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-1 ml-2"
              {...props}
            >
              <Plus class="h-3.5 w-3.5" />
              <span class="hidden xs:inline">Macro</span>
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content class="w-64 p-0" align="end">
          <Command.Root>
            <Command.Input placeholder="Search macros..." />
            <Command.List>
              <Command.Empty>No macro found.</Command.Empty>
              <Command.Group heading="Simple Macros">
                {#each allMacros.filter((m) => m.type === "simple") as macro}
                  <Command.Item
                    value={macro.name}
                    onSelect={() => insertMacro(macro)}
                  >
                    <span>{macro.name}</span>
                    <span
                      class="ml-auto text-xs text-muted-foreground font-mono"
                    >
                      {macro.token}
                    </span>
                  </Command.Item>
                {/each}
              </Command.Group>
              <Command.Separator />
              <Command.Group heading="Complex Macros">
                {#each allMacros.filter((m) => m.type === "complex") as macro}
                  <Command.Item
                    value={macro.name}
                    onSelect={() => insertMacro(macro)}
                  >
                    <span>{macro.name}</span>
                    <span
                      class="ml-auto text-xs text-muted-foreground font-mono"
                    >
                      {macro.token}
                    </span>
                  </Command.Item>
                {/each}
              </Command.Group>
            </Command.List>
          </Command.Root>
        </Popover.Content>
      </Popover.Root>

      {#if currentIsModified}
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-red-500"
          title="Reset to default"
          onclick={handleReset}
        >
          <RotateCcw class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </div>

  <!-- Tabs (System/User) -->
  {#if hasUserPrompt}
    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => (activeTab = v as "system" | "user")}
    >
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="system" class="text-xs relative">
          System Prompt
          {#if isModified}
            <span
              class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500"
            ></span>
          {/if}
        </Tabs.Trigger>
        <Tabs.Trigger value="user" class="text-xs relative">
          User Message
          {#if isUserModified}
            <span
              class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500"
            ></span>
          {/if}
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  {/if}

  <!-- Editor Content -->
  {#if viewMode === "visual"}
    <div
      class="min-h-[200px] max-h-[400px] overflow-y-auto p-3 rounded-md border bg-muted/30 text-sm leading-relaxed"
    >
      {#each segments as segment}
        {#if segment.type === "text"}
          <span class="whitespace-pre-wrap">{segment.content}</span>
        {:else if segment.type === "macro" && segment.macro}
          <MacroChip
            macro={segment.macro}
            interactive={true}
            onClick={() => handleMacroClick(segment.macro!)}
            class={editingMacro?.id === segment.macro.id
              ? "ring-2 ring-primary ring-offset-1"
              : ""}
          />
        {:else if segment.type === "placeholder" && segment.placeholder}
          <button
            type="button"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 align-middle transition-colors"
            onclick={() => handlePlaceholderClick(segment.placeholder!)}
          >
            <Info class="h-3 w-3" />
            {segment.placeholder.name}
          </button>
        {:else}
          <code
            class="text-xs px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
          >
            {segment.content}
          </code>
        {/if}
      {/each}
    </div>
  {:else}
    <Textarea
      bind:ref={textareaRef}
      value={currentContent}
      oninput={(e) =>
        handleContentChange((e.target as HTMLTextAreaElement).value)}
      class="min-h-[200px] max-h-[400px] font-mono text-sm"
      placeholder={`Enter ${activeTab === "system" ? "system prompt" : "user message"} content...`}
    />
  {/if}

  <!-- Inline Macro Inspector -->
  {#if editingMacro}
    <div class="mt-2 animate-in slide-in-from-top-2 fade-in duration-200">
      <MacroInspector
        macro={editingMacro}
        override={findMacroOverride(editingMacro.id)}
        {currentContext}
        onSave={handleMacroSave}
        onReset={handleMacroReset}
        onClose={() => (editingMacro = null)}
      />
    </div>
  {/if}
</div>

<!-- Placeholder Info Modal (Legacy for now) -->
{#if viewingPlaceholder}
  <PlaceholderInfo
    isOpen={showPlaceholderInfo}
    placeholder={viewingPlaceholder}
    onClose={() => {
      showPlaceholderInfo = false;
      viewingPlaceholder = null;
    }}
  />
{/if}
