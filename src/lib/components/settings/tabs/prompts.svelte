<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte'
  import { PROMPT_TEMPLATES } from '$lib/services/prompts'
  import { promptExportService } from '$lib/services/promptExport'
  import { RotateCcw, Download, Upload, Loader2, X, Check } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as Accordion from '$lib/components/ui/accordion'
  import { Badge } from '$lib/components/ui/badge'
  import { Textarea } from '$lib/components/ui/textarea'

  interface Props {
    openImportModal: () => void
  }

  let { openImportModal }: Props = $props()

  // Prompts tab state
  let promptsCategory = $state<'story' | 'service' | 'wizard' | 'image-style'>('story')
  let isExporting = $state(false)
  let confirmingCategoryReset = $state(false)

  // Get all templates grouped by category
  const allTemplates = PROMPT_TEMPLATES
  const storyTemplates = $derived(allTemplates.filter((t) => t.category === 'story'))
  const serviceTemplates = $derived(allTemplates.filter((t) => t.category === 'service'))
  const wizardTemplates = $derived(allTemplates.filter((t) => t.category === 'wizard'))
  const imageStyleTemplates = $derived(allTemplates.filter((t) => t.category === 'image-style'))

  // Get templates for current category
  function getTemplatesForCategory() {
    if (promptsCategory === 'story') return storyTemplates
    if (promptsCategory === 'service') return serviceTemplates
    if (promptsCategory === 'image-style') return imageStyleTemplates
    return wizardTemplates
  }

  // Get current template content (with overrides)
  function getTemplateContent(templateId: string): string {
    const override = settings.promptSettings.templateOverrides.find(
      (o) => o.templateId === templateId,
    )
    if (override) return override.content
    const template = allTemplates.find((t) => t.id === templateId)
    return template?.content ?? ''
  }

  // Get current user content (with overrides)
  function getUserContent(templateId: string): string | undefined {
    const template = allTemplates.find((t) => t.id === templateId)
    if (!template?.userContent) return undefined

    const override = settings.promptSettings.templateOverrides.find(
      (o) => o.templateId === `${templateId}-user`,
    )
    if (override) return override.content
    return template.userContent
  }

  // Check if template is modified
  function isTemplateModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some((o) => o.templateId === templateId)
  }

  // Check if user content is modified
  function isUserContentModified(templateId: string): boolean {
    return settings.promptSettings.templateOverrides.some(
      (o) => o.templateId === `${templateId}-user`,
    )
  }

  // Handle template content change
  function handleTemplateChange(templateId: string, content: string) {
    settings.setTemplateOverride(templateId, content)
  }

  // Handle user content change
  function handleUserContentChange(templateId: string, content: string) {
    settings.setTemplateOverride(`${templateId}-user`, content)
  }

  // Handle template reset
  function handleTemplateReset(templateId: string) {
    settings.removeTemplateOverride(templateId)
  }

  // Handle user content reset
  function handleUserContentReset(templateId: string) {
    settings.removeTemplateOverride(`${templateId}-user`)
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
        <div class="animate-in fade-in slide-in-from-right-2 flex items-center gap-2 duration-200">
          <span class="text-muted-foreground hidden text-xs font-medium sm:inline">
            Reset all in category?
          </span>
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground hover:text-foreground h-8 w-8 p-0 hover:bg-transparent"
            onclick={() => (confirmingCategoryReset = false)}
            title="Cancel"
          >
            <X class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-destructive h-8 w-8 p-0 hover:bg-transparent"
            onclick={() => {
              getTemplatesForCategory().forEach((t) => {
                handleTemplateReset(t.id)
                handleUserContentReset(t.id)
              })
              confirmingCategoryReset = false
            }}
            title="Confirm Reset"
          >
            <Check class="h-4 w-4" />
          </Button>
        </div>
      {:else}
        <Button variant="destructive" size="sm" onclick={() => (confirmingCategoryReset = true)}>
          <RotateCcw class="h-4 w-4" />
          <span class="hidden leading-snug sm:inline">Reset Category</span>
        </Button>
      {/if}
      <Button
        variant="outline"
        size="sm"
        onclick={async () => {
          isExporting = true
          try {
            await promptExportService.exportPrompts()
          } finally {
            isExporting = false
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
    onValueChange={(v) => (promptsCategory = v as 'story' | 'service' | 'wizard' | 'image-style')}
  >
    <Tabs.List class="grid w-full grid-cols-4">
      <Tabs.Trigger value="story">Story</Tabs.Trigger>
      <Tabs.Trigger value="service">Services</Tabs.Trigger>
      <Tabs.Trigger value="wizard">Wizard</Tabs.Trigger>
      <Tabs.Trigger value="image-style">Image Styles</Tabs.Trigger>
    </Tabs.List>

    <!-- Templates List (Accordion) -->
    <Tabs.Content value={promptsCategory} class="mt-4">
      <Accordion.Root type="single" class="w-full space-y-2">
        {#each getTemplatesForCategory() as template (template.id)}
          <Accordion.Item value={template.id} class="bg-card rounded-lg border px-3 shadow-sm">
            <Accordion.Trigger class="py-3 hover:no-underline">
              <div class="flex items-center gap-2 text-left">
                <span class="font-medium">{template.name}</span>
                {#if isTemplateModified(template.id)}
                  <Badge
                    variant="outline"
                    class="h-5 border-amber-500/50 text-[10px] text-amber-500"
                  >
                    Modified
                  </Badge>
                {/if}
              </div>
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="flex flex-col gap-4 pt-0 pb-4">
                <p class="text-muted-foreground text-base">{template.description}</p>

                <!-- System Prompt -->
                <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between">
                    <span class="text-muted-foreground text-xs font-medium">System Prompt</span>
                    {#if isTemplateModified(template.id)}
                      <Button
                        variant="ghost"
                        size="icon"
                        class="text-muted-foreground h-6 w-6 hover:text-red-500"
                        title="Reset to default"
                        onclick={() => handleTemplateReset(template.id)}
                      >
                        <RotateCcw class="h-3 w-3" />
                      </Button>
                    {/if}
                  </div>
                  <Textarea
                    value={getTemplateContent(template.id)}
                    oninput={(e) =>
                      handleTemplateChange(template.id, (e.target as HTMLTextAreaElement).value)}
                    class="max-h-[400px] min-h-[200px] font-mono text-sm"
                    placeholder="Enter system prompt content..."
                  />
                </div>

                <!-- User Message (if applicable) -->
                {#if template.userContent !== undefined && template.userContent.length > 0}
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                      <span class="text-muted-foreground text-xs font-medium">User Message</span>
                      {#if isUserContentModified(template.id)}
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-muted-foreground h-6 w-6 hover:text-red-500"
                          title="Reset to default"
                          onclick={() => handleUserContentReset(template.id)}
                        >
                          <RotateCcw class="h-3 w-3" />
                        </Button>
                      {/if}
                    </div>
                    <Textarea
                      value={getUserContent(template.id) ?? ''}
                      oninput={(e) =>
                        handleUserContentChange(
                          template.id,
                          (e.target as HTMLTextAreaElement).value,
                        )}
                      class="max-h-[300px] min-h-[150px] font-mono text-sm"
                      placeholder="Enter user message content..."
                    />
                  </div>
                {/if}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>
