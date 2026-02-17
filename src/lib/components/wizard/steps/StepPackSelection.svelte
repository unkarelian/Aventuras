<script lang="ts">
  import * as Select from '$lib/components/ui/select'
  import { Input } from '$lib/components/ui/input'
  import { Textarea } from '$lib/components/ui/textarea'
  import { Switch } from '$lib/components/ui/switch'
  import { Label } from '$lib/components/ui/label'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { Badge } from '$lib/components/ui/badge'
  import type { PresetPack, CustomVariable } from '$lib/services/packs/types'

  interface Props {
    availablePacks: PresetPack[]
    selectedPackId: string
    packVariables: CustomVariable[]
    variableValues: Record<string, string>
    onSelectPack: (packId: string) => void
    onVariableChange: (variableName: string, value: string) => void
  }

  let {
    availablePacks,
    selectedPackId,
    packVariables,
    variableValues,
    onSelectPack,
    onVariableChange,
  }: Props = $props()

  const selectedPack = $derived(availablePacks.find((p) => p.id === selectedPackId))
  const hasMultiplePacks = $derived(availablePacks.length > 1)
  const hasVariables = $derived(packVariables.length > 0)
</script>

<div class="space-y-6">
  <div>
    <h3 class="text-lg font-semibold">Prompt Pack</h3>
    <p class="text-muted-foreground text-sm">
      Choose which prompt templates to use for this story.
    </p>
  </div>

  <!-- Pack Dropdown (only shown when multiple packs exist) -->
  {#if hasMultiplePacks}
    <div class="space-y-2">
      <Label>Pack</Label>
      <Select.Root
        type="single"
        value={selectedPackId}
        onValueChange={(v) => { if (v) onSelectPack(v) }}
      >
        <Select.Trigger class="w-full">
          {selectedPack?.name ?? 'Select a pack'}
        </Select.Trigger>
        <Select.Content>
          {#each availablePacks as pack (pack.id)}
            <Select.Item value={pack.id} label={pack.name}>
              <div class="flex items-center gap-2">
                {pack.name}
                {#if pack.isDefault}
                  <Badge variant="secondary" class="text-xs">Default</Badge>
                {/if}
              </div>
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      {#if selectedPack?.description}
        <p class="text-muted-foreground text-xs italic">{selectedPack.description}</p>
      {/if}
    </div>
  {/if}

  <!-- Placeholder message when only default pack with no variables -->
  {#if !hasMultiplePacks && !hasVariables}
    <div class="bg-muted/50 rounded-lg border p-4">
      <p class="text-muted-foreground text-sm">
        Using the default prompt pack. Custom packs with configurable variables can be created in the Vault.
      </p>
    </div>
  {/if}

  <!-- Variable Inputs -->
  {#if hasVariables}
    <div class="space-y-3">
      <div>
        <h4 class="text-sm font-medium">Custom Variables</h4>
        <p class="text-muted-foreground text-xs">
          Configure values for this story's prompt templates.
        </p>
      </div>

      <ScrollArea class="max-h-[400px]">
        <div class="space-y-4 pr-3 pb-4">
          {#each packVariables as variable (variable.id)}
            <div class="space-y-1.5">
              <Label for="var-{variable.variableName}">{variable.displayName}</Label>
              {#if variable.description}
                <p class="text-muted-foreground text-xs italic">{variable.description}</p>
              {/if}

              {#if variable.variableType === 'text'}
                <Input
                  id="var-{variable.variableName}"
                  value={variableValues[variable.variableName] ?? ''}
                  oninput={(e) => onVariableChange(variable.variableName, e.currentTarget.value)}
                  placeholder={variable.displayName}
                />
              {:else if variable.variableType === 'textarea'}
                <Textarea
                  id="var-{variable.variableName}"
                  rows={3}
                  value={variableValues[variable.variableName] ?? ''}
                  oninput={(e) => onVariableChange(variable.variableName, e.currentTarget.value)}
                  placeholder={variable.displayName}
                />
              {:else if variable.variableType === 'number'}
                <Input
                  id="var-{variable.variableName}"
                  type="number"
                  value={variableValues[variable.variableName] ?? ''}
                  oninput={(e) => onVariableChange(variable.variableName, e.currentTarget.value)}
                  placeholder="0"
                />
              {:else if variable.variableType === 'boolean'}
                <Switch
                  id="var-{variable.variableName}"
                  checked={variableValues[variable.variableName] === 'true'}
                  onCheckedChange={(v) => onVariableChange(variable.variableName, v ? 'true' : 'false')}
                />
              {:else if variable.variableType === 'enum' && variable.enumOptions}
                <Select.Root
                  type="single"
                  value={variableValues[variable.variableName] ?? ''}
                  onValueChange={(v) => { if (v !== undefined) onVariableChange(variable.variableName, v) }}
                >
                  <Select.Trigger class="w-full">
                    {variable.enumOptions.find((o) => o.value === variableValues[variable.variableName])?.label ?? 'Select...'}
                  </Select.Trigger>
                  <Select.Content>
                    {#each variable.enumOptions as opt (opt.value)}
                      {#if opt.value}
                        <Select.Item value={opt.value} label={opt.label || opt.value}>
                          {opt.label || opt.value}
                        </Select.Item>
                      {/if}
                    {/each}
                  </Select.Content>
                </Select.Root>
              {/if}
            </div>
          {/each}
        </div>
      </ScrollArea>
    </div>
  {/if}
</div>
