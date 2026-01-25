<script lang="ts">
  import { story } from "$lib/stores/story.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { characterVault } from "$lib/stores/characterVault.svelte";
  import {
    scenarioService,
    type WizardData,
    type Genre,
    type ExpandedSetting,
    type GeneratedProtagonist,
    type GeneratedCharacter,
    type GeneratedOpening,
    type Tense,
  } from "$lib/services/ai/scenario";
  import { aiService } from "$lib/services/ai";
  import { TranslationService } from "$lib/services/ai/translation";
  import {
    type ImportedEntry,
    type LorebookImportResult,
  } from "$lib/services/lorebookImporter";
  import {
    convertCardToScenario,
    readCharacterCardFile,
  } from "$lib/services/characterCardImporter";
  import { NanoGPTImageProvider } from "$lib/services/ai/nanoGPTImageProvider";
  import { promptService } from "$lib/services/prompts";
  import type {
    StoryMode,
    POV,
    VaultCharacter,
    VaultLorebook,
    VaultLorebookEntry,
    VaultScenario,
  } from "$lib/types";
  import { lorebookVault } from "$lib/stores/lorebookVault.svelte";
  import { scenarioVault } from "$lib/stores/scenarioVault.svelte";
  import { X, ChevronLeft, ChevronRight, Sparkles, Play } from "lucide-svelte";

  import { QUICK_START_SEEDS } from "$lib/services/templates";
  import type { ImportedLorebookItem } from "./wizardTypes";
  import { replaceUserPlaceholders } from "./wizardTypes";

  // Step components
  import {
    Step1Mode,
    Step2Lorebook,
    Step3Genre,
    Step4Setting,
    Step5Characters,
    Step6SupportingCast,
    Step7Portraits,
    Step8WritingStyle,
    Step9Opening,
  } from "./steps";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  // Wizard state
  let currentStep = $state(1);
  const totalSteps = 9;

  // Step 4: Setting - Scenario Selection
  let selectedScenarioId = $state<string | null>(null);
  let scenarioCarouselRef = $state<HTMLDivElement | null>(null);

  // Step 1: Mode
  let selectedMode = $state<StoryMode>("adventure");

  // Step 2: Genre
  let selectedGenre = $state<Genre>("fantasy");
  let customGenre = $state("");

  // Step 3: Setting
  let settingSeed = $state("");
  let expandedSetting = $state<ExpandedSetting | null>(null);
  let expandedSettingTranslated = $state<ExpandedSetting | null>(null); // Translated version for display
  let isExpandingSetting = $state(false);
  let settingError = $state<string | null>(null);
  let settingElaborationGuidance = $state("");
  let previousExpandedSetting = $state<ExpandedSetting | null>(null);
  let previousSettingSeed = $state("");
  let isEditingSetting = $state(false);

  // Step 4: Protagonist/Characters
  let protagonist = $state<GeneratedProtagonist | null>(null);
  let protagonistTranslated = $state<GeneratedProtagonist | null>(null); // Translated version for display
  let supportingCharacters = $state<GeneratedCharacter[]>([]);
  let supportingCharactersTranslated = $state<GeneratedCharacter[]>([]); // Translated version for display
  let isGeneratingProtagonist = $state(false);
  let isGeneratingCharacters = $state(false);
  let isElaboratingCharacter = $state(false);
  let protagonistError = $state<string | null>(null);

  // Manual character input
  let manualCharacterName = $state("");
  let manualCharacterDescription = $state("");
  let manualCharacterBackground = $state("");
  let manualCharacterMotivation = $state("");
  let manualCharacterTraits = $state("");
  let showManualInput = $state(true);
  let characterElaborationGuidance = $state("");

  // Supporting character input
  let showSupportingCharacterForm = $state(false);
  let editingSupportingCharacterIndex = $state<number | null>(null);
  let supportingCharacterName = $state("");
  let supportingCharacterRole = $state("");
  let supportingCharacterDescription = $state("");
  let supportingCharacterRelationship = $state("");
  let supportingCharacterTraits = $state("");
  let isElaboratingSupportingCharacter = $state(false);
  let supportingCharacterGuidance = $state("");

  // Character Vault integration
  let showProtagonistVaultPicker = $state(false);
  let showSupportingVaultPicker = $state(false);
  let savedToVaultConfirm = $state(false);

  // Step 7: Portraits
  let protagonistVisualDescriptors = $state("");
  let protagonistPortrait = $state<string | null>(null);
  let isGeneratingProtagonistPortrait = $state(false);
  let portraitError = $state<string | null>(null);
  let supportingCharacterVisualDescriptors = $state<Record<string, string>>({});
  let supportingCharacterPortraits = $state<Record<string, string | null>>({});
  let generatingPortraitName = $state<string | null>(null);

  // Step 2: Import Lorebook
  let importedLorebooks = $state<ImportedLorebookItem[]>([]);
  let importError = $state<string | null>(null);

  const importedEntries = $derived(
    importedLorebooks.flatMap((lb) => lb.entries),
  );

  // Step 4: Character Card Import
  let isImportingCard = $state(false);
  let cardImportError = $state<string | null>(null);
  let importedCardNpcs = $state<GeneratedCharacter[]>([]);
  let cardImportFileInput: HTMLInputElement | null = null;
  let cardImportedTitle = $state<string | null>(null);
  let cardImportedFirstMessage = $state<string | null>(null);
  let cardImportedAlternateGreetings = $state<string[]>([]);
  let selectedGreetingIndex = $state<number>(0);

  // Scenario Vault integration
  let showScenarioVaultPicker = $state(false);
  let savedScenarioToVaultConfirm = $state(false);

  // Step 6: Writing Style
  let selectedPOV = $state<POV>("first");
  let selectedTense = $state<Tense>("present");
  let tone = $state("immersive and engaging");
  let visualProseMode = $state(false);
  let inlineImageMode = $state(false);

  // Step 7: Generate Opening
  let storyTitle = $state("");
  let openingGuidance = $state("");
  let generatedOpening = $state<GeneratedOpening | null>(null);
  let generatedOpeningTranslated = $state<GeneratedOpening | null>(null); // Translated version for display
  let isGeneratingOpening = $state(false);
  let isRefiningOpening = $state(false);
  let openingError = $state<string | null>(null);
  let isEditingOpening = $state(false);
  let openingDraft = $state("");
  let manualOpeningText = $state("");

  // Derived display variables - use translated version when available, fall back to original
  const expandedSettingDisplay = $derived(expandedSettingTranslated ?? expandedSetting);
  const protagonistDisplay = $derived(protagonistTranslated ?? protagonist);
  const supportingCharactersDisplay = $derived(
    supportingCharactersTranslated.length > 0 ? supportingCharactersTranslated : supportingCharacters
  );
  const generatedOpeningDisplay = $derived(generatedOpeningTranslated ?? generatedOpening);

  // Check if API key is configured
  const needsApiKey = $derived(settings.needsApiKey);

  // Check if image generation is enabled
  const imageGenerationEnabled = $derived(
    settings.systemServicesSettings.imageGeneration.enabled &&
      !!settings.systemServicesSettings.imageGeneration.nanoGptApiKey,
  );

  // Portrait upload states
  let isUploadingProtagonistPortrait = $state(false);
  let uploadingCharacterName = $state<string | null>(null);

  // Update default POV and tense when mode changes
  $effect(() => {
    if (selectedMode === "creative-writing") {
      if (selectedPOV === "first" || selectedPOV === "second") {
        selectedTense = "past";
      } else {
        selectedPOV = "third";
        selectedTense = "past";
      }
    } else {
      selectedPOV = "first";
      selectedTense = "present";
    }
  });

  // Step validation
  function canProceed(): boolean {
    switch (currentStep) {
      case 1: // Mode
        return true;
      case 2: // Lorebook (optional)
        return true;
      case 3: // Genre
        return selectedGenre !== "custom" || customGenre.trim().length > 0;
      case 4: // Setting
        return settingSeed.trim().length > 0;
      case 5: // Character (required - must have protagonist)
        return protagonist !== null;
      case 6: // Supporting Cast (optional)
        return true;
      case 7: // Portraits (optional)
        return true;
      case 8: // Writing Style
        return true;
      case 9: // Opening
        return storyTitle.trim().length > 0;
      default:
        return false;
    }
  }

  // Navigation
  function nextStep() {
    if (currentStep < totalSteps && canProceed()) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function clearSettingEditState() {
    isEditingSetting = false;
    previousExpandedSetting = null;
    previousSettingSeed = "";
  }

  function cancelSettingEdit() {
    if (!isEditingSetting) return;
    expandedSetting = previousExpandedSetting;
    settingSeed = previousSettingSeed;
    clearSettingEditState();
  }

  function useSettingAsIs() {
    if (!settingSeed.trim()) return;
    clearSettingEditState();
    expandedSetting = {
      name: settingSeed.split(".")[0].trim().slice(0, 50) || "Custom Setting",
      description: settingSeed.trim(),
      keyLocations: [],
      atmosphere: "",
      themes: [],
      potentialConflicts: [],
    };
  }

  async function expandSetting(seedOverride?: string) {
    const seed = seedOverride ?? settingSeed;
    if (!seed.trim() || isExpandingSetting) return;

    isExpandingSetting = true;
    settingError = null;

    try {
      const lorebookContext =
        importedEntries.length > 0
          ? importedEntries.map((e) => ({
              name: e.name,
              type: e.type,
              description: e.description,
              hiddenInfo: undefined,
            }))
          : undefined;

      expandedSetting = await scenarioService.expandSetting(
        seed,
        selectedGenre,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:settingExpansion"],
        lorebookContext,
        settingElaborationGuidance.trim() || undefined,
      );
      clearSettingEditState();
      settingElaborationGuidance = "";

      // Translate setting content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (expandedSetting && TranslationService.shouldTranslate(translationSettings)) {
        try {
          expandedSettingTranslated = await translateExpandedSetting(expandedSetting, translationSettings.targetLanguage);
          console.log("[Wizard] Setting translated for display");
        } catch (translationError) {
          console.error("Setting translation failed (non-fatal):", translationError);
          expandedSettingTranslated = null;
        }
      } else {
        expandedSettingTranslated = null;
      }
    } catch (error) {
      console.error("Failed to expand setting:", error);
      settingError =
        error instanceof Error ? error.message : "Failed to expand setting";
    } finally {
      isExpandingSetting = false;
    }
  }

  async function expandSettingFurther() {
    if (!expandedSetting || isExpandingSetting) return;

    isExpandingSetting = true;
    settingError = null;

    try {
      const lorebookContext =
        importedEntries.length > 0
          ? importedEntries.map((e) => ({
              name: e.name,
              type: e.type,
              description: e.description,
              hiddenInfo: undefined,
            }))
          : undefined;

      expandedSetting = await scenarioService.refineSetting(
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:settingRefinement"],
        lorebookContext,
        settingElaborationGuidance.trim() || undefined,
      );
      clearSettingEditState();
      settingElaborationGuidance = "";

      // Translate setting content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (expandedSetting && TranslationService.shouldTranslate(translationSettings)) {
        try {
          expandedSettingTranslated = await translateExpandedSetting(expandedSetting, translationSettings.targetLanguage);
          console.log("[Wizard] Refined setting translated for display");
        } catch (translationError) {
          console.error("Setting translation failed (non-fatal):", translationError);
          expandedSettingTranslated = null;
        }
      } else {
        expandedSettingTranslated = null;
      }
    } catch (error) {
      console.error("Failed to refine setting:", error);
      settingError =
        error instanceof Error ? error.message : "Failed to refine setting";
    } finally {
      isExpandingSetting = false;
    }
  }

  function editSetting() {
    if (!expandedSetting) return;
    previousExpandedSetting = expandedSetting;
    previousSettingSeed = settingSeed;
    isEditingSetting = true;
    settingSeed = expandedSetting.description;
    expandedSetting = null;
  }

  function selectScenario(scenarioId: string) {
    const scenario = QUICK_START_SEEDS.find((s) => s.id === scenarioId);
    if (!scenario) return;

    selectedScenarioId = scenarioId;

    const genreMap: Record<string, Genre> = {
      Fantasy: "fantasy",
      "Sci-Fi": "scifi",
      Mystery: "mystery",
      Horror: "horror",
      "Slice of Life": "romance",
      Historical: "custom",
    };
    const mappedGenre = genreMap[scenario.genre];
    if (mappedGenre) {
      selectedGenre = mappedGenre;
      if (mappedGenre === "custom") {
        customGenre = scenario.genre;
      }
    } else {
      selectedGenre = "custom";
      customGenre = scenario.genre;
    }

    const locationDesc = scenario.initialState.startingLocation?.description;
    if (locationDesc) {
      settingSeed = locationDesc;
      useSettingAsIs();
    }

    const proto = scenario.initialState.protagonist;
    if (proto) {
      manualCharacterName = proto.name ?? "";
      manualCharacterDescription = proto.description ?? "";
      manualCharacterBackground = proto.background ?? "";
      manualCharacterMotivation = proto.motivation ?? "";
      manualCharacterTraits = proto.traits?.join(", ") ?? "";
      showManualInput = true;
      useManualCharacter();
    }
  }

  function handleCarouselScroll() {
    if (!scenarioCarouselRef) return;

    const { scrollLeft, scrollWidth, clientWidth } = scenarioCarouselRef;
    const singleSetWidth = scrollWidth / 3;

    if (scrollLeft < 20) {
      scenarioCarouselRef.scrollLeft = singleSetWidth + scrollLeft;
    } else if (scrollLeft + clientWidth >= scrollWidth - 20) {
      scenarioCarouselRef.scrollLeft = scrollLeft - singleSetWidth;
    }
  }

  $effect(() => {
    if (scenarioCarouselRef && currentStep === 4) {
      setTimeout(() => {
        if (scenarioCarouselRef) {
          const singleSetWidth = scenarioCarouselRef.scrollWidth / 3;
          const containerWidth = scenarioCarouselRef.clientWidth;
          const firstCardWidth = 150;
          const centerOffset = (containerWidth - firstCardWidth) / 2;
          scenarioCarouselRef.scrollLeft = singleSetWidth - centerOffset;
        }
      }, 50);
    }
  });

  async function generateProtagonist() {
    if (!expandedSetting || isGeneratingProtagonist) return;

    isGeneratingProtagonist = true;
    protagonistError = null;

    try {
      protagonist = await scenarioService.generateProtagonist(
        expandedSetting,
        selectedGenre,
        selectedMode,
        selectedPOV,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:protagonistGeneration"],
      );

      // Translate protagonist content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (protagonist && TranslationService.shouldTranslate(translationSettings)) {
        try {
          protagonistTranslated = await translateProtagonist(protagonist, translationSettings.targetLanguage);
          console.log("[Wizard] Protagonist translated for display");
        } catch (translationError) {
          console.error("Protagonist translation failed (non-fatal):", translationError);
          protagonistTranslated = null;
        }
      } else {
        protagonistTranslated = null;
      }
    } catch (error) {
      console.error("Failed to generate protagonist:", error);
      protagonistError =
        error instanceof Error
          ? error.message
          : "Failed to generate protagonist";
    } finally {
      isGeneratingProtagonist = false;
    }
  }

  function useManualCharacter() {
    if (!manualCharacterName.trim()) return;

    protagonist = {
      name: manualCharacterName.trim(),
      description: manualCharacterDescription.trim() || "A mysterious figure.",
      background: manualCharacterBackground.trim() || "",
      motivation: manualCharacterMotivation.trim() || "",
      traits: manualCharacterTraits.trim()
        ? manualCharacterTraits
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };
    showManualInput = false;
  }

  function handleSelectProtagonistFromVault(vaultCharacter: VaultCharacter) {
    manualCharacterName = vaultCharacter.name;
    manualCharacterDescription = vaultCharacter.description || "";
    manualCharacterBackground = vaultCharacter.background || "";
    manualCharacterMotivation = vaultCharacter.motivation || "";
    manualCharacterTraits = vaultCharacter.traits.join(", ");
    protagonistVisualDescriptors = vaultCharacter.visualDescriptors.join(", ");
    protagonistPortrait = vaultCharacter.portrait;

    showProtagonistVaultPicker = false;
    showManualInput = true;
    useManualCharacter();
  }

  async function handleSaveProtagonistToVault() {
    if (!manualCharacterName.trim()) return;

    if (!characterVault.isLoaded) {
      await characterVault.load();
    }

    await characterVault.add({
      name: manualCharacterName.trim(),
      description: manualCharacterDescription.trim() || null,
      characterType: "protagonist",
      background: manualCharacterBackground.trim() || null,
      motivation: manualCharacterMotivation.trim() || null,
      role: null,
      relationshipTemplate: null,
      traits: manualCharacterTraits
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      visualDescriptors: protagonistVisualDescriptors
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
      portrait: protagonistPortrait,
      tags: [],
      favorite: false,
      source: "manual",
      originalStoryId: null,
      metadata: null,
    });

    savedToVaultConfirm = true;
    setTimeout(() => (savedToVaultConfirm = false), 2000);
  }

  function handleSelectSupportingFromVault(vaultCharacter: VaultCharacter) {
    supportingCharacterName = vaultCharacter.name;
    supportingCharacterRole = vaultCharacter.role || "";
    supportingCharacterDescription = vaultCharacter.description || "";
    supportingCharacterRelationship = vaultCharacter.relationshipTemplate || "";
    supportingCharacterTraits = vaultCharacter.traits.join(", ");
    supportingCharacterVisualDescriptors[vaultCharacter.name] =
      vaultCharacter.visualDescriptors.join(", ");
    supportingCharacterPortraits[vaultCharacter.name] = vaultCharacter.portrait;

    showSupportingVaultPicker = false;
    showSupportingCharacterForm = true;
    useSupportingCharacterAsIs();
  }

  async function elaborateCharacter(useCurrentProtagonist: boolean = false) {
    if (isElaboratingCharacter) return;

    const sourceName =
      useCurrentProtagonist && protagonist
        ? protagonist.name
        : manualCharacterName.trim();
    const sourceDescription =
      useCurrentProtagonist && protagonist
        ? protagonist.description
        : manualCharacterDescription.trim();
    const sourceBackground =
      useCurrentProtagonist && protagonist
        ? protagonist.background
        : manualCharacterBackground.trim();
    const sourceMotivation =
      useCurrentProtagonist && protagonist
        ? protagonist.motivation
        : manualCharacterMotivation.trim();
    const sourceTraits =
      useCurrentProtagonist && protagonist
        ? protagonist.traits
        : manualCharacterTraits.trim()
          ? manualCharacterTraits
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;

    const hasInput =
      sourceName || sourceDescription || sourceBackground || sourceMotivation;

    if (!hasInput) {
      protagonistError =
        "Please enter at least some character details to elaborate on.";
      return;
    }

    isElaboratingCharacter = true;
    protagonistError = null;

    try {
      protagonist = await scenarioService.elaborateCharacter(
        {
          name: sourceName || undefined,
          description: sourceDescription || undefined,
          background: sourceBackground || undefined,
          motivation: sourceMotivation || undefined,
          traits: sourceTraits,
        },
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:characterElaboration"],
        characterElaborationGuidance.trim() || undefined,
      );
      showManualInput = false;
      characterElaborationGuidance = "";

      // Translate protagonist content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (protagonist && TranslationService.shouldTranslate(translationSettings)) {
        try {
          protagonistTranslated = await translateProtagonist(protagonist, translationSettings.targetLanguage);
          console.log("[Wizard] Elaborated character translated for display");
        } catch (translationError) {
          console.error("Character translation failed (non-fatal):", translationError);
          protagonistTranslated = null;
        }
      } else {
        protagonistTranslated = null;
      }
    } catch (error) {
      console.error("Failed to elaborate character:", error);
      protagonistError =
        error instanceof Error
          ? error.message
          : "Failed to elaborate character";
    } finally {
      isElaboratingCharacter = false;
    }
  }

  async function elaborateCharacterFurther() {
    if (!protagonist || isElaboratingCharacter) return;

    isElaboratingCharacter = true;
    protagonistError = null;

    try {
      protagonist = await scenarioService.refineCharacter(
        protagonist,
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:characterRefinement"],
        characterElaborationGuidance.trim() || undefined,
      );
      characterElaborationGuidance = "";

      // Translate protagonist content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (protagonist && TranslationService.shouldTranslate(translationSettings)) {
        try {
          protagonistTranslated = await translateProtagonist(protagonist, translationSettings.targetLanguage);
          console.log("[Wizard] Refined character translated for display");
        } catch (translationError) {
          console.error("Character translation failed (non-fatal):", translationError);
          protagonistTranslated = null;
        }
      } else {
        protagonistTranslated = null;
      }
    } catch (error) {
      console.error("Failed to refine character:", error);
      protagonistError =
        error instanceof Error ? error.message : "Failed to refine character";
    } finally {
      isElaboratingCharacter = false;
    }
  }

  function editCharacter() {
    if (protagonist) {
      manualCharacterName = protagonist.name || "";
      manualCharacterDescription = protagonist.description || "";
      manualCharacterBackground = protagonist.background || "";
      manualCharacterMotivation = protagonist.motivation || "";
      manualCharacterTraits = protagonist.traits?.join(", ") || "";
    }
    showManualInput = true;
    protagonist = null;
  }

  async function generateCharacters() {
    if (!expandedSetting || !protagonist || isGeneratingCharacters) return;

    isGeneratingCharacters = true;

    try {
      supportingCharacters = await scenarioService.generateCharacters(
        expandedSetting,
        protagonist,
        selectedGenre,
        3,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:supportingCharacters"],
      );

      // Translate supporting characters if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (supportingCharacters.length > 0 && TranslationService.shouldTranslate(translationSettings)) {
        try {
          supportingCharactersTranslated = await Promise.all(
            supportingCharacters.map((char) =>
              translateSupportingCharacter(char, translationSettings.targetLanguage)
            )
          );
          console.log("[Wizard] Supporting characters translated for display");
        } catch (translationError) {
          console.error("Supporting characters translation failed (non-fatal):", translationError);
          supportingCharactersTranslated = [];
        }
      } else {
        supportingCharactersTranslated = [];
      }
    } catch (error) {
      console.error("Failed to generate characters:", error);
    } finally {
      isGeneratingCharacters = false;
    }
  }

  function openSupportingCharacterForm() {
    editingSupportingCharacterIndex = null;
    supportingCharacterName = "";
    supportingCharacterRole = "";
    supportingCharacterDescription = "";
    supportingCharacterRelationship = "";
    supportingCharacterTraits = "";
    showSupportingCharacterForm = true;
  }

  function editSupportingCharacter(index: number) {
    const char = supportingCharacters[index];
    editingSupportingCharacterIndex = index;
    supportingCharacterName = char.name;
    supportingCharacterRole = char.role;
    supportingCharacterDescription = char.description;
    supportingCharacterRelationship = char.relationship;
    supportingCharacterTraits = char.traits?.join(", ") || "";
    showSupportingCharacterForm = true;
  }

  function cancelSupportingCharacterForm() {
    showSupportingCharacterForm = false;
    editingSupportingCharacterIndex = null;
    supportingCharacterName = "";
    supportingCharacterRole = "";
    supportingCharacterDescription = "";
    supportingCharacterRelationship = "";
    supportingCharacterTraits = "";
    supportingCharacterGuidance = "";
  }

  function useSupportingCharacterAsIs() {
    if (!supportingCharacterName.trim()) return;

    const newChar: GeneratedCharacter = {
      name: supportingCharacterName.trim(),
      role: supportingCharacterRole.trim() || "supporting",
      description: supportingCharacterDescription.trim() || "",
      relationship: supportingCharacterRelationship.trim() || "",
      traits: supportingCharacterTraits.trim()
        ? supportingCharacterTraits
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    };

    if (editingSupportingCharacterIndex !== null) {
      supportingCharacters[editingSupportingCharacterIndex] = newChar;
      supportingCharacters = [...supportingCharacters];
    } else {
      supportingCharacters = [...supportingCharacters, newChar];
    }

    cancelSupportingCharacterForm();
  }

  async function elaborateSupportingCharacter() {
    if (isElaboratingSupportingCharacter) return;

    const hasInput =
      supportingCharacterName.trim() ||
      supportingCharacterDescription.trim() ||
      supportingCharacterRelationship.trim();

    if (!hasInput) return;

    isElaboratingSupportingCharacter = true;

    try {
      const elaborated = await scenarioService.elaborateCharacter(
        {
          name: supportingCharacterName.trim() || undefined,
          description: supportingCharacterDescription.trim() || undefined,
          background: supportingCharacterRelationship.trim() || undefined,
          motivation: supportingCharacterRole.trim() || undefined,
          traits: supportingCharacterTraits.trim()
            ? supportingCharacterTraits
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : undefined,
        },
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.servicePresetAssignments["wizard:characterElaboration"],
        supportingCharacterGuidance.trim() || undefined,
      );

      const newChar: GeneratedCharacter = {
        name: elaborated.name,
        role: supportingCharacterRole.trim() || "supporting",
        description: elaborated.description,
        relationship:
          supportingCharacterRelationship.trim() || elaborated.background || "",
        traits: elaborated.traits || [],
      };

      if (editingSupportingCharacterIndex !== null) {
        supportingCharacters[editingSupportingCharacterIndex] = newChar;
        supportingCharacters = [...supportingCharacters];
      } else {
        supportingCharacters = [...supportingCharacters, newChar];
      }

      supportingCharacterGuidance = "";
      cancelSupportingCharacterForm();
    } catch (error) {
      console.error("Failed to elaborate supporting character:", error);
    } finally {
      isElaboratingSupportingCharacter = false;
    }
  }

  function deleteSupportingCharacter(index: number) {
    supportingCharacters = supportingCharacters.filter((_, i) => i !== index);
  }

  // Opening generation
  async function generateOpeningScene() {
    if (isGeneratingOpening) return;

    isGeneratingOpening = true;
    openingError = null;
    clearOpeningEditState();
    // Clear manual text since we're generating with AI
    manualOpeningText = "";

    const wizardData: WizardData = {
      mode: selectedMode,
      genre: selectedGenre,
      customGenre: customGenre || undefined,
      settingSeed,
      expandedSetting: expandedSetting || undefined,
      protagonist: protagonist || undefined,
      characters:
        supportingCharacters.length > 0 ? supportingCharacters : undefined,
      writingStyle: {
        pov: selectedPOV,
        tense: selectedTense,
        tone,
      },
      title: storyTitle,
      openingGuidance:
        selectedMode === "creative-writing" && openingGuidance.trim()
          ? openingGuidance.trim()
          : undefined,
    };

    const lorebookContext =
      importedEntries.length > 0
        ? importedEntries.map((e) => ({
            name: e.name,
            type: e.type,
            description: e.description,
            hiddenInfo: undefined,
          }))
        : undefined;

    try {
      generatedOpening = await scenarioService.generateOpening(
        wizardData,
        settings.servicePresetAssignments["wizard:openingGeneration"],
        lorebookContext,
      );

      // Translate wizard content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (generatedOpening && TranslationService.shouldTranslate(translationSettings)) {
        try {
          // Build flat fields object for batch translation
          const fields: Record<string, string> = {
            scene: generatedOpening.scene,
            title: generatedOpening.title,
          };
          if (generatedOpening.initialLocation?.name) {
            fields.locName = generatedOpening.initialLocation.name;
          }
          if (generatedOpening.initialLocation?.description) {
            fields.locDesc = generatedOpening.initialLocation.description;
          }

          // Single batch translation call
          const translated = await aiService.translateWizardBatch(fields, translationSettings.targetLanguage);

          // Debug: log what we got back from batch translation
          console.log("[Wizard] Opening batch translation result:", {
            inputFields: Object.keys(fields),
            outputFields: Object.keys(translated),
            hasLocName: !!translated.locName,
            hasLocDesc: !!translated.locDesc,
            locName: translated.locName,
            locDesc: translated.locDesc?.substring(0, 100),
          });

          generatedOpeningTranslated = {
            ...generatedOpening,
            scene: translated.scene || generatedOpening.scene,
            title: translated.title || generatedOpening.title,
            initialLocation: generatedOpening.initialLocation
              ? {
                  name: translated.locName || generatedOpening.initialLocation.name,
                  description: translated.locDesc || generatedOpening.initialLocation.description,
                }
              : generatedOpening.initialLocation,
          };
          console.log("[Wizard] Opening translated for display", {
            hasInitialLocation: !!generatedOpeningTranslated.initialLocation,
            locName: generatedOpeningTranslated.initialLocation?.name,
            locDesc: generatedOpeningTranslated.initialLocation?.description?.substring(0, 50),
            originalLocName: generatedOpening.initialLocation?.name,
            translatedLocName: translated.locName,
            translatedLocDesc: translated.locDesc?.substring(0, 50),
          });
        } catch (translationError) {
          console.error("Opening translation failed (non-fatal):", translationError);
          generatedOpeningTranslated = null;
        }
      } else {
        generatedOpeningTranslated = null;
      }
    } catch (error) {
      console.error("Failed to generate opening:", error);
      openingError =
        error instanceof Error ? error.message : "Failed to generate opening";
    } finally {
      isGeneratingOpening = false;
    }
  }

  function clearOpeningEditState() {
    isEditingOpening = false;
    openingDraft = "";
  }

  function clearGeneratedOpening() {
    generatedOpening = null;
    generatedOpeningTranslated = null;
    openingError = null;
  }

  function startOpeningEdit() {
    if (!generatedOpening || isEditingOpening) return;
    openingError = null;
    openingDraft = generatedOpening.scene;
    isEditingOpening = true;
  }

  function cancelOpeningEdit() {
    clearOpeningEditState();
  }

  function saveOpeningEdit() {
    if (!generatedOpening) return;
    if (!openingDraft?.trim()) {
      openingError = "Opening text cannot be empty";
      return;
    }
    generatedOpening = {
      ...generatedOpening,
      title: storyTitle.trim() || generatedOpening.title,
      scene: openingDraft,
    };
    clearOpeningEditState();
  }

  async function refineOpeningScene() {
    if (!generatedOpening || isRefiningOpening) return;

    isRefiningOpening = true;
    openingError = null;

    const wizardData: WizardData = {
      mode: selectedMode,
      genre: selectedGenre,
      customGenre: customGenre || undefined,
      settingSeed,
      expandedSetting: expandedSetting || undefined,
      protagonist: protagonist || undefined,
      characters:
        supportingCharacters.length > 0 ? supportingCharacters : undefined,
      writingStyle: {
        pov: selectedPOV,
        tense: selectedTense,
        tone,
      },
      title: storyTitle,
      openingGuidance:
        selectedMode === "creative-writing" && openingGuidance.trim()
          ? openingGuidance.trim()
          : undefined,
    };

    const lorebookContext =
      importedEntries.length > 0
        ? importedEntries.map((e) => ({
            name: e.name,
            type: e.type,
            description: e.description,
            hiddenInfo: undefined,
          }))
        : undefined;

    try {
      const currentOpening = storyTitle.trim()
        ? { ...generatedOpening, title: storyTitle.trim() }
        : generatedOpening;
      generatedOpening = await scenarioService.refineOpening(
        wizardData,
        currentOpening,
        settings.servicePresetAssignments["wizard:openingRefinement"],
        lorebookContext,
      );
      clearOpeningEditState();

      // Translate wizard content if enabled (store in separate variable for display)
      const translationSettings = settings.translationSettings;
      if (generatedOpening && TranslationService.shouldTranslate(translationSettings)) {
        try {
          // Build flat fields object for batch translation
          const fields: Record<string, string> = {
            scene: generatedOpening.scene,
            title: generatedOpening.title,
          };
          if (generatedOpening.initialLocation?.name) {
            fields.locName = generatedOpening.initialLocation.name;
          }
          if (generatedOpening.initialLocation?.description) {
            fields.locDesc = generatedOpening.initialLocation.description;
          }

          // Single batch translation call
          const translated = await aiService.translateWizardBatch(fields, translationSettings.targetLanguage);

          generatedOpeningTranslated = {
            ...generatedOpening,
            scene: translated.scene || generatedOpening.scene,
            title: translated.title || generatedOpening.title,
            initialLocation: generatedOpening.initialLocation
              ? {
                  name: translated.locName || generatedOpening.initialLocation.name,
                  description: translated.locDesc || generatedOpening.initialLocation.description,
                }
              : generatedOpening.initialLocation,
          };
          console.log("[Wizard] Refined opening translated for display");
        } catch (translationError) {
          console.error("Opening translation failed (non-fatal):", translationError);
          generatedOpeningTranslated = null;
        }
      } else {
        generatedOpeningTranslated = null;
      }
    } catch (error) {
      console.error("Failed to refine opening:", error);
      openingError =
        error instanceof Error ? error.message : "Failed to refine opening";
    } finally {
      isRefiningOpening = false;
    }
  }

  // Create Story
  async function createStory() {
    if (!storyTitle.trim()) return;

    // Use manual opening if provided
    if (!generatedOpening && manualOpeningText.trim()) {
      generatedOpening = {
        scene: manualOpeningText.trim(),
        title: storyTitle || "Untitled Story",
        initialLocation: {
          name: "Starting Location",
          description: "The place where your journey begins.",
        },
      };
    }

    // Use card imported opening if available
    if (!generatedOpening && cardImportedFirstMessage) {
      generatedOpening = {
        scene: cardImportedFirstMessage,
        title: cardImportedTitle || storyTitle || "Untitled Story",
        initialLocation: {
          name: "Starting Location",
          description: "The place where your journey begins.",
        },
      };
    }

    if (!generatedOpening) {
      openingError = "Please provide an opening scene (write your own or generate with AI)";
      return;
    }

    const protagonistName = protagonist?.name || "the protagonist";

    const processedSettingSeed = replaceUserPlaceholders(
      settingSeed,
      protagonistName,
    );

    let processedExpandedSetting: ExpandedSetting | null = null;
    if (expandedSetting) {
      processedExpandedSetting = {
        ...expandedSetting,
        description: replaceUserPlaceholders(
          expandedSetting.description,
          protagonistName,
        ),
        keyLocations: expandedSetting.keyLocations.map((l) => ({
          ...l,
          description: replaceUserPlaceholders(l.description, protagonistName),
        })),
        atmosphere: replaceUserPlaceholders(
          expandedSetting.atmosphere,
          protagonistName,
        ),
        themes: expandedSetting.themes.map((t) =>
          replaceUserPlaceholders(t, protagonistName),
        ),
        potentialConflicts: expandedSetting.potentialConflicts.map((c) =>
          replaceUserPlaceholders(c, protagonistName),
        ),
      };
    }

    const processedOpening = {
      ...generatedOpening,
      scene: replaceUserPlaceholders(generatedOpening.scene, protagonistName),
    };

    const processedCharacters = supportingCharacters.map((char) => ({
      ...char,
      name: replaceUserPlaceholders(char.name, protagonistName),
      description: replaceUserPlaceholders(char.description, protagonistName),
      role: replaceUserPlaceholders(char.role, protagonistName),
      relationship: replaceUserPlaceholders(char.relationship, protagonistName),
      traits: char.traits?.map((t) =>
        replaceUserPlaceholders(t, protagonistName),
      ),
    }));

    const processedEntries = importedEntries.map((e) => ({
      ...e,
      name: replaceUserPlaceholders(e.name, protagonistName),
      description: replaceUserPlaceholders(e.description, protagonistName),
      keywords: e.keywords.map((k) =>
        replaceUserPlaceholders(k, protagonistName),
      ),
    }));

    const wizardData: WizardData = {
      mode: selectedMode,
      genre: selectedGenre,
      customGenre: customGenre || undefined,
      settingSeed: processedSettingSeed,
      expandedSetting: processedExpandedSetting || undefined,
      protagonist: protagonist || undefined,
      characters:
        processedCharacters.length > 0 ? processedCharacters : undefined,
      writingStyle: {
        pov: selectedPOV,
        tense: selectedTense,
        tone,
        visualProseMode,
        inlineImageMode,
      },
      title: storyTitle,
      openingGuidance:
        selectedMode === "creative-writing" && openingGuidance.trim()
          ? openingGuidance.trim()
          : undefined,
    };

    const storyData = scenarioService.prepareStoryData(
      wizardData,
      processedOpening,
    );

    if (storyData.protagonist) {
      storyData.protagonist.portrait = protagonistPortrait ?? undefined;
      storyData.protagonist.visualDescriptors = protagonistVisualDescriptors
        ? protagonistVisualDescriptors
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [];
    }

    storyData.characters = storyData.characters.map((char) => ({
      ...char,
      portrait: char.name
        ? (supportingCharacterPortraits[char.name] ?? undefined)
        : undefined,
      visualDescriptors:
        char.name && supportingCharacterVisualDescriptors[char.name]
          ? supportingCharacterVisualDescriptors[char.name]
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : [],
    }));

    // Build translations object if we have translations
    const translationSettings = settings.translationSettings;
    let translations: {
      language: string;
      openingScene?: string;
      protagonist?: { name?: string; description?: string; traits?: string[]; visualDescriptors?: string[] };
      startingLocation?: { name?: string; description?: string };
      characters?: { [originalName: string]: { name?: string; description?: string; relationship?: string; traits?: string[]; visualDescriptors?: string[] } };
    } | undefined;

    if (TranslationService.shouldTranslate(translationSettings)) {
      const targetLanguage = translationSettings.targetLanguage;
      translations = { language: targetLanguage };

      // Opening scene translation
      if (generatedOpeningTranslated?.scene) {
        translations.openingScene = generatedOpeningTranslated.scene;
      }

      // Protagonist translation
      if (protagonistTranslated) {
        // Translate visual descriptors if present
        let protagonistVisualDescriptorsTranslated: string[] | undefined;
        if (protagonistVisualDescriptors?.trim()) {
          try {
            const visualDescriptorsArray = protagonistVisualDescriptors.split(",").map(d => d.trim()).filter(Boolean);
            if (visualDescriptorsArray.length > 0) {
              const translated = await aiService.translateWizardBatch(
                { visualDescriptors: visualDescriptorsArray.join(", ") },
                targetLanguage
              );
              if (translated.visualDescriptors) {
                protagonistVisualDescriptorsTranslated = translated.visualDescriptors.split(",").map(d => d.trim()).filter(Boolean);
              }
            }
          } catch (e) {
            console.error("[Wizard] Failed to translate protagonist visual descriptors:", e);
          }
        }
        translations.protagonist = {
          name: protagonistTranslated.name,
          description: protagonistTranslated.description,
          traits: protagonistTranslated.traits,
          visualDescriptors: protagonistVisualDescriptorsTranslated,
        };
      }

      // Starting location translation (from opening's initialLocation)
      if (generatedOpeningTranslated?.initialLocation) {
        translations.startingLocation = {
          name: generatedOpeningTranslated.initialLocation.name,
          description: generatedOpeningTranslated.initialLocation.description,
        };
      }

      // Supporting characters translation - key by processed name (after placeholder replacement)
      if (supportingCharactersTranslated.length > 0) {
        translations.characters = {};
        for (let i = 0; i < supportingCharacters.length; i++) {
          const processed = processedCharacters[i];
          const translated = supportingCharactersTranslated[i];
          // Use processed name as key since createStoryFromWizard looks up by processed name
          if (processed?.name && translated) {
            // Translate visual descriptors if present for this character
            let charVisualDescriptorsTranslated: string[] | undefined;
            const charVisualDescriptors = supportingCharacterVisualDescriptors[processed.name];
            if (charVisualDescriptors?.trim()) {
              try {
                const visualDescriptorsArray = charVisualDescriptors.split(",").map(d => d.trim()).filter(Boolean);
                if (visualDescriptorsArray.length > 0) {
                  const translatedVD = await aiService.translateWizardBatch(
                    { visualDescriptors: visualDescriptorsArray.join(", ") },
                    targetLanguage
                  );
                  if (translatedVD.visualDescriptors) {
                    charVisualDescriptorsTranslated = translatedVD.visualDescriptors.split(",").map(d => d.trim()).filter(Boolean);
                  }
                }
              } catch (e) {
                console.error("[Wizard] Failed to translate character visual descriptors:", e);
              }
            }
            translations.characters[processed.name] = {
              name: translated.name,
              description: translated.description,
              relationship: translated.relationship,
              traits: translated.traits,
              visualDescriptors: charVisualDescriptorsTranslated,
            };
          }
        }
      }

      // Debug: log what translations we're passing
      console.log("[Wizard] Translations being passed to createStoryFromWizard:", {
        hasOpeningScene: !!translations.openingScene,
        hasProtagonist: !!translations.protagonist,
        hasStartingLocation: !!translations.startingLocation,
        startingLocation: translations.startingLocation,
        characterCount: translations.characters ? Object.keys(translations.characters).length : 0,
        characters: translations.characters,
      });
    }

    const newStory = await story.createStoryFromWizard({
      ...storyData,
      importedEntries:
        processedEntries.length > 0 ? processedEntries : undefined,
      translations,
    });

    await story.loadStory(newStory.id);
    ui.setActivePanel("story");
    onClose();
  }

  // Translation helper functions - using batch translation for efficiency
  async function translateExpandedSetting(setting: ExpandedSetting, targetLanguage: string): Promise<ExpandedSetting> {
    // Build flat fields object for batch translation
    const fields: Record<string, string> = {
      name: setting.name,
      description: setting.description,
    };

    if (setting.atmosphere) fields.atmosphere = setting.atmosphere;
    if (setting.themes?.length) fields.themes = setting.themes.join(", ");
    if (setting.potentialConflicts?.length) fields.conflicts = setting.potentialConflicts.join("; ");

    // Add key locations with indexed keys
    (setting.keyLocations || []).forEach((loc, i) => {
      fields[`loc_${i}_name`] = loc.name;
      if (loc.description) fields[`loc_${i}_desc`] = loc.description;
    });

    // Single batch translation call
    const translated = await aiService.translateWizardBatch(fields, targetLanguage);

    // Reconstruct key locations
    const translatedLocations = (setting.keyLocations || []).map((loc, i) => ({
      name: translated[`loc_${i}_name`] || loc.name,
      description: translated[`loc_${i}_desc`] || loc.description,
    }));

    return {
      ...setting,
      name: translated.name || setting.name,
      description: translated.description || setting.description,
      atmosphere: translated.atmosphere || setting.atmosphere,
      keyLocations: translatedLocations,
      themes: translated.themes
        ? translated.themes.split(",").map((t) => t.trim()).filter(Boolean)
        : setting.themes,
      potentialConflicts: translated.conflicts
        ? translated.conflicts.split(";").map((c) => c.trim()).filter(Boolean)
        : setting.potentialConflicts,
    };
  }

  async function translateProtagonist(char: GeneratedProtagonist, targetLanguage: string): Promise<GeneratedProtagonist> {
    // Build flat fields object for batch translation
    const fields: Record<string, string> = {
      name: char.name,
      description: char.description,
    };

    if (char.background) fields.background = char.background;
    if (char.motivation) fields.motivation = char.motivation;
    if (char.traits?.length) fields.traits = char.traits.join(", ");

    // Single batch translation call
    const translated = await aiService.translateWizardBatch(fields, targetLanguage);

    return {
      ...char,
      name: translated.name || char.name,
      description: translated.description || char.description,
      background: translated.background || char.background,
      motivation: translated.motivation || char.motivation,
      traits: translated.traits
        ? translated.traits.split(",").map((t) => t.trim()).filter(Boolean)
        : char.traits,
    };
  }

  async function translateSupportingCharacter(char: GeneratedCharacter, targetLanguage: string): Promise<GeneratedCharacter> {
    // Build flat fields object for batch translation
    const fields: Record<string, string> = {
      name: char.name,
      description: char.description,
    };

    if (char.role) fields.role = char.role;
    if (char.relationship) fields.relationship = char.relationship;
    if (char.traits?.length) fields.traits = char.traits.join(", ");

    // Single batch translation call
    const translated = await aiService.translateWizardBatch(fields, targetLanguage);

    return {
      ...char,
      name: translated.name || char.name,
      description: translated.description || char.description,
      role: translated.role || char.role,
      relationship: translated.relationship || char.relationship,
      traits: translated.traits
        ? translated.traits.split(",").map((t) => t.trim()).filter(Boolean)
        : char.traits,
    };
  }

  // Step titles
  const stepTitles = [
    "Choose Your Mode",
    "Import Lorebook (Optional)",
    "Select a Genre",
    "Describe Your Setting",
    "Create Your Character",
    "Supporting Cast (Optional)",
    "Character Portraits (Optional)",
    "Writing Style",
    "Generate Opening",
  ];

  // Portrait generation functions
  async function generateProtagonistPortrait() {
    if (!protagonist || isGeneratingProtagonistPortrait) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      portraitError = "NanoGPT API key required for portrait generation";
      return;
    }

    const descriptors = protagonistVisualDescriptors.trim();
    if (!descriptors) {
      portraitError = "Add appearance descriptors first";
      return;
    }

    isGeneratingProtagonistPortrait = true;
    portraitError = null;

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

      protagonistPortrait = `data:image/png;base64,${response.images[0].b64_json}`;
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to generate portrait";
    } finally {
      isGeneratingProtagonistPortrait = false;
    }
  }

  async function generateSupportingCharacterPortrait(charName: string) {
    const char = supportingCharacters.find((c) => c.name === charName);
    if (!char || generatingPortraitName !== null) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      portraitError = "NanoGPT API key required for portrait generation";
      return;
    }

    const descriptors = (
      supportingCharacterVisualDescriptors[charName] || ""
    ).trim();
    if (!descriptors) {
      portraitError = `Add appearance descriptors for ${char.name} first`;
      return;
    }

    generatingPortraitName = charName;
    portraitError = null;

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

      supportingCharacterPortraits[charName] =
        `data:image/png;base64,${response.images[0].b64_json}`;
      supportingCharacterPortraits = { ...supportingCharacterPortraits };
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to generate portrait";
    } finally {
      generatingPortraitName = null;
    }
  }

  function removeProtagonistPortrait() {
    protagonistPortrait = null;
    portraitError = null;
  }

  function removeSupportingCharacterPortrait(charName: string) {
    supportingCharacterPortraits[charName] = null;
    supportingCharacterPortraits = { ...supportingCharacterPortraits };
    portraitError = null;
  }

  async function handleProtagonistPortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isUploadingProtagonistPortrait = true;
    portraitError = null;

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

      protagonistPortrait = dataUrl;
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to upload portrait";
    } finally {
      isUploadingProtagonistPortrait = false;
      input.value = "";
    }
  }

  async function handleSupportingCharacterPortraitUpload(
    event: Event,
    charName: string,
  ) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingCharacterName = charName;
    portraitError = null;

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

      supportingCharacterPortraits[charName] = dataUrl;
      supportingCharacterPortraits = { ...supportingCharacterPortraits };
    } catch (error) {
      portraitError =
        error instanceof Error ? error.message : "Failed to upload portrait";
    } finally {
      uploadingCharacterName = null;
      input.value = "";
    }
  }

  async function handleSelectLorebookFromVault(vaultLorebook: VaultLorebook) {
    const entries = vaultLorebook.entries.map((e) => ({
      ...e,
    }));

    importedLorebooks = [
      ...importedLorebooks,
      {
        id: crypto.randomUUID(),
        filename: `${vaultLorebook.name} (from Vault)`,
        result: {
          success: true,
          entries: entries,
          errors: [],
          warnings: [],
          metadata: vaultLorebook.metadata || {
            format: "aventura",
            totalEntries: entries.length,
            importedEntries: entries.length,
            skippedEntries: 0,
          },
        },
        entries: entries,
        expanded: true,
      },
    ];
  }

  function handleNavigateToVault() {
    ui.setActivePanel("vault");
    ui.setVaultTab("lorebooks");
    onClose();
  }

  function handleNavigateToVaultScenarios() {
    ui.setActivePanel("vault");
    ui.setVaultTab("scenarios");
    onClose();
  }

  function handleNavigateToVaultCharacters() {
    ui.setActivePanel("vault");
    ui.setVaultTab("characters");
    onClose();
  }

  function removeLorebook(id: string) {
    importedLorebooks = importedLorebooks.filter((lb) => lb.id !== id);
    if (importedLorebooks.length === 0) {
      importError = null;
    }
  }

  function toggleLorebookExpanded(id: string) {
    importedLorebooks = importedLorebooks.map((lb) =>
      lb.id === id ? { ...lb, expanded: !lb.expanded } : lb,
    );
  }

  function clearAllLorebooks() {
    importedLorebooks = [];
    importError = null;
  }

  // Scenario Vault Handler
  function handleSelectScenarioFromVault(scenario: VaultScenario) {
    settingSeed = scenario.settingSeed;
    expandedSetting = null;
    clearSettingEditState();

    const importedNpcs: GeneratedCharacter[] = scenario.npcs.map((npc) => ({
      name: npc.name,
      role: npc.role,
      description: npc.description,
      relationship: npc.relationship,
      traits: npc.traits || [],
    }));

    if (importedCardNpcs.length > 0) {
      const prevImportedNames = new Set(importedCardNpcs.map((n) => n.name));
      supportingCharacters = supportingCharacters.filter(
        (c) => !prevImportedNames.has(c.name),
      );
    }

    supportingCharacters = [...supportingCharacters, ...importedNpcs];
    importedCardNpcs = importedNpcs;

    if (scenario.name) {
      cardImportedTitle = scenario.name;
      storyTitle = scenario.name;
    }

    if (scenario.firstMessage) {
      cardImportedFirstMessage = scenario.firstMessage;
      cardImportedAlternateGreetings = scenario.alternateGreetings || [];
      selectedGreetingIndex = 0;
    } else {
      cardImportedFirstMessage = null;
      cardImportedAlternateGreetings = [];
    }

    showScenarioVaultPicker = false;
    useSettingAsIs();
  }

  async function handleSaveScenarioToVault() {
    if (!settingSeed.trim()) return;

    if (!scenarioVault.isLoaded) {
      await scenarioVault.load();
    }

    const npcs =
      importedCardNpcs.length > 0
        ? importedCardNpcs
        : supportingCharacters.map((c) => ({
            name: c.name,
            role: c.role,
            description: c.description,
            relationship: c.relationship,
            traits: c.traits || [],
          }));

    const vaultNpcs = npcs.map((c) => ({
      name: c.name,
      role: c.role,
      description: c.description,
      relationship: c.relationship,
      traits: c.traits || [],
    }));

    await scenarioVault.saveFromWizard(
      storyTitle || "Untitled Scenario",
      settingSeed,
      vaultNpcs,
      {
        description: expandedSetting?.description,
        firstMessage: cardImportedFirstMessage || undefined,
        alternateGreetings: cardImportedAlternateGreetings,
        tags: ["wizard"],
      },
    );

    savedScenarioToVaultConfirm = true;
    setTimeout(() => (savedScenarioToVaultConfirm = false), 2000);
  }

  // Character Card Import handler
  async function handleCardImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    cardImportError = null;
    isImportingCard = true;

    try {
      const content = await readCharacterCardFile(file);
      const result = await convertCardToScenario(
        content,
        selectedMode,
        selectedGenre,
      );

      if (!result.success && result.errors.length > 0) {
        cardImportError = result.errors.join("; ");
      }

      if (result.settingSeed) {
        settingSeed = result.settingSeed;
        expandedSetting = null;
        clearSettingEditState();
        useSettingAsIs();
      }

      if (result.npcs && result.npcs.length > 0) {
        supportingCharacters = [...supportingCharacters, ...result.npcs];
        importedCardNpcs = result.npcs;
      }

      if (result.storyTitle) {
        cardImportedTitle = result.storyTitle;
        storyTitle = result.storyTitle;
      }
      if (result.firstMessage) {
        cardImportedFirstMessage = result.firstMessage;
        cardImportedAlternateGreetings = result.alternateGreetings || [];
        selectedGreetingIndex = 0;
      }

      if (cardImportFileInput) {
        cardImportFileInput.value = "";
      }
    } catch (err) {
      cardImportError =
        err instanceof Error ? err.message : "Failed to import character card";
    } finally {
      isImportingCard = false;
    }
  }

  function clearCardImport() {
    if (importedCardNpcs.length > 0) {
      const importedNames = new Set(importedCardNpcs.map((n) => n.name));
      supportingCharacters = supportingCharacters.filter(
        (c) => !importedNames.has(c.name),
      );
    }
    importedCardNpcs = [];
    cardImportError = null;
    cardImportedTitle = null;
    cardImportedFirstMessage = null;
    cardImportedAlternateGreetings = [];
    selectedGreetingIndex = 0;
    if (cardImportFileInput) {
      cardImportFileInput.value = "";
    }
  }

  // Use card opening handler for Step8
  function useCardOpening() {
    const selectedScene =
      selectedGreetingIndex === 0
        ? cardImportedFirstMessage
        : cardImportedAlternateGreetings[selectedGreetingIndex - 1];
    generatedOpening = {
      title: storyTitle,
      scene: selectedScene || "",
      initialLocation: {
        name: expandedSetting?.keyLocations?.[0]?.name || "Starting Location",
        description:
          expandedSetting?.keyLocations?.[0]?.description ||
          "The scene begins here.",
      },
    };
    openingError = null;
    clearOpeningEditState();
  }

  function clearCardOpening() {
    cardImportedFirstMessage = null;
    cardImportedAlternateGreetings = [];
    selectedGreetingIndex = 0;
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center sm:bg-black/70"
  role="dialog"
  aria-modal="true"
>
  <!-- Mobile: full screen with safe area; Desktop: centered modal -->
  <div
    class="card w-full h-full sm:h-auto sm:max-w-3xl sm:max-h-[90vh] overflow-hidden flex flex-col rounded-none sm:rounded-xl pt-[env(safe-area-inset-top)] sm:pt-4"
  >
    <!-- Header -->
    <div
      class="flex items-center justify-between border-b border-surface-700 pb-4 shrink-0 px-2"
    >
      <div>
        <h2 class="text-xl font-semibold text-surface-100">Create New Story</h2>
        <p class="text-sm text-surface-400">
          Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
        </p>
      </div>
      <button
        class="btn-ghost rounded-lg p-1.5 text-surface-400 hover:text-surface-100"
        onclick={onClose}
      >
        <X class="h-7 w-7" />
      </button>
    </div>

    <!-- Progress Bar -->
    <div class="py-3 px-2 shrink-0">
      <div class="flex gap-1">
        {#each Array(totalSteps) as _, i}
          <div
            class="h-1.5 flex-1 rounded-full transition-colors"
            class:bg-accent-500={i === currentStep - 1}
            class:bg-surface-700={i < currentStep - 1}
            class:bg-surface-500={i > currentStep - 1}
          ></div>
        {/each}
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto pb-4 pt-1 px-2 min-h-0">
      {#if needsApiKey}
        <!-- API Key Warning -->
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <div class="rounded-full bg-amber-500/20 p-4 mb-4">
            <Sparkles class="h-8 w-8 text-amber-400" />
          </div>
          <h3 class="text-lg font-semibold text-surface-100 mb-2">
            API Key Required
          </h3>
          <p class="text-surface-400 mb-4 max-w-md">
            The setup wizard uses AI to dynamically generate your story world.
            Please configure your OpenRouter API key in settings first.
          </p>
          <button
            class="btn btn-primary"
            onclick={() => {
              ui.openSettings();
              onClose();
            }}
          >
            Open Settings
          </button>
        </div>
      {:else if currentStep === 1}
        <Step1Mode
          {selectedMode}
          onModeChange={(mode) => (selectedMode = mode)}
        />
      {:else if currentStep === 2}
        <Step2Lorebook
          {importedLorebooks}
          {importError}
          onSelectFromVault={handleSelectLorebookFromVault}
          onRemoveLorebook={removeLorebook}
          onToggleExpanded={toggleLorebookExpanded}
          onClearAll={clearAllLorebooks}
          onNavigateToVault={handleNavigateToVault}
        />
      {:else if currentStep === 3}
        <Step3Genre
          {selectedGenre}
          {customGenre}
          onGenreChange={(g) => (selectedGenre = g)}
          onCustomGenreChange={(v) => (customGenre = v)}
        />
      {:else if currentStep === 4}
        <Step4Setting
          {settingSeed}
          expandedSetting={expandedSettingDisplay}
          {settingElaborationGuidance}
          {isExpandingSetting}
          {settingError}
          {isEditingSetting}
          {selectedScenarioId}
          {importedCardNpcs}
          {cardImportError}
          {isImportingCard}
          {savedScenarioToVaultConfirm}
          {showScenarioVaultPicker}
          onSettingSeedChange={(v) => (settingSeed = v)}
          onGuidanceChange={(v) => (settingElaborationGuidance = v)}
          onUseAsIs={useSettingAsIs}
          onExpandSetting={() => expandSetting()}
          onExpandFurther={expandSettingFurther}
          onEditSetting={editSetting}
          onCancelEdit={cancelSettingEdit}
          onSelectScenario={selectScenario}
          onCardImport={handleCardImport}
          onClearCardImport={clearCardImport}
          onSaveToVault={handleSaveScenarioToVault}
          onShowVaultPickerChange={(show) => (showScenarioVaultPicker = show)}
          onSelectFromVault={handleSelectScenarioFromVault}
          cardImportFileInputRef={(el) => (cardImportFileInput = el)}
          scenarioCarouselRef={(el) => (scenarioCarouselRef = el)}
          onCarouselScroll={handleCarouselScroll}
          onNavigateToVault={handleNavigateToVaultScenarios}
        />
      {:else if currentStep === 5}
        <Step5Characters
          {selectedMode}
          expandedSetting={expandedSettingDisplay}
          protagonist={protagonistDisplay}
          {manualCharacterName}
          {manualCharacterDescription}
          {manualCharacterBackground}
          {manualCharacterMotivation}
          {manualCharacterTraits}
          {characterElaborationGuidance}
          {isGeneratingProtagonist}
          {isElaboratingCharacter}
          {protagonistError}
          {savedToVaultConfirm}
          onManualNameChange={(v) => (manualCharacterName = v)}
          onManualDescriptionChange={(v) => (manualCharacterDescription = v)}
          onManualBackgroundChange={(v) => (manualCharacterBackground = v)}
          onManualMotivationChange={(v) => (manualCharacterMotivation = v)}
          onManualTraitsChange={(v) => (manualCharacterTraits = v)}
          onCharacterGuidanceChange={(v) => (characterElaborationGuidance = v)}
          onUseManualCharacter={useManualCharacter}
          onElaborateCharacter={() => elaborateCharacter()}
          onElaborateCharacterFurther={elaborateCharacterFurther}
          onGenerateProtagonist={generateProtagonist}
          onSaveToVault={handleSaveProtagonistToVault}
          onSelectProtagonistFromVault={handleSelectProtagonistFromVault}
          onNavigateToVault={handleNavigateToVaultCharacters}
        />
      {:else if currentStep === 6}
        <Step6SupportingCast
          protagonist={protagonistDisplay}
          supportingCharacters={supportingCharactersDisplay}
          {showSupportingCharacterForm}
          {editingSupportingCharacterIndex}
          {supportingCharacterName}
          {supportingCharacterRole}
          {supportingCharacterDescription}
          {supportingCharacterRelationship}
          {supportingCharacterTraits}
          {supportingCharacterGuidance}
          {isGeneratingCharacters}
          {isElaboratingSupportingCharacter}
          onSupportingNameChange={(v) => (supportingCharacterName = v)}
          onSupportingRoleChange={(v) => (supportingCharacterRole = v)}
          onSupportingDescriptionChange={(v) =>
            (supportingCharacterDescription = v)}
          onSupportingRelationshipChange={(v) =>
            (supportingCharacterRelationship = v)}
          onSupportingTraitsChange={(v) => (supportingCharacterTraits = v)}
          onSupportingGuidanceChange={(v) => (supportingCharacterGuidance = v)}
          onOpenSupportingForm={openSupportingCharacterForm}
          onEditSupportingCharacter={editSupportingCharacter}
          onCancelSupportingForm={cancelSupportingCharacterForm}
          onUseSupportingAsIs={useSupportingCharacterAsIs}
          onElaborateSupportingCharacter={elaborateSupportingCharacter}
          onDeleteSupportingCharacter={deleteSupportingCharacter}
          onGenerateCharacters={generateCharacters}
          onSelectSupportingFromVault={handleSelectSupportingFromVault}
          onNavigateToVault={handleNavigateToVaultCharacters}
        />
      {:else if currentStep === 7}
        <Step7Portraits
          {protagonist}
          {supportingCharacters}
          {imageGenerationEnabled}
          {protagonistVisualDescriptors}
          {protagonistPortrait}
          {isGeneratingProtagonistPortrait}
          {isUploadingProtagonistPortrait}
          {supportingCharacterVisualDescriptors}
          {supportingCharacterPortraits}
          {generatingPortraitName}
          {uploadingCharacterName}
          {portraitError}
          onProtagonistDescriptorsChange={(v) =>
            (protagonistVisualDescriptors = v)}
          onGenerateProtagonistPortrait={generateProtagonistPortrait}
          onRemoveProtagonistPortrait={removeProtagonistPortrait}
          onProtagonistPortraitUpload={handleProtagonistPortraitUpload}
          onSupportingDescriptorsChange={(name, v) => {
            supportingCharacterVisualDescriptors[name] = v;
            supportingCharacterVisualDescriptors = {
              ...supportingCharacterVisualDescriptors,
            };
          }}
          onGenerateSupportingPortrait={generateSupportingCharacterPortrait}
          onRemoveSupportingPortrait={removeSupportingCharacterPortrait}
          onSupportingPortraitUpload={handleSupportingCharacterPortraitUpload}
        />
      {:else if currentStep === 8}
        <Step8WritingStyle
          {selectedPOV}
          {selectedTense}
          {tone}
          {visualProseMode}
          {inlineImageMode}
          onPOVChange={(v) => (selectedPOV = v)}
          onTenseChange={(v) => (selectedTense = v)}
          onToneChange={(v) => (tone = v)}
          onVisualProseModeChange={(v) => (visualProseMode = v)}
          onInlineImageModeChange={(v) => (inlineImageMode = v)}
        />
      {:else if currentStep === 9}
        <Step9Opening
          {storyTitle}
          {openingGuidance}
          generatedOpening={generatedOpeningDisplay}
          {isGeneratingOpening}
          {isRefiningOpening}
          {isEditingOpening}
          {openingDraft}
          {openingError}
          {manualOpeningText}
          {cardImportedFirstMessage}
          {cardImportedAlternateGreetings}
          {selectedGreetingIndex}
          {selectedMode}
          {selectedGenre}
          {customGenre}
          {selectedPOV}
          {selectedTense}
          expandedSetting={expandedSettingDisplay}
          protagonist={protagonistDisplay}
          importedEntriesCount={importedEntries.length}
          onTitleChange={(v) => (storyTitle = v)}
          onGuidanceChange={(v) => (openingGuidance = v)}
          onSelectedGreetingChange={(v) => (selectedGreetingIndex = v)}
          onGenerateOpening={generateOpeningScene}
          onRefineOpening={refineOpeningScene}
          onStartEdit={startOpeningEdit}
          onCancelEdit={cancelOpeningEdit}
          onSaveEdit={saveOpeningEdit}
          onDraftChange={(v) => (openingDraft = v)}
          onUseCardOpening={useCardOpening}
          onClearCardOpening={clearCardOpening}
          onManualOpeningChange={(v) => (manualOpeningText = v)}
          onClearGenerated={clearGeneratedOpening}
        />
      {/if}
    </div>

    <!-- Footer Navigation -->
    <div
      class="flex justify-between border-t border-surface-700 pt-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-0 shrink-0"
    >
      {#if currentStep > 1}
        <button class="btn btn-secondary gap-1 pl-2" onclick={prevStep}>
          <ChevronLeft class="h-4 w-4" />
          Back
        </button>
      {:else}
        <div></div>
      {/if}

      {#if currentStep === totalSteps}
        <button
          class="btn btn-primary flex items-center gap-2"
          onclick={createStory}
          disabled={!storyTitle.trim() ||
            isGeneratingOpening ||
            isRefiningOpening ||
            isEditingOpening ||
            (!generatedOpening && !manualOpeningText.trim() && !cardImportedFirstMessage)}
          title={(!generatedOpening && !manualOpeningText.trim() && !cardImportedFirstMessage) ? "Provide an opening scene first" : ""}
        >
          <Play class="h-4 w-4" />
          Begin Story
        </button>
      {:else}
        <button
          class="btn btn-primary gap-1 pr-2.5"
          onclick={nextStep}
          disabled={!canProceed()}
        >
          Next
          <ChevronRight class="h-4 w-4" />
        </button>
      {/if}
    </div>
  </div>
</div>
