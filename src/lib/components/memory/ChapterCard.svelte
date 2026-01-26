<script lang="ts">
  import type { Chapter, StoryEntry, TimeTracker } from '$lib/types';
  import { ui } from '$lib/stores/ui.svelte';
  import { story } from '$lib/stores/story.svelte';
  import ChapterEntryList from './ChapterEntryList.svelte';
  import {
    ChevronDown,
    ChevronRight,
    Edit2,
    RefreshCw,
    Trash2,
    Users,
    MapPin,
    Theater,
    Clock,
    Save,
    X,
  } from 'lucide-svelte';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Badge } from '$lib/components/ui/badge';
  import { Separator } from '$lib/components/ui/separator';
  import { cn } from '$lib/utils/cn';

  interface Props {
    chapter: Chapter;
    entries: StoryEntry[];
    onResummarize?: (chapter: Chapter) => void;
  }

  let { chapter, entries, onResummarize }: Props = $props();

  const isExpanded = $derived(ui.memoryExpandedChapterId === chapter.id);
  const isEditing = $derived(ui.memoryEditingChapterId === chapter.id);

  let editedSummary = $state(chapter.summary);

  // Reset edit state when chapter changes
  $effect(() => {
    editedSummary = chapter.summary;
  });

  // Format time for display (compact version)
  function formatTime(time: TimeTracker | null): string {
    if (!time) return '';
    const parts: string[] = [];
    if (time.years > 0) parts.push(`Y${time.years}`);
    if (time.days > 0) parts.push(`D${time.days}`);
    const hour = time.hours.toString().padStart(2, '0');
    const minute = time.minutes.toString().padStart(2, '0');
    parts.push(`${hour}:${minute}`);
    return parts.join(' ');
  }

  // Format time range for display
  const timeRangeDisplay = $derived.by(() => {
    if (!chapter.startTime && !chapter.endTime) return null;
    const start = formatTime(chapter.startTime);
    const end = formatTime(chapter.endTime);
    if (start && end && start !== end) {
      return `${start} → ${end}`;
    }
    return start || end || null;
  });

  function toggleExpand() {
    ui.toggleChapterExpanded(chapter.id);
  }

  function startEdit() {
    editedSummary = chapter.summary;
    ui.setMemoryEditingChapter(chapter.id);
  }

  function cancelEdit() {
    editedSummary = chapter.summary;
    ui.setMemoryEditingChapter(null);
  }

  async function saveEdit() {
    if (editedSummary !== chapter.summary) {
      await story.updateChapterSummary(chapter.id, editedSummary);
    }
    ui.setMemoryEditingChapter(null);
  }

  function handleResummarize() {
    if (onResummarize) {
      onResummarize(chapter);
    } else {
      ui.openResummarizeModal(chapter.id);
    }
  }

  async function handleDelete() {
    const confirmed = await ask(
      `Are you sure you want to delete Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}? The story entries will remain, but the summary will be lost.`,
      {
        title: 'Delete Chapter',
        kind: 'warning',
      }
    );
    if (confirmed) {
      await story.deleteChapter(chapter.id);
    }
  }
</script>

<Card class="overflow-hidden">
  <div class="p-3 flex items-start justify-between gap-2 border-b">
    <div class="flex-1 min-w-0">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span class="text-sm font-medium text-foreground shrink-0">
          Chapter {chapter.number}
        </span>
        {#if chapter.title}
          <span class="text-sm text-muted-foreground hidden sm:inline">—</span>
          <span class="text-sm text-primary truncate max-w-[150px] sm:max-w-none">{chapter.title}</span>
        {/if}
      </div>
    </div>

    <!-- Action Buttons -->
    {#if !isEditing}
      <div class="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={startEdit}
          title="Edit summary"
        >
          <Edit2 class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={handleResummarize}
          title="Regenerate summary"
          disabled={ui.memoryLoading}
        >
          <RefreshCw class={cn("h-3.5 w-3.5", ui.memoryLoading && ui.resummarizeChapterId === chapter.id && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-muted-foreground hover:text-red-500"
          onclick={handleDelete}
          title="Delete chapter"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </Button>
      </div>
    {:else}
      <div class="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 text-green-500 hover:text-green-600"
          onclick={saveEdit}
          title="Save changes"
        >
          <Save class="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          onclick={cancelEdit}
          title="Cancel"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
    {/if}
  </div>

  <CardContent class="p-0">
    <!-- Summary -->
    <div class="px-3 py-3">
      {#if isEditing}
        <Textarea
          bind:value={editedSummary}
          class="min-h-[80px] text-sm resize-y"
          rows={4}
        />
      {:else}
        <div class="p-2 rounded bg-muted/30 text-sm text-muted-foreground leading-relaxed">
          {chapter.summary}
        </div>
      {/if}
    </div>

    <!-- Metadata Row -->
    <div class="px-3 pb-3 flex items-center justify-between gap-2 flex-wrap">
      <div class="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {#if timeRangeDisplay}
          <Badge variant="outline" class="flex items-center gap-1 px-1.5 h-5 font-normal text-xs">
            <Clock class="h-3 w-3" />
            <span>{timeRangeDisplay}</span>
          </Badge>
        {/if}
        {#if chapter.emotionalTone}
          <Badge variant="outline" class="flex items-center gap-1 px-1.5 h-5 font-normal text-xs">
            <Theater class="h-3 w-3" />
            <span>{chapter.emotionalTone}</span>
          </Badge>
        {/if}
        {#if chapter.characters && chapter.characters.length > 0}
          <Badge variant="outline" class="flex items-center gap-1 px-1.5 h-5 font-normal text-xs">
            <Users class="h-3 w-3" />
            <span>{chapter.characters.length}</span>
          </Badge>
        {/if}
        {#if chapter.locations && chapter.locations.length > 0}
          <Badge variant="outline" class="flex items-center gap-1 px-1.5 h-5 font-normal text-xs">
            <MapPin class="h-3 w-3" />
            <span>{chapter.locations.length}</span>
          </Badge>
        {/if}
      </div>

      <!-- Expand Button -->
      <Button
        variant="ghost"
        size="sm"
        class="h-6 text-xs text-muted-foreground hover:text-foreground gap-1 px-2"
        onclick={toggleExpand}
      >
        {#if isExpanded}
          <ChevronDown class="h-3.5 w-3.5" />
        {:else}
          <ChevronRight class="h-3.5 w-3.5" />
        {/if}
        <span>{entries.length} entries</span>
      </Button>
    </div>

    <!-- Entry List (Collapsible) -->
    {#if entries.length > 0 && isExpanded}
      <div class="border-t">
        <ChapterEntryList {entries} expanded={isExpanded} />
      </div>
    {/if}
  </CardContent>
</Card>

