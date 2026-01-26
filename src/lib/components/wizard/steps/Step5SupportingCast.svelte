<script lang="ts">
  import { slide } from "svelte/transition";
  import {
    Archive,
    Loader2,
    Check,
    Sparkles,
    X,
    PenTool,
    Users,
    Plus,
    Trash2,
    ChevronDown,
    Send,
    User,
  } from "lucide-svelte";
  import UniversalVaultBrowser from "$lib/components/vault/UniversalVaultBrowser.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import type { VaultCharacter } from "$lib/types";
  import type {
    GeneratedProtagonist,
    GeneratedCharacter,
  } from "../wizardTypes";

  // Shadcn Components
  import * as Card from "$lib/components/ui/card";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import * as Alert from "$lib/components/ui/alert";
  import * as Avatar from "$lib/components/ui/avatar";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Separator } from "$lib/components/ui/separator";
  import { Badge } from "$lib/components/ui/badge";

  interface Props {
    protagonist: GeneratedProtagonist | null;
    supportingCharacters: GeneratedCharacter[];

    // Supporting character form
    showSupportingCharacterForm: boolean;
    editingSupportingCharacterIndex: number | null;
    supportingCharacterName: string;
    supportingCharacterRole: string;
    supportingCharacterDescription: string;
    supportingCharacterRelationship: string;
    supportingCharacterTraits: string;
    supportingCharacterGuidance: string;

    // Loading states
    isGeneratingCharacters: boolean;
    isElaboratingSupportingCharacter: boolean;

    // Form handlers
    onSupportingNameChange: (value: string) => void;
    onSupportingRoleChange: (value: string) => void;
    onSupportingDescriptionChange: (value: string) => void;
    onSupportingRelationshipChange: (value: string) => void;
    onSupportingTraitsChange: (value: string) => void;
    onSupportingGuidanceChange: (value: string) => void;

    // Action handlers
    onOpenSupportingForm: () => void;
    onEditSupportingCharacter: (index: number) => void;
    onCancelSupportingForm: () => void;
    onUseSupportingAsIs: () => void;
    onElaborateSupportingCharacter: () => void;
    onDeleteSupportingCharacter: (index: number) => void;
    onGenerateCharacters: () => void;

    // Vault handlers
    onSelectSupportingFromVault: (character: VaultCharacter) => void;
    onNavigateToVault?: () => void;
  }

  let {
    protagonist,
    supportingCharacters,
    showSupportingCharacterForm,
    editingSupportingCharacterIndex,
    supportingCharacterName,
    supportingCharacterRole,
    supportingCharacterDescription,
    supportingCharacterRelationship,
    supportingCharacterTraits,
    supportingCharacterGuidance,
    isGeneratingCharacters,
    isElaboratingSupportingCharacter,
    onSupportingNameChange,
    onSupportingRoleChange,
    onSupportingDescriptionChange,
    onSupportingRelationshipChange,
    onSupportingTraitsChange,
    onSupportingGuidanceChange,
    onOpenSupportingForm,
    onEditSupportingCharacter,
    onCancelSupportingForm,
    onUseSupportingAsIs,
    onElaborateSupportingCharacter,
    onDeleteSupportingCharacter,
    onGenerateCharacters,
    onSelectSupportingFromVault,
    onNavigateToVault,
  }: Props = $props();

  // Local state
  let showAdjustWithAI = $state(false);
  let showVaultPicker = $state(false);
  let loadedVaultCharacterId = $state<string | null>(null);

  const hasVaultCharacters = $derived(
    characterVault.isLoaded && characterVault.characters.length > 0,
  );

  const addedVaultCharacterIds = $derived(
    supportingCharacters
      .map((c) => c.vaultId)
      .filter((id): id is string => !!id),
  );

  function handleSelectFromVault(character: VaultCharacter) {
    loadedVaultCharacterId = character.id;
    onSelectSupportingFromVault(character);
    // Don't close immediately so user can add multiple if they want,
    // though the disabled logic handles preventing duplicates.
    // Actually, maybe close it to indicate success? User preference.
    // Let's keep it open for multi-select feel or close it?
    // The previous implementation for cards closed it. Let's close it.
    showVaultPicker = false;
  }
</script>

<div class="space-y-4">
  <!-- Header / Description -->
  <div class="space-y-1">
    <h3 class="text-lg font-medium">Supporting Cast</h3>
    <p class="text-sm text-muted-foreground">
      Add side characters, allies, or antagonists to enrich your story. This
      step is optional.
    </p>
  </div>

  <!-- Load from Vault Section -->
  <div class="space-y-1">
    <div class="flex items-center justify-between pb-1">
      <h4
        class="text-sm font-medium text-muted-foreground flex items-center gap-2"
      >
        <Archive class="h-4 w-4" />
        Load from Vault
      </h4>
      <Button
        variant="link"
        size="sm"
        class="h-auto p-0 text-xs"
        onclick={() => onNavigateToVault?.()}
      >
        Manage Vault
      </Button>
    </div>

    <div
      class="rounded-lg border border-muted-foreground/20 bg-muted/10 text-card-foreground shadow-sm"
    >
      <Collapsible.Root
        open={showVaultPicker}
        onOpenChange={(open) => (showVaultPicker = open)}
      >
        <div class="flex items-center p-3 pl-4 gap-3">
          <Collapsible.Trigger
            class="flex items-center gap-2 flex-1 text-left group/trigger w-full justify-between"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 transition-colors"
              >
                <Users class="h-4 w-4 text-primary" />
              </div>
              <div class="text-left">
                <div class="font-medium text-sm">
                  {supportingCharacters.length > 0
                    ? `${supportingCharacters.length} Character${supportingCharacters.length === 1 ? "" : "s"} Added`
                    : "Add from Vault"}
                </div>
                <div class="text-xs text-muted-foreground">
                  {hasVaultCharacters
                    ? "Browse your saved characters"
                    : "Vault is empty"}
                </div>
              </div>
            </div>
            <div
              class="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover/trigger:bg-muted"
            >
              <ChevronDown
                class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
              />
            </div>
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content>
          <div class="border-t p-3 h-80">
            <UniversalVaultBrowser
              type="character"
              onSelect={handleSelectFromVault}
              selectedId={loadedVaultCharacterId}
              disabledIds={addedVaultCharacterIds}
              {onNavigateToVault}
            />
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  </div>

  <Separator />

  <!-- Add New / Generate Section -->
  {#if !showSupportingCharacterForm}
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" transition:slide>
      <Button
        variant="outline"
        class="h-12 justify-start gap-3 border-dashed hover:border-solid hover:border-primary/50"
        onclick={onOpenSupportingForm}
      >
        <div
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10"
        >
          <Plus class="h-4 w-4 text-primary" />
        </div>
        <span class="text-sm">Create New Character</span>
      </Button>

      <Button
        variant="outline"
        class="h-12 justify-start gap-3 border-dashed hover:border-solid hover:border-primary/50"
        onclick={onGenerateCharacters}
        disabled={isGeneratingCharacters || !protagonist}
        title={!protagonist
          ? "Create a protagonist first"
          : "Generate 3 AI characters"}
      >
        <div
          class="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10"
        >
          {#if isGeneratingCharacters}
            <Loader2 class="h-4 w-4 animate-spin text-accent-foreground" />
          {:else}
            <Sparkles class="h-4 w-4 text-accent-foreground" />
          {/if}
        </div>
        <span class="text-sm">Generate Cast with AI</span>
      </Button>
    </div>
  {:else}
    <!-- Creation Form -->
    <div
      class="rounded-lg border bg-card text-card-foreground shadow-sm p-3"
      transition:slide
    >
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-medium flex items-center gap-2">
          <User class="h-4 w-4" />
          {editingSupportingCharacterIndex !== null
            ? "Edit Character"
            : "New Character"}
        </h4>
        <Button
          variant="ghost"
          size="icon"
          class="h-8 w-8"
          onclick={onCancelSupportingForm}
        >
          <X class="h-4 w-4" />
        </Button>
      </div>

      <div class="space-y-2.5">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Input
            label="Name"
            id="supp-name"
            value={supportingCharacterName}
            oninput={(e) => onSupportingNameChange(e.currentTarget.value)}
            placeholder="e.g., Lady Vivienne"
          />
          <Input
            label="Role"
            id="supp-role"
            value={supportingCharacterRole}
            oninput={(e) => onSupportingRoleChange(e.currentTarget.value)}
            placeholder="e.g., ally, antagonist..."
          />
        </div>

        <div class="space-y-1.5">
          <Label for="supp-desc" class="text-xs">Description</Label>
          <Textarea
            id="supp-desc"
            value={supportingCharacterDescription}
            oninput={(e) =>
              onSupportingDescriptionChange(e.currentTarget.value)}
            placeholder="Appearance, personality..."
            class="min-h-20 text-sm resize-none"
          />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Input
            label="Relationship"
            id="supp-rel"
            value={supportingCharacterRelationship}
            oninput={(e) =>
              onSupportingRelationshipChange(e.currentTarget.value)}
            placeholder="e.g., Childhood friend..."
          />
          <Input
            label="Traits"
            id="supp-traits"
            value={supportingCharacterTraits}
            oninput={(e) => onSupportingTraitsChange(e.currentTarget.value)}
            placeholder="e.g., cunning, loyal..."
          />
        </div>

        <!-- AI Adjustments -->
        <Collapsible.Root
          open={showAdjustWithAI}
          onOpenChange={(open) => (showAdjustWithAI = open)}
          class="space-y-2"
        >
          <div class="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 text-xs text-muted-foreground gap-2 px-0 hover:bg-transparent hover:text-foreground"
              onclick={() => (showAdjustWithAI = !showAdjustWithAI)}
            >
              <Sparkles class="h-3.5 w-3.5" />
              {showAdjustWithAI ? "Hide AI Options" : "Adjust with AI"}
              <ChevronDown
                class="h-3 w-3 transition-transform {showAdjustWithAI
                  ? 'rotate-180'
                  : ''}"
              />
            </Button>
          </div>

          <Collapsible.Content class="space-y-2 -mt-3">
            <div class="space-y-1.5">
              <Label
                for="ai-guidance-supp"
                class="text-[10px] uppercase text-muted-foreground tracking-wider"
                >Guidance</Label
              >
              <Textarea
                id="ai-guidance-supp"
                value={supportingCharacterGuidance}
                oninput={(e) =>
                  onSupportingGuidanceChange(e.currentTarget.value)}
                placeholder="e.g., Make them more sinister..."
                class="h-16 text-xs resize-none"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              class="w-full gap-2"
              onclick={onElaborateSupportingCharacter}
              disabled={isElaboratingSupportingCharacter ||
                !supportingCharacterName.trim()}
            >
              {#if isElaboratingSupportingCharacter}
                <Loader2 class="h-3.5 w-3.5 animate-spin" />
                Expanding...
              {:else}
                <Sparkles class="h-3.5 w-3.5" />
                Expand Details
              {/if}
            </Button>
          </Collapsible.Content>
        </Collapsible.Root>

        <Separator class="my-2" />

        <div class="flex justify-end gap-2">
          <Button variant="ghost" onclick={onCancelSupportingForm}>
            Cancel
          </Button>
          <Button
            class="gap-2"
            onclick={onUseSupportingAsIs}
            disabled={!supportingCharacterName.trim()}
          >
            <Check class="h-4 w-4" />
            {editingSupportingCharacterIndex !== null
              ? "Update"
              : "Add Character"}
          </Button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Character List -->
  {#if supportingCharacters.length > 0}
    <div class="grid grid-cols-1 gap-3 pt-2">
      <h4 class="text-sm font-medium text-muted-foreground mb-1">
        Cast Members ({supportingCharacters.length})
      </h4>
      {#each supportingCharacters as char, index (index)}
        <Card.Root class="group transition-all hover:border-primary/30">
          <Card.Content class="p-2.5 flex items-start gap-2.5">
            <Avatar.Root class="h-8 w-8 border mt-0.5">
              <!-- If we had a portrait for generated chars, we'd use it here.
                     For now, fallback. -->
              <Avatar.Fallback class="bg-primary/10 text-primary">
                <User class="h-4 w-4" />
              </Avatar.Fallback>
            </Avatar.Root>

            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 overflow-hidden">
                  <span class="font-medium text-sm truncate">{char.name}</span>
                  {#if char.role}
                    <Badge
                      variant="secondary"
                      class="text-[10px] px-1 h-4 font-normal"
                    >
                      {char.role}
                    </Badge>
                  {/if}
                </div>

                <div
                  class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onclick={() => onEditSupportingCharacter(index)}
                    title="Edit"
                  >
                    <PenTool class="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onclick={() => onDeleteSupportingCharacter(index)}
                    title="Delete"
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <p
                class="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2"
              >
                {char.description}
              </p>

              {#if char.relationship}
                <p class="text-[10px] text-muted-foreground/70 mt-0.5 italic">
                  {char.relationship}
                </p>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
