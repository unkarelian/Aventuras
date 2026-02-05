<script lang="ts">
  import type { VaultScenario, VaultScenarioNpc, VaultCharacter } from '$lib/types'
  import { scenarioVault } from '$lib/stores/scenarioVault.svelte'
  import { characterVault } from '$lib/stores/characterVault.svelte'
  import {
    Save,
    Plus,
    Trash2,
    Users,
    MessageSquare,
    FileText,
    MapPin,
    ChevronRight,
    Search,
    Loader2,
    User,
  } from 'lucide-svelte'
  import TagInput from '$lib/components/tags/TagInput.svelte'
  import { normalizeImageDataUrl } from '$lib/utils/image'

  import * as ResponsiveModal from '$lib/components/ui/responsive-modal'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Label } from '$lib/components/ui/label'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Avatar from '$lib/components/ui/avatar'
  import * as Collapsible from '$lib/components/ui/collapsible'

  interface Props {
    scenario: VaultScenario
    onClose: () => void
  }

  let { scenario, onClose }: Props = $props()

  // Form State
  let name = $derived(scenario.name)
  let description = $derived(scenario.description || '')
  let settingSeed = $derived(scenario.settingSeed)
  let npcs = $derived<VaultScenarioNpc[]>(JSON.parse(JSON.stringify(scenario.npcs)))
  let firstMessage = $derived(scenario.firstMessage || '')
  let alternateGreetings = $derived<string[]>([...scenario.alternateGreetings])
  let tags = $derived<string[]>([...scenario.tags])

  let saving = $state(false)
  let error = $state<string | null>(null)

  let showCharacterSelector = $state(false)
  let charSearchQuery = $state('')

  // Tab state
  let activeTab = $state('general')

  const filteredCharacters = $derived.by(() => {
    if (!showCharacterSelector) return []
    let chars = characterVault.characters
    if (charSearchQuery.trim()) {
      const q = charSearchQuery.toLowerCase()
      chars = chars.filter((c) => c.name.toLowerCase().includes(q))
    }
    return chars
  })

  async function handleSave() {
    if (!name.trim()) {
      error = 'Scenario name is required'
      return
    }

    saving = true
    error = null

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
      })
      onClose()
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save scenario'
    } finally {
      saving = false
    }
  }

  function addNpc() {
    npcs.push({
      name: 'New NPC',
      role: 'Supporting Character',
      description: '',
      relationship: 'Neutral',
      traits: [],
    })
    npcs = npcs // Trigger reactivity
  }

  function removeNpc(index: number) {
    npcs = npcs.filter((_, i) => i !== index)
  }

  function addNpcFromCharacter(char: VaultCharacter) {
    npcs.push({
      name: char.name,
      role: 'Supporting Character',
      description: char.description || '',
      relationship: 'Neutral',
      traits: [...char.traits],
    })
    npcs = npcs
    showCharacterSelector = false
  }

  function addGreeting() {
    alternateGreetings = [...alternateGreetings, '']
  }

  function removeGreeting(index: number) {
    alternateGreetings = alternateGreetings.filter((_, i) => i !== index)
  }
</script>

<ResponsiveModal.Root
  open={true}
  onOpenChange={(open) => {
    if (!open) onClose()
  }}
>
  <ResponsiveModal.Content
    class="flex h-[95vh] flex-col overflow-hidden p-0 md:h-[85vh] md:max-w-4xl"
  >
    <ResponsiveModal.Header class="bg-muted/40 border-b px-6 py-4">
      <div class="flex items-center gap-3">
        <div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
          <MapPin class="text-primary h-5 w-5" />
        </div>
        <div>
          <h2 class="text-lg font-semibold">Edit Scenario</h2>
          <p class="text-muted-foreground text-sm">Modify your scenario settings and characters.</p>
        </div>
      </div>
    </ResponsiveModal.Header>

    <Tabs.Root
      value={activeTab}
      onValueChange={(v) => (activeTab = v)}
      class="flex flex-1 flex-col overflow-hidden"
    >
      <div class="bg-muted/20 border-b">
        <Tabs.List class="h-12 w-full justify-start bg-transparent p-0">
          <Tabs.Trigger
            value="general"
            class="data-[state=active]:border-primary h-full rounded-none px-4 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <FileText class="mr-2 h-4 w-4" />
            General
          </Tabs.Trigger>
          <Tabs.Trigger
            value="npcs"
            class="data-[state=active]:border-primary h-full rounded-none px-4 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <Users class="mr-2 h-4 w-4" />
            NPCs ({npcs.length})
          </Tabs.Trigger>
          <Tabs.Trigger
            value="opening"
            class="data-[state=active]:border-primary h-full rounded-none px-4 data-[state=active]:border-b-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            <MessageSquare class="mr-2 h-4 w-4" />
            Opening
          </Tabs.Trigger>
        </Tabs.List>
      </div>

      <div class="bg-background flex-1 overflow-y-auto">
        <div class="mx-auto max-w-3xl space-y-6 px-6 py-2">
          {#if error}
            <div
              class="bg-destructive/10 border-destructive/20 text-destructive flex items-center gap-2 rounded-md border p-3 text-sm"
            >
              <Loader2 class="h-4 w-4" />
              {error}
            </div>
          {/if}

          <Tabs.Content value="general" class="mt-0 space-y-6">
            <div class="space-y-4">
              <div class="space-y-2">
                <Label for="name">Scenario Name</Label>
                <Input id="name" bind:value={name} placeholder="e.g. The Cyberpunk City" />
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
                    class="min-h-[200px] resize-y font-mono text-sm leading-relaxed"
                    placeholder="Detailed world setting..."
                  />
                  <div
                    class="text-muted-foreground bg-background/80 absolute right-2 bottom-2 rounded px-2 py-0.5 text-xs"
                  >
                    Markdown supported
                  </div>
                </div>
                <p class="text-muted-foreground text-[0.8rem]">
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
              class="bg-background sticky top-0 z-10 mb-4 flex items-center justify-between border-b pt-2 pb-4"
            >
              <h3 class="text-muted-foreground text-sm font-medium">Supporting Characters</h3>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => {
                    charSearchQuery = ''
                    showCharacterSelector = true
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
                  class="text-muted-foreground bg-muted/30 flex flex-col items-center justify-center rounded-lg border border-dashed p-8"
                >
                  <Users class="mb-2 h-10 w-10 opacity-20" />
                  <p>No NPCs defined yet.</p>
                  <Button variant="link" onclick={addNpc}>Create your first NPC</Button>
                </div>
              {:else}
                {#each npcs as npc, i (i)}
                  <div class="bg-card text-card-foreground group rounded-lg border shadow-sm">
                    <Collapsible.Root>
                      <div class="flex items-center gap-3 p-3 pl-4">
                        <Collapsible.Trigger
                          class="group/trigger flex flex-1 items-center gap-2 text-left"
                        >
                          <div
                            class="bg-muted/50 group-hover/trigger:bg-muted flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                          >
                            <ChevronRight
                              class="h-4 w-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90"
                            />
                          </div>
                          <div class="flex-1">
                            <div class="text-sm font-medium">
                              {npc.name || 'Unnamed NPC'}
                            </div>
                            <div class="text-muted-foreground text-xs">
                              {npc.role || 'No role'}
                            </div>
                          </div>
                        </Collapsible.Trigger>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-muted-foreground hover:text-destructive h-8 w-8"
                          onclick={() => removeNpc(i)}
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </div>

                      <Collapsible.Content>
                        <div class="bg-muted/10 mt-2 space-y-4 border-t p-4 px-4 pt-0 pb-4">
                          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div class="space-y-2">
                              <Label class="text-xs">Relationship</Label>
                              <Input bind:value={npc.relationship} class="h-8" />
                            </div>
                            <div class="space-y-2">
                              <Label class="text-xs">Traits</Label>
                              <Input
                                value={npc.traits.join(', ')}
                                oninput={(e) =>
                                  (npc.traits = e.currentTarget.value
                                    .split(',')
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
              <p class="text-muted-foreground text-[0.8rem]">Shown when the story begins.</p>
            </div>

            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <Label>Alternate Greetings</Label>
                <Button variant="outline" size="sm" onclick={addGreeting}>
                  <Plus class="h-3.5 w-3.5 " /> Add
                </Button>
              </div>

              {#each alternateGreetings as _greeting, i (i)}
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
                    class="text-muted-foreground hover:text-destructive absolute top-2 right-2 h-6 w-6"
                    onclick={() => removeGreeting(i)}
                  >
                    <Trash2 class="h-3 w-3" />
                  </Button>
                </div>
              {/each}

              {#if alternateGreetings.length === 0}
                <p class="text-muted-foreground py-4 text-center text-sm italic">
                  No variations added.
                </p>
              {/if}
            </div>
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>

    <ResponsiveModal.Footer class="bg-muted/40 border-t px-6 py-4">
      <div class="flex w-full items-center justify-end gap-2">
        <Button variant="outline" onclick={onClose} disabled={saving}>Cancel</Button>
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
    <ResponsiveModal.Content class="flex h-[500px] flex-col p-0 sm:max-w-md">
      <ResponsiveModal.Header class="border-b px-4 py-3">
        <h3 class="font-semibold">Import Character</h3>
      </ResponsiveModal.Header>

      <div class="border-b p-4">
        <div class="relative">
          <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input bind:value={charSearchQuery} placeholder="Search characters..." class="pl-9" />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-2">
        {#if filteredCharacters.length === 0}
          <div class="text-muted-foreground flex h-full flex-col items-center justify-center">
            <Users class="mb-2 h-8 w-8 opacity-50" />
            <p>No characters found</p>
          </div>
        {:else}
          {#each filteredCharacters as char (char.id)}
            <button
              class="hover:bg-muted flex w-full items-center gap-3 rounded-md p-3 text-left transition-colors"
              onclick={() => addNpcFromCharacter(char)}
            >
              <Avatar.Root class="h-10 w-10 border">
                <Avatar.Image
                  src={normalizeImageDataUrl(char.portrait) ?? ''}
                  class="object-cover"
                />
                <Avatar.Fallback><User class="h-5 w-5" /></Avatar.Fallback>
              </Avatar.Root>
              <div class="min-w-0 flex-1">
                <div class="truncate font-medium">{char.name}</div>
                <div class="text-muted-foreground truncate text-xs">
                  {char.traits.slice(0, 3).join(', ')}
                </div>
              </div>
              <Plus class="text-muted-foreground h-4 w-4" />
            </button>
          {/each}
        {/if}
      </div>
    </ResponsiveModal.Content>
  </ResponsiveModal.Root>
{/if}
