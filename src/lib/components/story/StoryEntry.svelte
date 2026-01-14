<script lang="ts">
  import type { StoryEntry, EmbeddedImage } from '$lib/types';
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { User, BookOpen, Info, Pencil, Trash2, Check, X, RefreshCw, RotateCcw, Loader2, GitBranch, Bookmark, Volume2 } from 'lucide-svelte';
import { parseMarkdown } from '$lib/utils/markdown';
  import { sanitizeVisualProse } from '$lib/utils/htmlSanitize';
  import { replacePicTagsWithImages, type ImageReplacementInfo } from '$lib/utils/inlineImageParser';
  import { database } from '$lib/services/database';
  import { eventBus, type ImageReadyEvent, type TTSQueuedEvent } from '$lib/services/events';
  import { NanoGPTImageProvider } from '$lib/services/ai/nanoGPTImageProvider';
  import { ChutesImageProvider } from '$lib/services/ai/chutesImageProvider';
  import { promptService } from '$lib/services/prompts';
  import { onMount } from 'svelte';

  let { entry }: { entry: StoryEntry } = $props();

  // TTS generation state
  let isGeneratingTTS = $state(false);
  let isPlayingTTS = $state(false);
  let currentAudioElement: HTMLAudioElement | null = null;

  // Check if this entry is an error entry (either tracked or detected by content)
  const isErrorEntry = $derived(
    entry.type === 'system' && (
      ui.lastGenerationError?.errorEntryId === entry.id ||
      entry.content.toLowerCase().includes('generation failed') ||
      entry.content.toLowerCase().includes('failed to generate') ||
      entry.content.toLowerCase().includes('empty response')
    )
  );

// Check if Visual Prose mode is enabled for this story
  const visualProseMode = $derived(story.currentStory?.settings?.visualProseMode ?? false);

  // Check if Inline Image mode is enabled for this story
  const inlineImageMode = $derived(story.currentStory?.settings?.inlineImageMode ?? false);

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

  // Embedded images state
  let embeddedImages = $state<EmbeddedImage[]>([]);
  let expandedImageId = $state<string | null>(null);
  let clickedElement = $state<HTMLElement | null>(null);

// Branching state
  let isBranching = $state(false);
  let branchName = $state('');

  // Inline image edit state
  let isEditingImage = $state(false);
  let editingImageId = $state<string | null>(null);
  let editingImagePrompt = $state('');

  // Helper to get which branch a checkpoint belongs to (by checking its last entry's branchId)
  function getCheckpointBranchId(checkpoint: { entriesSnapshot: { id: string; branchId?: string | null }[]; lastEntryId: string }): string | null {
    const lastEntry = checkpoint.entriesSnapshot.find(e => e.id === checkpoint.lastEntryId);
    return lastEntry?.branchId ?? null;
  }

  // Check if this entry has an associated checkpoint (can be branched from)
  // Only show checkpoints that belong to the current branch to prevent incorrect branch lineage
  const currentBranchId = $derived(story.currentStory?.currentBranchId ?? null);
  const entryCheckpoint = $derived(
    story.checkpoints.find(cp =>
      cp.lastEntryId === entry.id && getCheckpointBranchId(cp) === currentBranchId
    )
  );
  const canBranch = $derived(!!entryCheckpoint);

  // Handle creating a branch from this entry
  async function handleCreateBranch() {
    if (!branchName.trim()) return;
    if (!entryCheckpoint) {
      alert('Cannot branch from this entry - no checkpoint available');
      return;
    }
    try {
      await story.createBranchFromCheckpoint(branchName.trim(), entry.id, entryCheckpoint.id);
      isBranching = false;
      branchName = '';
    } catch (error) {
      console.error('[StoryEntry] Failed to create branch:', error);
      alert(error instanceof Error ? error.message : 'Failed to create branch');
    }
  }

  function cancelBranch() {
    isBranching = false;
    branchName = '';
  }

  // Checkpoint creation state
  let isCreatingCheckpoint = $state(false);
  let checkpointName = $state('');

  // Check if this is the latest entry (checkpoints can only be created at the latest entry)
  const isLatestEntry = $derived(
    story.entries.length > 0 && story.entries[story.entries.length - 1].id === entry.id
  );

  // Can create checkpoint: latest entry, not a system entry, and no checkpoint exists yet
  const canCreateCheckpoint = $derived(
    isLatestEntry && entry.type !== 'system' && !entryCheckpoint
  );

  async function handleCreateCheckpoint() {
    if (!checkpointName.trim()) return;
    try {
      await story.createCheckpoint(checkpointName.trim());
      isCreatingCheckpoint = false;
      checkpointName = '';
    } catch (error) {
      console.error('[StoryEntry] Failed to create checkpoint:', error);
      alert(error instanceof Error ? error.message : 'Failed to create checkpoint');
    }
  }

  function cancelCheckpoint() {
    isCreatingCheckpoint = false;
    checkpointName = '';
  }

  // Load embedded images for narration entries
  async function loadEmbeddedImages() {
    if (entry.type !== 'narration') return;
    try {
      embeddedImages = await database.getEmbeddedImagesForEntry(entry.id);
    } catch (err) {
      console.error('[StoryEntry] Failed to load embedded images:', err);
    }
  }

  // Escape special regex characters
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Process content to wrap source text matches in clickable spans
  function processContentWithImages(content: string, images: EmbeddedImage[]): string {
    if (images.length === 0) return parseMarkdown(content);

    let processed = content;

    // Sort images by source text length (longest first) to avoid partial matches
    const sortedImages = [...images]
      .filter(img => img.status === 'complete' || img.status === 'generating' || img.status === 'pending')
      .sort((a, b) => b.sourceText.length - a.sourceText.length);

    // Track which portions of text have been marked
    const markers: { start: number; end: number; imageId: string; status: string }[] = [];

    for (const img of sortedImages) {
      // Case-insensitive search for the source text
      const regex = new RegExp(escapeRegex(img.sourceText), 'gi');
      let match;
      while ((match = regex.exec(processed)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        // Check if this overlaps with an existing marker
        const overlaps = markers.some(m =>
          (start >= m.start && start < m.end) ||
          (end > m.start && end <= m.end) ||
          (start <= m.start && end >= m.end)
        );

        if (!overlaps) {
          markers.push({ start, end, imageId: img.id, status: img.status });
        }
      }
    }

    // Sort markers by position (reverse order for replacement)
    markers.sort((a, b) => b.start - a.start);

    // Apply markers from end to start to preserve positions
    for (const marker of markers) {
      const originalText = processed.slice(marker.start, marker.end);
      const statusClass = marker.status === 'complete' ? 'complete' :
                          marker.status === 'generating' ? 'generating' : 'pending';
      const replacement = `<span class="embedded-image-link ${statusClass}" data-image-id="${marker.imageId}">${originalText}</span>`;
      processed = processed.slice(0, marker.start) + replacement + processed.slice(marker.end);
    }

    return parseMarkdown(processed);
  }

  // Process Visual Prose content with embedded images
  function processVisualProseWithImages(content: string, images: EmbeddedImage[], entryId: string): string {
    if (images.length === 0) return sanitizeVisualProse(content, entryId);

    let processed = content;

    // Sort images by source text length (longest first) to avoid partial matches
    const sortedImages = [...images]
      .filter(img => img.status === 'complete' || img.status === 'generating' || img.status === 'pending')
      .sort((a, b) => b.sourceText.length - a.sourceText.length);

    // Track which portions of text have been marked
    const markers: { start: number; end: number; imageId: string; status: string }[] = [];

    for (const img of sortedImages) {
      // Case-insensitive search for the source text
      const regex = new RegExp(escapeRegex(img.sourceText), 'gi');
      let match;
      while ((match = regex.exec(processed)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        // Check if this overlaps with an existing marker
        const overlaps = markers.some(m =>
          (start >= m.start && start < m.end) ||
          (end > m.start && end <= m.end) ||
          (start <= m.start && end >= m.end)
        );

        if (!overlaps) {
          markers.push({ start, end, imageId: img.id, status: img.status });
        }
      }
    }

    // Sort markers by position (reverse order for replacement)
    markers.sort((a, b) => b.start - a.start);

    // Apply markers from end to start to preserve positions
    for (const marker of markers) {
      const originalText = processed.slice(marker.start, marker.end);
      const statusClass = marker.status === 'complete' ? 'complete' :
                          marker.status === 'generating' ? 'generating' : 'pending';
      const replacement = `<span class="embedded-image-link ${statusClass}" data-image-id="${marker.imageId}">${originalText}</span>`;
      processed = processed.slice(0, marker.start) + replacement + processed.slice(marker.end);
    }

return sanitizeVisualProse(processed, entryId);
  }

  // Process content with inline <pic> tags - replaces tags with images
  function processContentWithInlineImages(content: string, images: EmbeddedImage[]): string {
    // Build map of original tag text -> image info for inline mode images
    const imageMap = new Map<string, ImageReplacementInfo>();
    
    const inlineImages = images.filter(img => img.generationMode === 'inline');
    
    for (const img of inlineImages) {
      imageMap.set(img.sourceText, {
        imageData: img.imageData,
        status: img.status,
        id: img.id,
        errorMessage: img.errorMessage,
      });
    }
    
    // Replace <pic> tags with actual images
    const processedContent = replacePicTagsWithImages(content, imageMap);
    
    // Parse markdown for any remaining content
    return parseMarkdown(processedContent);
  }

  // Process Visual Prose content with inline <pic> tags
  function processVisualProseWithInlineImages(content: string, images: EmbeddedImage[], entryId: string): string {
    // Build map of original tag text -> image info for inline mode images
    const imageMap = new Map<string, ImageReplacementInfo>();
    
    for (const img of images) {
      if (img.generationMode === 'inline') {
        imageMap.set(img.sourceText, {
          imageData: img.imageData,
          status: img.status,
          id: img.id,
          errorMessage: img.errorMessage,
        });
      }
    }
    
    // Replace <pic> tags with actual images first
    const processedContent = replacePicTagsWithImages(content, imageMap);
    
    // Then sanitize as Visual Prose
    return sanitizeVisualProse(processedContent, entryId);
  }

// Handle click on embedded image link
  function handleContentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    
    // Check for inline image action buttons
    const actionBtn = target.closest('.inline-image-btn') as HTMLElement | null;
    if (actionBtn) {
      event.preventDefault();
      event.stopPropagation();
      const action = actionBtn.getAttribute('data-action');
      const imageId = actionBtn.getAttribute('data-image-id');
      
      if (action && imageId) {
        handleInlineImageAction(action, imageId);
      }
      return;
    }
    
    // Check for embedded image link (analyzed mode)
    const imageLink = target.closest('.embedded-image-link') as HTMLElement | null;
    if (imageLink) {
      const imageId = imageLink.getAttribute('data-image-id');
      if (imageId) {
        // Toggle expanded state
        if (expandedImageId === imageId) {
          expandedImageId = null;
          clickedElement = null;
        } else {
          expandedImageId = imageId;
          clickedElement = imageLink;
        }
      }
    }
  }

  // Handle inline image actions (edit, regenerate)
  async function handleInlineImageAction(action: string, imageId: string) {
    const image = embeddedImages.find(img => img.id === imageId);
    if (!image) return;

    if (action === 'edit') {
      // Open edit modal with current prompt
      editingImageId = imageId;
      // Extract the original prompt from the stored prompt (remove style suffix)
      editingImagePrompt = image.prompt.split('. ').slice(0, -1).join('. ') || image.prompt;
      isEditingImage = true;
    } else if (action === 'regenerate') {
      // Regenerate with same prompt
      await regenerateInlineImage(imageId, image.prompt);
    }
  }

  // Regenerate an inline image with a new or existing prompt
  async function regenerateInlineImage(imageId: string, prompt: string) {
    const image = embeddedImages.find(img => img.id === imageId);
    if (!image) return;

    try {
      // Update status to generating
      await database.updateEmbeddedImage(imageId, { status: 'generating', errorMessage: undefined });
      
      // Reload images to show generating state
      await loadEmbeddedImages();

      // Get image settings
      const imageSettings = settings.systemServicesSettings.imageGeneration;
      const apiKey = imageSettings.imageProvider === 'chutes' 
        ? imageSettings.chutesApiKey 
        : imageSettings.nanoGptApiKey;

      if (!apiKey) {
        throw new Error('No API key configured');
      }

      // Create provider
      const provider = imageSettings.imageProvider === 'chutes'
        ? new ChutesImageProvider(apiKey, false)
        : new NanoGPTImageProvider(apiKey, false);

      // Generate new image
      const response = await provider.generateImage({
        prompt,
        model: image.model || imageSettings.model,
        size: imageSettings.size,
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      // Update with new image data
      await database.updateEmbeddedImage(imageId, {
        imageData: response.images[0].b64_json,
        prompt,
        status: 'complete',
      });

      // Reload to show new image
      await loadEmbeddedImages();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Regeneration failed';
      await database.updateEmbeddedImage(imageId, {
        status: 'failed',
        errorMessage,
      });
      await loadEmbeddedImages();
    }
  }

  // Handle edit modal submission
  async function handleEditImageSubmit() {
    if (!editingImageId || !editingImagePrompt.trim()) return;

    const image = embeddedImages.find(img => img.id === editingImageId);
    if (!image) return;

    // Get style prompt and append it
    const imageSettings = settings.systemServicesSettings.imageGeneration;
    const styleId = imageSettings.styleId;
    let stylePrompt = '';
    try {
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };
      stylePrompt = promptService.getPrompt(styleId, promptContext) || '';
    } catch {
      stylePrompt = 'Soft cel-shaded anime illustration.';
    }

    const fullPrompt = `${editingImagePrompt.trim()}. ${stylePrompt}`;

    // Close modal and regenerate
    isEditingImage = false;
    await regenerateInlineImage(editingImageId, fullPrompt);
    editingImageId = null;
    editingImagePrompt = '';
  }

  // Cancel edit modal
  function handleEditImageCancel() {
    isEditingImage = false;
    editingImageId = null;
    editingImagePrompt = '';
  }

  // Manage inline image display
  $effect(() => {
    // Clean up any existing inline image displays
    const existingDisplays = document.querySelectorAll('.inline-image-display');
    existingDisplays.forEach(el => el.remove());

    if (!expandedImageId || !clickedElement || !expandedImage) return;

    // Create the inline image container
    const container = document.createElement('div');
    container.className = 'inline-image-display';
    container.setAttribute('data-image-id', expandedImageId);

    // Build the HTML content based on image status
    let innerHtml = `
      <div class="inline-image-header">
        <div class="inline-image-title">
          <span class="inline-image-source">${expandedImage.sourceText}</span>
        </div>
        <button class="inline-image-close" aria-label="Close image">×</button>
      </div>
    `;

    if (expandedImage.status === 'complete' && expandedImage.imageData) {
      innerHtml += `<img src="data:image/png;base64,${expandedImage.imageData}" alt="${expandedImage.sourceText}" class="inline-image-content" />`;
    } else if (expandedImage.status === 'generating') {
      innerHtml += `<div class="inline-image-loading"><span class="spinner"></span><span>Generating image...</span></div>`;
    } else if (expandedImage.status === 'pending') {
      innerHtml += `<div class="inline-image-loading"><span>Image queued...</span></div>`;
    } else if (expandedImage.status === 'failed') {
      innerHtml += `<div class="inline-image-error"><span>Failed to generate image</span>${expandedImage.errorMessage ? `<span class="error-message">${expandedImage.errorMessage}</span>` : ''}</div>`;
    }

    container.innerHTML = innerHtml;

    // Add close button handler
    const closeBtn = container.querySelector('.inline-image-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        expandedImageId = null;
        clickedElement = null;
      });
    }

    // Insert after the clicked element's parent paragraph or directly after
    const paragraph = clickedElement.closest('p');
    if (paragraph) {
      paragraph.insertAdjacentElement('afterend', container);
    } else {
      clickedElement.insertAdjacentElement('afterend', container);
    }

    // Cleanup function
    return () => {
      container.remove();
    };
  });

  // Get the currently expanded image
  const expandedImage = $derived(
    expandedImageId ? embeddedImages.find(img => img.id === expandedImageId) : null
  );

  // Subscribe to ImageReady and TTS events
  onMount(() => {
    // Subscribe to ImageReady events to reload images when one completes
    const unsubImageReady = eventBus.subscribe<ImageReadyEvent>('ImageReady', (event) => {
      if (event.entryId === entry.id) {
        loadEmbeddedImages();
      }
    });

    // Subscribe to TTSQueued events to auto-play TTS when triggered from ActionInput
    const unsubTTSQueued = eventBus.subscribe<TTSQueuedEvent>('TTSQueued', (event) => {
      if (event.entryId === entry.id && entry.type === 'narration') {
        console.log('[StoryEntry] Received TTSQueued event, triggering auto-play', { entryId: entry.id });
        handleTTSToggle();
        loadEmbeddedImages();
      }
    });

    // Load images on mount if this is a narration entry
    if (entry.type === 'narration') {
      loadEmbeddedImages();
    }

    return () => {
      unsubImageReady();
      unsubTTSQueued();
    };
  });

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

    try {
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
    } catch (error) {
      console.error('[StoryEntry] Failed to save edit:', error);
      alert(error instanceof Error ? error.message : 'Failed to save edit');
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

  /**
   * Play TTS audio or stop if already playing.
   */
  async function handleTTSToggle() {
    // If audio is playing, stop it
    if (isPlayingTTS && currentAudioElement) {
      currentAudioElement.pause();
      isPlayingTTS = false;
      return;
    }

    const ttsSettings = settings.systemServicesSettings.tts;

    if (!ttsSettings.enabled) {
      alert('TTS is not enabled. Please enable it in settings.');
      return;
    }

    if (!ttsSettings.endpoint || !ttsSettings.apiKey) {
      alert('TTS is not properly configured. Please set the endpoint and API key in settings.');
      return;
    }

    isGeneratingTTS = true;

    try {
      // Stop any existing audio playback
      if (currentAudioElement) {
        currentAudioElement.pause();
        currentAudioElement = null;
        isPlayingTTS = false;
      }

      const response = await fetch(ttsSettings.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ttsSettings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ttsSettings.model || 'tts-1',
          input: entry.content,
          voice: ttsSettings.voice || 'alloy',
          speed: ttsSettings.speed || 1.0,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `TTS generation failed: ${response.statusText}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play audio
      currentAudioElement = new Audio(audioUrl);
      currentAudioElement.play();
      isPlayingTTS = true;

      // Handle audio end
      currentAudioElement.addEventListener('ended', () => {
        URL.revokeObjectURL(audioUrl);
        currentAudioElement = null;
        isPlayingTTS = false;
      });

      // Handle pause
      currentAudioElement.addEventListener('pause', () => {
        if (!currentAudioElement?.ended) {
          isPlayingTTS = false;
        }
      });
    } catch (error) {
      console.error('[StoryEntry] TTS generation failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate TTS');
    } finally {
      isGeneratingTTS = false;
    }
  }

  function cancelEdit() {
    isEditing = false;
    editContent = '';
  }

  async function confirmDelete() {
    try {
      await story.deleteEntry(entry.id);
      isDeleting = false;
    } catch (error) {
      console.error('[StoryEntry] Failed to delete entry:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete entry');
      isDeleting = false;
    }
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
      {#if !isEditing && !isDeleting && !isBranching && !isCreatingCheckpoint && entry.type !== 'system'}
        <div class="flex flex-col gap-1 sm:opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onclick={startEdit}
            class="rounded p-1.5 text-surface-400 hover:bg-surface-600 hover:text-surface-200 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Edit entry"
          >
            <Pencil class="h-3.5 w-3.5" />
          </button>
          <button
            onclick={handleTTSToggle}
            disabled={isGeneratingTTS}
            class="rounded p-1.5 text-surface-400 hover:bg-surface-600 hover:text-surface-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title={isPlayingTTS ? 'Stop narration' : 'Narrate'}
          >
            {#if isGeneratingTTS}
              <Loader2 class="h-3.5 w-3.5 animate-spin" />
            {:else if isPlayingTTS}
              <X class="h-3.5 w-3.5 text-red-400" />
            {:else}
              <Volume2 class="h-3.5 w-3.5" />
            {/if}
          </button>
          <button
            onclick={() => isDeleting = true}
            class="rounded p-1.5 text-surface-400 hover:bg-red-500/20 hover:text-red-400 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            title="Delete entry"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
          {#if canBranch}
            <button
              onclick={() => isBranching = true}
              class="rounded p-1.5 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="Branch from here (checkpoint available)"
            >
              <GitBranch class="h-3.5 w-3.5" />
            </button>
          {/if}
          {#if canCreateCheckpoint}
            <button
              onclick={() => isCreatingCheckpoint = true}
              class="rounded p-1.5 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 min-h-[32px] min-w-[32px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
              title="Create checkpoint here (for branching)"
            >
              <Bookmark class="h-3.5 w-3.5" />
            </button>
          {/if}
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
      {:else if isBranching}
        <div class="space-y-2">
          <p class="text-sm text-surface-300">Create a branch from this point:</p>
          <input
            type="text"
            class="input w-full text-sm"
            placeholder="Branch name..."
            bind:value={branchName}
            onkeydown={(e) => {
              if (e.key === 'Enter') handleCreateBranch();
              if (e.key === 'Escape') cancelBranch();
            }}
          />
          <div class="flex gap-2">
            <button
              onclick={handleCreateBranch}
              disabled={!branchName.trim()}
              class="btn flex items-center gap-1.5 text-sm bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 min-h-[40px] px-3"
            >
              <GitBranch class="h-4 w-4" />
              Create Branch
            </button>
            <button
              onclick={cancelBranch}
              class="btn btn-secondary flex items-center gap-1.5 text-sm min-h-[40px] px-3"
            >
              <X class="h-4 w-4" />
              Cancel
            </button>
          </div>
          <p class="text-xs text-surface-500">This will create a new timeline from this checkpoint.</p>
        </div>
      {:else if isCreatingCheckpoint}
        <div class="space-y-2">
          <p class="text-sm text-surface-300">Create a checkpoint at this point:</p>
          <input
            type="text"
            class="input w-full text-sm"
            placeholder="Checkpoint name..."
            bind:value={checkpointName}
            onkeydown={(e) => {
              if (e.key === 'Enter') handleCreateCheckpoint();
              if (e.key === 'Escape') cancelCheckpoint();
            }}
          />
          <div class="flex gap-2">
            <button
              onclick={handleCreateCheckpoint}
              disabled={!checkpointName.trim()}
              class="btn flex items-center gap-1.5 text-sm bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 min-h-[40px] px-3"
            >
              <Bookmark class="h-4 w-4" />
              Create Checkpoint
            </button>
            <button
              onclick={cancelCheckpoint}
              class="btn btn-secondary flex items-center gap-1.5 text-sm min-h-[40px] px-3"
            >
              <X class="h-4 w-4" />
              Cancel
            </button>
          </div>
          <p class="text-xs text-surface-500">Checkpoints save the current story state and allow branching from this point.</p>
        </div>
{:else}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="story-text prose-content" class:visual-prose-container={visualProseMode && entry.type === 'narration'} onclick={handleContentClick}>
          {#if entry.type === 'narration'}
            {#if visualProseMode && inlineImageMode}
              <!-- Both Visual Prose and Inline Image mode -->
              {@html processVisualProseWithInlineImages(entry.content, embeddedImages, entry.id)}
            {:else if visualProseMode}
              <!-- Visual Prose mode only -->
              {@html processVisualProseWithImages(entry.content, embeddedImages, entry.id)}
            {:else if inlineImageMode}
              <!-- Inline Image mode only -->
              {@html processContentWithInlineImages(entry.content, embeddedImages)}
            {:else}
              <!-- Standard mode with analyzed images -->
              {@html processContentWithImages(entry.content, embeddedImages)}
            {/if}
          {:else}
            {@html parseMarkdown(entry.content)}
          {/if}
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

{#if isEditingImage}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="inline-image-edit-overlay" onclick={handleEditImageCancel}>
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="inline-image-edit-modal" onclick={(e) => e.stopPropagation()}>
    <h3>Edit Image Prompt</h3>
    <textarea
      bind:value={editingImagePrompt}
      placeholder="Describe the image you want to generate..."
      onkeydown={(e) => {
        if (e.key === 'Escape') handleEditImageCancel();
      }}
    ></textarea>
    <div class="inline-image-edit-actions">
      <button class="cancel-btn" onclick={handleEditImageCancel}>Cancel</button>
      <button class="generate-btn" onclick={handleEditImageSubmit} disabled={!editingImagePrompt.trim()}>
        Generate
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  /* Embedded image link styles */
  :global(.embedded-image-link) {
    color: var(--accent-400);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
    transition: all 0.15s ease;
  }

  :global(.embedded-image-link:hover) {
    text-decoration-style: solid;
    filter: brightness(1.1);
  }

  :global(.embedded-image-link.generating) {
    color: var(--color-amber-400, #fbbf24);
    animation: pulse-glow 2s ease-in-out infinite;
  }

  :global(.embedded-image-link.pending) {
    color: var(--surface-400);
    text-decoration-style: dashed;
  }

  @keyframes pulse-glow {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* Inline image display styles */
  :global(.inline-image-display) {
    margin: 0.75rem 0;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--surface-600);
    background-color: var(--surface-800);
  }

  :global(.inline-image-header) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background-color: var(--surface-700);
  }

  :global(.inline-image-title) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--surface-300);
  }

  :global(.inline-image-source) {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.inline-image-close) {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    background: transparent;
    border: none;
    color: var(--surface-400);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  :global(.inline-image-close:hover) {
    background-color: var(--surface-600);
    color: var(--surface-200);
  }

  :global(.inline-image-content) {
    display: block;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
  }

  :global(.inline-image-loading) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--surface-400);
    font-size: 0.875rem;
  }

  :global(.inline-image-loading .spinner) {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--surface-600);
    border-top-color: var(--accent-400);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  :global(.inline-image-error) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--color-red-400, #f87171);
    font-size: 0.875rem;
  }

  :global(.inline-image-error .error-message) {
    font-size: 0.75rem;
    color: var(--surface-500);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
