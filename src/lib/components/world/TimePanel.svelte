<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { Pencil, RotateCcw } from 'lucide-svelte';

  let isEditing = $state(false);
  let editYears = $state(0);
  let editDays = $state(0);
  let editHours = $state(0);
  let editMinutes = $state(0);

  function startEdit() {
    const time = story.timeTracker;
    editYears = time.years;
    editDays = time.days;
    editHours = time.hours;
    editMinutes = time.minutes;
    isEditing = true;
  }

  function cancelEdit() {
    isEditing = false;
  }

  async function saveEdit() {
    await story.setTimeTracker({
      years: Math.max(0, Number(editYears) || 0),
      days: Math.max(0, Number(editDays) || 0),
      hours: Math.max(0, Number(editHours) || 0),
      minutes: Math.max(0, Number(editMinutes) || 0),
    });
    isEditing = false;
  }

  async function resetTime() {
    const confirmed = await new Promise<boolean>((resolve) => {
      const result = confirm('Reset time to zero? This cannot be undone.');
      resolve(result);
    });
    if (!confirmed) return;
    await story.setTimeTracker({ years: 0, days: 0, hours: 0, minutes: 0 });
  }

  // Helper to pad numbers for display
  function pad(n: number, width: number = 2): string {
    return n.toString().padStart(width, '0');
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="font-medium text-surface-200">Time</h3>
    {#if !isEditing}
      <div class="flex items-center gap-1">
        <button
          class="sm:btn-ghost rounded p-1"
          onclick={startEdit}
          title="Edit time"
        >
          <Pencil class="h-4 w-4" />
        </button>
        <button
          class="sm:btn-ghost rounded p-1"
          onclick={resetTime}
          title="Reset time"
        >
          <RotateCcw class="h-4 w-4" />
        </button>
      </div>
    {/if}
  </div>

  {#if isEditing}
    <div class="card space-y-3">
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="mb-1 block text-xs text-surface-400">Years</label>
          <input
            type="number"
            bind:value={editYears}
            min="0"
            class="input text-sm"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-surface-400">Days</label>
          <input
            type="number"
            bind:value={editDays}
            min="0"
            max="364"
            class="input text-sm"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-surface-400">Hours</label>
          <input
            type="number"
            bind:value={editHours}
            min="0"
            max="23"
            class="input text-sm"
          />
        </div>
        <div>
          <label class="mb-1 block text-xs text-surface-400">Minutes</label>
          <input
            type="number"
            bind:value={editMinutes}
            min="0"
            max="59"
            class="input text-sm"
          />
        </div>
      </div>
      <p class="text-xs text-surface-500">
        Time will be automatically normalized (60 min = 1 hour, etc.)
      </p>
      <div class="flex justify-end gap-2">
        <button class="btn btn-secondary text-xs" onclick={cancelEdit}>
          Cancel
        </button>
        <button class="btn btn-primary text-xs" onclick={saveEdit}>
          Save
        </button>
      </div>
    </div>
  {:else}
    <div class="card p-4">
      <!-- Detailed time display -->
      <div class="grid grid-cols-4 gap-2 text-center">
        <div class="rounded bg-surface-700/50 p-2">
          <div class="text-lg font-medium text-surface-100">{story.timeTracker.years}</div>
          <div class="text-xs text-surface-500">Years</div>
        </div>
        <div class="rounded bg-surface-700/50 p-2">
          <div class="text-lg font-medium text-surface-100">{story.timeTracker.days}</div>
          <div class="text-xs text-surface-500">Days</div>
        </div>
        <div class="rounded bg-surface-700/50 p-2">
          <div class="text-lg font-medium text-surface-100">{pad(story.timeTracker.hours)}</div>
          <div class="text-xs text-surface-500">Hours</div>
        </div>
        <div class="rounded bg-surface-700/50 p-2">
          <div class="text-lg font-medium text-surface-100">{pad(story.timeTracker.minutes)}</div>
          <div class="text-xs text-surface-500">Min.</div>
        </div>
      </div>
    </div>

    <p class="text-xs text-surface-500">
      Time is tracked automatically as the story progresses. You can also edit it manually.
    </p>
  {/if}
</div>
