<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { slide } from 'svelte/transition';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Slider } from '$lib/components/ui/slider';
  import { Label } from '$lib/components/ui/label';
  import { ToggleGroup, ToggleGroupItem } from '$lib/components/ui/toggle-group';

  const threshold = $derived(story.memoryConfig.tokenThreshold);
  const bufferMessages = $derived(story.memoryConfig.chapterBuffer);

  // Local state for editing
  let localThreshold = $state(threshold);
  let localBuffer = $state(bufferMessages);

  // Sync local state when props change
  $effect(() => {
    localThreshold = threshold;
  });

  $effect(() => {
    localBuffer = bufferMessages;
  });

  // Debounced save
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  function scheduleThresholdSave(value: number) {
    localThreshold = value;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      story.updateMemoryConfig({ tokenThreshold: value });
    }, 500);
  }

  function scheduleBufferSave(value: number) {
    localBuffer = value;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      story.updateMemoryConfig({ chapterBuffer: value });
    }, 500);
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }

  // Threshold presets
  const thresholdPresets = [
    { label: '8K', value: 8000 },
    { label: '16K', value: 16000 },
    { label: '24K', value: 24000 },
    { label: '32K', value: 32000 },
    { label: '48K', value: 48000 },
  ];
</script>

{#if ui.memorySettingsOpen}
  <div transition:slide={{ duration: 200 }}>
    <Card class="mt-4">
      <CardContent class="p-4 space-y-4">
        <h3 class="text-sm font-medium text-foreground">Memory Settings</h3>

        <!-- Token Threshold -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label for="token-threshold" class="text-muted-foreground">Token Threshold</Label>
            <span class="text-sm font-medium text-foreground">{formatNumber(localThreshold)}</span>
          </div>
          
          <Slider 
            id="token-threshold"
            value={[localThreshold]}
            min={4000}
            max={100000}
            step={1000}
            onValueChange={(vals) => scheduleThresholdSave(vals[0])}
          />
          
          <ToggleGroup type="single" value={localThreshold.toString()} onValueChange={(val) => val && scheduleThresholdSave(parseInt(val))} class="justify-start flex-wrap">
            {#each thresholdPresets as preset}
              <ToggleGroupItem value={preset.value.toString()} size="sm" class="h-7 px-2 text-xs">
                {preset.label}
              </ToggleGroupItem>
            {/each}
          </ToggleGroup>
          
          <p class="text-xs text-muted-foreground">
            Auto-summarization triggers when token count exceeds this threshold.
          </p>
        </div>

        <!-- Buffer Messages -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label for="buffer-messages" class="text-muted-foreground">Buffer Messages</Label>
            <span class="text-sm font-medium text-foreground">{localBuffer}</span>
          </div>
          
          <Slider 
            id="buffer-messages"
            value={[localBuffer]}
            min={0}
            max={50}
            step={1}
            onValueChange={(vals) => scheduleBufferSave(vals[0])}
          />

          <p class="text-xs text-muted-foreground">
            Recent messages protected from being included in chapter summaries.
            Higher values keep more context visible but create smaller chapters.
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
{/if}

