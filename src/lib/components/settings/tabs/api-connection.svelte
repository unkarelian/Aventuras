<script lang="ts">
  import { settings } from "$lib/stores/settings.svelte";
  import type { APIProfile } from "$lib/types";
  import type { ProviderInfo } from "$lib/services/ai/types";
  import { fetch } from "@tauri-apps/plugin-http";
  import {
    Plus,
    Edit2,
    ChevronRight,
    RefreshCw,
    Eye,
    EyeOff,
    Check,
    Globe,
    Key as KeyIcon,
    Box,
    AlertCircle,
    Star,
  } from "lucide-svelte";

  import { Button } from "$lib/components/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import { Separator } from "$lib/components/ui/separator";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Alert, AlertDescription } from "$lib/components/ui/alert";
  import IconRow from "$lib/components/ui/icon-row.svelte";
  import X from "@lucide/svelte/icons/x";
  import { isMobileDevice } from "$lib/utils/swipe";

  interface Props {
    providerOptions: ProviderInfo[];
  }

  let { providerOptions }: Props = $props();

  let editingProfileId = $state<string | null>(null);
  let isNewProfile = $state(false);

  // Form state
  let formName = $state("");
  let formBaseUrl = $state("");
  let formApiKey = $state("");
  let formCustomModels = $state<string[]>([]);
  let formFetchedModels = $state<string[]>([]);
  let formSetAsDefault = $state(false);
  let formNewModelInput = $state("");
  let formShowApiKey = $state(false);

  // Auto-save debounce state
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  // UI state
  let isFetchingModels = $state(false);
  let fetchError = $state<string | null>(null);
  let openCollapsibles = $state<Set<string>>(new Set());

  const urlPresets = [
    { name: "OpenRouter", url: "https://openrouter.ai/api/v1" },
    { name: "NanoGPT", url: "https://nano-gpt.com/api/v1" },
  ];

  function startEdit(profile: APIProfile) {
    if (editingProfileId && editingProfileId !== profile.id && !isNewProfile) {
      if (saveTimeout) clearTimeout(saveTimeout);
      autoSaveEdit();
    }

    editingProfileId = profile.id;
    isNewProfile = false;
    formName = profile.name;
    formBaseUrl = profile.baseUrl;
    formApiKey = profile.apiKey;
    formCustomModels = [...profile.customModels];
    formFetchedModels = [...profile.fetchedModels];
    formSetAsDefault = false;
    formShowApiKey = false;
    fetchError = null;
    openCollapsibles = new Set([...openCollapsibles, profile.id]);
  }

  function startNewProfile() {
    editingProfileId = crypto.randomUUID();
    isNewProfile = true;
    formName = "";
    formBaseUrl = settings.apiSettings.openaiApiURL;
    formApiKey = "";
    formCustomModels = [];
    formFetchedModels = [];
    formSetAsDefault = settings.apiSettings.profiles.length === 0;
    formShowApiKey = false;
    fetchError = null;
  }

  function cancelEdit() {
    editingProfileId = null;
    isNewProfile = false;
    fetchError = null;
  }

  async function handleSave() {
    if (!formName.trim() || !formBaseUrl.trim()) return;

    const profile: APIProfile = {
      id: editingProfileId!,
      name: formName.trim(),
      baseUrl: formBaseUrl.trim().replace(/\/$/, ""),
      apiKey: formApiKey,
      customModels: formCustomModels,
      fetchedModels: formFetchedModels,
      createdAt: isNewProfile
        ? Date.now()
        : settings.apiSettings.profiles.find((p) => p.id === editingProfileId)
            ?.createdAt || Date.now(),
    };

    if (isNewProfile) {
      await settings.addProfile(profile);

      if (formSetAsDefault) {
        settings.setDefaultProfile(profile.id);
      }
    } else {
      await settings.updateProfile(profile.id, profile);
    }

    cancelEdit();
  }

  async function handleDelete(profileId: string) {
    await settings.deleteProfile(profileId);
    if (editingProfileId === profileId) cancelEdit();
  }

  async function handleFetchModels() {
    if (!formBaseUrl) {
      fetchError = "Please enter a base URL first";
      return;
    }

    isFetchingModels = true;
    fetchError = null;
    formFetchedModels = [];

    try {
      const modelsUrl = formBaseUrl.replace(/\/$/, "") + "/models";
      const response = await fetch(modelsUrl, {
        headers: formApiKey ? { Authorization: `Bearer ${formApiKey}` } : {},
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch models: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (data.data && Array.isArray(data.data)) {
        formFetchedModels = data.data.map((m: { id: string }) => m.id);
      } else if (Array.isArray(data)) {
        formFetchedModels = data
          .map((m: { id?: string; name?: string }) => m.id || m.name || "")
          .filter(Boolean);
      } else {
        throw new Error("Unexpected response format");
      }
    } catch (err) {
      fetchError =
        err instanceof Error ? err.message : "Failed to fetch models";
    } finally {
      isFetchingModels = false;
    }
  }

  function handleAddCustomModel() {
    const model = formNewModelInput.trim();
    if (model && !formCustomModels.includes(model)) {
      formCustomModels = [...formCustomModels, model];
      formNewModelInput = "";
    }
  }

  function handleRemoveCustomModel(model: string) {
    formCustomModels = formCustomModels.filter((m) => m !== model);
  }

  function handleRemoveFetchedModel(model: string) {
    formFetchedModels = formFetchedModels.filter((m) => m !== model);
  }

  function handleSetDefault(profileId: string) {
    const currentDefault = settings.getDefaultProfileIdForProvider();
    if (currentDefault === profileId) {
      if (settings.apiSettings.profiles.length > 1) {
        settings.setDefaultProfile(undefined);
      }
    } else {
      settings.setDefaultProfile(profileId);
    }
  }

  function handleOpenChange(open: boolean, profile: APIProfile) {
    if (open) {
      startEdit(profile);
    } else {
      openCollapsibles.delete(profile.id);
      openCollapsibles = new Set(openCollapsibles);

      if (editingProfileId === profile.id) {
        if (saveTimeout) clearTimeout(saveTimeout);
        autoSaveEdit();
        editingProfileId = null;
      }
    }
  }

  function isProfileOpen(profileId: string): boolean {
    return openCollapsibles.has(profileId);
  }

  async function autoSaveEdit() {
    if (!editingProfileId || isNewProfile) return;
    if (!formName.trim() || !formBaseUrl.trim()) return;

    const existingProfile = settings.apiSettings.profiles.find(
      (p) => p.id === editingProfileId,
    );
    if (!existingProfile) return;

    const profile: APIProfile = {
      id: editingProfileId,
      name: formName.trim(),
      baseUrl: formBaseUrl.trim().replace(/\/$/, ""),
      apiKey: formApiKey,
      customModels: formCustomModels,
      fetchedModels: formFetchedModels,
      createdAt: existingProfile.createdAt,
    };

    await settings.updateProfile(profile.id, profile);
  }

  function triggerAutoSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      autoSaveEdit();
      saveTimeout = null;
    }, 500);
  }

  $effect(() => {
    if (editingProfileId && !isNewProfile) {
      formName;
      formBaseUrl;
      formApiKey;
      formCustomModels;
      formFetchedModels;
      triggerAutoSave();
    }
  });
</script>

<div class="space-y-6">
  <!-- Header -->
  <div>
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-semibold">API Profiles</h3>
        <p class="text-sm text-muted-foreground">Setup your API endpoints</p>
      </div>
      <Button onclick={startNewProfile}>
        <Plus class="h-4 w-4" />
        Add Profile
      </Button>
    </div>
  </div>

  <!-- New Profile Form -->
  {#if isNewProfile && editingProfileId}
    <Card class="border-primary/50 bg-primary/5">
      <CardContent>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <Star class="h-4 w-4 text-primary" />
            <span class="text-sm font-medium text-primary">New Profile</span>
          </div>

          <Input
            id="new-name"
            label="Profile Name"
            placeholder="e.g., OpenRouter, Local LLM"
            bind:value={formName}
          />

          <div class="space-y-2">
            <Label for="new-url">Base URL</Label>
            <div class="flex flex-wrap gap-2 mb-2">
              {#each urlPresets as preset}
                <Badge
                  variant={formBaseUrl === preset.url ? "default" : "outline"}
                  class="cursor-pointer"
                  onclick={() => {
                    if (!formName) formName = preset.name;
                    formBaseUrl = preset.url;
                    formFetchedModels = [];
                    fetchError = null;
                  }}
                >
                  {preset.name}
                </Badge>
              {/each}
            </div>
            <Input
              id="new-url"
              placeholder="https://api.example.com/v1"
              bind:value={formBaseUrl}
              class="font-mono text-xs"
            />
          </div>

          <div class="space-y-2">
            <Input
              label="API Key"
              id="new-key"
              type="password"
              placeholder="sk-..."
              bind:value={formApiKey}
              class="font-mono text-xs"
            />
          </div>
        </div>

        <Separator class="my-4" />

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <Label class="flex items-center gap-2">
              <Box class="h-4 w-4" />
              Models
            </Label>
          </div>

          {#if fetchError}
            <Alert variant="destructive">
              <AlertCircle class="h-4 w-4" />
              <AlertDescription class="text-xs">{fetchError}</AlertDescription>
            </Alert>
          {/if}

          <div class="space-y-2 mb-2">
            <div class="flex gap-2">
              <Input
                placeholder={isMobileDevice()
                  ? "Add custom or fetch..."
                  : "Add custom model or fetch available"}
                bind:value={formNewModelInput}
                class="flex-1 w-full"
                onkeydown={(e) => e.key === "Enter" && handleAddCustomModel()}
              />
              <Button
                variant="outline"
                onclick={handleAddCustomModel}
                disabled={!formNewModelInput.trim()}
              >
                <Plus class="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onclick={handleFetchModels}
                disabled={isFetchingModels || !formBaseUrl}
              >
                {#if isFetchingModels}
                  <RefreshCw class=" h-4 w-4 animate-spin" />
                  Fetching...
                {:else}
                  <RefreshCw class=" h-4 w-4" />
                  {isMobileDevice() ? "" : "Fetch Models"}
                {/if}
              </Button>
            </div>

            {#if formFetchedModels.length > 0}
              <div class="space-y-2">
                <p class="text-xs font-medium text-muted-foreground">
                  Fetched Models ({formFetchedModels.length})
                </p>
                <ScrollArea class="h-32 w-full rounded-md border">
                  <div class="flex flex-wrap gap-1 p-2">
                    {#each formFetchedModels as model}
                      <Badge variant="secondary" class="gap-1 pr-1">
                        <span class="max-w-37.5 truncate">{model}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-4 w-4 p-0 hover:text-destructive"
                          onclick={() => handleRemoveFetchedModel(model)}
                        >
                          <X class="h-3 w-3" />
                        </Button>
                      </Badge>
                    {/each}
                  </div>
                </ScrollArea>
              </div>
            {/if}

            {#if formCustomModels.length > 0}
              <div class="space-y-2">
                <p class="text-xs font-medium text-muted-foreground">
                  Custom Models ({formCustomModels.length})
                </p>
                <ScrollArea class="h-24 w-full rounded-md border">
                  <div class="flex flex-wrap gap-1 p-2">
                    {#each formCustomModels as model}
                      <Badge variant="outline" class="gap-1 pr-1">
                        <span class="max-w-37.5 truncate">{model}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-4 w-4 p-0 hover:text-destructive"
                          onclick={() => handleRemoveCustomModel(model)}
                        >
                          <X class="h-3 w-3" />
                        </Button>
                      </Badge>
                    {/each}
                  </div>
                </ScrollArea>
              </div>
            {/if}
          </div>
        </div>

        <div class="flex gap-2 pt-2">
          <Button variant="outline" onclick={cancelEdit} class="flex-1"
            >Cancel</Button
          >
          <Button
            onclick={handleSave}
            disabled={!formName.trim() || !formBaseUrl.trim()}
            class="flex-1"
          >
            <Check class="h-4 w-4" />
            Create Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  {/if}

  <!-- Profiles List -->
  <div class="space-y-3">
    {#each settings.apiSettings.profiles as profile (profile.id)}
      <div
        class="rounded-lg border bg-card text-card-foreground shadow-sm group"
      >
        <Collapsible.Root
          open={isProfileOpen(profile.id)}
          onOpenChange={(open) => handleOpenChange(open, profile)}
        >
          <div class="flex items-center p-3 pl-4 gap-3">
            <Collapsible.Trigger
              class="flex items-center gap-2 flex-1 text-left group/trigger"
            >
              <div
                class="flex h-8 w-8 items-center justify-center rounded-md bg-muted/50 transition-colors group-hover/trigger:bg-muted"
              >
                <ChevronRight
                  class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-xl md:text-sm"
                    >{profile.name}</span
                  >
                  {#if profile.id === settings.getDefaultProfileIdForProvider()}
                    <Badge
                      variant="default"
                      class="hidden shrink-0 md:flex items-center justify-center"
                    >
                      <Star class="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  {/if}
                </div>
                <div class="items-center gap-2 mt-0.5 hidden md:flex">
                  <span class="text-xs text-muted-foreground font-mono truncate"
                    >{profile.baseUrl}</span
                  >
                  <Badge
                    variant="outline"
                    class="text-xs text-muted-foreground"
                  >
                    {profile.customModels.length + profile.fetchedModels.length}
                    models
                  </Badge>
                </div>
              </div>
            </Collapsible.Trigger>
            <div class="flex items-center gap-1 shrink-0">
              <IconRow
                onDelete={() => handleDelete(profile.id)}
                size="icon"
                showDelete={settings.canDeleteProfile(profile.id)}
              >
                {#if profile.id === settings.getDefaultProfileIdForProvider()}
                  <Badge variant="default" class="shrink-0 text-xs md:hidden">
                    Default
                  </Badge>
                {/if}
                {#if settings.apiSettings.profiles.length > 1}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="w-5 {profile.id ===
                    settings.getDefaultProfileIdForProvider()
                      ? 'md:block hidden'
                      : ''}"
                    onclick={() => handleSetDefault(profile.id)}
                    title={profile.id ===
                    settings.getDefaultProfileIdForProvider()
                      ? "Remove default"
                      : "Set as default"}
                  >
                    <Star
                      class={`h-4 w-4 ${profile.id === settings.getDefaultProfileIdForProvider() ? "fill-primary text-primary" : ""}`}
                    />
                  </Button>
                {/if}
                <Button
                  variant="ghost"
                  size="icon"
                  class="w-5"
                  onclick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startEdit(profile);
                  }}
                  title="Edit profile"
                >
                  <Edit2 class="h-4 w-4" />
                </Button>
              </IconRow>
            </div>
          </div>

          <Collapsible.Content>
            {#if editingProfileId === profile.id}
              <div class="space-y-4 border-t bg-muted/10 mt-2 p-4">
                <Input
                  label="Profile Name"
                  bind:value={formName}
                  placeholder="Profile name"
                />

                <div class="flex flex-col">
                  <Label class="mb-2">Base URL</Label>
                  <div class="flex flex-wrap gap-2 mb-2">
                    {#each urlPresets as preset}
                      <Badge
                        variant={formBaseUrl === preset.url
                          ? "default"
                          : "outline"}
                        class="cursor-pointer"
                        onclick={() => {
                          formBaseUrl = preset.url;
                          formFetchedModels = [];
                          fetchError = null;
                        }}
                      >
                        {preset.name}
                      </Badge>
                    {/each}
                  </div>
                  <Input
                    bind:value={formBaseUrl}
                    placeholder="https://api.example.com/v1"
                    class="font-mono text-xs"
                  />
                </div>

                <div class="space-y-2">
                  <Input
                    label="API Key"
                    type="password"
                    placeholder="sk-..."
                    bind:value={formApiKey}
                    class="font-mono text-xs"
                  />
                </div>

                <div class="">
                  <div class="flex items-center justify-between">
                    <Label class="flex items-center gap-2">
                      <Box class="h-4 w-4" />
                      Models
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={handleFetchModels}
                      disabled={isFetchingModels || !formBaseUrl}
                    >
                      {#if isFetchingModels}
                        <RefreshCw class=" h-3 w-3 animate-spin" />
                        Fetching...
                      {:else}
                        <RefreshCw class=" h-3 w-3" />
                        {isMobileDevice() ? "Fetch" : "Fetch Models"}
                      {/if}
                    </Button>
                  </div>

                  {#if fetchError}
                    <Alert variant="destructive">
                      <AlertCircle class="h-4 w-4" />
                      <AlertDescription class="text-xs"
                        >{fetchError}</AlertDescription
                      >
                    </Alert>
                  {/if}

                  {#if formFetchedModels.length > 0}
                    <div class="space-y-1 mb-2">
                      <p class="text-xs font-medium text-muted-foreground">
                        Fetched Models ({formFetchedModels.length})
                      </p>
                      <ScrollArea class="h-32 w-full rounded-md border">
                        <div class="flex flex-wrap gap-1 p-2">
                          {#each formFetchedModels as model}
                            <Badge variant="secondary" class="gap-1 pr-1">
                              <span class="max-w-37.5 truncate">{model}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                class="h-4 w-4 p-0 hover:text-destructive"
                                onclick={() => handleRemoveFetchedModel(model)}
                              >
                                <X class="h-3 w-3" />
                              </Button>
                            </Badge>
                          {/each}
                        </div>
                      </ScrollArea>
                    </div>
                  {/if}

                  <div class="space-y-1">
                    <p class="text-xs font-medium text-muted-foreground">
                      Custom Models
                    </p>
                    <div class="flex gap-2">
                      <Input
                        placeholder="model-name or provider/model"
                        bind:value={formNewModelInput}
                        class="flex-1 pr-20"
                        onkeydown={(e) =>
                          e.key === "Enter" && handleAddCustomModel()}
                      />
                      <Button
                        size="icon"
                        onclick={handleAddCustomModel}
                        disabled={!formNewModelInput.trim()}
                      >
                        <Plus class="h-4 w-4" />
                      </Button>
                    </div>
                    {#if formCustomModels.length > 0}
                      <ScrollArea class="h-24 w-full rounded-md border">
                        <div class="flex flex-wrap gap-1 p-2">
                          {#each formCustomModels as model}
                            <Badge variant="outline" class="gap-1 pr-1">
                              <span class="max-w-[150px] truncate">{model}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                class="h-4 w-4 p-0 hover:text-destructive"
                                onclick={() => handleRemoveCustomModel(model)}
                              >
                                <X class="h-3 w-3" />
                              </Button>
                            </Badge>
                          {/each}
                        </div>
                      </ScrollArea>
                    {/if}
                  </div>
                </div>
              </div>
            {:else}
              <!-- Read-only View -->
              <div class="space-y-4 border-t bg-muted/10 mt-2 p-4">
                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">Profile Name</Label
                  >
                  <div class="font-medium">{profile.name}</div>
                </div>

                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">Base URL</Label>
                  <div class="font-mono text-sm bg-muted p-2 rounded truncate">
                    {profile.baseUrl}
                  </div>
                </div>

                <div class="grid gap-1">
                  <Label class="text-muted-foreground text-xs">API Key</Label>
                  <div class="font-mono text-sm bg-muted p-2 rounded truncate">
                    {#if profile.apiKey}
                      {profile.apiKey.slice(0, 3)}...{profile.apiKey.slice(-4)}
                    {:else}
                      <span class="text-muted-foreground italic"
                        >No API key set</span
                      >
                    {/if}
                  </div>
                </div>

                <div class="grid gap-2">
                  <Label class="text-muted-foreground text-xs">Models</Label>
                  <div class="flex flex-wrap gap-1">
                    {#each [...profile.fetchedModels, ...profile.customModels] as model}
                      <Badge variant="secondary" class="font-mono text-xs">
                        {model}
                      </Badge>
                    {/each}
                    {#if profile.fetchedModels.length === 0 && profile.customModels.length === 0}
                      <span class="text-sm text-muted-foreground italic"
                        >No models configured</span
                      >
                    {/if}
                  </div>
                </div>

                <div class="pt-2 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={() => startEdit(profile)}
                  >
                    <Edit2 class="h-3 w-3 mr-2" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            {/if}
          </Collapsible.Content>
        </Collapsible.Root>
      </div>
    {/each}

    {#if settings.apiSettings.profiles.length === 0}
      <Card class="border-dashed">
        <CardContent class="p-8 text-center">
          <div
            class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted"
          >
            <KeyIcon class="h-6 w-6 text-muted-foreground" />
          </div>
          <h4 class="mb-2 font-medium">No API profiles yet</h4>
          <p class="mb-4 text-sm text-muted-foreground">
            Add an API profile to connect to your LLM provider
          </p>
          <Button onclick={startNewProfile}>
            <Plus class=" h-4 w-4" />
            Add Your First Profile
          </Button>
        </CardContent>
      </Card>
    {/if}
  </div>

  <!-- Footer Links -->
  <Card class="bg-muted/30 -mt-3">
    <CardContent class="p-4">
      <p class="text-sm text-muted-foreground">
        PAYG with
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
        >
          OpenRouter,
        </a>
        $8/month sub with
        <a
          href="https://nano-gpt.com/subscription"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
        >
          NanoGPT,
        </a>
        or bring your own LLM!
      </p>
    </CardContent>
  </Card>
</div>
