import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, mkdir } from '@tauri-apps/plugin-fs';
import type { EmbeddedImage } from '$lib/types';

class ImageExportService {
  private base64ToBytes(imageData: string): Uint8Array {
    const base64Data = imageData.startsWith('data:')
      ? imageData.split(',')[1]
      : imageData;

    if (!base64Data) {
      throw new Error('Invalid image data');
    }

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private filterImages(images: EmbeddedImage[], selectedIds?: Set<string>): EmbeddedImage[] {
    return selectedIds ? images.filter(img => selectedIds.has(img.id)) : images;
  }

  async exportSingleImage(storyTitle: string, image: EmbeddedImage): Promise<boolean> {
    try {
      const selectedPath = await save({
        defaultPath: `${storyTitle}-image.png`,
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });

      if (!selectedPath) return false;

      const bytes = this.base64ToBytes(image.imageData);
      await writeFile(selectedPath, bytes);

      console.log(`[ImageExport] Exported to ${selectedPath}`);
      return true;
    } catch (error) {
      console.error('[ImageExport] Single image export failed:', error);
      throw error;
    }
  }

  async exportImagesToZip(
    storyTitle: string,
    images: EmbeddedImage[],
    selectedImageIds?: Set<string>
  ): Promise<boolean> {
    const imagesToExport = this.filterImages(images, selectedImageIds);

    if (imagesToExport.length === 0) {
      throw new Error('No images to export');
    }

    try {
      const { default: JSZip } = await import('jszip');

      const selectedPath = await save({
        defaultPath: `${storyTitle}-images.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      });

      if (!selectedPath) return false;

      const zip = new JSZip();
      const errors: string[] = [];

      for (let i = 0; i < imagesToExport.length; i++) {
        const fileName = `image-${String(i + 1).padStart(3, '0')}.png`;
        try {
          const base64Data = imagesToExport[i].imageData.startsWith('data:')
            ? imagesToExport[i].imageData.split(',')[1]
            : imagesToExport[i].imageData;

          if (!base64Data) {
            errors.push(`Image ${i + 1}: Invalid data`);
            continue;
          }

          zip.file(fileName, base64Data, { base64: true });
        } catch (error) {
          errors.push(`Image ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const zipData = await zip.generateAsync({ type: 'uint8array' });
      await writeFile(selectedPath, zipData);

      if (errors.length > 0) {
        console.warn('[ImageExport] Completed with errors:', errors);
      }

      console.log(`[ImageExport] Exported ${imagesToExport.length - errors.length}/${imagesToExport.length} images`);
      return true;
    } catch (error) {
      console.error('[ImageExport] ZIP export failed:', error);
      throw error;
    }
  }

  async exportImages(
    storyTitle: string,
    images: EmbeddedImage[],
    selectedImageIds?: Set<string>
  ): Promise<boolean> {
    const imagesToExport = this.filterImages(images, selectedImageIds);

    if (imagesToExport.length === 0) {
      throw new Error('No images to export');
    }

    return imagesToExport.length === 1
      ? this.exportSingleImage(storyTitle, imagesToExport[0])
      : this.exportImagesToZip(storyTitle, images, selectedImageIds);
  }

  /**
   * @deprecated Use exportImages() instead
   */
  async exportImagesToDirectory(
    storyTitle: string,
    images: EmbeddedImage[],
    selectedImageIds?: Set<string>
  ): Promise<boolean> {
    const imagesToExport = this.filterImages(images, selectedImageIds);

    if (imagesToExport.length === 0) {
      throw new Error('No images to export');
    }

    try {
      const selectedPath = await save({
        defaultPath: `${storyTitle}-images`,
        filters: [{ name: 'Folders', extensions: ['*'] }],
      });

      if (!selectedPath) return false;

      try {
        await mkdir(selectedPath, { recursive: true });
      } catch {
        // Directory might already exist
      }

      const errors: string[] = [];

      for (let i = 0; i < imagesToExport.length; i++) {
        const fileName = `image-${String(i + 1).padStart(3, '0')}.png`;
        const filePath = `${selectedPath}/${fileName}`;

        try {
          const bytes = this.base64ToBytes(imagesToExport[i].imageData);
          await writeFile(filePath, bytes);
        } catch (error) {
          errors.push(`Image ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (errors.length === imagesToExport.length) {
        throw new Error(`Failed to save images: ${errors.join(', ')}`);
      }

      if (errors.length > 0) {
        console.warn('[ImageExport] Completed with errors:', errors);
      }

      console.log(`[ImageExport] Exported ${imagesToExport.length - errors.length}/${imagesToExport.length} images`);
      return true;
    } catch (error) {
      console.error('[ImageExport] Export failed:', error);
      throw error;
    }
  }
}

export const imageExportService = new ImageExportService();
