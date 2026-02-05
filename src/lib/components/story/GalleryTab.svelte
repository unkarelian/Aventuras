<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { database } from '$lib/services/database';
  import { imageExportService } from '$lib/services/imageExport';
  import { retryImageGeneration } from '$lib/services/ai/image';
  import type { EmbeddedImage } from '$lib/types';
  import { Download, ImageIcon, AlertCircle, X, RefreshCw, ChevronLeft, ChevronRight, Pencil, RotateCcw } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as ResponsiveModal from '$lib/components/ui/responsive-modal';

  const SWIPE_THRESHOLD = 50;

  let images = $state<EmbeddedImage[]>([]);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let isRegenerating = $state(false);

  let selectedImageIds = $state<Set<string>>(new Set());
  let selectAllChecked = $state(false);

  let lightboxOpen = $state(false);
  let lightboxImageIndex = $state(0);
  let touchStartX = $state(0);
  let touchEndX = $state(0);

  function resetSelection() {
    selectedImageIds = new Set();
    selectAllChecked = false;
  }

  function closeGallery() {
    ui.activePanel = 'story';
  }

  async function refreshImages() {
    const storyId = story.currentStory?.id;
    if (!storyId) return;
    
    ui.clearGalleryImages(storyId);
    await loadImagesForStory(storyId);
  }

  async function loadImagesForStory(storyId: string) {
    isLoading = true;
    try {
      const loaded = await database.getEmbeddedImagesForStory(storyId);
      ui.setGalleryImages(storyId, loaded);
      images = loaded;
    } catch (error) {
      console.error('[Gallery] Failed to load images:', error);
      ui.showToast('Failed to load gallery images', 'error');
      images = [];
    } finally {
      isLoading = false;
    }
  }

  $effect(() => {
    const storyId = story.currentStory?.id;
    resetSelection(); // Always reset selection on story change

    if (storyId) {
      const cached = ui.getGalleryImages(storyId);
      if (cached) {
        images = cached;
        isLoading = false;
      } else {
        loadImagesForStory(storyId);
      }
    } else {
      images = [];
      isLoading = false;
    }
  });

  function toggleSelectAll() {
    selectAllChecked = !selectAllChecked;
    if (selectAllChecked) {
      selectedImageIds = new Set(images.map(img => img.id));
    } else {
      selectedImageIds = new Set();
    }
  }

  function toggleImageSelection(imageId: string) {
    const newSet = new Set(selectedImageIds);
    newSet.has(imageId) ? newSet.delete(imageId) : newSet.add(imageId);
    selectedImageIds = newSet;
    selectAllChecked = newSet.size === images.length;
  }

  async function handleSaveImages() {
    if (!story.currentStory || images.length === 0) return;

    const imagesToSave = selectedImageIds.size || images.length;

    isSaving = true;
    try {
      const success = await imageExportService.exportImages(
        story.currentStory.title,
        images,
        selectedImageIds.size > 0 ? selectedImageIds : undefined
      );

      if (success) {
        const message = imagesToSave === 1
          ? 'Saved 1 image as PNG'
          : `Saved ${imagesToSave} images as ZIP`;
        ui.showToast(message, 'info');
        resetSelection();
      }
    } catch (error) {
      console.error('[Gallery] Save failed:', error);
      ui.showToast(
        `Failed to save images: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
    } finally {
      isSaving = false;
    }
  }

  function getImagePreview(imageData: string): string {
    return imageData.startsWith('data:') 
      ? imageData 
      : `data:image/png;base64,${imageData}`;
  }

  function openLightbox(index: number) {
    lightboxImageIndex = index;
    // Show the full stored prompt - user can edit as needed
    const image = images[index];
    if (image) {
      editingImagePrompt = image.prompt;
    }
    lightboxOpen = true;
  }

  function closeLightbox() {
    lightboxOpen = false;
  }

  function previousImage() {
    if (lightboxImageIndex > 0) {
      lightboxImageIndex--;
    }
  }

  function nextImage() {
    if (lightboxImageIndex < images.length - 1) {
      lightboxImageIndex++;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    touchStartX = e.changedTouches[0].screenX;
  }

  function handleTouchEnd(e: TouchEvent) {
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > SWIPE_THRESHOLD) {
      diff > 0 ? nextImage() : previousImage();
    }
  }

  $effect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (isEditingImage) {
        if (e.key === 'Escape') handleEditImageCancel();
        return;
      }
      if (lightboxOpen) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') previousImage();
        if (e.key === 'ArrowRight') nextImage();
      } else {
        if (e.key === 'Escape') closeGallery();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  // Edit modal state
  let isEditingImage = $state(false);
  let editingImageId = $state<string | null>(null);
  let editingImagePrompt = $state('');

  // Get the current lightbox image
  const lightboxImage = $derived(
    lightboxOpen && images.length > 0 ? images[lightboxImageIndex] : null
  );

  // Update prompt when navigating between images in lightbox
  $effect(() => {
    if (lightboxOpen && images.length > 0) {
      const image = images[lightboxImageIndex];
      if (image) {
        editingImagePrompt = image.prompt;
      }
    }
  });

  // Open edit modal for an image
  function openEditModal(image: EmbeddedImage) {
    editingImageId = image.id;
    // Show the full stored prompt - user can edit as needed
    editingImagePrompt = image.prompt;
    isEditingImage = true;
  }

  // Cancel edit modal
  function handleEditImageCancel() {
    isEditingImage = false;
    editingImageId = null;
    editingImagePrompt = '';
  }

  // Submit edit modal - regenerate with new prompt
  async function handleEditImageSubmit() {
    if (!editingImageId || !editingImagePrompt.trim()) return;

    const image = images.find(img => img.id === editingImageId);
    if (!image) return;

    // Use the prompt as-is - don't append style (user has full control)
    const fullPrompt = editingImagePrompt.trim();

    // Close modal and regenerate
    isEditingImage = false;
    closeLightbox();

    // Use centralized retry logic from ImageGenerationService
    await retryImageGeneration(editingImageId, fullPrompt);

    editingImageId = null;
    editingImagePrompt = '';

    // Refresh gallery images
    await refreshImages();
  }

  // Regenerate image with same prompt
  async function handleRegenerateImage(image: EmbeddedImage) {
    // Use the stored prompt as-is
    closeLightbox();
    await retryImageGeneration(image.id, image.prompt);
    await refreshImages();
  }
</script>

<div class="flex h-full flex-col bg-surface-900">
  <!-- Header -->
  <div class="border-b border-surface-700 px-4 py-3 sm:px-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <ImageIcon class="h-5 w-5 text-accent-400" />
        <h2 class="text-lg font-semibold text-surface-100">Gallery</h2>
        {#if images.length > 0}
          <span class="text-sm text-surface-500">({images.length})</span>
        {/if}
      </div>

      {#if images.length > 0 && !isLoading}
        <div class="flex items-center gap-1.5">
          <!-- Refresh button -->
          <Button
            variant="ghost"
            size="icon"
            onclick={refreshImages}
            disabled={isLoading || !story.currentStory}
            title="Refresh gallery"
            class="h-8 w-8"
          >
            <RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" />
          </Button>

          <!-- Save button -->
          <Button
            variant="default"
            size="sm"
            onclick={handleSaveImages}
            disabled={isSaving}
            title={isSaving ? 'Saving images...' : selectedImageIds.size > 0 ? `Save ${selectedImageIds.size} selected` : 'Save all images'}
            class="h-8 gap-1.5 text-xs px-2.5"
          >
            <Download class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">
              {isSaving ? 'Saving...' : selectedImageIds.size > 0 ? `Save ${selectedImageIds.size}` : 'Save All'}
            </span>
            <span class="sm:hidden">
              {isSaving ? '...' : selectedImageIds.size > 0 ? selectedImageIds.size : 'All'}
            </span>
          </Button>

          <!-- Close/Back button -->
          <Button
            variant="outline"
            size="sm"
            onclick={closeGallery}
            title="Close gallery (Esc)"
            class="h-8 gap-1 text-xs px-2.5"
          >
            <X class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">Close</span>
          </Button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Selection toolbar (shown when images exist) -->
  {#if images.length > 0 && !isLoading}
    <div class="border-b border-surface-700 bg-surface-800 px-4 sm:px-6 py-2.5 flex items-center gap-3">
      <Checkbox
        checked={selectAllChecked}
        onCheckedChange={toggleSelectAll}
        aria-label="Select all images"
      />
      <span class="text-xs sm:text-sm text-surface-400">
        {selectedImageIds.size === 0
          ? 'Select images to download'
          : selectedImageIds.size === images.length
            ? 'All selected'
            : `${selectedImageIds.size} selected`}
      </span>
    </div>
  {/if}

  <!-- Content -->
  <div class="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
    {#if isLoading}
      <!-- Loading state -->
      <div class="flex items-center justify-center py-12">
        <div class="flex flex-col items-center gap-3">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-surface-600 border-t-accent-400"></div>
          <p class="text-sm text-surface-400">Loading images...</p>
        </div>
      </div>
    {:else if images.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <ImageIcon class="h-12 w-12 text-surface-700 mb-3" />
        <p class="text-surface-300 font-medium">No generated images yet</p>
        <p class="text-sm text-surface-500 mt-1">
          Generate images using the image generation feature in your story
        </p>
      </div>
    {:else}
      <!-- Images grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each images as image, index (image.id)}
          <div class="group relative overflow-hidden rounded-lg bg-surface-800 border-2 transition-colors"
            class:border-accent-500={selectedImageIds.has(image.id)}
            class:border-surface-700={!selectedImageIds.has(image.id)}
            class:hover:border-accent-400={!selectedImageIds.has(image.id)}
          >
            <!-- Checkbox overlay (top-left) -->
            <div class="absolute top-2 left-2 z-20 pointer-events-auto">
              <Checkbox
                checked={selectedImageIds.has(image.id)}
                onCheckedChange={() => toggleImageSelection(image.id)}
                aria-label="Select image"
                class="bg-surface-900/80 border-surface-500"
              />
            </div>

            <!-- Image container - click opens lightbox -->
            <div
              class="relative bg-surface-700 aspect-video cursor-pointer"
              onclick={() => openLightbox(index)}
            >
              <img
                src={getImagePreview(image.imageData)}
                alt={`Generated image ${index + 1}`}
                class="w-full h-full object-contain"
              />
              <!-- Hover overlay - desktop only -->
              <div class="hidden sm:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 items-center justify-center">
                <Button variant="default" size="sm">
                  View
                </Button>
              </div>
            </div>

            <!-- Image metadata (shown below) -->
            <div class="p-3 border-t border-surface-700 text-xs">
              <div class="space-y-1 text-surface-400">
                {#if image.model}
                  <p class="truncate">
                    <span class="text-surface-500 font-medium">Model:</span>
                    {image.model}
                  </p>
                {/if}
                {#if image.styleId}
                  <p class="truncate">
                    <span class="text-surface-500 font-medium">Style:</span>
                    {image.styleId}
                  </p>
                {/if}
                {#if image.width && image.height}
                  <p>
                    <span class="text-surface-500 font-medium">Size:</span>
                    {image.width}×{image.height}
                  </p>
                {/if}
                {#if image.generationMode}
                  <p class="capitalize">
                    <span class="text-surface-500 font-medium">Mode:</span>
                    {image.generationMode}
                  </p>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer info -->
  {#if images.length > 0 && !isLoading}
    <div class="border-t border-surface-700 bg-surface-800 px-4 sm:px-6 py-2">
      <div class="flex items-start gap-2 text-xs text-surface-400">
        <AlertCircle class="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          {selectedImageIds.size > 0
            ? `${selectedImageIds.size} image${selectedImageIds.size > 1 ? 's' : ''} selected for download`
            : `${images.length} image${images.length > 1 ? 's' : ''} available. Select images to download.`}
        </p>
      </div>
    </div>
  {/if}
</div>

<!-- Lightbox Modal using ResponsiveModal -->
<ResponsiveModal.Root bind:open={lightboxOpen}>
  <ResponsiveModal.Content class="sm:max-w-3xl p-0 gap-0 overflow-hidden">
    <!-- Image area with navigation -->
    <div
      class="relative bg-surface-950 flex items-center justify-center p-4"
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      <!-- Navigation: Previous -->
      {#if images.length > 1}
        <button
          onclick={previousImage}
          disabled={lightboxImageIndex === 0}
          class="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-800/80 hover:bg-surface-700 text-surface-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Previous (←)"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
      {/if}

      <!-- Image with loading overlay -->
      {#if images.length > 0}
        <div class="relative">
          <img
            src={getImagePreview(images[lightboxImageIndex].imageData)}
            alt={`Generated image ${lightboxImageIndex + 1}`}
            class="max-w-full max-h-[40vh] sm:max-h-[50vh] object-contain rounded"
            class:opacity-50={isRegenerating}
          />
          {#if isRegenerating}
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="flex flex-col items-center gap-2 bg-surface-900/80 px-4 py-3 rounded-lg">
                <div class="h-6 w-6 animate-spin rounded-full border-2 border-surface-400 border-t-accent-400"></div>
                <span class="text-sm text-surface-300">Regenerating...</span>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Navigation: Next -->
      {#if images.length > 1}
        <button
          onclick={nextImage}
          disabled={lightboxImageIndex === images.length - 1}
          class="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-800/80 hover:bg-surface-700 text-surface-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Next (→)"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      {/if}
    </div>

    <!-- Edit area -->
    <div class="px-4 py-3 bg-surface-900 border-t border-surface-800">
      <label class="block text-xs text-surface-400 mb-1.5">Image Prompt</label>
      <Textarea
        bind:value={editingImagePrompt}
        placeholder="Describe the image you want to generate..."
        rows={3}
        class="resize-none text-sm"
      />
    </div>

    <!-- Footer toolbar -->
    <div class="flex items-center justify-between gap-3 px-4 py-3 bg-surface-900 border-t border-surface-800">
      <!-- Counter -->
      <div class="text-sm text-surface-400 tabular-nums">
        {#if images.length > 1}
          {lightboxImageIndex + 1} of {images.length}
        {:else}
          1 image
        {/if}
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" onclick={closeLightbox} class="h-8 text-xs">
          Close
        </Button>
        {#if lightboxImage}
          <Button
            size="sm"
            onclick={async () => {
              if (lightboxImage && editingImagePrompt.trim()) {
                isRegenerating = true;
                editingImageId = lightboxImage.id;
                await handleEditImageSubmit();
                isRegenerating = false;
              }
            }}
            disabled={!editingImagePrompt.trim() || isRegenerating}
            class="h-8 gap-1.5 text-xs"
          >
            {#if isRegenerating}
              <div class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
            {:else}
              <RotateCcw class="h-3.5 w-3.5" />
            {/if}
            Regenerate
          </Button>
        {/if}
      </div>
    </div>
  </ResponsiveModal.Content>
</ResponsiveModal.Root>

