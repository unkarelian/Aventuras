<script lang="ts">
  import type { CustomVariable } from '$lib/services/packs/types'
  import { createIsMobile } from '$lib/hooks/is-mobile.svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Drawer from '$lib/components/ui/drawer'
  import * as Select from '$lib/components/ui/select'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Switch } from '$lib/components/ui/switch'
  import { Badge } from '$lib/components/ui/badge'
  import { RotateCcw } from 'lucide-svelte'

  interface Props {
    open: boolean
    customVariables: CustomVariable[]
    testValues: Record<string, string>
    onOpenChange: (open: boolean) => void
    onTestValuesChange: (values: Record<string, string>) => void
  }

  let { open, customVariables, testValues, onOpenChange, onTestValuesChange }: Props = $props()

  const isMobile = createIsMobile()

  // Local draft that initializes from testValues when modal opens
  let draft = $state<Record<string, string>>({})

  // Sync draft from testValues when modal opens
  $effect(() => {
    if (open) {
      draft = { ...testValues }
    }
  })

  function updateDraft(variableName: string, value: string) {
    draft = { ...draft, [variableName]: value }
  }

  function handleResetDefaults() {
    const reset: Record<string, string> = {}
    for (const v of customVariables) {
      reset[v.variableName] = v.defaultValue ?? ''
    }
    draft = reset
  }

  function handleApply() {
    onTestValuesChange(draft)
    onOpenChange(false)
  }
</script>

{#snippet formContent()}
  {#if customVariables.length === 0}
    <div class="flex items-center justify-center py-8">
      <p class="text-muted-foreground text-sm">This pack has no custom variables.</p>
    </div>
  {:else}
    <div class="space-y-4">
      {#each customVariables as variable (variable.id)}
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <Label for="test-{variable.variableName}">{variable.displayName}</Label>
            <Badge variant="outline" class="font-mono text-[10px]">{variable.variableName}</Badge>
          </div>
          {#if variable.description}
            <p class="text-muted-foreground text-xs">{variable.description}</p>
          {/if}

          {#if variable.variableType === 'text'}
            <Input
              id="test-{variable.variableName}"
              value={draft[variable.variableName] ?? variable.defaultValue ?? ''}
              oninput={(e) => updateDraft(variable.variableName, e.currentTarget.value)}
              placeholder={variable.displayName}
            />
          {:else if variable.variableType === 'number'}
            <Input
              id="test-{variable.variableName}"
              type="number"
              value={draft[variable.variableName] ?? variable.defaultValue ?? ''}
              oninput={(e) => updateDraft(variable.variableName, e.currentTarget.value)}
              placeholder="0"
            />
          {:else if variable.variableType === 'boolean'}
            <Switch
              id="test-{variable.variableName}"
              checked={(draft[variable.variableName] ?? variable.defaultValue ?? 'false') === 'true'}
              onCheckedChange={(v) => updateDraft(variable.variableName, v ? 'true' : 'false')}
            />
          {:else if variable.variableType === 'enum'}
            <Select.Root
              type="single"
              value={draft[variable.variableName] ?? variable.defaultValue ?? ''}
              onValueChange={(v) => updateDraft(variable.variableName, v)}
            >
              <Select.Trigger class="h-9 w-full">
                {#if draft[variable.variableName]}
                  {variable.enumOptions?.find((o) => o.value === draft[variable.variableName])?.label ?? draft[variable.variableName]}
                {:else}
                  Select a value
                {/if}
              </Select.Trigger>
              <Select.Content>
                {#each variable.enumOptions ?? [] as opt (opt.value)}
                  <Select.Item value={opt.value} label={opt.label || opt.value}>
                    {opt.label || opt.value}
                  </Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          {:else if variable.variableType === 'textarea'}
            <Textarea
              id="test-{variable.variableName}"
              value={draft[variable.variableName] ?? variable.defaultValue ?? ''}
              oninput={(e) => updateDraft(variable.variableName, e.currentTarget.value)}
              rows={3}
              placeholder={variable.displayName}
            />
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet footerContent()}
  <div class="flex items-center justify-between gap-2">
    <Button variant="outline" size="sm" class="gap-1.5" onclick={handleResetDefaults}>
      <RotateCcw class="h-3.5 w-3.5" />
      Reset to Defaults
    </Button>
    <div class="flex gap-2">
      <Button variant="outline" size="sm" onclick={() => onOpenChange(false)}>Cancel</Button>
      <Button size="sm" onclick={handleApply}>Apply</Button>
    </div>
  </div>
{/snippet}

{#if isMobile.current}
  <Drawer.Root
    open={open}
    onOpenChange={onOpenChange}
  >
    <Drawer.Content class="max-h-[85vh]">
      <Drawer.Header>
        <Drawer.Title>Test Variables</Drawer.Title>
        <Drawer.Description>Set values to test how your templates render.</Drawer.Description>
      </Drawer.Header>
      <div class="overflow-y-auto px-4 pb-2">
        {@render formContent()}
      </div>
      <Drawer.Footer>
        {@render footerContent()}
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Dialog.Root {open} {onOpenChange}>
    <Dialog.Content class="sm:max-w-lg">
      <Dialog.Header>
        <Dialog.Title>Test Variables</Dialog.Title>
        <Dialog.Description>Set values to test how your templates render.</Dialog.Description>
      </Dialog.Header>
      <div class="max-h-[60vh] overflow-y-auto py-4">
        {@render formContent()}
      </div>
      <Dialog.Footer>
        {@render footerContent()}
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}
