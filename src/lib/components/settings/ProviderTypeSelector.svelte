<script lang="ts">
  import type { ProviderType } from "$lib/types";
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";

  interface Props {
    value: ProviderType;
    onchange: (value: ProviderType) => void;
    label?: string;
  }

  let { value, onchange, label = "Provider" }: Props = $props();

  const providers: Array<{
    value: ProviderType;
    label: string;
    description: string;
    disabled?: boolean;
  }> = [
    {
      value: "openrouter",
      label: "OpenRouter",
      description: "Access 100+ models from one API",
    },
    {
      value: "openai",
      label: "OpenAI (or compatible)",
      description: "GPT, Azure, NIM, local LLMs, or any OpenAI-compatible API",
    },
    {
      value: "anthropic",
      label: "Anthropic",
      description: "Claude models",
    },
    {
      value: "google",
      label: "Google AI",
      description: "Gemini models (coming soon)",
      disabled: true,
    },
  ];

  function handleChange(newValue: string | undefined) {
    if (newValue && newValue !== value) {
      onchange(newValue as ProviderType);
    }
  }

  // Find current provider for display
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
        <Select.Item
          value={provider.value}
          disabled={provider.disabled}
          label={provider.label}
        >
          <div class="flex flex-col py-1">
            <span class="font-medium">{provider.label}</span>
            <span class="text-xs text-muted-foreground"
              >{provider.description}</span
            >
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
