<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { database } from '$lib/services/database';
  import { imageExportService } from '$lib/services/imageExport';
  import type { EmbeddedImage } from '$lib/types';
  import { Download, ImageIcon, AlertCircle, X, RefreshCw } from 'lucide-svelte';

  const SWIPE_THRESHOLD = 50;

  let images = $state<EmbeddedImage[]>([]);
  let isLoading = $state(false);
  let isSaving = $state(false);

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
        <div class="flex items-center gap-2">
          <!-- Refresh button -->
          <button
            class="flex items-center justify-center rounded p-2 hover:bg-surface-700 transition-colors disabled:opacity-50 min-h-[44px] min-w-[44px]"
            onclick={refreshImages}
            disabled={isLoading || !story.currentStory}
            title="Refresh gallery"
          >
            <RefreshCw class="h-4 w-4 text-surface-300 {isLoading ? 'animate-spin' : ''}" />
          </button>

          <!-- Save button -->
          <button
            class="flex items-center gap-2 rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-white transition-colors min-h-[44px]"
            onclick={handleSaveImages}
            disabled={isSaving}
            title={isSaving ? 'Saving images...' : selectedImageIds.size > 0 ? `Save ${selectedImageIds.size} selected` : 'Save all images'}
          >
            <Download class="h-4 w-4 flex-shrink-0" />
            <span class="hidden sm:inline">
              {isSaving ? 'Saving...' : selectedImageIds.size > 0 ? `Save ${selectedImageIds.size}` : 'Save All'}
            </span>
            <span class="sm:hidden">
              {isSaving ? '...' : selectedImageIds.size > 0 ? selectedImageIds.size : 'All'}
            </span>
          </button>

          <!-- Close/Back button -->
          <button
            class="flex items-center gap-1.5 rounded-lg border border-surface-600 hover:bg-surface-700 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium text-surface-300 hover:text-surface-100 transition-colors min-h-[44px]"
            onclick={closeGallery}
            title="Close gallery (Esc)"
          >
            <X class="h-4 w-4 flex-shrink-0" />
            <span class="hidden sm:inline">Close</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Selection toolbar (shown when images exist) -->
  {#if images.length > 0 && !isLoading}
    <div class="border-b border-surface-700 bg-surface-800 px-4 sm:px-6 py-2.5 flex items-center gap-3">
      <input
        type="checkbox"
        checked={selectAllChecked}
        onchange={toggleSelectAll}
        class="h-5 w-5 cursor-pointer rounded border-surface-600 text-accent-600 min-h-[44px] min-w-[44px] p-2"
        title="Select all images"
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
            <div class="absolute top-2 left-2 z-20 flex items-center pointer-events-none">
              <input
                type="checkbox"
                checked={selectedImageIds.has(image.id)}
                onchange={() => toggleImageSelection(image.id)}
                class="h-5 w-5 cursor-pointer rounded border-surface-500 text-accent-600 pointer-events-auto"
                style="min-height: 44px; min-width: 44px; padding: 6px;"
              />
            </div>

            <!-- Image container with proper scaling -->
            <div class="relative bg-surface-700 aspect-video flex items-center justify-center cursor-pointer hover:bg-surface-600 transition-colors"
              onclick={() => openLightbox(index)}
            >
              <img
                src={getImagePreview(image.imageData)}
                alt={`Generated image ${index + 1}`}
                class="w-full h-full object-contain"
              />
            </div>

            <!-- Hover overlay with view button -->
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
              <button
                class="pointer-events-auto px-3 py-1.5 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded transition-colors"
                onclick={() => openLightbox(index)}
              >
                View
              </button>
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

<!-- Lightbox Modal -->
{#if lightboxOpen && images.length > 0}
  <div
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
    onclick={() => closeLightbox()}
    role="dialog"
    aria-modal="true"
  >
    <!-- Close button -->
    <button
      class="absolute top-4 right-4 p-2 hover:bg-surface-700/50 rounded-lg transition-colors z-[10000]"
      onclick={(e) => {
        e.stopPropagation();
        closeLightbox();
      }}
      title="Close (Esc)"
    >
      <X class="h-6 w-6 text-white" />
    </button>

    <!-- Image container -->
    <div
      class="flex items-center justify-center max-w-5xl max-h-[80vh]"
      onclick={(e) => e.stopPropagation()}
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      <img
        src={getImagePreview(images[lightboxImageIndex].imageData)}
        alt={`Generated image ${lightboxImageIndex + 1}`}
        class="max-w-full max-h-full object-contain rounded-lg"
      />
    </div>

    <!-- Navigation buttons -->
    {#if images.length > 1}
      <!-- Previous button -->
      <button
        class="absolute left-3 sm:left-8 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed z-[10000] min-h-[44px] min-w-[44px] flex items-center justify-center"
        onclick={(e) => {
          e.stopPropagation();
          previousImage();
        }}
        disabled={lightboxImageIndex === 0}
        title="Previous image (← or swipe right)"
      >
        <svg class="h-6 w-6 sm:h-8 sm:w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- Next button -->
      <button
        class="absolute right-3 sm:right-8 top-1/2 -translate-y-1/2 p-2.5 sm:p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed z-[10000] min-h-[44px] min-w-[44px] flex items-center justify-center"
        onclick={(e) => {
          e.stopPropagation();
          nextImage();
        }}
        disabled={lightboxImageIndex === images.length - 1}
        title="Next image (→ or swipe left)"
      >
        <svg class="h-6 w-6 sm:h-8 sm:w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <!-- Image counter -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 sm:px-4 sm:py-2 bg-black/60 rounded-lg text-white text-xs sm:text-sm font-medium z-[10000]">
        {lightboxImageIndex + 1} / {images.length}
      </div>
    {/if}
  </div>
{/if}
