import {
  settings
} from "$lib/stores/settings.svelte";
import { NanoGPTImageProvider } from "$lib/services/ai/nanoGPTImageProvider";
import { promptService } from "$lib/services/prompts";
import type { GeneratedProtagonist, GeneratedCharacter } from "$lib/services/ai/scenario";

export class ImageStore {
  protagonistVisualDescriptors = $state("");
  protagonistPortrait = $state<string | null>(null);
  isGeneratingProtagonistPortrait = $state(false);
  isUploadingProtagonistPortrait = $state(false);
  portraitError = $state<string | null>(null);
  
  supportingCharacterVisualDescriptors = $state<Record<string, string>>({});
  supportingCharacterPortraits = $state<Record<string, string | null>>({});
  generatingPortraitName = $state<string | null>(null);
  uploadingCharacterName = $state<string | null>(null);

  // Actions
  async generateProtagonistPortrait(protagonist: GeneratedProtagonist | null) {
    if (!protagonist || this.isGeneratingProtagonistPortrait) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      this.portraitError = "NanoGPT API key required for portrait generation";
      return;
    }

    const descriptors = this.protagonistVisualDescriptors.trim();
    if (!descriptors) {
      this.portraitError = "Add appearance descriptors first";
      return;
    }

    this.isGeneratingProtagonistPortrait = true;
    this.portraitError = null;

    try {
      const styleId = imageSettings.styleId;
      let stylePrompt = "";
      try {
        const promptContext = {
          mode: "adventure" as const,
          pov: "second" as const,
          tense: "present" as const,
          protagonistName: "",
        };
        stylePrompt = promptService.getPrompt(styleId, promptContext) || "";
      } catch {
        stylePrompt =
          "Soft cel-shaded anime illustration. Muted pastel color palette. Dreamy, airy atmosphere.";
      }

      const promptContext = {
        mode: "adventure" as const,
        pov: "second" as const,
        tense: "present" as const,
        protagonistName: "",
      };

      const portraitPrompt = promptService.renderPrompt(
        "image-portrait-generation",
        promptContext,
        {
          imageStylePrompt: stylePrompt,
          visualDescriptors: descriptors,
          characterName: protagonist.name,
        },
      );

      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || "z-image-turbo",
        size: "1024x1024",
        response_format: "b64_json",
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error("No image data returned");
      }

      this.protagonistPortrait = `data:image/png;base64,${response.images[0].b64_json}`;
    } catch (error) {
      this.portraitError =
        error instanceof Error ? error.message : "Failed to generate portrait";
    } finally {
      this.isGeneratingProtagonistPortrait = false;
    }
  }

  async generateSupportingCharacterPortrait(charName: string, supportingCharacters: GeneratedCharacter[]) {
    const char = supportingCharacters.find((c) => c.name === charName);
    if (!char || this.generatingPortraitName !== null) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      this.portraitError = "NanoGPT API key required for portrait generation";
      return;
    }

    const descriptors = (
      this.supportingCharacterVisualDescriptors[charName] || ""
    ).trim();
    if (!descriptors) {
      this.portraitError = `Add appearance descriptors for ${char.name} first`;
      return;
    }

    this.generatingPortraitName = charName;
    this.portraitError = null;

    try {
      const styleId = imageSettings.styleId;
      let stylePrompt = "";
      try {
        const promptContext = {
          mode: "adventure" as const,
          pov: "second" as const,
          tense: "present" as const,
          protagonistName: "",
        };
        stylePrompt = promptService.getPrompt(styleId, promptContext) || "";
      } catch {
        stylePrompt =
          "Soft cel-shaded anime illustration. Muted pastel color palette. Dreamy, airy atmosphere.";
      }

      const promptContext = {
        mode: "adventure" as const,
        pov: "second" as const,
        tense: "present" as const,
        protagonistName: "",
      };

      const portraitPrompt = promptService.renderPrompt(
        "image-portrait-generation",
        promptContext,
        {
          imageStylePrompt: stylePrompt,
          visualDescriptors: descriptors,
          characterName: char.name,
        },
      );

      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || "z-image-turbo",
        size: "1024x1024",
        response_format: "b64_json",
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error("No image data returned");
      }

      this.supportingCharacterPortraits[charName] =
        `data:image/png;base64,${response.images[0].b64_json}`;
      // Force update for reactive map
      this.supportingCharacterPortraits = { ...this.supportingCharacterPortraits };
    } catch (error) {
      this.portraitError =
        error instanceof Error ? error.message : "Failed to generate portrait";
    } finally {
      this.generatingPortraitName = null;
    }
  }

  removeProtagonistPortrait() {
    this.protagonistPortrait = null;
    this.portraitError = null;
  }

  removeSupportingCharacterPortrait(charName: string) {
    this.supportingCharacterPortraits[charName] = null;
    this.supportingCharacterPortraits = { ...this.supportingCharacterPortraits };
    this.portraitError = null;
  }

  async handleProtagonistPortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.isUploadingProtagonistPortrait = true;
    this.portraitError = null;

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image must be smaller than 5MB");
      }

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string" || !result.startsWith("data:image/")) {
            reject(new Error("Failed to read image data"));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      this.protagonistPortrait = dataUrl;
    } catch (error) {
      this.portraitError =
        error instanceof Error ? error.message : "Failed to upload portrait";
    } finally {
      this.isUploadingProtagonistPortrait = false;
      input.value = "";
    }
  }

  async handleSupportingCharacterPortraitUpload(
    event: Event,
    charName: string
  ) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingCharacterName = charName;
    this.portraitError = null;

    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please select an image file");
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error("Image must be smaller than 5MB");
      }

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== "string" || !result.startsWith("data:image/")) {
            reject(new Error("Failed to read image data"));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      this.supportingCharacterPortraits[charName] = dataUrl;
      this.supportingCharacterPortraits = { ...this.supportingCharacterPortraits };
    } catch (error) {
      this.portraitError =
        error instanceof Error ? error.message : "Failed to upload portrait";
    } finally {
      this.uploadingCharacterName = null;
      input.value = "";
    }
  }
}
