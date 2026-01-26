<script lang="ts">
  import type {
    VaultScenario,
    VaultScenarioNpc,
    VaultCharacter,
  } from "$lib/types";
  import { scenarioVault } from "$lib/stores/scenarioVault.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import {
    X,
    Save,
    Plus,
    Trash2,
    Users,
    MessageSquare,
    FileText,
    MapPin,
    ChevronDown,
    ChevronRight,
    Search,
    Loader2,
    User,
  } from "lucide-svelte";
  import TagInput from "$lib/components/tags/TagInput.svelte";
  import VaultListItem from "./shared/VaultListItem.svelte";
  import { normalizeImageDataUrl } from "$lib/utils/image";
  import { cn } from "$lib/utils/cn";

  import * as ResponsiveModal from "$lib/components/ui/responsive-modal";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Label } from "$lib/components/ui/label";
  import * as Tabs from "$lib/components/ui/tabs";
  import * as Avatar from "$lib/components/ui/avatar";
  import * as Collapsible from "$lib/components/ui/collapsible";

  interface Props {
    scenario: VaultScenario;
    onClose: () => void;
  }

  let { scenario, onClose }: Props = $props();

  // Form State
  let name = $state(scenario.name);
  let description = $state(scenario.description || "");
  let settingSeed = $state(scenario.settingSeed);
  let npcs = $state<VaultScenarioNpc[]>(
    JSON.parse(JSON.stringify(scenario.npcs)),
  );
  let firstMessage = $state(scenario.firstMessage || "");
  let alternateGreetings = $state<string[]>([...scenario.alternateGreetings]);
  let tags = $state<string[]>([...scenario.tags]);

  let saving = $state(false);
  let error = $state<string | null>(null);

  let showCharacterSelector = $state(false);
  let charSearchQuery = $state("");

  // Tab state
  let activeTab = $state("general");

  const filteredCharacters = $derived.by(() => {
    if (!showCharacterSelector) return [];
    let chars = characterVault.characters;
    if (charSearchQuery.trim()) {
      const q = charSearchQuery.toLowerCase();
      chars = chars.filter((c) => c.name.toLowerCase().includes(q));
    }
    return chars;
  });

  async function handleSave() {
    if (!name.trim()) {
      error = "Scenario name is required";
      return;
    }

    saving = true;
    error = null;

    try {
      await scenarioVault.update(scenario.id, {
        name,
        description: description || null,
        settingSeed,
        npcs,
        firstMessage: firstMessage || null,
        alternateGreetings,
        tags,
        metadata: {
          ...scenario.metadata,
          npcCount: npcs.length,
          hasFirstMessage: !!firstMessage,
          alternateGreetingsCount: alternateGreetings.length,
        },
      });
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to save scenario";
    } finally {
      saving = false;
    }
  }

  function addNpc() {
    npcs.push({
      name: "New NPC",
      role: "Supporting Character",
      description: "",
      relationship: "Neutral",
      traits: [],
    });
    npcs = npcs; // Trigger reactivity
  }

  function removeNpc(index: number) {
    npcs = npcs.filter((_, i) => i !== index);
  }

  function addNpcFromCharacter(char: VaultCharacter) {
    npcs.push({
      name: char.name,
      role: "Supporting Character",
      description: char.description || "",
      relationship: "Neutral",
      traits: [...char.traits],
    });
    npcs = npcs;
    showCharacterSelector = false;
  }

  function addGreeting() {
    alternateGreetings = [...alternateGreetings, ""];
  }

  function removeGreeting(index: number) {
    alternateGreetings = alternateGreetings.filter((_, i) => i !== index);
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <ResponsiveModal.Content
    class="md:max-w-4xl flex flex-col h-[95vh] md:h-[85vh] p-0 overflow-hidden"
  >
    <ResponsiveModal.Header class="px-6 py-4 border-b bg-muted/40">
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10"
        >
          <MapPin class="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Edit Scenario</h2>
          <p class="text-sm text-muted-foreground">
            Modify your scenario settings and characters.
          </p>
        </div>
      </div>
    </ResponsiveModal.Header>

    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => (activeTab = v)}
      class="flex-1 flex flex-col overflow-hidden"
    >
      <div class="border-b bg-muted/20">
        <Tabs.List class="w-full justify-start h-12 bg-transparent p-0">
          <Tabs.Trigger
            value="general"
            class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4"
          >
            <FileText class="h-4 w-4 mr-2" />
            General
          </Tabs.Trigger>
          <Tabs.Trigger
            value="npcs"
            class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4"
          >
            <Users class="h-4 w-4 mr-2" />
            NPCs ({npcs.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="opening"
            class="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-4"
          >
            <MessageSquare class="h-4 w-4 mr-2" />
            Opening
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <div class="flex-1 overflow-y-auto bg-background">
        <div class="px-6 py-2 max-w-3xl mx-auto space-y-6">
          {#if error}
            <div
              class="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-center gap-2"
            >
              <Loader2 class="h-4 w-4" />
              {error}
            </div>
          {/if}

          <Tabs.Content value="general" class="mt-0 space-y-6">
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="name">Scenario Name</Label>
                <Input
                  id="name"
                  bind:value={name}
                  placeholder="e.g. The Cyberpunk City"
                />
              </div>

              <div class="space-y-2">
                <Label for="description">Description</Label>
                <Textarea
                  id="description"
                  bind:value={description}
                  rows={2}
                  placeholder="Brief overview shown on the card..."
                  class="resize-none"
                />
              </div>

              <div class="space-y-2">
                <Label for="seed">Setting Seed</Label>
                <div class="relative">
                  <Textarea
                    id="seed"
                    bind:value={settingSeed}
                    rows={10}
                    class="font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                    placeholder="Detailed world setting..."
                  />
                  <div
                    class="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded"
                  >
                    Markdown supported
                  </div>
                </div>
                <p class="text-[0.8rem] text-muted-foreground">
                  The core world details used for generation.
                </p>
              </div>

              <div class="space-y-2">
                <Label>Tags</Label>
                <TagInput
                  value={tags}
                  type="scenario"
                  onChange={(t) => (tags = t)}
                  placeholder="Add tags..."
                />
              </div>
            </div>
          </Tabs.Content>

          <Tabs.Content value="npcs" class="mt-0 space-y-6">
            <div
              class="flex items-center justify-between sticky top-0 bg-background z-10 pt-2 pb-4 border-b mb-4"
            >
              <h3 class="text-sm font-medium text-muted-foreground">
                Supporting Characters
              </h3>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => {
                    charSearchQuery = "";
                    showCharacterSelector = true;
                  }}
                >
                  <Users class="h-3.5 w-3.5 " />
                  Import
                </Button>
                <Button size="sm" onclick={addNpc}>
                  <Plus class="h-3.5 w-3.5 " />
                  New NPC
                </Button>
              </div>
            </div>

            <div class="space-y-3">
              {#if npcs.length === 0}
                <div
                  class="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-muted-foreground bg-muted/30"
                >
                  <Users class="h-10 w-10 opacity-20 mb-2" />
                  <p>No NPCs defined yet.</p>
                  <Button variant="link" onclick={addNpc}
                    >Create your first NPC</Button
                  >
                </div>
              {:else}
                {#each npcs as npc, i}
                  <div
                    class="rounded-lg border bg-card text-card-foreground shadow-sm group"
                  >
                    <Collapsible.Root>
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
                          <div class="flex-1">
                            <div class="font-medium text-sm">
                              {npc.name || "Unnamed NPC"}
                            </div>
                            <div class="text-xs text-muted-foreground">
                              {npc.role || "No role"}
                            </div>
                          </div>
                        </Collapsible.Trigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onclick={() => removeNpc(i)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </div>

                      <Collapsible.Content>
                        <div
                          class="px-4 pb-4 pt-0 space-y-4 border-t bg-muted/10 mt-2 p-4"
                        >
                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-2">
                              <Label class="text-xs">Name</Label>
                              <Input bind:value={npc.name} class="h-8" />
                            </div>
                            <div class="space-y-2">
                              <Label class="text-xs">Role</Label>
                              <Input bind:value={npc.role} class="h-8" />
                            </div>
                          </div>

                          <div class="space-y-2">
                            <Label class="text-xs">Description</Label>
                            <Textarea
                              bind:value={npc.description}
                              rows={2}
                              class="min-h-[60px] resize-none"
                            />
                          </div>

                          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-2">
                              <Label class="text-xs">Relationship</Label>
                              <Input
                                bind:value={npc.relationship}
                                class="h-8"
                              />
                            </div>
                            <div class="space-y-2">
                              <Label class="text-xs">Traits</Label>
                              <Input
                                value={npc.traits.join(", ")}
                                oninput={(e) =>
                                  (npc.traits = e.currentTarget.value
                                    .split(",")
                                    .map((t) => t.trim())
                                    .filter(Boolean))}
                                class="h-8"
                                placeholder="Comma separated..."
                              />
                            </div>
                          </div>
                        </div>
                      </Collapsible.Content>
                    </Collapsible.Root>
                  </div>
                {/each}
              {/if}
            </div>
          </Tabs.Content>

          <Tabs.Content value="opening" class="mt-0 space-y-6">
            <div class="space-y-2">
              <Label>First Message</Label>
              <Textarea
                bind:value={firstMessage}
                rows={6}
                class="font-mono text-sm leading-relaxed"
                placeholder="The opening scene..."
              />
              <p class="text-[0.8rem] text-muted-foreground">
                Shown when the story begins.
              </p>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <Label>Alternate Greetings</Label>
                <Button variant="outline" size="sm" onclick={addGreeting}>
                  <Plus class="h-3.5 w-3.5 " /> Add
                </Button>
              </div>

              {#each alternateGreetings as greeting, i}
                <div class="relative">
                  <Textarea
                    bind:value={alternateGreetings[i]}
                    rows={3}
                    class="pr-10 font-mono text-sm"
                    placeholder={`Variation ${i + 1}...`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    class="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-destructive"
                    onclick={() => removeGreeting(i)}
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              {/each}

              {#if alternateGreetings.length === 0}
                <p
                  class="text-sm text-muted-foreground italic text-center py-4"
                >
                  No variations added.
                </p>
              {/if}
            </div>
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>

    <ResponsiveModal.Footer class="border-t bg-muted/40 px-6 py-4">
      <div class="flex w-full items-center justify-end gap-2">
        <Button variant="outline" onclick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onclick={handleSave} disabled={saving || !name.trim()}>
          {#if saving}
            <Loader2 class=" h-4 w-4 animate-spin" />
          {:else}
            <Save class=" h-4 w-4" />
          {/if}
          Save Changes
        </Button>
      </div>
    </ResponsiveModal.Footer>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

<!-- Character Import Modal -->
{#if showCharacterSelector}
  <ResponsiveModal.Root
    open={showCharacterSelector}
    onOpenChange={(open) => (showCharacterSelector = open)}
  >
    <ResponsiveModal.Content class="sm:max-w-md h-[500px] flex flex-col p-0">
      <ResponsiveModal.Header class="px-4 py-3 border-b">
        <h3 class="font-semibold">Import Character</h3>
      </ResponsiveModal.Header>

      <div class="p-4 border-b">
        <div class="relative">
          <Search
            class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
          />
          <Input
            bind:value={charSearchQuery}
            placeholder="Search characters..."
            class="pl-9"
            autoFocus
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-2">
        {#if filteredCharacters.length === 0}
          <div
            class="flex flex-col items-center justify-center h-full text-muted-foreground"
          >
            <Users class="h-8 w-8 mb-2 opacity-50" />
            <p>No characters found</p>
          </div>
        {:else}
          {#each filteredCharacters as char}
            <button
              class="w-full flex items-center gap-3 p-3 rounded-md hover:bg-muted text-left transition-colors"
              onclick={() => addNpcFromCharacter(char)}
            >
              <Avatar.Root class="h-10 w-10 border">
                <Avatar.Image
                  src={normalizeImageDataUrl(char.portrait) ?? ""}
                  class="object-cover"
                />
                <Avatar.Fallback><User class="h-5 w-5" /></Avatar.Fallback>
              </Avatar.Root>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{char.name}</div>
                <div class="text-xs text-muted-foreground truncate">
                  {char.traits.slice(0, 3).join(", ")}
                </div>
              </div>
              <Plus class="h-4 w-4 text-muted-foreground" />
            </button>
          {/each}
        {/if}
      </div>
    </ResponsiveModal.Content>
  </ResponsiveModal.Root>
{/if}
