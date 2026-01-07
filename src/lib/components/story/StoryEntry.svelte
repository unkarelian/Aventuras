<script lang="ts">
  import type { StoryEntry } from '$lib/types';
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { User, BookOpen, Info, Pencil, Trash2, Check, X, RefreshCw, RotateCcw } from 'lucide-svelte';
  import { parseMarkdown } from '$lib/utils/markdown';

  let { entry }: { entry: StoryEntry } = $props();

  // Check if this entry is an error entry (either tracked or detected by content)
  const isErrorEntry = $derived(
    entry.type === 'system' && (
      ui.lastGenerationError?.errorEntryId === entry.id ||
      entry.content.toLowerCase().includes('generation failed') ||
      entry.content.toLowerCase().includes('failed to generate') ||
      entry.content.toLowerCase().includes('empty response')
    )
  );

  // Check if this is the latest narration entry (for retry button)
  const isLatestNarration = $derived.by(() => {
    if (entry.type !== 'narration') return false;
    const narrations = story.entries.filter(e => e.type === 'narration');
    if (narrations.length === 0) return false;
    return narrations[narrations.length - 1].id === entry.id;
  });

  // Check if retry is available for this entry
  const canRetry = $derived(
    isLatestNarration &&
    ui.retryBackup &&
    story.currentStory &&
    ui.retryBackup.storyId === story.currentStory.id &&
    !ui.isGenerating &&
    !ui.lastGenerationError
  );

  /**
   * Retry generation for this error entry.
   * For tracked errors, uses the UI callback. For legacy errors, finds the previous user action.
   */
  async function handleRetryFromEntry() {
    console.log('[StoryEntry] handleRetryFromEntry called', { entryId: entry.id, isGenerating: ui.isGenerating });

    if (ui.isGenerating) {
      console.log('[StoryEntry] Already generating, returning');
      return;
    }

    // If this is the currently tracked error, use the standard retry
    if (ui.lastGenerationError?.errorEntryId === entry.id) {
      console.log('[StoryEntry] Using tracked error retry');
      await ui.triggerRetry();
      return;
    }

    // For legacy/untracked errors, find the previous user action and set up retry
    console.log('[StoryEntry] Legacy error, finding previous user action');
    const entryIndex = story.entries.findIndex(e => e.id === entry.id);
    if (entryIndex <= 0) {
      console.log('[StoryEntry] Entry not found or is first entry');
      return;
    }

    // Find the most recent user action before this error
    let userActionEntry = null;
    for (let i = entryIndex - 1; i >= 0; i--) {
      if (story.entries[i].type === 'user_action') {
        userActionEntry = story.entries[i];
        break;
      }
    }

    if (!userActionEntry) {
      console.log('[StoryEntry] No user action found before error');
      return;
    }

    console.log('[StoryEntry] Found user action', { userActionId: userActionEntry.id });

    // Set up the error state so the retry callback can handle it
    ui.setGenerationError({
      message: entry.content,
      errorEntryId: entry.id,
      userActionEntryId: userActionEntry.id,
      timestamp: Date.now(),
    });

    console.log('[StoryEntry] Error state set, triggering retry');
    // Trigger the retry
    await ui.triggerRetry();
    console.log('[StoryEntry] Retry complete');
  }

  let isEditing = $state(false);
  let editContent = $state('');
  let isDeleting = $state(false);

  const icons = {
    user_action: User,
    narration: BookOpen,
    system: Info,
    retry: BookOpen,
  };

  const styles = {
    user_action: 'border-l-accent-500 bg-accent-500/5',
    narration: 'border-l-surface-600 bg-surface-800/50',
    system: 'border-l-surface-500 bg-surface-800/30 italic text-surface-400',
    retry: 'border-l-amber-500 bg-amber-500/5',
  };

  const Icon = $derived(icons[entry.type]);

  function startEdit() {
    editContent = entry.content;
    isEditing = true;
  }

  async function saveEdit() {
    const newContent = editContent.trim();
    if (!newContent || newContent === entry.content) {
      isEditing = false;
      return;
    }

    // Check if this is the last user_action entry
    const isLastUserAction = entry.type === 'user_action' && isLastUserActionEntry();

    if (isLastUserAction && ui.retryBackup && story.currentStory && ui.retryBackup.storyId === story.currentStory.id) {
      // Update the backup with the new content and trigger retry
      console.log('[StoryEntry] Editing last user action, triggering retry with new content');
      ui.updateRetryBackupContent(newContent);
      isEditing = false;
      await ui.triggerRetryLastMessage();
    } else {
      // Normal edit - just update the entry
      await story.updateEntry(entry.id, newContent);
      isEditing = false;
    }
  }

  /**
   * Check if this entry is the last user_action in the story.
   */
  function isLastUserActionEntry(): boolean {
    // Find all user_action entries
    const userActions = story.entries.filter(e => e.type === 'user_action');
    if (userActions.length === 0) return false;

    // Check if this entry is the last one
    const lastUserAction = userActions[userActions.length - 1];
    return lastUserAction.id === entry.id;
  }

  function cancelEdit() {
    isEditing = false;
    editContent = '';
  }

  async function confirmDelete() {
    await story.deleteEntry(entry.id);
    isDeleting = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      cancelEdit();
    } else if (event.key === 'Enter' && event.ctrlKey) {
      saveEdit();
    }
  }
</script>

<div class="group rounded-lg border-l-4 p-3 sm:p-4 {styles[entry.type]}">
  <div class="flex items-start gap-3">
    <div class="flex flex-col items-center gap-1">
      <div class="rounded-full bg-surface-700 p-1.5">
        <Icon class="h-4 w-4 text-surface-400" />
      </div>
      <!-- Edit/Delete buttons below icon (always visible on mobile, hover on desktop) -->
      {#if !isEditing && !isDeleting && entry.type !== 'system'}
        <div class="flex flex-col gap-1 sm:opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onclick={startEdit}
            class="rounded p-1.5 text-surface-400 hover:bg-surface-600 hover:text-surface-200 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Edit entry"
          >
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <button
            onclick={() => isDeleting = true}
            class="rounded p-1.5 text-surface-400 hover:bg-red-500/20 hover:text-red-400 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Delete entry"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      {/if}
    </div>
    <div class="flex-1">
      {#if entry.type === 'user_action'}
        <p class="user-action mb-1 text-sm font-medium">You</p>
      {/if}

      {#if isEditing}
        <div class="space-y-2">
          <textarea
            bind:value={editContent}
            onkeydown={handleKeydown}
            class="input min-h-[100px] w-full resize-y text-base"
            rows="4"
          ></textarea>
          <div class="flex gap-2">
            <button
              onclick={saveEdit}
              class="btn btn-primary flex items-center gap-1.5 text-sm min-h-[40px] px-3"
            >
              <Check class="h-4 w-4" />
              Save
            </button>
            <button
              onclick={cancelEdit}
              class="btn btn-secondary flex items-center gap-1.5 text-sm min-h-[40px] px-3"
            >
              <X class="h-4 w-4" />
              Cancel
            </button>
          </div>
          <p class="text-xs text-surface-500 hidden sm:block">Ctrl+Enter to save, Esc to cancel</p>
        </div>
      {:else if isDeleting}
        <div class="space-y-2">
          <p class="text-sm text-surface-300">Delete this entry?</p>
          <div class="flex gap-2">
            <button
              onclick={confirmDelete}
              class="btn flex items-center gap-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 min-h-[40px] px-3"
            >
              <Trash2 class="h-4 w-4" />
              Delete
            </button>
            <button
              onclick={() => isDeleting = false}
              class="btn btn-secondary flex items-center gap-1.5 text-sm min-h-[40px] px-3"
            >
              <X class="h-4 w-4" />
              Cancel
            </button>
          </div>
        </div>
      {:else}
        <div class="story-text prose-content">
          {@html parseMarkdown(entry.content)}
        </div>
        {#if isErrorEntry}
          <button
            onclick={handleRetryFromEntry}
            disabled={ui.isGenerating}
            class="mt-3 btn flex items-center gap-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
          >
            <RefreshCw class="h-4 w-4" />
            Retry
          </button>
        {/if}
        {#if canRetry}
          <button
            onclick={() => ui.triggerRetryLastMessage()}
            class="mt-3 btn flex items-center gap-1.5 text-sm bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
            title="Generate a different response"
          >
            <RotateCcw class="h-4 w-4" />
            Retry
          </button>
        {/if}
        {#if entry.metadata?.tokenCount}
          <p class="mt-2 text-xs text-surface-500">
            {entry.metadata.tokenCount} tokens
          </p>
        {/if}
      {/if}
    </div>
  </div>
</div>
