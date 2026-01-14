<script lang="ts">
  import { story } from '$lib/stores/story.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import {
    scenarioService,
    type WizardData,
    type Genre,
    type ExpandedSetting,
    type GeneratedProtagonist,
    type GeneratedCharacter,
    type GeneratedOpening,
    type Tense,
  } from '$lib/services/ai/scenario';
import {
    parseSillyTavernLorebook,
    classifyEntriesWithLLM,
    getImportSummary,
    type ImportedEntry,
    type LorebookImportResult,
  } from '$lib/services/lorebookImporter';
  import {
    convertCardToScenario,
    readCharacterCardFile,
    type CardImportResult,
  } from '$lib/services/characterCardImporter';
  import { NanoGPTImageProvider } from '$lib/services/ai/nanoGPTImageProvider';
  import { promptService } from '$lib/services/prompts';
  import { normalizeImageDataUrl } from '$lib/utils/image';
  import type { StoryMode, POV, EntryType } from '$lib/types';
  import {
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Sword,
    Feather,
    Wand2,
    Rocket,
    Building,
    Skull,
    Search,
    Heart,
    Sparkles,
    Globe,
    User,
    Users,
    PenTool,
    Play,
    RefreshCw,
    Upload,
    FileJson,
    Check,
    AlertCircle,
    Book,
    Trash2,
    Plus,
    ImageIcon,
    ImageUp,
  } from 'lucide-svelte';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  // Wizard state
  let currentStep = $state(1);
  const totalSteps = 8;

  // Step 1: Mode
  let selectedMode = $state<StoryMode>('adventure');

  // Step 2: Genre
  let selectedGenre = $state<Genre>('fantasy');
  let customGenre = $state('');

  // Step 3: Setting
  let settingSeed = $state('');
  let expandedSetting = $state<ExpandedSetting | null>(null);
  let isExpandingSetting = $state(false);
  let settingError = $state<string | null>(null);

  // Step 4: Protagonist/Characters
  let protagonist = $state<GeneratedProtagonist | null>(null);
  let supportingCharacters = $state<GeneratedCharacter[]>([]);
  let isGeneratingProtagonist = $state(false);
  let isGeneratingCharacters = $state(false);
  let isElaboratingCharacter = $state(false);
  let protagonistError = $state<string | null>(null);

  // Manual character input
  let manualCharacterName = $state('');
  let manualCharacterDescription = $state('');
  let manualCharacterBackground = $state('');
  let manualCharacterMotivation = $state('');
  let manualCharacterTraits = $state('');
  let showManualInput = $state(true); // Show manual input by default

  // Supporting character input
  let showSupportingCharacterForm = $state(false);
  let editingSupportingCharacterIndex = $state<number | null>(null);
  let supportingCharacterName = $state('');
  let supportingCharacterRole = $state('');
  let supportingCharacterDescription = $state('');
  let supportingCharacterRelationship = $state('');
  let supportingCharacterTraits = $state('');
  let isElaboratingSupportingCharacter = $state(false);

  // Step 7: Portraits
  let protagonistVisualDescriptors = $state('');
  let protagonistPortrait = $state<string | null>(null);
  let isGeneratingProtagonistPortrait = $state(false);
  let portraitError = $state<string | null>(null);
  // Supporting character visual descriptors and portraits keyed by character NAME (not index)
  // This prevents data loss when characters are removed/reordered
  let supportingCharacterVisualDescriptors = $state<Record<string, string>>({});
  let supportingCharacterPortraits = $state<Record<string, string | null>>({});
  let generatingPortraitName = $state<string | null>(null);

  // Step 2: Import Lorebook (optional - moved to early position)
  let importedLorebook = $state<LorebookImportResult | null>(null);
  let importedEntries = $state<ImportedEntry[]>([]);
  let isImporting = $state(false);
  let isClassifying = $state(false);
  let classificationProgress = $state({ current: 0, total: 0 });
  let importError = $state<string | null>(null);
  let importFileInput: HTMLInputElement | null = null;

  // Step 4: Character Card Import (optional)
  let isImportingCard = $state(false);
  let cardImportError = $state<string | null>(null);
  let importedCardNpcs = $state<GeneratedCharacter[]>([]);
  let cardImportFileInput: HTMLInputElement | null = null;
  // Card-imported opening scene data (used in step 7)
  let cardImportedTitle = $state<string | null>(null);
  let cardImportedFirstMessage = $state<string | null>(null);
  let cardImportedAlternateGreetings = $state<string[]>([]);
  let selectedGreetingIndex = $state<number>(0); // 0 = first_mes, 1+ = alternate greetings

// Step 6: Writing Style
  let selectedPOV = $state<POV>('first');
  let selectedTense = $state<Tense>('present');
  let tone = $state('immersive and engaging');
  let visualProseMode = $state(false);
  let inlineImageMode = $state(false);

  // Step 7: Generate Opening
  let storyTitle = $state('');
  let openingGuidance = $state(''); // Creative writing mode: user guidance for opening scene
  let generatedOpening = $state<GeneratedOpening | null>(null);
  let isGeneratingOpening = $state(false);
  let openingError = $state<string | null>(null);

  // Check if API key is configured
  const needsApiKey = $derived(settings.needsApiKey);

  // Genre options with icons
  const genres: { id: Genre; name: string; icon: typeof Wand2; description: string }[] = [
    { id: 'fantasy', name: 'Fantasy', icon: Wand2, description: 'Magic, quests, and mythical creatures' },
    { id: 'scifi', name: 'Sci-Fi', icon: Rocket, description: 'Space, technology, and the future' },
    { id: 'modern', name: 'Modern', icon: Building, description: 'Contemporary realistic settings' },
    { id: 'horror', name: 'Horror', icon: Skull, description: 'Fear, suspense, and the unknown' },
    { id: 'mystery', name: 'Mystery', icon: Search, description: 'Puzzles, clues, and investigations' },
    { id: 'romance', name: 'Romance', icon: Heart, description: 'Love, relationships, and emotion' },
    { id: 'custom', name: 'Custom', icon: Sparkles, description: 'Define your own genre' },
  ];

  // POV options
  const povOptions = $derived.by((): { id: POV; label: string; example: string }[] => {
    return [
      { id: 'first', label: '1st Person', example: 'I walk into the room...' },
      { id: 'second', label: '2nd Person', example: 'You walk into the room...' },
      { id: 'third', label: '3rd Person', example: 'They walk into the room...' },
    ];
  });

  // Tense options
  const tenseOptions: { id: Tense; label: string; example: string }[] = [
    { id: 'present', label: 'Present', example: 'You see a door.' },
    { id: 'past', label: 'Past', example: 'You saw a door.' },
  ];

  // Tone presets
  const tonePresets = [
    'Immersive and engaging',
    'Dark and atmospheric',
    'Light and whimsical',
    'Gritty and realistic',
    'Poetic and lyrical',
    'Action-packed and fast-paced',
  ];

  // Update default POV and tense when mode changes
  // Creative writing: third person, past tense (literary standard) - but user can override POV
  // Adventure: first person, present tense (immersive)
  $effect(() => {
    if (selectedMode === 'creative-writing') {
      // Only set defaults if not already set (allow user to override POV)
      if (selectedPOV === 'first' || selectedPOV === 'second') {
        // Keep user's POV choice, only set tense
        selectedTense = 'past';
      } else {
        // First time or was third, set both defaults
        selectedPOV = 'third';
        selectedTense = 'past';
      }
    } else {
      selectedPOV = 'first';
      selectedTense = 'present';
    }
  });

  // Step validation
  function canProceed(): boolean {
    switch (currentStep) {
      case 1: return true; // Mode always selected
      case 2: return true; // Import is optional (can skip)
      case 3: return selectedGenre !== 'custom' || customGenre.trim().length > 0;
      case 4: return settingSeed.trim().length > 0;
      case 5: return true; // Protagonist is optional
      case 6: return true; // Portraits are optional
      case 7: return true; // Style always has defaults
      case 8: return storyTitle.trim().length > 0;
      default: return false;
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

  // Step 3: Use setting as-is without AI expansion
  function useSettingAsIs() {
    if (!settingSeed.trim()) return;

    // Create a minimal expanded setting from the seed text
    expandedSetting = {
      name: settingSeed.split('.')[0].trim().slice(0, 50) || 'Custom Setting',
      description: settingSeed.trim(),
      keyLocations: [],
      atmosphere: '',
      themes: [],
      potentialConflicts: [],
    };
  }

  // Step 3: Expand Setting with AI
  async function expandSetting() {
    if (!settingSeed.trim() || isExpandingSetting) return;

    isExpandingSetting = true;
    settingError = null;

    try {
      // Prepare lorebook entries for setting expansion context
      // Include ALL entries with full descriptions to avoid hallucinating contradictory details
      const lorebookContext = importedEntries.length > 0
        ? importedEntries.map(e => ({
            name: e.name,
            type: e.type,
            description: e.description,
            // hiddenInfo not available in SillyTavern imports, but included if present
            hiddenInfo: undefined,
          }))
        : undefined;

      expandedSetting = await scenarioService.expandSetting(
        settingSeed,
        selectedGenre,
        customGenre || undefined,
        settings.wizardSettings.settingExpansion,
        lorebookContext
      );
    } catch (error) {
      console.error('Failed to expand setting:', error);
      settingError = error instanceof Error ? error.message : 'Failed to expand setting';
    } finally {
      isExpandingSetting = false;
    }
  }

  // Step 4: Generate Protagonist
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
        settings.wizardSettings.protagonistGeneration
      );
    } catch (error) {
      console.error('Failed to generate protagonist:', error);
      protagonistError = error instanceof Error ? error.message : 'Failed to generate protagonist';
    } finally {
      isGeneratingProtagonist = false;
    }
  }

  // Step 4: Use manual character input directly
  function useManualCharacter() {
    if (!manualCharacterName.trim()) return;

    protagonist = {
      name: manualCharacterName.trim(),
      description: manualCharacterDescription.trim() || 'A mysterious figure.',
      background: manualCharacterBackground.trim() || '',
      motivation: manualCharacterMotivation.trim() || '',
      traits: manualCharacterTraits.trim()
        ? manualCharacterTraits.split(',').map(t => t.trim()).filter(Boolean)
        : [],
    };
    showManualInput = false;
  }

  // Step 4: Elaborate on manual character input with AI
  async function elaborateCharacter() {
    if (isElaboratingCharacter) return;

    // Need at least a name or some input
    const hasInput = manualCharacterName.trim() ||
      manualCharacterDescription.trim() ||
      manualCharacterBackground.trim() ||
      manualCharacterMotivation.trim();

    if (!hasInput) {
      protagonistError = 'Please enter at least some character details to elaborate on.';
      return;
    }

    isElaboratingCharacter = true;
    protagonistError = null;

    try {
      protagonist = await scenarioService.elaborateCharacter(
        {
          name: manualCharacterName.trim() || undefined,
          description: manualCharacterDescription.trim() || undefined,
          background: manualCharacterBackground.trim() || undefined,
          motivation: manualCharacterMotivation.trim() || undefined,
          traits: manualCharacterTraits.trim()
            ? manualCharacterTraits.split(',').map(t => t.trim()).filter(Boolean)
            : undefined,
        },
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.wizardSettings.characterElaboration
      );
      showManualInput = false;
    } catch (error) {
      console.error('Failed to elaborate character:', error);
      protagonistError = error instanceof Error ? error.message : 'Failed to elaborate character';
    } finally {
      isElaboratingCharacter = false;
    }
  }

  // Step 4: Edit the generated character (switch back to manual input)
  function editCharacter() {
    if (protagonist) {
      manualCharacterName = protagonist.name || '';
      manualCharacterDescription = protagonist.description || '';
      manualCharacterBackground = protagonist.background || '';
      manualCharacterMotivation = protagonist.motivation || '';
      manualCharacterTraits = protagonist.traits?.join(', ') || '';
    }
    showManualInput = true;
    protagonist = null;
  }

  // Step 4: Generate Supporting Characters (Creative Mode)
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
        settings.wizardSettings.supportingCharacters
      );
    } catch (error) {
      console.error('Failed to generate characters:', error);
    } finally {
      isGeneratingCharacters = false;
    }
  }

  // Supporting character form management
  function openSupportingCharacterForm() {
    editingSupportingCharacterIndex = null;
    supportingCharacterName = '';
    supportingCharacterRole = '';
    supportingCharacterDescription = '';
    supportingCharacterRelationship = '';
    supportingCharacterTraits = '';
    showSupportingCharacterForm = true;
  }

  function editSupportingCharacter(index: number) {
    const char = supportingCharacters[index];
    editingSupportingCharacterIndex = index;
    supportingCharacterName = char.name;
    supportingCharacterRole = char.role;
    supportingCharacterDescription = char.description;
    supportingCharacterRelationship = char.relationship;
    supportingCharacterTraits = char.traits?.join(', ') || '';
    showSupportingCharacterForm = true;
  }

  function cancelSupportingCharacterForm() {
    showSupportingCharacterForm = false;
    editingSupportingCharacterIndex = null;
    supportingCharacterName = '';
    supportingCharacterRole = '';
    supportingCharacterDescription = '';
    supportingCharacterRelationship = '';
    supportingCharacterTraits = '';
  }

  function useSupportingCharacterAsIs() {
    if (!supportingCharacterName.trim()) return;

    const newChar: GeneratedCharacter = {
      name: supportingCharacterName.trim(),
      role: supportingCharacterRole.trim() || 'supporting',
      description: supportingCharacterDescription.trim() || '',
      relationship: supportingCharacterRelationship.trim() || '',
      traits: supportingCharacterTraits.trim()
        ? supportingCharacterTraits.split(',').map(t => t.trim()).filter(Boolean)
        : [],
    };

    if (editingSupportingCharacterIndex !== null) {
      supportingCharacters[editingSupportingCharacterIndex] = newChar;
      supportingCharacters = [...supportingCharacters]; // Trigger reactivity
    } else {
      supportingCharacters = [...supportingCharacters, newChar];
    }

    cancelSupportingCharacterForm();
  }

  async function elaborateSupportingCharacter() {
    if (isElaboratingSupportingCharacter) return;

    const hasInput = supportingCharacterName.trim() ||
      supportingCharacterDescription.trim() ||
      supportingCharacterRelationship.trim();

    if (!hasInput) return;

    isElaboratingSupportingCharacter = true;

    try {
      // Use the same elaboration service but for supporting characters
      const elaborated = await scenarioService.elaborateCharacter(
        {
          name: supportingCharacterName.trim() || undefined,
          description: supportingCharacterDescription.trim() || undefined,
          background: supportingCharacterRelationship.trim() || undefined, // Use relationship as background context
          motivation: supportingCharacterRole.trim() || undefined, // Use role as motivation context
          traits: supportingCharacterTraits.trim()
            ? supportingCharacterTraits.split(',').map(t => t.trim()).filter(Boolean)
            : undefined,
        },
        expandedSetting,
        selectedGenre,
        customGenre || undefined,
        settings.wizardSettings.characterElaboration
      );

      // Convert elaborated protagonist format to supporting character format
      const newChar: GeneratedCharacter = {
        name: elaborated.name,
        role: supportingCharacterRole.trim() || 'supporting',
        description: elaborated.description,
        relationship: supportingCharacterRelationship.trim() || elaborated.background || '',
        traits: elaborated.traits || [],
      };

      if (editingSupportingCharacterIndex !== null) {
        supportingCharacters[editingSupportingCharacterIndex] = newChar;
        supportingCharacters = [...supportingCharacters];
      } else {
        supportingCharacters = [...supportingCharacters, newChar];
      }

      cancelSupportingCharacterForm();
    } catch (error) {
      console.error('Failed to elaborate supporting character:', error);
    } finally {
      isElaboratingSupportingCharacter = false;
    }
  }

  function deleteSupportingCharacter(index: number) {
    supportingCharacters = supportingCharacters.filter((_, i) => i !== index);
  }

  // Step 7: Generate Opening
  async function generateOpeningScene() {
    if (isGeneratingOpening) return;

    isGeneratingOpening = true;
    openingError = null;

    const wizardData: WizardData = {
      mode: selectedMode,
      genre: selectedGenre,
      customGenre: customGenre || undefined,
      settingSeed,
      expandedSetting: expandedSetting || undefined,
      protagonist: protagonist || undefined,
      characters: supportingCharacters.length > 0 ? supportingCharacters : undefined,
      writingStyle: {
        pov: selectedPOV,
        tense: selectedTense,
        tone,
      },
      title: storyTitle,
      openingGuidance: selectedMode === 'creative-writing' && openingGuidance.trim() ? openingGuidance.trim() : undefined,
    };

    // Prepare lorebook entries for opening generation context
    // Include ALL entries with full descriptions to avoid hallucinating contradictory details
    const lorebookContext = importedEntries.length > 0
      ? importedEntries.map(e => ({
          name: e.name,
          type: e.type,
          description: e.description,
          hiddenInfo: undefined,
        }))
      : undefined;

    try {
      generatedOpening = await scenarioService.generateOpening(
        wizardData,
        settings.wizardSettings.openingGeneration,
        lorebookContext
      );
    } catch (error) {
      console.error('Failed to generate opening:', error);
      openingError = error instanceof Error ? error.message : 'Failed to generate opening';
    } finally {
      isGeneratingOpening = false;
    }
  }

  // Create Story
  async function createStory() {
    // Sanity checks
    if (!storyTitle.trim()) return;
    if (!generatedOpening) {
      openingError = 'Please generate an opening scene first';
      return;
    }

    // Get protagonist name for {{user}} replacement
    const protagonistName = protagonist?.name || 'the protagonist';

    // Replace {{user}} placeholders in the opening scene
    const processedOpening = {
      ...generatedOpening,
      scene: generatedOpening.scene.replace(/\{\{user\}\}/gi, protagonistName),
    };

const wizardData: WizardData = {
      mode: selectedMode,
      genre: selectedGenre,
      customGenre: customGenre || undefined,
      settingSeed: settingSeed.replace(/\{\{user\}\}/gi, protagonistName),
      expandedSetting: expandedSetting || undefined,
      protagonist: protagonist || undefined,
      characters: supportingCharacters.length > 0 ? supportingCharacters : undefined,
writingStyle: {
        pov: selectedPOV,
        tense: selectedTense,
        tone,
        visualProseMode,
        inlineImageMode,
      },
      title: storyTitle,
      openingGuidance: selectedMode === 'creative-writing' && openingGuidance.trim() ? openingGuidance.trim() : undefined,
    };

    // Prepare story data
    const storyData = scenarioService.prepareStoryData(wizardData, processedOpening);

    // Add portraits and visual descriptors to protagonist
    if (storyData.protagonist) {
      storyData.protagonist.portrait = protagonistPortrait ?? undefined;
      storyData.protagonist.visualDescriptors = protagonistVisualDescriptors
        ? protagonistVisualDescriptors.split(',').map(d => d.trim()).filter(Boolean)
        : [];
    }

    // Add portraits and visual descriptors to supporting characters (keyed by name)
    storyData.characters = storyData.characters.map((char) => ({
      ...char,
      portrait: supportingCharacterPortraits[char.name] ?? undefined,
      visualDescriptors: supportingCharacterVisualDescriptors[char.name]
        ? supportingCharacterVisualDescriptors[char.name].split(',').map(d => d.trim()).filter(Boolean)
        : [],
    }));

    // Create the story using the store, including any imported entries
    const newStory = await story.createStoryFromWizard({
      ...storyData,
      importedEntries: importedEntries.length > 0 ? importedEntries : undefined,
    });

    // Load and navigate to the story
    await story.loadStory(newStory.id);
    ui.setActivePanel('story');
    onClose();
  }

  // Step title
  const stepTitles = [
    'Choose Your Mode',
    'Import Lorebook (Optional)',
    'Select a Genre',
    'Describe Your Setting',
    'Create Your Character',
    'Character Portraits (Optional)',
    'Writing Style',
    'Generate Opening',
  ];

  // Portrait generation functions
  async function generateProtagonistPortrait() {
    if (!protagonist || isGeneratingProtagonistPortrait) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      portraitError = 'NanoGPT API key required for portrait generation';
      return;
    }

    const descriptors = protagonistVisualDescriptors.trim();
    if (!descriptors) {
      portraitError = 'Add appearance descriptors first';
      return;
    }

    isGeneratingProtagonistPortrait = true;
    portraitError = null;

    try {
      // Get style prompt
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
        stylePrompt = 'Soft cel-shaded anime illustration. Muted pastel color palette. Dreamy, airy atmosphere.';
      }

      // Build portrait prompt
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };

      const portraitPrompt = promptService.renderPrompt('image-portrait-generation', promptContext, {
        imageStylePrompt: stylePrompt,
        visualDescriptors: descriptors,
        characterName: protagonist.name,
      });

      // Generate
      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || 'z-image-turbo',
        size: '1024x1024',
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      protagonistPortrait = `data:image/png;base64,${response.images[0].b64_json}`;
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to generate portrait';
    } finally {
      isGeneratingProtagonistPortrait = false;
    }
  }

  async function generateSupportingCharacterPortrait(charName: string) {
    const char = supportingCharacters.find(c => c.name === charName);
    if (!char || generatingPortraitName !== null) return;

    const imageSettings = settings.systemServicesSettings.imageGeneration;
    if (!imageSettings.nanoGptApiKey) {
      portraitError = 'NanoGPT API key required for portrait generation';
      return;
    }

    const descriptors = (supportingCharacterVisualDescriptors[charName] || '').trim();
    if (!descriptors) {
      portraitError = `Add appearance descriptors for ${char.name} first`;
      return;
    }

    generatingPortraitName = charName;
    portraitError = null;

    try {
      // Get style prompt
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
        stylePrompt = 'Soft cel-shaded anime illustration. Muted pastel color palette. Dreamy, airy atmosphere.';
      }

      // Build portrait prompt
      const promptContext = {
        mode: 'adventure' as const,
        pov: 'second' as const,
        tense: 'present' as const,
        protagonistName: '',
      };

      const portraitPrompt = promptService.renderPrompt('image-portrait-generation', promptContext, {
        imageStylePrompt: stylePrompt,
        visualDescriptors: descriptors,
        characterName: char.name,
      });

      // Generate
      const provider = new NanoGPTImageProvider(imageSettings.nanoGptApiKey);
      const response = await provider.generateImage({
        prompt: portraitPrompt,
        model: imageSettings.portraitModel || 'z-image-turbo',
        size: '1024x1024',
        response_format: 'b64_json',
      });

      if (response.images.length === 0 || !response.images[0].b64_json) {
        throw new Error('No image data returned');
      }

      supportingCharacterPortraits[charName] = `data:image/png;base64,${response.images[0].b64_json}`;
      supportingCharacterPortraits = { ...supportingCharacterPortraits }; // Trigger reactivity
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to generate portrait';
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

  // Portrait upload handlers
  let isUploadingProtagonistPortrait = $state(false);
  let uploadingCharacterName = $state<string | null>(null);

  async function handleProtagonistPortraitUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isUploadingProtagonistPortrait = true;
    portraitError = null;

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file');
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be smaller than 5MB');
      }

      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string' || !result.startsWith('data:image/')) {
            reject(new Error('Failed to read image data'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      protagonistPortrait = dataUrl;
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to upload portrait';
    } finally {
      isUploadingProtagonistPortrait = false;
      // Reset input
      input.value = '';
    }
  }

  async function handleSupportingCharacterPortraitUpload(event: Event, charName: string) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploadingCharacterName = charName;
    portraitError = null;

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please select an image file');
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be smaller than 5MB');
      }

      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result !== 'string' || !result.startsWith('data:image/')) {
            reject(new Error('Failed to read image data'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      supportingCharacterPortraits[charName] = dataUrl;
      supportingCharacterPortraits = { ...supportingCharacterPortraits }; // Trigger reactivity
    } catch (error) {
      portraitError = error instanceof Error ? error.message : 'Failed to upload portrait';
    } finally {
      uploadingCharacterName = null;
      // Reset input
      input.value = '';
    }
  }

  // Check if image generation is enabled
  const imageGenerationEnabled = $derived(
    settings.systemServicesSettings.imageGeneration.enabled &&
    !!settings.systemServicesSettings.imageGeneration.nanoGptApiKey
  );

  // Lorebook import functions
  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    importError = null;
    isImporting = true;

    try {
      const content = await file.text();
      const result = parseSillyTavernLorebook(content);

      if (!result.success) {
        importError = result.errors.join('; ') || 'Failed to parse lorebook';
        importedLorebook = null;
        importedEntries = [];
        isImporting = false;
        return;
      }

      if (result.entries.length === 0) {
        importError = 'No valid entries found in this file. Please select a valid lorebook JSON file.';
        importedLorebook = null;
        importedEntries = [];
        isImporting = false;
        return;
      }

      importedLorebook = result;

      // Run LLM classification if we have entries and an API key is available
      if (result.entries.length > 0 && !settings.needsApiKey) {
        isImporting = false;
        isClassifying = true;
        classificationProgress = { current: 0, total: result.entries.length };

        try {
          const classifiedEntries = await classifyEntriesWithLLM(
            result.entries,
            (current, total) => {
              classificationProgress = { current, total };
            },
            selectedMode
          );
          importedEntries = classifiedEntries;
        } catch (classifyError) {
          console.error('LLM classification failed:', classifyError);
          // Fall back to keyword-based classification
          importedEntries = result.entries;
        } finally {
          isClassifying = false;
        }
      } else {
        importedEntries = result.entries;
        isImporting = false;
      }
    } catch (err) {
      importError = err instanceof Error ? err.message : 'Failed to read file';
      importedLorebook = null;
      importedEntries = [];
      isImporting = false;
      isClassifying = false;
    }
  }

function clearImport() {
    importedLorebook = null;
    importedEntries = [];
    importError = null;
    isClassifying = false;
    classificationProgress = { current: 0, total: 0 };
    if (importFileInput) {
      importFileInput.value = '';
    }
  }

  // Character Card Import handler
  async function handleCardImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    cardImportError = null;
    isImportingCard = true;

    try {
      // Read the file (handles both JSON and PNG formats)
      const content = await readCharacterCardFile(file);
      const result = await convertCardToScenario(
        content,
        selectedMode,
        selectedGenre
      );

      if (!result.success && result.errors.length > 0) {
        // Show error but still use fallback if available
        cardImportError = result.errors.join('; ');
      }

      if (result.settingSeed) {
        // Set the setting seed from the card
        settingSeed = result.settingSeed;
        // Clear any previous expanded setting since we have new content
        expandedSetting = null;
      }

      if (result.npcs && result.npcs.length > 0) {
        // Add imported NPCs to supporting characters
        supportingCharacters = [...supportingCharacters, ...result.npcs];
        // Also store reference for display purposes
        importedCardNpcs = result.npcs;
      }

      // Store card-imported opening scene data for step 7
      if (result.storyTitle) {
        cardImportedTitle = result.storyTitle;
        storyTitle = result.storyTitle; // Pre-fill the story title
      }
      if (result.firstMessage) {
        cardImportedFirstMessage = result.firstMessage;
        cardImportedAlternateGreetings = result.alternateGreetings || [];
        selectedGreetingIndex = 0;
      }

      // Reset the file input
      if (cardImportFileInput) {
        cardImportFileInput.value = '';
      }
    } catch (err) {
      cardImportError = err instanceof Error ? err.message : 'Failed to import character card';
    } finally {
      isImportingCard = false;
    }
  }

  function clearCardImport() {
    // Remove card-imported NPCs from supporting characters
    if (importedCardNpcs.length > 0) {
      const importedNames = new Set(importedCardNpcs.map(n => n.name));
      supportingCharacters = supportingCharacters.filter(c => !importedNames.has(c.name));
    }
    importedCardNpcs = [];
    cardImportError = null;
    cardImportedTitle = null;
    cardImportedFirstMessage = null;
    cardImportedAlternateGreetings = [];
    selectedGreetingIndex = 0;
    if (cardImportFileInput) {
      cardImportFileInput.value = '';
    }
  }

  // Get entry type icon color
  function getTypeColor(type: EntryType): string {
    switch (type) {
      case 'character': return 'text-blue-400';
      case 'location': return 'text-green-400';
      case 'item': return 'text-yellow-400';
      case 'faction': return 'text-purple-400';
      case 'concept': return 'text-cyan-400';
      case 'event': return 'text-red-400';
      default: return 'text-surface-400';
    }
  }

  // Check if setting seed contains {{user}} placeholder
  const hasUserPlaceholder = $derived(settingSeed.includes('{{user}}'));

  // Helper to style {{user}} placeholders in text for display
  // Returns HTML with {{user}} styled as inline tags
  function styleUserPlaceholders(text: string): string {
    return text.replace(
      /\{\{user\}\}/gi,
      '<span class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-primary-600/30 text-primary-300 text-xs font-mono border border-primary-500/40">{{user}}</span>'
    );
  }

  // Derived import summary
  const importSummary = $derived(
    importedEntries.length > 0 ? getImportSummary(importedEntries) : null
  );
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
  role="dialog"
  aria-modal="true"
>
  <div class="card w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-surface-700 pb-4 shrink-0">
      <div>
        <h2 class="text-xl font-semibold text-surface-100">Create New Story</h2>
        <p class="text-sm text-surface-400">
          Step {currentStep} of {totalSteps}: {stepTitles[currentStep - 1]}
        </p>
      </div>
      <button
        class="btn-ghost rounded-lg p-2 text-surface-400 hover:text-surface-100"
        onclick={onClose}
      >
        <X class="h-5 w-5" />
      </button>
    </div>

    <!-- Progress Bar -->
    <div class="py-3 shrink-0">
      <div class="flex gap-1">
        {#each Array(totalSteps) as _, i}
          <div
            class="h-1.5 flex-1 rounded-full transition-colors"
            class:bg-primary-500={i < currentStep}
            class:bg-surface-700={i >= currentStep}
          ></div>
        {/each}
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto py-4 min-h-0">
      {#if needsApiKey}
        <!-- API Key Warning -->
        <div class="flex flex-col items-center justify-center py-8 text-center">
          <div class="rounded-full bg-amber-500/20 p-4 mb-4">
            <Sparkles class="h-8 w-8 text-amber-400" />
          </div>
          <h3 class="text-lg font-semibold text-surface-100 mb-2">API Key Required</h3>
          <p class="text-surface-400 mb-4 max-w-md">
            The setup wizard uses AI to dynamically generate your story world.
            Please configure your OpenRouter API key in settings first.
          </p>
          <button
            class="btn btn-primary"
            onclick={() => { ui.openSettings(); onClose(); }}
          >
            Open Settings
          </button>
        </div>
      {:else if currentStep === 1}
        <!-- Step 1: Mode Selection -->
        <div class="space-y-4">
          <p class="text-surface-400">How do you want to experience your story?</p>
          <div class="grid gap-4 sm:grid-cols-2">
            <button
              class="card p-6 text-left transition-all hover:border-primary-500/50"
              class:ring-2={selectedMode === 'adventure'}
              class:ring-primary-500={selectedMode === 'adventure'}
              onclick={() => selectedMode = 'adventure'}
            >
              <div class="flex items-center gap-4 mb-3">
                <div class="rounded-lg bg-primary-900/50 p-3">
                  <Sword class="h-6 w-6 text-primary-400" />
                </div>
                <span class="text-lg font-semibold text-surface-100">Adventure Mode</span>
              </div>
              <p class="text-sm text-surface-400">
                <strong>You are the protagonist.</strong> Explore the world, interact with characters,
                and make choices that shape your story. The AI narrates the consequences of your actions.
              </p>
            </button>
            <button
              class="card p-6 text-left transition-all hover:border-secondary-500/50"
              class:ring-2={selectedMode === 'creative-writing'}
              class:ring-secondary-500={selectedMode === 'creative-writing'}
              onclick={() => selectedMode = 'creative-writing'}
            >
              <div class="flex items-center gap-4 mb-3">
                <div class="rounded-lg bg-secondary-900/50 p-3">
                  <Feather class="h-6 w-6 text-secondary-400" />
                </div>
                <span class="text-lg font-semibold text-surface-100">Creative Writing</span>
              </div>
              <p class="text-sm text-surface-400">
                <strong>You are the author.</strong> Direct the story and craft the narrative.
                The AI collaborates with you to write prose following your creative vision.
              </p>
            </button>
          </div>
        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Import Lorebook (Optional) -->
        <div class="space-y-4">
          <p class="text-surface-400">
            Import an existing lorebook to populate your world with characters, locations, and lore.
            This step is optional - you can skip it and add content later.
          </p>

          {#if !importedLorebook || isClassifying}
            <!-- File Upload Area -->
            <div
              class="card bg-surface-900 border-dashed border-2 border-surface-600 p-8 text-center hover:border-accent-500/50 transition-colors cursor-pointer"
              class:pointer-events-none={isImporting || isClassifying}
              onclick={() => !isImporting && !isClassifying && importFileInput?.click()}
              onkeydown={(e) => e.key === 'Enter' && !isImporting && !isClassifying && importFileInput?.click()}
              role="button"
              tabindex="0"
            >
              <input
                type="file"
                accept=".json,application/json,*/*"
                class="hidden"
                bind:this={importFileInput}
                onchange={handleFileSelect}
              />
              {#if isImporting}
                <Loader2 class="h-8 w-8 mx-auto mb-2 text-accent-400 animate-spin" />
                <p class="text-surface-300">Parsing lorebook...</p>
              {:else if isClassifying}
                <Loader2 class="h-8 w-8 mx-auto mb-2 text-accent-400 animate-spin" />
                <p class="text-surface-300 font-medium">Classifying entries with AI...</p>
                <p class="text-xs text-surface-500 mt-1">
                  {classificationProgress.current} / {classificationProgress.total} entries
                </p>
                <div class="mt-3 w-full max-w-xs mx-auto bg-surface-700 rounded-full h-2">
                  <div
                    class="bg-accent-500 h-2 rounded-full transition-all duration-300"
                    style="width: {classificationProgress.total > 0 ? (classificationProgress.current / classificationProgress.total) * 100 : 0}%"
                  ></div>
                </div>
              {:else}
                <Upload class="h-8 w-8 mx-auto mb-2 text-surface-500" />
                <p class="text-surface-300 font-medium">Click to upload a lorebook</p>
                <p class="text-xs text-surface-500 mt-1">Supports SillyTavern lorebook format (.json)</p>
              {/if}
            </div>

            {#if importError && !isClassifying}
              <div class="card bg-red-500/10 border-red-500/30 p-3 flex items-start gap-2">
                <AlertCircle class="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p class="text-sm text-red-400">{importError}</p>
              </div>
            {/if}
          {:else if !isClassifying}
            <!-- Import Results -->
            <div class="card bg-surface-900 p-4 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <FileJson class="h-5 w-5 text-accent-400" />
                  <span class="font-medium text-surface-100">
                    Lorebook Imported
                  </span>
                  {#if importedLorebook.success}
                    <Check class="h-4 w-4 text-green-400" />
                  {/if}
                </div>
                <button
                  class="text-xs text-surface-400 hover:text-surface-200"
                  onclick={clearImport}
                >
                  Clear
                </button>
              </div>

              {#if importSummary}
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <div class="card bg-surface-800 p-3">
                    <div class="text-2xl font-bold text-surface-100">{importSummary.total}</div>
                    <div class="text-xs text-surface-400">Total Entries</div>
                  </div>
                  <div class="card bg-surface-800 p-3">
                    <div class="text-2xl font-bold text-surface-100">{importSummary.withContent}</div>
                    <div class="text-xs text-surface-400">With Content</div>
                  </div>
                </div>

                <!-- Type Breakdown -->
                <div class="space-y-2">
                  <h4 class="text-xs font-medium text-surface-400 uppercase">By Type</h4>
                  <div class="flex flex-wrap gap-2">
                    {#each Object.entries(importSummary.byType) as [type, count]}
                      {#if count > 0}
                        <span class="px-2 py-1 rounded-full bg-surface-700 text-xs {getTypeColor(type as EntryType)}">
                          {type}: {count}
                        </span>
                      {/if}
                    {/each}
                  </div>
                </div>

                <!-- Entry Preview List -->
                {#if importedEntries.length > 0}
                  <div class="space-y-2">
                    <h4 class="text-xs font-medium text-surface-400 uppercase">Preview (first 10)</h4>
                    <div class="max-h-40 overflow-y-auto space-y-1">
                      {#each importedEntries.slice(0, 10) as entry}
                        <div class="flex items-center gap-2 text-sm p-2 rounded bg-surface-800">
                          <span class="px-1.5 py-0.5 rounded text-xs {getTypeColor(entry.type)} bg-surface-700">
                            {entry.type}
                          </span>
                          <span class="text-surface-200 truncate flex-1">{entry.name}</span>
                          {#if entry.keywords.length > 0}
                            <span class="text-xs text-surface-500">{entry.keywords.length} keywords</span>
                          {/if}
                        </div>
                      {/each}
                      {#if importedEntries.length > 10}
                        <p class="text-xs text-surface-500 text-center py-2">
                          ...and {importedEntries.length - 10} more entries
                        </p>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/if}

              {#if importedLorebook.warnings.length > 0}
                <div class="text-xs text-amber-400">
                  {importedLorebook.warnings.length} warning(s) during import
                </div>
              {/if}
            </div>
          {/if}

          <p class="text-xs text-surface-500 text-center">
            Imported entries will be added to your story's lorebook after creation.
          </p>
        </div>

      {:else if currentStep === 3}
        <!-- Step 3: Genre Selection -->
        <div class="space-y-4">
          <p class="text-surface-400">What kind of story do you want to tell?</p>
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {#each genres as genre}
              {@const Icon = genre.icon}
              <button
                class="card p-4 text-left transition-all hover:border-accent-500/50"
                class:ring-2={selectedGenre === genre.id}
                class:ring-accent-500={selectedGenre === genre.id}
                onclick={() => selectedGenre = genre.id}
              >
                <div class="flex items-center gap-3 mb-2">
                  <div class="rounded-lg bg-surface-700 p-2">
                    <Icon class="h-5 w-5 text-accent-400" />
                  </div>
                  <span class="font-medium text-surface-100">{genre.name}</span>
                </div>
                <p class="text-xs text-surface-400">{genre.description}</p>
              </button>
            {/each}
          </div>
          {#if selectedGenre === 'custom'}
            <div class="mt-4">
              <label class="mb-2 block text-sm font-medium text-surface-300">
                Describe your genre
              </label>
              <input
                type="text"
                bind:value={customGenre}
                placeholder="e.g., Steampunk Western, Cosmic Horror, Slice-of-Life Fantasy..."
                class="input"
              />
            </div>
          {/if}
        </div>

{:else if currentStep === 4}
        <!-- Step 4: Setting -->
        <div class="space-y-4">
          <p class="text-surface-400">
            Describe your world in a few sentences. The AI will expand it into a rich setting.
          </p>

          <!-- Character Card Import -->
          <div class="card bg-surface-800/50 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <FileJson class="h-4 w-4 text-surface-400" />
                <span class="text-sm font-medium text-surface-300">Import Character Card</span>
                <span class="text-xs text-surface-500">(Optional)</span>
              </div>
              {#if importedCardNpcs.length > 0}
                <button
                  class="text-xs text-surface-400 hover:text-surface-200"
                  onclick={clearCardImport}
                >
                  Clear
                </button>
              {/if}
            </div>
            <p class="text-xs text-surface-500">
              Import a SillyTavern character card (.json or .png) to generate a setting with the character as an NPC.
            </p>
            <div class="flex items-center gap-2">
              <input
                type="file"
                accept=".json,.png,application/json,image/png"
                class="hidden"
                bind:this={cardImportFileInput}
                onchange={handleCardImport}
              />
              <button
                class="btn btn-secondary btn-sm flex items-center gap-2"
                onclick={() => cardImportFileInput?.click()}
                disabled={isImportingCard}
              >
                {#if isImportingCard}
                  <Loader2 class="h-3 w-3 animate-spin" />
                  Converting...
                {:else}
                  <Upload class="h-3 w-3" />
                  Select Card
                {/if}
              </button>
              {#if importedCardNpcs.length > 0}
                <span class="text-xs text-green-400 flex items-center gap-1">
                  <Check class="h-3 w-3" />
                  Imported: {importedCardNpcs.map(n => n.name).join(', ')}
                </span>
              {/if}
            </div>
            {#if cardImportError}
              <p class="text-xs text-red-400">{cardImportError}</p>
            {/if}
          </div>

          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">
              Setting Seed
            </label>
            <textarea
              bind:value={settingSeed}
              placeholder="e.g., A kingdom where music is magic, and bards are the most powerful beings. An ancient evil stirs in the Silent Lands, where no song has been heard for a thousand years..."
              class="input min-h-[100px] resize-none"
              rows="4"
            ></textarea>
            {#if hasUserPlaceholder}
              <p class="text-xs text-surface-500 mt-1 flex items-center gap-1">
                <span class="inline-flex items-center px-1 py-0.5 rounded bg-primary-600/30 text-primary-300 text-[10px] font-mono border border-primary-500/40">{'{{user}}'}</span>
                will be replaced with your character's name from Step 5
              </p>
            {/if}
          </div>

          {#if settingSeed.trim().length > 0 && !expandedSetting}
            <div class="flex flex-wrap gap-2">
              <button
                class="btn btn-secondary flex items-center gap-2"
                onclick={useSettingAsIs}
              >
                <Check class="h-4 w-4" />
                Use As-Is
              </button>
              <button
                class="btn btn-primary flex items-center gap-2"
                onclick={expandSetting}
                disabled={isExpandingSetting}
              >
                {#if isExpandingSetting}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Expanding...
                {:else}
                  <Sparkles class="h-4 w-4" />
                  Expand with AI
                {/if}
              </button>
            </div>
          {/if}

          {#if settingError}
            <p class="text-sm text-red-400">{settingError}</p>
          {/if}

          {#if expandedSetting}
            <div class="card bg-surface-900 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-surface-100">{expandedSetting.name}</h3>
                <div class="flex gap-2">
                  <button
                    class="text-xs text-surface-400 hover:text-surface-200 flex items-center gap-1"
                    onclick={() => expandedSetting = null}
                  >
                    <PenTool class="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1"
                    onclick={expandSetting}
                    disabled={isExpandingSetting}
                  >
                    <RefreshCw class="h-3 w-3 {isExpandingSetting ? 'animate-spin' : ''}" />
                    {isExpandingSetting ? 'Regenerating...' : 'Regenerate'}
                  </button>
                </div>
              </div>
              <p class="text-sm text-surface-300 whitespace-pre-wrap">{expandedSetting.description}</p>

              {#if expandedSetting.keyLocations.length > 0}
                <div>
                  <h4 class="text-xs font-medium text-surface-400 uppercase mb-1">Key Locations</h4>
                  <ul class="text-sm text-surface-300 space-y-1">
                    {#each expandedSetting.keyLocations as location}
                      <li><strong>{location.name}:</strong> {location.description}</li>
                    {/each}
                  </ul>
                </div>
              {/if}

              <div class="flex flex-wrap gap-2">
                {#each expandedSetting.themes as theme}
                  <span class="px-2 py-0.5 rounded-full bg-surface-700 text-xs text-surface-300">{theme}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if currentStep === 5}
        <!-- Step 5: Protagonist/Characters -->
        <div class="space-y-4">
          <p class="text-surface-400">
            {selectedMode === 'adventure'
              ? 'Create your character for this adventure.'
              : 'Define the main characters for your story.'}
          </p>

          {#if !expandedSetting}
            <div class="card bg-amber-500/10 border-amber-500/30 p-4">
              <p class="text-sm text-amber-400">
                Go back to Step 4 and expand your setting first. This helps create a more fitting character.
              </p>
            </div>
          {:else}
            <!-- Protagonist Section -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h3 class="font-medium text-surface-100">
                  {selectedMode === 'adventure' ? 'Your Character' : 'Main Character'}
                </h3>
              </div>

              {#if protagonistError}
                <p class="text-sm text-red-400">{protagonistError}</p>
              {/if}

              {#if showManualInput && !protagonist}
                <!-- Manual Character Input Form -->
                <div class="card bg-surface-900 p-4 space-y-4">
                  <p class="text-sm text-surface-400">
                    Enter your character details below. You can use them as-is, have AI elaborate on them, or generate a completely new character.
                  </p>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">Character Name</label>
                    <input
                      type="text"
                      bind:value={manualCharacterName}
                      placeholder="e.g., Alex, Jordan, Sam..."
                      class="input"
                    />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">Description</label>
                    <textarea
                      bind:value={manualCharacterDescription}
                      placeholder="Physical appearance, demeanor, notable features..."
                      class="input min-h-[60px] resize-none"
                      rows="2"
                    ></textarea>
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">Background</label>
                    <textarea
                      bind:value={manualCharacterBackground}
                      placeholder="Where they come from, their history..."
                      class="input min-h-[60px] resize-none"
                      rows="2"
                    ></textarea>
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">Motivation</label>
                    <input
                      type="text"
                      bind:value={manualCharacterMotivation}
                      placeholder="What drives them? What do they seek?"
                      class="input"
                    />
                  </div>

                  <div>
                    <label class="mb-1 block text-xs font-medium text-surface-400">Traits (comma-separated)</label>
                    <input
                      type="text"
                      bind:value={manualCharacterTraits}
                      placeholder="e.g., brave, curious, stubborn, compassionate..."
                      class="input"
                    />
                  </div>

                  <div class="flex flex-wrap gap-2 pt-2 border-t border-surface-700">
                    <button
                      class="btn btn-secondary btn-sm flex items-center gap-1"
                      onclick={useManualCharacter}
                      disabled={!manualCharacterName.trim()}
                      title="Use character as entered"
                    >
                      <User class="h-3 w-3" />
                      Use As-Is
                    </button>
                    <button
                      class="btn btn-primary btn-sm flex items-center gap-1"
                      onclick={elaborateCharacter}
                      disabled={isElaboratingCharacter || (!manualCharacterName.trim() && !manualCharacterDescription.trim() && !manualCharacterBackground.trim())}
                      title="Have AI expand on your character details"
                    >
                      {#if isElaboratingCharacter}
                        <Loader2 class="h-3 w-3 animate-spin" />
                        Elaborating...
                      {:else}
                        <Sparkles class="h-3 w-3" />
                        Elaborate with AI
                      {/if}
                    </button>
                    <button
                      class="btn btn-secondary btn-sm flex items-center gap-1"
                      onclick={generateProtagonist}
                      disabled={isGeneratingProtagonist}
                      title="Generate a completely new character from scratch"
                    >
                      {#if isGeneratingProtagonist}
                        <RefreshCw class="h-3 w-3 animate-spin" />
                        Generating...
                      {:else}
                        <RefreshCw class="h-3 w-3" />
                        Generate New
                      {/if}
                    </button>
                  </div>
                </div>
              {:else if protagonist}
                <!-- Generated/Final Character Display -->
                <div class="card bg-surface-900 p-4 space-y-2">
                  <div class="flex items-start justify-between">
                    <h4 class="font-semibold text-surface-100">{protagonist.name}</h4>
                    <div class="flex gap-1">
                      <button
                        class="text-xs text-surface-400 hover:text-surface-200 flex items-center gap-1"
                        onclick={editCharacter}
                        title="Edit character details"
                      >
                        <PenTool class="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        class="text-xs text-accent-400 hover:text-accent-300 flex items-center gap-1 ml-2"
                        onclick={generateProtagonist}
                        disabled={isGeneratingProtagonist}
                        title="Generate a different character"
                      >
                        <RefreshCw class="h-3 w-3 {isGeneratingProtagonist ? 'animate-spin' : ''}" />
                        {isGeneratingProtagonist ? 'Regenerating...' : 'Regenerate'}
                      </button>
                    </div>
                  </div>
                  <p class="text-sm text-surface-300">{protagonist.description}</p>
                  {#if protagonist.background}
                    <p class="text-sm text-surface-400"><strong>Background:</strong> {protagonist.background}</p>
                  {/if}
                  {#if protagonist.motivation}
                    <p class="text-sm text-surface-400"><strong>Motivation:</strong> {protagonist.motivation}</p>
                  {/if}
                  {#if protagonist.traits && protagonist.traits.length > 0}
                    <div class="flex flex-wrap gap-1">
                      {#each protagonist.traits as trait}
                        <span class="px-2 py-0.5 rounded-full bg-primary-900/50 text-xs text-primary-400">{trait}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else}
                <!-- Fallback: Show generate button -->
                <div class="card bg-surface-900 border-dashed border-2 border-surface-600 p-6 text-center">
                  <p class="text-surface-400 mb-3">Enter your own character details or generate one with AI</p>
                  <div class="flex justify-center gap-2">
                    <button
                      class="btn btn-secondary btn-sm"
                      onclick={() => showManualInput = true}
                    >
                      Enter Manually
                    </button>
                    <button
                      class="btn btn-primary btn-sm flex items-center gap-1"
                      onclick={generateProtagonist}
                      disabled={isGeneratingProtagonist}
                    >
                      {#if isGeneratingProtagonist}
                        <Loader2 class="h-3 w-3 animate-spin" />
                      {:else}
                        <Sparkles class="h-3 w-3" />
                      {/if}
                      Generate Character
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Hint when no protagonist is defined -->
            {#if !protagonist && !showManualInput}
              <p class="text-xs text-surface-500 italic">
                Tip: While optional, having a protagonist helps the AI create more personalized story content.
              </p>
            {/if}

            <!-- Supporting Characters (Creative Mode Only) -->
            {#if selectedMode === 'creative-writing'}
              <div class="space-y-3 pt-4 border-t border-surface-700">
                <div class="flex items-center justify-between">
                  <h3 class="font-medium text-surface-100">Supporting Cast</h3>
                  <div class="flex gap-2">
                    <button
                      class="btn btn-secondary btn-sm flex items-center gap-1"
                      onclick={openSupportingCharacterForm}
                      disabled={showSupportingCharacterForm}
                    >
                      <Plus class="h-3 w-3" />
                      Add
                    </button>
                    <button
                      class="btn btn-secondary btn-sm flex items-center gap-1"
                      onclick={generateCharacters}
                      disabled={isGeneratingCharacters || !protagonist}
                      title="Generate 3 AI characters at once"
                    >
                      {#if isGeneratingCharacters}
                        <Loader2 class="h-3 w-3 animate-spin" />
                        Generating...
                      {:else}
                        <Sparkles class="h-3 w-3" />
                        Generate 3
                      {/if}
                    </button>
                  </div>
                </div>

                <!-- Supporting Character Form -->
                {#if showSupportingCharacterForm}
                  <div class="card bg-surface-900 p-4 space-y-4">
                    <p class="text-sm text-surface-400">
                      {editingSupportingCharacterIndex !== null ? 'Edit' : 'Add'} a supporting character. You can use them as-is or have AI elaborate on them.
                    </p>

                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">Name</label>
                        <input
                          type="text"
                          bind:value={supportingCharacterName}
                          placeholder="e.g., Lady Vivienne"
                          class="input"
                        />
                      </div>
                      <div>
                        <label class="mb-1 block text-xs font-medium text-surface-400">Role</label>
                        <input
                          type="text"
                          bind:value={supportingCharacterRole}
                          placeholder="e.g., ally, antagonist, mentor..."
                          class="input"
                        />
                      </div>
                    </div>

                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Description</label>
                      <textarea
                        bind:value={supportingCharacterDescription}
                        placeholder="Physical appearance, personality, notable features..."
                        class="input min-h-[60px] resize-none"
                        rows="2"
                      ></textarea>
                    </div>

                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Relationship to Protagonist</label>
                      <input
                        type="text"
                        bind:value={supportingCharacterRelationship}
                        placeholder="e.g., Childhood friend, rival from academy..."
                        class="input"
                      />
                    </div>

                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Traits (comma-separated)</label>
                      <input
                        type="text"
                        bind:value={supportingCharacterTraits}
                        placeholder="e.g., cunning, loyal, mysterious..."
                        class="input"
                      />
                    </div>

                    <div class="flex flex-wrap gap-2 pt-2 border-t border-surface-700">
                      <button
                        class="btn btn-secondary btn-sm flex items-center gap-1"
                        onclick={useSupportingCharacterAsIs}
                        disabled={!supportingCharacterName.trim()}
                        title="Use character as entered"
                      >
                        <Check class="h-3 w-3" />
                        Use As-Is
                      </button>
                      <button
                        class="btn btn-primary btn-sm flex items-center gap-1"
                        onclick={elaborateSupportingCharacter}
                        disabled={isElaboratingSupportingCharacter || (!supportingCharacterName.trim() && !supportingCharacterDescription.trim())}
                        title="Have AI expand on character details"
                      >
                        {#if isElaboratingSupportingCharacter}
                          <Loader2 class="h-3 w-3 animate-spin" />
                          Elaborating...
                        {:else}
                          <Sparkles class="h-3 w-3" />
                          Elaborate with AI
                        {/if}
                      </button>
                      <button
                        class="btn btn-secondary btn-sm flex items-center gap-1"
                        onclick={cancelSupportingCharacterForm}
                      >
                        <X class="h-3 w-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                {/if}

                <!-- Character List -->
                {#if supportingCharacters.length > 0}
                  <div class="space-y-2">
                    {#each supportingCharacters as char, index}
                      <div class="card bg-surface-900 p-3">
                        <div class="flex items-start justify-between mb-1">
                          <div class="flex items-center gap-2">
                            <span class="font-medium text-surface-100">{char.name}</span>
                            <span class="text-xs px-1.5 py-0.5 rounded bg-accent-500/20 text-accent-400">{char.role}</span>
                          </div>
                          <div class="flex gap-1">
                            <button
                              class="text-xs text-surface-400 hover:text-surface-200 flex items-center gap-1 p-1"
                              onclick={() => editSupportingCharacter(index)}
                              title="Edit character"
                            >
                              <PenTool class="h-3 w-3" />
                            </button>
                            <button
                              class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 p-1"
                              onclick={() => deleteSupportingCharacter(index)}
                              title="Delete character"
                            >
                              <Trash2 class="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                        <p class="text-sm text-surface-300">{char.description}</p>
                        {#if char.relationship}
                          <p class="text-xs text-surface-400 mt-1">{char.relationship}</p>
                        {/if}
                        {#if char.traits && char.traits.length > 0}
                          <div class="flex flex-wrap gap-1 mt-1">
                            {#each char.traits as trait}
                              <span class="px-1.5 py-0.5 rounded-full bg-surface-700 text-xs text-surface-400">{trait}</span>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {:else if !showSupportingCharacterForm}
                  <p class="text-sm text-surface-500 italic">
                    No supporting characters yet. Add one manually or generate multiple with AI.
                  </p>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

      {:else if currentStep === 6}
        <!-- Step 6: Character Portraits -->
        <div class="space-y-4">
          <p class="text-surface-400">
            Upload or generate portrait images for your characters. In portrait mode, only characters with portraits can appear in story images.
          </p>

          {#if !imageGenerationEnabled}
            <div class="card bg-amber-500/10 border-amber-500/30 p-4">
              <p class="text-sm text-amber-400">
                Image generation is not configured. You can still upload portraits manually, or enable generation in Settings &gt; Image Generation.
              </p>
            </div>
          {/if}

          {#if portraitError}
              <div class="card bg-red-500/10 border-red-500/30 p-3">
                <p class="text-sm text-red-400">{portraitError}</p>
              </div>
            {/if}

            <!-- Protagonist Portrait -->
            {#if protagonist}
              <div class="card bg-surface-900 p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-medium text-surface-100">{protagonist.name}</h3>
                  <span class="text-xs px-2 py-0.5 rounded bg-primary-500/20 text-primary-400">Protagonist</span>
                </div>

                <div class="flex gap-4">
                  <!-- Portrait Preview -->
                  <div class="shrink-0">
                    {#if protagonistPortrait}
                      <div class="relative">
                        <img
                          src={normalizeImageDataUrl(protagonistPortrait) ?? ''}
                          alt="{protagonist.name} portrait"
                          class="w-24 h-24 rounded-lg object-cover ring-1 ring-surface-600"
                        />
                        <button
                          class="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                          onclick={removeProtagonistPortrait}
                          title="Remove portrait"
                        >
                          <X class="h-3 w-3" />
                        </button>
                      </div>
                    {:else}
                      <div class="w-24 h-24 rounded-lg border-2 border-dashed border-surface-600 bg-surface-800 flex items-center justify-center">
                        <User class="h-8 w-8 text-surface-600" />
                      </div>
                    {/if}
                  </div>

                  <!-- Appearance Input & Generate/Upload Buttons -->
                  <div class="flex-1 space-y-2">
                    <div>
                      <label class="mb-1 block text-xs font-medium text-surface-400">Appearance (comma-separated)</label>
                      <textarea
                        bind:value={protagonistVisualDescriptors}
                        placeholder="e.g., long silver hair, violet eyes, fair skin, elegant dark blue coat..."
                        class="input text-sm min-h-[60px] resize-none"
                        rows="2"
                      ></textarea>
                    </div>
                    <div class="flex gap-2">
                      <label class="btn btn-secondary btn-sm flex items-center gap-1 cursor-pointer">
                        {#if isUploadingProtagonistPortrait}
                          <Loader2 class="h-3 w-3 animate-spin" />
                          Uploading...
                        {:else}
                          <ImageUp class="h-3 w-3" />
                          Upload
                        {/if}
                        <input
                          type="file"
                          accept="image/*"
                          class="hidden"
                          onchange={handleProtagonistPortraitUpload}
                          disabled={isUploadingProtagonistPortrait || isGeneratingProtagonistPortrait}
                        />
                      </label>
                      {#if imageGenerationEnabled}
                        <button
                          class="btn btn-secondary btn-sm flex items-center gap-1"
                          onclick={generateProtagonistPortrait}
                          disabled={isGeneratingProtagonistPortrait || isUploadingProtagonistPortrait || !protagonistVisualDescriptors.trim()}
                          title={!protagonistVisualDescriptors.trim() ? 'Add appearance descriptors to generate' : ''}
                        >
                          {#if isGeneratingProtagonistPortrait}
                            <Loader2 class="h-3 w-3 animate-spin" />
                            Generating...
                          {:else}
                            <Wand2 class="h-3 w-3" />
                            {protagonistPortrait ? 'Regenerate' : 'Generate'}
                          {/if}
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {:else}
              <div class="card bg-surface-900 border-dashed border-2 border-surface-600 p-4 text-center">
                <p class="text-surface-400 text-sm">No protagonist created. Go back to step 5 to create one.</p>
              </div>
            {/if}

            <!-- Supporting Character Portraits -->
            {#if supportingCharacters.length > 0}
              <div class="space-y-3">
                <h4 class="text-sm font-medium text-surface-300">Supporting Characters</h4>
                {#each supportingCharacters as char, index}
                  <div class="card bg-surface-900 p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <h3 class="font-medium text-surface-100">{char.name}</h3>
                      <span class="text-xs px-2 py-0.5 rounded bg-accent-500/20 text-accent-400">{char.role}</span>
                    </div>

                    <div class="flex gap-4">
                      <!-- Portrait Preview -->
                      <div class="shrink-0">
                        {#if supportingCharacterPortraits[char.name]}
                          <div class="relative">
                            <img
                              src={normalizeImageDataUrl(supportingCharacterPortraits[char.name]) ?? ''}
                              alt="{char.name} portrait"
                              class="w-24 h-24 rounded-lg object-cover ring-1 ring-surface-600"
                            />
                            <button
                              class="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white hover:bg-red-600"
                              onclick={() => removeSupportingCharacterPortrait(char.name)}
                              title="Remove portrait"
                            >
                              <X class="h-3 w-3" />
                            </button>
                          </div>
                        {:else}
                          <div class="w-24 h-24 rounded-lg border-2 border-dashed border-surface-600 bg-surface-800 flex items-center justify-center">
                            <User class="h-8 w-8 text-surface-600" />
                          </div>
                        {/if}
                      </div>

                      <!-- Appearance Input & Generate/Upload Buttons -->
                      <div class="flex-1 space-y-2">
                        <div>
                          <label class="mb-1 block text-xs font-medium text-surface-400">Appearance (comma-separated)</label>
                          <textarea
                            value={supportingCharacterVisualDescriptors[char.name] || ''}
                            oninput={(e) => {
                              supportingCharacterVisualDescriptors[char.name] = e.currentTarget.value;
                              supportingCharacterVisualDescriptors = { ...supportingCharacterVisualDescriptors };
                            }}
                            placeholder="e.g., short dark hair, green eyes, athletic build..."
                            class="input text-sm min-h-[60px] resize-none"
                            rows="2"
                          ></textarea>
                        </div>
                        <div class="flex gap-2">
                          <label class="btn btn-secondary btn-sm flex items-center gap-1 cursor-pointer">
                            {#if uploadingCharacterName === char.name}
                              <Loader2 class="h-3 w-3 animate-spin" />
                              Uploading...
                            {:else}
                              <ImageUp class="h-3 w-3" />
                              Upload
                            {/if}
                            <input
                              type="file"
                              accept="image/*"
                              class="hidden"
                              onchange={(e) => handleSupportingCharacterPortraitUpload(e, char.name)}
                              disabled={uploadingCharacterName !== null || generatingPortraitName !== null}
                            />
                          </label>
                          {#if imageGenerationEnabled}
                            <button
                              class="btn btn-secondary btn-sm flex items-center gap-1"
                              onclick={() => generateSupportingCharacterPortrait(char.name)}
                              disabled={generatingPortraitName !== null || uploadingCharacterName !== null || !(supportingCharacterVisualDescriptors[char.name] || '').trim()}
                              title={!(supportingCharacterVisualDescriptors[char.name] || '').trim() ? 'Add appearance descriptors to generate' : ''}
                            >
                              {#if generatingPortraitName === char.name}
                                <Loader2 class="h-3 w-3 animate-spin" />
                                Generating...
                              {:else}
                                <Wand2 class="h-3 w-3" />
                                {supportingCharacterPortraits[char.name] ? 'Regenerate' : 'Generate'}
                              {/if}
                            </button>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

          {#if !protagonist && supportingCharacters.length === 0}
            <div class="card bg-surface-900 border-dashed border-2 border-surface-600 p-6 text-center">
              <p class="text-surface-400">No characters created yet. Go back to step 5 to create characters.</p>
            </div>
          {/if}

          <p class="text-xs text-surface-500 text-center">
            Portraits are optional. You can skip this step and add portraits later from the Characters panel.
          </p>
        </div>

      {:else if currentStep === 7}
        <!-- Step 7: Writing Style -->
        <div class="space-y-6">
          <p class="text-surface-400">Customize how your story will be written.</p>

          <!-- POV Selection -->
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">Point of View</label>
            <div class="grid gap-2 grid-cols-3">
              {#each povOptions as option}
                <button
                  class="card p-3 text-center transition-all"
                  class:ring-2={selectedPOV === option.id}
                  class:ring-accent-500={selectedPOV === option.id}
                  onclick={() => selectedPOV = option.id}
                >
                  <span class="block font-medium text-surface-100">{option.label}</span>
                  <span class="text-xs text-surface-400">{option.example}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Tense Selection -->
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">Tense</label>
            <div class="grid grid-cols-2 gap-2">
              {#each tenseOptions as option}
                <button
                  class="card p-3 text-center transition-all"
                  class:ring-2={selectedTense === option.id}
                  class:ring-accent-500={selectedTense === option.id}
                  onclick={() => selectedTense = option.id}
                >
                  <span class="block font-medium text-surface-100">{option.label}</span>
                  <span class="text-xs text-surface-400">{option.example}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Tone Selection -->
          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">Tone</label>
            <div class="flex flex-wrap gap-2 mb-2">
              {#each tonePresets as preset}
                <button
                  class="px-3 py-1 rounded-full text-sm transition-colors"
                  class:bg-accent-500={tone === preset}
                  class:text-white={tone === preset}
                  class:bg-surface-700={tone !== preset}
                  class:text-surface-300={tone !== preset}
                  class:hover:bg-surface-600={tone !== preset}
                  onclick={() => tone = preset}
                >
                  {preset}
                </button>
              {/each}
            </div>
<input
              type="text"
              bind:value={tone}
              placeholder="Or describe your own tone..."
              class="input"
            />
          </div>

          <!-- Visual Prose Mode Toggle -->
          <div class="card bg-surface-800/50 p-4">
            <div class="flex items-start gap-3">
              <div class="rounded-full bg-surface-700 p-2">
                <Sparkles class="h-5 w-5 text-accent-400" />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-medium text-surface-200">Visual Prose Mode</div>
                  <button
                    type="button"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-surface-800"
                    class:bg-accent-600={visualProseMode}
                    class:bg-surface-600={!visualProseMode}
                    onclick={() => visualProseMode = !visualProseMode}
                    role="switch"
                    aria-checked={visualProseMode}
                    aria-label="Toggle Visual Prose Mode"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      class:translate-x-5={visualProseMode}
                      class:translate-x-0={!visualProseMode}
                    ></span>
                  </button>
                </div>
<p class="mt-1 text-xs text-surface-400">
                  Enable rich HTML/CSS visual output. The AI can create styled layouts, dialogue boxes, and atmospheric effects. Best for immersive, cinematic storytelling.
                </p>
              </div>
            </div>
          </div>

          <!-- Inline Image Mode Toggle -->
          <div class="card bg-surface-800/50 p-4">
            <div class="flex items-start gap-3">
              <div class="rounded-full bg-surface-700 p-2">
                <ImageIcon class="h-5 w-5 text-blue-400" />
              </div>
              <div class="flex-1">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-medium text-surface-200">Inline Image Mode</div>
                  <button
                    type="button"
                    class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-surface-800"
                    class:bg-accent-600={inlineImageMode}
                    class:bg-surface-600={!inlineImageMode}
                    onclick={() => inlineImageMode = !inlineImageMode}
                    role="switch"
                    aria-checked={inlineImageMode}
                    aria-label="Toggle Inline Image Mode"
                  >
                    <span
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                      class:translate-x-5={inlineImageMode}
                      class:translate-x-0={!inlineImageMode}
                    ></span>
                  </button>
                </div>
                <p class="mt-1 text-xs text-surface-400">
                  AI places image tags directly in the narrative. Images are generated inline where the AI decides they fit best. Requires image generation to be configured.
                </p>
              </div>
            </div>
          </div>
        </div>

      {:else if currentStep === 8}
        <!-- Step 8: Generate Opening -->
        <div class="space-y-4">
          <p class="text-surface-400">
            Give your story a title and generate the opening scene.
          </p>

          <div>
            <label class="mb-2 block text-sm font-medium text-surface-300">Story Title</label>
            <input
              type="text"
              bind:value={storyTitle}
              placeholder="Enter a title for your adventure..."
              class="input"
            />
          </div>

          <!-- Imported Opening Scene from Character Card -->
          {#if cardImportedFirstMessage}
            <div class="card bg-surface-800/50 p-4 space-y-3">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <FileJson class="h-4 w-4 text-accent-400" />
                  <h4 class="font-medium text-surface-200">Imported Opening Scene</h4>
                </div>
                <button
                  class="text-xs text-surface-400 hover:text-surface-200"
                  onclick={() => {
                    cardImportedFirstMessage = null;
                    cardImportedAlternateGreetings = [];
                    selectedGreetingIndex = 0;
                  }}
                >
                  Clear
                </button>
              </div>

              <!-- Greeting Selection (if alternate greetings exist) -->
              {#if cardImportedAlternateGreetings.length > 0}
                <div>
                  <label class="mb-2 block text-xs font-medium text-surface-400">Select Opening</label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="px-3 py-1.5 rounded text-xs transition-colors {selectedGreetingIndex === 0 ? 'bg-accent-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
                      onclick={() => selectedGreetingIndex = 0}
                    >
                      Default
                    </button>
                    {#each cardImportedAlternateGreetings as _, i}
                      <button
                        class="px-3 py-1.5 rounded text-xs transition-colors {selectedGreetingIndex === i + 1 ? 'bg-accent-600 text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
                        onclick={() => selectedGreetingIndex = i + 1}
                      >
                        Alt {i + 1}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Preview of selected opening -->
              <div class="card bg-surface-900 p-3 max-h-48 overflow-y-auto">
                <p class="text-sm text-surface-300 whitespace-pre-wrap">
                  {@html styleUserPlaceholders(selectedGreetingIndex === 0 ? (cardImportedFirstMessage || '') : (cardImportedAlternateGreetings[selectedGreetingIndex - 1] || ''))}
                </p>
              </div>
              {#if (selectedGreetingIndex === 0 ? cardImportedFirstMessage : cardImportedAlternateGreetings[selectedGreetingIndex - 1])?.includes('{{user}}')}
                <p class="text-xs text-surface-500 flex items-center gap-1">
                  <span class="inline-flex items-center px-1 py-0.5 rounded bg-primary-600/30 text-primary-300 text-[10px] font-mono border border-primary-500/40">{'{{user}}'}</span>
                  will be replaced with your character's name
                </p>
              {/if}

              <button
                class="btn btn-primary btn-sm flex items-center gap-2"
                onclick={() => {
                  const selectedScene = selectedGreetingIndex === 0
                    ? cardImportedFirstMessage
                    : cardImportedAlternateGreetings[selectedGreetingIndex - 1];
                  generatedOpening = {
                    title: storyTitle,
                    scene: selectedScene || '',
                    initialLocation: {
                      name: expandedSetting?.keyLocations?.[0]?.name || 'Starting Location',
                      description: expandedSetting?.keyLocations?.[0]?.description || 'The scene begins here.'
                    }
                  };
                }}
              >
                <Check class="h-3 w-3" />
                Use This Opening
              </button>
            </div>
          {/if}

          <!-- Opening Scene Guidance (Creative Writing Mode Only) -->
          {#if selectedMode === 'creative-writing'}
            <div class="card bg-surface-900 p-4 space-y-3">
              <div class="flex items-center gap-2">
                <Feather class="h-4 w-4 text-secondary-400" />
                <h4 class="font-medium text-surface-200">Opening Scene Guidance</h4>
                <span class="text-xs text-surface-500">(Optional)</span>
              </div>
              <p class="text-sm text-surface-400">
                As the author, describe what you want to happen in the opening scene. Include setting details, character positions, mood, or specific events.
              </p>
              <textarea
                bind:value={openingGuidance}
                placeholder="e.g., The scene opens at night in a crowded tavern. Sarah sits alone in a corner, nursing a drink, when a mysterious stranger approaches her table with urgent news about her missing brother..."
                class="input min-h-[100px] resize-y text-sm"
                rows="4"
              ></textarea>
            </div>
          {/if}

          {#if storyTitle.trim()}
            <div class="flex items-center gap-3">
              <button
                class="btn btn-secondary flex items-center gap-2"
                onclick={generateOpeningScene}
                disabled={isGeneratingOpening}
              >
                {#if isGeneratingOpening}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  Generating Opening...
                {:else}
                  <PenTool class="h-4 w-4" />
                  {generatedOpening ? 'Regenerate Opening' : 'Generate Opening Scene'}
                {/if}
              </button>
              {#if !generatedOpening && !isGeneratingOpening && !cardImportedFirstMessage}
                <span class="text-sm text-amber-400">Required to begin story</span>
              {:else if !generatedOpening && !isGeneratingOpening && cardImportedFirstMessage}
                <span class="text-sm text-surface-400">Or use the imported opening above</span>
              {/if}
            </div>
          {:else}
            <p class="text-sm text-surface-500">Enter a title to generate the opening scene</p>
          {/if}

          {#if openingError}
            <p class="text-sm text-red-400">{openingError}</p>
          {/if}

          {#if generatedOpening}
            <div class="card bg-surface-900 p-4 max-h-64 overflow-y-auto">
              <h3 class="font-semibold text-surface-100 mb-2">
                {generatedOpening?.title || storyTitle}
              </h3>
              <div class="prose prose-invert prose-sm max-w-none">
                <p class="text-surface-300 whitespace-pre-wrap">
                  {generatedOpening?.scene || ''}
                </p>
              </div>
            </div>
          {/if}

          <!-- Summary -->
          <div class="card bg-surface-800 p-4 space-y-2 text-sm">
            <h4 class="font-medium text-surface-200">Story Summary</h4>
            <div class="grid grid-cols-2 gap-2 text-surface-400">
              <div><strong>Mode:</strong> {selectedMode === 'adventure' ? 'Adventure' : 'Creative Writing'}</div>
              <div><strong>Genre:</strong> {selectedGenre === 'custom' ? customGenre : selectedGenre}</div>
              <div><strong>POV:</strong> {povOptions.find(p => p.id === selectedPOV)?.label}</div>
              <div><strong>Tense:</strong> {tenseOptions.find(t => t.id === selectedTense)?.label}</div>
              {#if expandedSetting}
                <div class="col-span-2"><strong>Setting:</strong> {expandedSetting.name}</div>
              {/if}
              {#if protagonist}
                <div class="col-span-2"><strong>Protagonist:</strong> {protagonist.name}</div>
              {/if}
              {#if importedEntries.length > 0}
                <div class="col-span-2 flex items-center gap-2">
                  <Book class="h-4 w-4 text-accent-400" />
                  <strong>Lorebook:</strong> {importedEntries.length} entries to import
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Footer Navigation -->
    <div class="flex justify-between border-t border-surface-700 pt-4 shrink-0">
      <button
        class="btn btn-secondary flex items-center gap-1"
        onclick={prevStep}
        disabled={currentStep === 1}
      >
        <ChevronLeft class="h-4 w-4" />
        Back
      </button>

      {#if currentStep === totalSteps}
        <button
          class="btn btn-primary flex items-center gap-2"
          onclick={createStory}
          disabled={!storyTitle.trim() || isGeneratingOpening || !generatedOpening}
          title={!generatedOpening ? 'Generate an opening scene first' : ''}
        >
          <Play class="h-4 w-4" />
          Begin Story
        </button>
      {:else}
        <button
          class="btn btn-primary flex items-center gap-1"
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
