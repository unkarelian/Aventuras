<script lang="ts">
  import { story } from "$lib/stores/story.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { Sword, MessageCircle, Search, MapPin, Loader2 } from "lucide-svelte";
  import type { ActionChoice } from "$lib/services/ai/actionChoices";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils/cn";

  // Icon mapping for choice types
  const typeIcons = {
    action: Sword,
    dialogue: MessageCircle,
    examine: Search,
    move: MapPin,
  };

  // Style classes for choice types
  const typeStyles = {
    action: "border-l-red-500/50 hover:border-l-red-400",
    dialogue: "border-l-blue-500/50 hover:border-l-blue-400",
    examine: "border-l-yellow-500/50 hover:border-l-yellow-400",
    move: "border-l-green-500/50 hover:border-l-green-400",
  };

  function handleChoiceClick(choice: ActionChoice) {
    // Set the pending action choice - ActionInput will pick this up and submit
    ui.setPendingActionChoice(choice.text, story.currentStory?.id);
  }

  // Key bindings for quick selection (1-4)
  function handleKeydown(event: KeyboardEvent) {
    if (ui.actionChoices.length === 0) return;

    const target = (event.target ??
      document.activeElement) as HTMLElement | null;
    if (
      target &&
      (target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable)
    ) {
      return;
    }

    const keyNum = parseInt(event.key);
    if (keyNum >= 1 && keyNum <= ui.actionChoices.length) {
      event.preventDefault();
      handleChoiceClick(ui.actionChoices[keyNum - 1]);
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if ui.actionChoicesLoading}
  <div
    class="flex items-center justify-center gap-2 py-4 text-muted-foreground"
  >
    <Loader2 class="h-4 w-4 animate-spin" />
    <span class="text-sm">Generating options...</span>
  </div>
{:else if ui.actionChoices.length > 0}
  <div class="mt-3 sm:mt-4 space-y-2 rounded-lg border border-border border-l-4 border-l-muted-foreground/20 bg-card p-3 sm:p-4 shadow-sm">
    <div
      class="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide mb-2"
    >
      <span>What do you do?</span>
      <span class="text-muted-foreground/60 hidden sm:inline"
        >(Press 1-{ui.actionChoices.length} to quick select)</span
      >
    </div>

    {#each ui.actionChoices as choice, index}
      {@const Icon = typeIcons[choice.type]}
      <Button
        variant="secondary"
        class={cn(
          "w-full justify-start h-auto py-3 px-3 sm:px-4 flex space-x-1 relative overflow-hidden transition-all duration-150 group min-h-13",
          "border border-border/40 border-l-4 rounded-l-none",
          "bg-secondary/30 hover:bg-secondary/60",
          typeStyles[choice.type],
        )}
        onclick={() => handleChoiceClick(choice)}
      >
        <span
          class="flex items-center justify-center w-6 h-6 rounded bg-background/50 text-muted-foreground
                     group-hover:bg-background group-hover:text-foreground text-sm font-mono shrink-0"
        >
          {index + 1}
        </span>
        <Icon
          class="h-4 w-4 text-muted-foreground group-hover:text-foreground shrink-0"
        />
        <span
          class="text-foreground text-sm sm:text-base text-left wrap-break-word whitespace-normal line-clamp-2"
        >
          {choice.text}
        </span>
      </Button>
    {/each}
  </div>
{/if}
