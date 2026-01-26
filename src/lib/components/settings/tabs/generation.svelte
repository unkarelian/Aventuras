<script lang="ts">
  import MainNarrative from "../MainNarrative.svelte";
  import AgentProfiles from "../AgentProfiles.svelte";
  import type { ProviderInfo } from "$lib/services/ai/types";

  interface Props {
    providerOptions: ProviderInfo[];
    onOpenManualBodyEditor: (title: string, value: string, onSave: (v: string) => void) => void;
  }

  let { providerOptions, onOpenManualBodyEditor }: Props = $props();
</script>

<div class="space-y-6">
  <MainNarrative
    {providerOptions}
    onOpenManualBodyEditor={onOpenManualBodyEditor}
  />
  <AgentProfiles {providerOptions} />
</div>
