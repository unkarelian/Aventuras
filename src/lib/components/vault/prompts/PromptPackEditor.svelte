<script lang="ts">
  import type { FullPack } from '$lib/services/packs/types'
  import { packService } from '$lib/services/packs/pack-service'
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'
  import TemplateGroupList from './TemplateGroupList.svelte'
  import TemplateEditor from './TemplateEditor.svelte'
  import VariableManager from './VariableManager.svelte'
  import VariablePalette from './VariablePalette.svelte'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Drawer from '$lib/components/ui/drawer'
  import * as Tabs from '$lib/components/ui/tabs'
  import { ChevronLeft, Menu, Save, Undo2, RotateCcw } from 'lucide-svelte'

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

  // Editor tab state
  let editorActiveTab = $state<'system' | 'user'>('system')
  let editorHasUserContent = $state(false)

  // Dirty guard state
  let isEditorDirty = $state(false)
  let showDirtyDialog = $state(false)
  let pendingAction = $state<(() => void) | null>(null)
  let editorRef = $state<TemplateEditor | null>(null)

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

  async function refreshPack() {
    try {
      fullPack = await packService.getFullPack(packId)
    } catch (error) {
      console.error('[PromptPackEditor] Failed to refresh pack:', error)
    }
  }

  /**
   * Guard wrapper: if editor is dirty, show dialog instead of executing action.
   * If clean, execute immediately.
   */
  function guardDirty(action: () => void) {
    if (isEditorDirty) {
      pendingAction = action
      showDirtyDialog = true
    } else {
      action()
    }
  }

  function handleSelectTemplate(templateId: string) {
    if (templateId === selectedTemplateId) return
    guardDirty(() => {
      showVariables = false
      selectedTemplateId = templateId
      isEditorDirty = false
      drawerOpen = false
    })
  }

  function handleToggleVariables() {
    guardDirty(() => {
      showVariables = !showVariables
      if (showVariables) {
        selectedTemplateId = null
      }
      isEditorDirty = false
      drawerOpen = false
    })
  }

  function handleBack() {
    guardDirty(() => {
      onClose()
    })
  }

  function handleDirtyChange(dirty: boolean) {
    isEditorDirty = dirty
  }

  // Dirty dialog actions
  async function handleSaveAndSwitch() {
    if (editorRef) {
      await editorRef.save()
    }
    isEditorDirty = false
    showDirtyDialog = false
    pendingAction?.()
    pendingAction = null
  }

  function handleDiscardAndSwitch() {
    if (editorRef) {
      editorRef.discard()
    }
    isEditorDirty = false
    showDirtyDialog = false
    pendingAction?.()
    pendingAction = null
  }

  function handleCancelSwitch() {
    showDirtyDialog = false
    pendingAction = null
  }
</script>

<div class="flex h-full flex-col">
  <!-- Header Bar -->
  <div class="flex items-center gap-3 border-b px-4 py-3">
    <Button
      variant="ghost"
      size="sm"
      class="text-muted-foreground hover:text-foreground -ml-2 gap-1"
      onclick={handleBack}
    >
      <ChevronLeft class="h-4 w-4" />
    </Button>

    {#if loading}
      <Skeleton class="h-5 w-32" />
    {:else if fullPack}
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold">{fullPack.pack.name}</h2>
        {#if fullPack.pack.isDefault}
          <Badge variant="default">Default</Badge>
        {/if}
        {#if isEditorDirty}
          <Badge variant="outline" class="border-yellow-500/50 text-yellow-500 text-xs"
            >Unsaved</Badge
          >
        {/if}
      </div>
    {/if}

    <div class="ml-auto flex items-center gap-1">
      {#if selectedTemplateId && editorRef}
        {#if editorHasUserContent}
          <Tabs.Root
            value={editorActiveTab}
            onValueChange={(v) => {
              if (v) editorActiveTab = v as 'system' | 'user'
            }}
          >
            <Tabs.List class="h-8">
              <Tabs.Trigger value="system" class="text-xs">System Prompt</Tabs.Trigger>
              <Tabs.Trigger value="user" class="text-xs">User Message</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        {/if}

        <VariablePalette
          customVariables={fullPack?.variables ?? []}
          onInsert={(name) => editorRef?.insertVariable(name)}
        />

        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1 text-xs"
          disabled={!isEditorDirty}
          onclick={() => editorRef?.save()}
        >
          <Save class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Save</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1 text-xs"
          disabled={!isEditorDirty}
          onclick={() => editorRef?.discard()}
        >
          <Undo2 class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Discard</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="h-8 gap-1 text-xs"
          onclick={() => editorRef?.reset()}
        >
          <RotateCcw class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Reset</span>
        </Button>
      {/if}

      <!-- Mobile menu button -->
      {#if isMobile.current}
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={() => (drawerOpen = true)}
        >
          <Menu class="h-4 w-4" />
        </Button>
      {/if}
    </div>
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
      <div class="flex flex-1 overflow-hidden">
        {#if showVariables}
          <div class="flex-1 overflow-hidden">
            <VariableManager
              {packId}
              variables={fullPack?.variables ?? []}
              onVariablesChanged={refreshPack}
            />
          </div>
        {:else if selectedTemplateId}
          <div class="flex-1 overflow-hidden">
            <TemplateEditor
              bind:this={editorRef}
              {packId}
              templateId={selectedTemplateId}
              customVariables={fullPack.variables}
              activeTab={editorActiveTab}
              onDirtyChange={handleDirtyChange}
              onActiveTabChange={(tab) => (editorActiveTab = tab)}
              onHasUserContent={(has) => (editorHasUserContent = has)}
            />
          </div>
        {:else}
          <div class="flex flex-1 items-center justify-center">
            <div class="text-muted-foreground text-center">
              <p class="text-sm">Select a template to edit</p>
            </div>
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

<!-- Dirty guard dialog -->
<Dialog.Root bind:open={showDirtyDialog}>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Unsaved Changes</Dialog.Title>
      <Dialog.Description>
        You have unsaved changes. What would you like to do?
      </Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer class="flex gap-2 sm:justify-end">
      <Button variant="outline" onclick={handleCancelSwitch}>Cancel</Button>
      <Button variant="secondary" onclick={handleDiscardAndSwitch}>Discard</Button>
      <Button onclick={handleSaveAndSwitch}>Save & Continue</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
