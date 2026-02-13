<script lang="ts">
  import type { FullPack } from '$lib/services/packs/types'
  import { packService } from '$lib/services/packs/pack-service'
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'
  import TemplateGroupList from './TemplateGroupList.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import * as Drawer from '$lib/components/ui/drawer'
  import { ChevronLeft, Menu } from 'lucide-svelte'

  interface Props {
    packId: string
    onClose: () => void
  }

  let { packId, onClose }: Props = $props()

  let selectedTemplateId = $state<string | null>(null)
  let showVariables = $state(false)
  let fullPack = $state<FullPack | null>(null)
  let loading = $state(true)
  let drawerOpen = $state(false)

  const isMobile = createIsMobile()

  $effect(() => {
    loadPack()
  })

  async function loadPack() {
    loading = true
    try {
      fullPack = await packService.getFullPack(packId)
    } catch (error) {
      console.error('[PromptPackEditor] Failed to load pack:', error)
    } finally {
      loading = false
    }
  }

  function handleSelectTemplate(templateId: string) {
    showVariables = false
    selectedTemplateId = templateId
    drawerOpen = false
  }

  function handleToggleVariables() {
    showVariables = !showVariables
    if (showVariables) {
      selectedTemplateId = null
    }
    drawerOpen = false
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header Bar -->
  <div class="flex items-center gap-3 border-b px-4 py-3">
    <Button
      variant="ghost"
      size="sm"
      class="text-muted-foreground hover:text-foreground -ml-2 gap-1"
      onclick={onClose}
    >
      <ChevronLeft class="h-4 w-4" />
      <span class="hidden sm:inline">Back to Packs</span>
      <span class="sm:hidden">Back</span>
    </Button>

    {#if loading}
      <Skeleton class="h-5 w-32" />
    {:else if fullPack}
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold">{fullPack.pack.name}</h2>
        {#if fullPack.pack.isDefault}
          <Badge variant="default">Default</Badge>
        {/if}
      </div>
    {/if}

    <!-- Mobile menu button -->
    {#if isMobile.current}
      <Button
        variant="outline"
        size="icon"
        class="ml-auto h-8 w-8"
        onclick={() => (drawerOpen = true)}
      >
        <Menu class="h-4 w-4" />
      </Button>
    {/if}
  </div>

  <!-- Main Content -->
  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="space-y-3 text-center">
        <Skeleton class="mx-auto h-6 w-48" />
        <Skeleton class="mx-auto h-4 w-32" />
      </div>
    </div>
  {:else if fullPack}
    <div class="flex flex-1 overflow-hidden">
      <!-- Left Panel (desktop only) -->
      {#if !isMobile.current}
        <div class="w-64 shrink-0 overflow-hidden border-r">
          <TemplateGroupList
            {packId}
            {selectedTemplateId}
            {showVariables}
            onSelectTemplate={handleSelectTemplate}
            onToggleVariables={handleToggleVariables}
          />
        </div>
      {/if}

      <!-- Right Panel -->
      <div class="flex flex-1 items-center justify-center overflow-hidden">
        {#if showVariables}
          <div class="text-muted-foreground text-center">
            <p class="text-sm">Variable Manager -- coming in Plan 05</p>
          </div>
        {:else if selectedTemplateId}
          <div class="text-muted-foreground text-center">
            <p class="text-sm">Editor for {selectedTemplateId} -- coming in Plan 04</p>
          </div>
        {:else}
          <div class="text-muted-foreground text-center">
            <p class="text-sm">Select a template to edit</p>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-muted-foreground text-sm">Pack not found</p>
    </div>
  {/if}
</div>

<!-- Mobile Drawer for template navigation -->
{#if isMobile.current}
  <Drawer.Root bind:open={drawerOpen}>
    <Drawer.Content class="h-[70vh]">
      <Drawer.Header>
        <Drawer.Title>Templates</Drawer.Title>
      </Drawer.Header>
      <div class="flex-1 overflow-hidden">
        <TemplateGroupList
          {packId}
          {selectedTemplateId}
          {showVariables}
          onSelectTemplate={handleSelectTemplate}
          onToggleVariables={handleToggleVariables}
        />
      </div>
    </Drawer.Content>
  </Drawer.Root>
{/if}
