<script lang="ts">
  import { Sword, Feather } from "lucide-svelte";
  import * as Card from "$lib/components/ui/card";
  import type { StoryMode } from "../wizardTypes";

  interface Props {
    selectedMode: StoryMode;
    onModeChange: (mode: StoryMode) => void;
  }

  let { selectedMode, onModeChange }: Props = $props();
</script>

<div class="space-y-4">
  <p class="text-muted-foreground">
    How do you want to experience your story?
  </p>
  <div class="grid gap-4 sm:grid-cols-2">
    <!-- Adventure Mode -->
    <button
      class="text-left w-full focus:outline-none group"
      onclick={() => onModeChange("adventure")}
    >
      <Card.Root 
        class="h-full transition-all duration-200 border-border hover:border-primary hover:shadow-md hover:shadow-primary/5 {selectedMode === 'adventure' ? 'ring-2 ring-primary border-primary' : ''}"
      >
        <Card.Header>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-primary/10 p-3">
              <Sword class="h-6 w-6 text-primary" />
            </div>
            <Card.Title>Adventure Mode</Card.Title>
          </div>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            <strong>You are the protagonist.</strong> Explore the world, interact
            with characters, and make choices that shape your story. The AI narrates
            the consequences of your actions.
          </p>
        </Card.Content>
      </Card.Root>
    </button>

    <!-- Creative Writing Mode -->
    <button
      class="text-left w-full focus:outline-none group"
      onclick={() => onModeChange("creative-writing")}
    >
      <Card.Root 
        class="h-full transition-all duration-200 border-border hover:border-primary hover:shadow-md hover:shadow-primary/5 {selectedMode === 'creative-writing' ? 'ring-2 ring-primary border-primary' : ''}"
      >
        <Card.Header>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-primary/10 p-3">
              <Feather class="h-6 w-6 text-primary" />
            </div>
            <Card.Title>Creative Writing</Card.Title>
          </div>
        </Card.Header>
        <Card.Content>
          <p class="text-sm text-muted-foreground">
            <strong>You are the author.</strong> Direct the story and craft the
            narrative. The AI collaborates with you to write prose following
            your creative vision.
          </p>
        </Card.Content>
      </Card.Root>
    </button>
  </div>
</div>
