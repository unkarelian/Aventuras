<script lang="ts">
  import { RotateCcw, Save, X, Check } from "lucide-svelte";
  import type {
    Macro,
    MacroOverride,
    SimpleMacro,
    ComplexMacro,
    MacroVariant,
    VariantKey,
    StoryMode,
    POV,
    Tense,
  } from "$lib/services/prompts/types";
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import * as Select from "$lib/components/ui/select";
  import { Badge } from "$lib/components/ui/badge";

  interface Props {
    macro: Macro;
    override?: MacroOverride | null;
    currentContext?: {
      mode?: StoryMode;
      pov?: POV;
      tense?: Tense;
    };
    onSave: (value: string | MacroVariant[]) => void;
    onReset: () => void;
    onClose: () => void;
  }

  let {
    macro,
    override = null,
    currentContext,
    onSave,
    onReset,
    onClose,
  }: Props = $props();

  // --- Simple Macro State ---
  let simpleValue = $state("");

  // --- Complex Macro State ---
  let selectedMode = $state<StoryMode>("adventure");
  let selectedPov = $state<POV>("second");
  let selectedTense = $state<Tense>("present");

  let editedVariants = $state<MacroVariant[]>([]);

  // Initialize state
  $effect(() => {
    if (macro.type === "simple") {
      simpleValue = override?.value ?? (macro as SimpleMacro).defaultValue;
    } else {
      // Deep copy variants
      const sourceVariants = override?.variantOverrides ?? [];
      editedVariants = JSON.parse(JSON.stringify(sourceVariants));

      // Init context
      if (currentContext) {
        if (currentContext.mode && (macro as ComplexMacro).variesBy.mode) {
          selectedMode = currentContext.mode;
        }
        if (currentContext.pov && (macro as ComplexMacro).variesBy.pov) {
          selectedPov = currentContext.pov;
        }
        if (currentContext.tense && (macro as ComplexMacro).variesBy.tense) {
          selectedTense = currentContext.tense;
        }
      }
    }
  });

  // --- Derived State for Complex ---
  let currentKey = $derived<VariantKey>({
    mode: (macro as ComplexMacro).variesBy?.mode ? selectedMode : undefined,
    pov: (macro as ComplexMacro).variesBy?.pov ? selectedPov : undefined,
    tense: (macro as ComplexMacro).variesBy?.tense ? selectedTense : undefined,
  });

  function variantKeyMatches(a: VariantKey, b: VariantKey): boolean {
    return a.mode === b.mode && a.pov === b.pov && a.tense === b.tense;
  }

  function findVariant(
    variants: MacroVariant[],
    key: VariantKey
  ): MacroVariant | undefined {
    return variants.find((v) => variantKeyMatches(v.key, key));
  }

  let defaultVariantContent = $derived.by(() => {
    if (macro.type !== "complex") return "";
    const builtin = findVariant((macro as ComplexMacro).variants, currentKey);
    return builtin?.content ?? (macro as ComplexMacro).fallbackContent ?? "";
  });

  let currentVariantContent = $derived.by(() => {
    if (macro.type !== "complex") return "";
    // Check edited
    const edited = findVariant(editedVariants, currentKey);
    if (edited) return edited.content;
    // Fallback to default
    return defaultVariantContent;
  });

  let isCurrentModified = $derived.by(() => {
    if (macro.type === "simple") {
      return simpleValue !== (macro as SimpleMacro).defaultValue;
    } else {
      const edited = findVariant(editedVariants, currentKey);
      return edited !== undefined;
    }
  });

  // --- Actions ---

  function handleSimpleSave() {
    if (macro.type === "simple") {
      onSave(simpleValue);
    }
  }

  function handleComplexSave() {
    if (macro.type === "complex") {
      onSave(editedVariants);
    }
  }

  function updateComplexVariant(content: string) {
    if (content === defaultVariantContent) {
      // Remove override if matches default
      const idx = editedVariants.findIndex((v) =>
        variantKeyMatches(v.key, currentKey)
      );
      if (idx >= 0) {
        editedVariants = editedVariants.filter((_, i) => i !== idx);
      }
    } else {
      // Upsert override
      const idx = editedVariants.findIndex((v) =>
        variantKeyMatches(v.key, currentKey)
      );
      if (idx >= 0) {
        editedVariants[idx] = { key: { ...currentKey }, content };
      } else {
        editedVariants = [
          ...editedVariants,
          { key: { ...currentKey }, content },
        ];
      }
    }
  }

  function resetCurrentVariant() {
    const idx = editedVariants.findIndex((v) =>
      variantKeyMatches(v.key, currentKey)
    );
    if (idx >= 0) {
      editedVariants = editedVariants.filter((_, i) => i !== idx);
    }
  }

  // Options for Selects
  const modeOptions = [
    { value: "adventure", label: "Adventure" },
    { value: "creative-writing", label: "Creative Writing" },
  ];
  const povOptions = [
    { value: "first", label: "1st Person" },
    { value: "second", label: "2nd Person" },
    { value: "third", label: "3rd Person" },
  ];
  const tenseOptions = [
    { value: "past", label: "Past" },
    { value: "present", label: "Present" },
  ];
</script>

<Card.Root class="border-primary/20 bg-primary/5">
  <Card.Header class="pb-3">
    <div class="flex items-start justify-between">
      <div>
        <Card.Title class="text-base flex items-center gap-2">
          {macro.name}
          <Badge variant="outline" class="font-mono text-xs">
            {macro.token}
          </Badge>
        </Card.Title>
        <Card.Description class="mt-1 text-xs">
          {macro.description}
        </Card.Description>
      </div>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8 text-muted-foreground hover:text-foreground"
          onclick={onClose}
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </div>
  </Card.Header>

  <Card.Content class="pb-3 space-y-4">
    {#if macro.type === "simple"}
      <div class="space-y-2">
        <Label for="simple-val">Value</Label>
        <div class="flex gap-2">
          <Input
            id="simple-val"
            bind:value={simpleValue}
            placeholder={(macro as SimpleMacro).defaultValue}
          />
          {#if isCurrentModified}
            <Button
              variant="ghost"
              size="icon"
              title="Reset to default"
              onclick={() =>
                (simpleValue = (macro as SimpleMacro).defaultValue)}
            >
              <RotateCcw class="h-4 w-4" />
            </Button>
          {/if}
        </div>
        {#if (macro as SimpleMacro).dynamic}
          <p class="text-[10px] text-muted-foreground">
            This macro is dynamic. Your override will prevent automatic updates.
          </p>
        {/if}
      </div>
    {:else}
      <!-- Complex Macro UI -->
      <div class="space-y-4">
        <!-- Dimensions Selectors -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {#if (macro as ComplexMacro).variesBy.mode}
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">Mode</Label>
              <Select.Root
                type="single"
                value={selectedMode}
                onValueChange={(v) => (selectedMode = v as StoryMode)}
              >
                <Select.Trigger class="h-8 text-xs">
                  {modeOptions.find((o) => o.value === selectedMode)?.label}
                </Select.Trigger>
                <Select.Content>
                  {#each modeOptions as opt}
                    <Select.Item value={opt.value} label={opt.label} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          {#if (macro as ComplexMacro).variesBy.pov}
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">POV</Label>
              <Select.Root
                type="single"
                value={selectedPov}
                onValueChange={(v) => (selectedPov = v as POV)}
              >
                <Select.Trigger class="h-8 text-xs">
                  {povOptions.find((o) => o.value === selectedPov)?.label}
                </Select.Trigger>
                <Select.Content>
                  {#each povOptions as opt}
                    <Select.Item value={opt.value} label={opt.label} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}

          {#if (macro as ComplexMacro).variesBy.tense}
            <div class="space-y-1">
              <Label class="text-xs text-muted-foreground">Tense</Label>
              <Select.Root
                type="single"
                value={selectedTense}
                onValueChange={(v) => (selectedTense = v as Tense)}
              >
                <Select.Trigger class="h-8 text-xs">
                  {tenseOptions.find((o) => o.value === selectedTense)?.label}
                </Select.Trigger>
                <Select.Content>
                  {#each tenseOptions as opt}
                    <Select.Item value={opt.value} label={opt.label} />
                  {/each}
                </Select.Content>
              </Select.Root>
            </div>
          {/if}
        </div>

        <!-- Variant Editor -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <Label>Content for this variant</Label>
            {#if isCurrentModified}
              <Button
                variant="ghost"
                size="sm"
                class="h-6 text-[10px] px-2"
                onclick={resetCurrentVariant}
              >
                <RotateCcw class="h-3 w-3 mr-1" />
                Reset Variant
              </Button>
            {/if}
          </div>

          <Textarea
            value={currentVariantContent}
            oninput={(e) => updateComplexVariant(e.currentTarget.value)}
            class="font-mono text-sm min-h-[120px]"
          />
        </div>

        <div class="text-xs text-muted-foreground">
          <span class="font-medium">Default:</span>
          <span class="opacity-70">{defaultVariantContent}</span>
        </div>
      </div>
    {/if}
  </Card.Content>

  <Card.Footer class="flex justify-between border-t py-3">
    <Button variant="ghost" size="sm" onclick={onReset}>
      <RotateCcw class="h-4 w-4 mr-2" />
      Reset Macro
    </Button>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={onClose}>Cancel</Button>
      <Button
        variant="default"
        size="sm"
        onclick={macro.type === "simple" ? handleSimpleSave : handleComplexSave}
      >
        <Save class="h-4 w-4 mr-2" />
        Save Changes
      </Button>
    </div>
  </Card.Footer>
</Card.Root>
