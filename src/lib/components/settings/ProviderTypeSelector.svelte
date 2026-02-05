<script lang="ts">
  import type { ProviderType } from "$lib/types";
  import { getProviderList } from "$lib/services/ai/sdk/providers/config";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";

  interface Props {
    value: ProviderType;
    onchange: (value: ProviderType) => void;
    label?: string;
  }

  let { value, onchange, label = "Provider" }: Props = $props();

  const providers = getProviderList();

  function handleChange(newValue: string | undefined) {
    if (newValue && newValue !== value) {
      onchange(newValue as ProviderType);
    }
  }

  let currentProvider = $derived(providers.find((p) => p.value === value));
</script>

<div class="space-y-2">
  {#if label}
    <Label>{label}</Label>
  {/if}
  <Select.Root type="single" {value} onValueChange={handleChange}>
    <Select.Trigger class="w-full">
      {#if currentProvider}
        <span>{currentProvider.label}</span>
      {:else}
        <span class="text-muted-foreground">Select provider</span>
      {/if}
    </Select.Trigger>
    <Select.Content>
      {#each providers as provider}
        <Select.Item value={provider.value} label={provider.label}>
          <div class="flex flex-col py-1">
            <span class="font-medium">{provider.label}</span>
            <span class="text-xs text-muted-foreground">{provider.description}</span>
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
