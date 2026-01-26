<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import {
    Server,
    Check,
    ChevronsUpDown,
    Plus,
    RefreshCw,
  } from "lucide-svelte";
  import * as Select from "$lib/components/ui/select";
  import * as Command from "$lib/components/ui/command";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { cn } from "$lib/utils/cn";

  interface Props {
    profileId: string | null;
    model: string;
    onProfileChange: (profileId: string | null) => void;
    onModelChange: (model: string) => void;
    showProfileSelector?: boolean;
    onManageProfiles?: () => void;
    label?: string;
    placeholder?: string;
    class?: string;
    onRefreshModels?: () => void;
    isRefreshingModels?: boolean;
  }

  let {
    profileId,
    model,
    onProfileChange,
    onModelChange,
    showProfileSelector = true,
    onManageProfiles,
    label = "Model",
    placeholder = "Select or type model...",
    class: className,
    onRefreshModels,
    isRefreshingModels = false,
  }: Props = $props();

  // Local state for model search/input
  let open = $state(false);
  let inputValue = $state("");

  // Resolve the effective profile ID (with fallback to default)
  // This ensures models are available even if profileId is null
  let effectiveProfileId = $derived(
    profileId || settings.getDefaultProfileIdForProvider(),
  );

  // Get available models for the selected profile
  let availableModels = $derived.by(() => {
    if (!effectiveProfileId) return [];
    const profile = settings.getProfile(effectiveProfileId);
    if (!profile) return [];
    // Combine fetched and custom models, removing duplicates
    return [...new Set([...profile.fetchedModels, ...profile.customModels])];
  });

  // Get selected profile name
  let selectedProfileName = $derived.by(() => {
    if (!profileId) return "Select Profile";
    const profile = settings.getProfile(profileId);
    return profile?.name || "Unknown";
  });

  // Create framework options for Select
  let profileOptions = $derived(
    settings.apiSettings.profiles.map((p) => ({
      value: p.id,
      label:
        p.name +
        (settings.apiSettings.defaultProfileId === p.id ? " (Default)" : ""),
    })),
  );

  function handleSelectProfile(val: string) {
    onProfileChange(val);
  }
</script>

<div class={cn("grid gap-4", className)}>
  {#if showProfileSelector}
    <div class="grid gap-2">
      <Label>API Profile</Label>
      <div class="flex gap-2">
        <Select.Root
          type="single"
          value={profileId || settings.getDefaultProfileIdForProvider()}
          onValueChange={handleSelectProfile}
        >
          <Select.Trigger class="w-full">
            {selectedProfileName}
          </Select.Trigger>
          <Select.Content>
            {#each profileOptions as option}
              <Select.Item value={option.value}>{option.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        {#if onManageProfiles}
          <Button
            variant="outline"
            size="icon"
            onclick={onManageProfiles}
            title="Manage API Profiles"
            class="shrink-0"
          >
            <Server class="h-4 w-4" />
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  <div class="grid gap-2">
    <div class="flex items-center justify-between">
      <Label>{label}</Label>
      {#if onRefreshModels}
        <Button
          variant="text"
          size="sm"
          class="h-auto p-0 text-xs text-muted-foreground hover:text-primary no-underline"
          onclick={onRefreshModels}
          disabled={isRefreshingModels}
        >
          <RefreshCw
            class={cn("h-3 w-3 mr-1", isRefreshingModels && "animate-spin")}
          />
          Refresh
        </Button>
      {/if}
    </div>
    <Popover.Root bind:open>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            class="w-full justify-between"
            {...props}
          >
            {model || placeholder}
            <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class="w-[var(--bits-popover-anchor-width)] p-0">
        <Command.Root>
          <Command.Input
            bind:value={inputValue}
            placeholder="Search or type model..."
          />
          <Command.List>
            <Command.Empty>
              {#if inputValue.length > 0}
                <div class="p-1">
                  <Button
                    variant="ghost"
                    class="w-full justify-start text-xs"
                    onclick={() => {
                      onModelChange(inputValue);
                      open = false;
                    }}
                  >
                    <Plus class="mr-2 h-4 w-4" />
                    Use "{inputValue}"
                  </Button>
                </div>
              {:else}
                <div class="p-2 text-sm text-muted-foreground text-center">
                  No models found.
                </div>
              {/if}
            </Command.Empty>
            <Command.Group>
              {#each availableModels as modelOption}
                <Command.Item
                  value={modelOption}
                  onSelect={() => {
                    onModelChange(modelOption);
                    open = false;
                  }}
                >
                  <Check
                    class={cn(
                      "mr-2 h-4 w-4",
                      model === modelOption ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {modelOption}
                </Command.Item>
              {/each}

              {#if inputValue.length > 0 && !availableModels.some((m) => m.toLowerCase() === inputValue.toLowerCase())}
                <Command.Item
                  value={inputValue}
                  onSelect={() => {
                    onModelChange(inputValue);
                    open = false;
                  }}
                >
                  <Plus class="mr-2 h-4 w-4" />
                  Use "{inputValue}"
                </Command.Item>
              {/if}
            </Command.Group>
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
    {#if availableModels.length === 0}
      <p class="text-[0.8rem] text-muted-foreground">
        No models available. Add models to the profile.
      </p>
    {/if}
  </div>
</div>
