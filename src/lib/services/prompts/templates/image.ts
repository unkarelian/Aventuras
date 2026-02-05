/**
 * Image Generation Prompt Templates
 *
 * Templates for image generation including style presets,
 * scene analysis, and portrait generation.
 */

import type { PromptTemplate } from '../types'

/**
 * Soft Anime style template
 * Soft cel-shading, muted pastels, dreamy atmosphere
 */
export const softAnimeStyleTemplate: PromptTemplate = {
  id: 'image-style-soft-anime',
  name: 'Soft Anime',
  category: 'image-style',
  description: 'Soft cel-shading, muted pastels, dreamy atmosphere',
  content: `Soft cel-shaded anime illustration with muted pastel color palette. Low saturation, gentle lighting with diffused ambient glow. Subtle linework that blends into the coloring rather than hard outlines. Smooth gradients on shadows, slight bloom effect on highlights and light sources. Dreamy, airy, cozy atmosphere. Studio Ghibli-inspired aesthetic with soft watercolor texture hints in background. Smooth blending on hair and skin with no visible harsh texture. Avoid high contrast, sharp shadows, or dark gritty environments.`,
}

/**
 * Semi-realistic Anime style template
 * Polished, cinematic, detailed rendering
 */
export const semiRealisticAnimeStyleTemplate: PromptTemplate = {
  id: 'image-style-semi-realistic',
  name: 'Semi-realistic Anime',
  category: 'image-style',
  description: 'Polished, cinematic, detailed rendering',
  content: `Digital anime art with polished, detailed rendering. NOT photorealistic - this is stylized anime/digital art with refined details. Anime-style eyes and facial features with expressive proportions. Detailed hair with visible strands, smooth skin with subtle shading, fabric with weight and texture. Clear directional lighting with soft falloff. Cinematic composition with depth of field. Rich colors with professional color grading. Clean linework with painterly rendering. Atmospheric and polished digital illustration style. Think high-quality anime key visual or game CG art. Avoid photorealism, 3D renders, or uncanny valley faces.`,
}

/**
 * Photorealistic style template
 * True-to-life rendering with natural lighting
 */
export const photorealisticStyleTemplate: PromptTemplate = {
  id: 'image-style-photorealistic',
  name: 'Photorealistic',
  category: 'image-style',
  description: 'True-to-life rendering with natural lighting',
  content: `Photorealistic digital art with true-to-life rendering. Natural lighting with accurate shadows and highlights. Detailed textures on skin, fabric, and materials. Accurate human proportions and anatomy. Professional photography aesthetic with cinematic depth of field. High dynamic range with realistic contrast. Detailed environments with accurate perspective. Materials rendered with proper reflectance and subsurface scattering where appropriate. Film grain optional for cinematic feel. 8K quality, hyperrealistic detail.`,
}

/**
 * Image Prompt Analysis template (legacy mode - full character descriptions)
 * Identifies imageable scenes in narrative text for image generation
 */
export const imagePromptAnalysisTemplate: PromptTemplate = {
  id: 'image-prompt-analysis',
  name: 'Image Prompt Analysis',
  category: 'service',
  description: 'Identifies imageable scenes in narrative text for image generation',
  content: `You identify visually striking moments in narrative text for image generation.

## Your Task
Analyze the narrative and identify up to {{maxImages}} key visual moments (0 = unlimited). Create DETAILED, descriptive image prompts (aim for 500-800 characters each). **Do NOT exceed 800 characters per prompt - prompts over 800 characters will cause an error and fail to generate.**

## Style (MUST include in every prompt)
{{imageStylePrompt}}

**You MUST incorporate this full style description into every prompt.** Include multiple style keywords and rendering details.

## Character Reference
{{characterDescriptors}}

## Prompt Requirements
- **Prompt length:** 500-800 characters MAX (prompts over 800 chars will ERROR and fail)
- **sourceText:** Exact phrase from narrative (3-15 words, VERBATIM with all punctuation and *markup*)
- **sceneType:** action|item|character|environment
- **priority:** 1-10

## Prompt Structure (follow this order)
1. **Character appearance** - hair (color, length, style), eyes, skin tone, expression, build
2. **Clothing/accessories** - what they're wearing, distinctive items
3. **Action/pose** - what they're doing, body position
4. **Setting/environment** - where they are, lighting, atmosphere, background details
5. **Style keywords** - copy relevant phrases from the Style section above (lighting, rendering, aesthetic)

## Example Good Prompt
"An anime woman with shoulder-length black hair with subtle blue highlights, sharp teal eyes, and a focused expression. She's wearing a dark fitted coat with silver buttons and a grey scarf, one hand adjusting an earpiece. She's standing on a rain-slicked city rooftop at night, with glowing neon signs and distant skyscrapers blurred in the background. Semi-realistic anime style with refined features, detailed hair strands, realistic fabric and skin rendering, cinematic lighting with cool blue and warm neon accents. Polished and atmospheric with depth of field."

## CRITICAL Rules
1. **ONE CHARACTER PER IMAGE** - only depict a single character per prompt. Background details are fine, but no multiple characters. This ensures character consistency.
2. **NEVER use character names** - the image model doesn't know who "Elena" is. Describe appearance only!
3. **ALWAYS include the full style** - copy style keywords directly from the Style section
4. **Stay under 800 characters** - prompts over 800 chars will ERROR and fail. Aim for 500-800.
5. **sourceText** MUST be COPY-PASTED EXACTLY from the DISPLAY NARRATIVE - this is used for text matching and WILL FAIL if not exact.
   - If a "Display Narrative" is provided (translated text), copy sourceText from THAT version
   - Copy the EXACT characters, including punctuation and any *asterisks* or **markup**
   - Do NOT paraphrase, rephrase, or reword - copy EXACTLY as written
   - Do NOT add asterisks or markup that isn't in the original
   - Do NOT change words (e.g., "her" to "your")
6. **ALWAYS write prompts in ENGLISH** - image generation models work best with English prompts
   - Even if the narrative is in another language, your prompts MUST be in English
   - Use the English narrative context to understand the scene, write English prompts
7. Return empty array [] if no suitable visual moments exist
8. Skip: mundane actions, dialogue-only scenes, abstract concepts

## Priority Guidelines
- 8-10: Dramatic actions, combat, pivotal moments
- 6-8: Significant items, magical effects, reveals
- 5-7: Character introductions, emotions
- 3-5: Environmental shots, atmosphere`,
  userContent: `## Story Context
{{chatHistory}}

{{lorebookContext}}

## User Action
{{userAction}}

## English Narrative (use for understanding context)
{{narrativeResponse}}

{{translatedNarrativeBlock}}

Identify the most visually striking moments and return the JSON array. Remember: sourceText must come from the Display Narrative (translated if provided), but prompts must ALWAYS be in English.`,
}

/**
 * Image Prompt Analysis (Reference Mode) template
 * Identifies imageable scenes for generation with character reference images
 */
export const imagePromptAnalysisReferenceTemplate: PromptTemplate = {
  id: 'image-prompt-analysis-reference',
  name: 'Image Prompt Analysis (Reference Mode)',
  category: 'service',
  description: 'Identifies imageable scenes for generation with character reference images',
  content: `You identify visually striking moments in narrative text for image generation WITH REFERENCE IMAGES.

## Your Task
Analyze the narrative and identify up to {{maxImages}} scene images (0 = unlimited). Portrait generations do NOT count towards this limit - generate portraits freely as needed. Create concise image prompts.

**Prompt length targets:**
- Single character: 200-350 characters
- Multi-character (2-3): 350-500 characters
- Portrait generation: 300-450 characters
- Environment only: 150-250 characters

**MANDATORY: Portrait Requirements**
- ALL characters MUST have a portrait before they can appear in any scene image. This is NOT optional.
- Characters WITHOUT portraits CANNOT be depicted in any scene - they will be invisible/absent from all visuals.
- If a character appears in the narrative but is NOT in the "Characters With Portraits" list below, you MUST generate a portrait for them FIRST (generatePortrait: true).
- You CAN and SHOULD include both portrait generation AND scene images in the same response - the portrait enables the character to appear in subsequent scene images.
- ALWAYS check the portraits list: if a character you want to depict is missing, add a portrait generation entry BEFORE any scene that includes them.
- Think of portraits as "unlocking" a character for visual representation - no portrait = character cannot exist in images.

## Style Keywords (pick 2-3 relevant ones per prompt)
{{imageStylePrompt}}

## Characters With Portraits (can appear in scene images)
{{charactersWithPortraits}}

## Characters Without Portraits (need portrait generation first)
{{charactersWithoutPortraits}}

## Character Visual Descriptors
{{characterDescriptors}}

## CRITICAL: Never Use Character Names in Prompts
Image models don't know who "Elena" or "Marcus" are. Character names are ONLY for the JSON fields, NEVER in the prompt text itself.

**WRONG:** "Elena wielding a sword while Marcus watches"
**RIGHT:** "Woman with silver hair wielding sword, tall man with brown hair watching nearby"

## Output Requirements
- **Prompt:** Concise visual description - NO character names, only visual traits
- **sourceText:** Exact phrase from narrative (3-15 words, VERBATIM)
- **sceneType:** action|item|character|environment
- **priority:** 1-10
- **characters:** Array of character names (first character is primary)
- **generatePortrait:** true for portrait generation, false otherwise

## Prompt Structure

**SINGLE character (has portrait):**
- Use "The character" or "A [gender]" - reference image provides appearance
- Action/pose, expression
- **Dynamic camera angle** - vary the POV to enhance the scene (see Camera Angles below)
- Setting, lighting, atmosphere
- 2-3 style keywords

**MULTI-CHARACTER (2-3, all have portraits):**
- Describe each by KEY visual traits only (hair color/style, one distinctive feature)
- Spatial arrangement (left/right, foreground/background, facing each other)
- Actions/poses
- **Dynamic camera angle** - choose POV that best captures the interaction
- Brief setting
- 2-3 style keywords

**PORTRAIT generation (generatePortrait: true):**
- Full body, head to feet visible
- Key appearance traits from visual descriptors
- Relaxed standing pose, facing viewer
- **Plain solid color or simple gradient background ONLY** - no objects, no environment, no scenery
- 2-3 style keywords
- (Portraits always use standard front-facing view)

## Camera Angles (vary these to create dynamic images)
- **Low angle** (looking up) - makes characters imposing, heroic, powerful
- **High angle** (looking down) - vulnerability, overview of scene, contemplation
- **Dutch angle** (tilted) - tension, unease, action moments
- **Over-the-shoulder** - conversation scenes, following action
- **Close-up** - emotional intensity, important reactions
- **Wide shot** - establishing location, showing scale, group dynamics
- **Worm's eye view** - extreme drama, towering presence
- **Bird's eye view** - tactical scenes, showing spatial relationships

Match the angle to the emotional tone: action scenes benefit from low/dutch angles, tense conversations from close-ups, epic moments from wide shots.

## Examples

**Single character:**
{
  "prompt": "Low angle shot, the character in defensive stance gripping glowing sword. Rain-soaked alley, neon reflections, dramatic backlighting. Anime style, cinematic.",
  "sourceText": "gripped her sword tightly",
  "sceneType": "action",
  "priority": 8,
  "characters": ["Elena"],
  "generatePortrait": false
}

**Two characters:**
{
  "prompt": "Wide shot, woman with silver hair and man with brown hair stand back-to-back, weapons drawn. Ruined temple at sunset, golden light through columns. Anime style, dynamic.",
  "sourceText": "they stood ready to face the horde together",
  "sceneType": "action",
  "priority": 9,
  "characters": ["Elena", "Marcus"],
  "generatePortrait": false
}

**Three characters:**
{
  "prompt": "Medium shot, red-haired woman laughing, grey-bearded man with crossed arms, black-haired boy grinning between them. Cozy tavern interior, warm firelight. Soft anime, warm colors.",
  "sourceText": "the unlikely trio shared a rare moment of levity",
  "sceneType": "character",
  "priority": 7,
  "characters": ["Lily", "Roland", "Pip"],
  "generatePortrait": false
}

**Portrait generation:**
{
  "prompt": "Full body portrait: tall man, short grey hair, weathered face, brown eyes, stubble. Dark leather armor over grey tunic. Relaxed pose facing viewer, head to feet visible. Plain solid blue-grey gradient background, no objects or scenery. Anime style.",
  "sourceText": "the old mercenary stepped forward",
  "sceneType": "character",
  "priority": 7,
  "characters": ["Marcus"],
  "generatePortrait": true
}

**Environment:**
{
  "prompt": "Ancient library, towering bookshelves, dust motes in golden light through stained glass. Atmospheric, soft anime.",
  "sourceText": "the vast library stretched before them",
  "sceneType": "environment",
  "priority": 5,
  "characters": [],
  "generatePortrait": false
}

## Rules
1. **NEVER use character names in prompts** - only visual descriptions
2. **Keep prompts concise** - don't repeat the entire style block
3. **Maximum 3 characters per image**
4. **Describe characters by distinguishing visual traits** - hair color/style, one key feature
5. **generatePortrait scenes are single-character only**
6. **Include 2-3 style keywords** - not the entire style description
7. **sourceText** MUST be VERBATIM from the DISPLAY NARRATIVE - if a translated version is provided, copy from THAT
8. **ALWAYS write prompts in ENGLISH** - image models work best with English prompts, regardless of narrative language
9. Return empty array [] if no suitable moments exist
10. **MANDATORY: Generate portraits for ALL characters without them** - if ANY character you want to include is not in the portraits list, you MUST add a portrait generation entry BEFORE including them in scenes. No exceptions.

## Priority Guidelines
- 8-10: Combat, pivotal moments, dramatic multi-character interactions
- 6-8: Character introductions, magical effects, significant items
- 5-7: Emotional moments, reveals
- 3-5: Environmental atmosphere`,
  userContent: `## Story Context
{{chatHistory}}

{{lorebookContext}}

## User Action
{{userAction}}

## English Narrative (use for understanding context)
{{narrativeResponse}}

{{translatedNarrativeBlock}}

Identify visually striking moments. Return JSON array. Remember: NEVER use character names in prompts - describe by visual traits only. Keep prompts concise. sourceText must come from the Display Narrative (translated if provided), but prompts must ALWAYS be in English.`,
}

/**
 * Portrait Generation template
 * Direct image prompt template for character portraits
 */
export const imagePortraitGenerationTemplate: PromptTemplate = {
  id: 'image-portrait-generation',
  name: 'Portrait Generation',
  category: 'service',
  description: 'Direct image prompt template for character portraits',
  content: `Full body portrait of a character: {{visualDescriptors}}. Standing in a relaxed natural pose, facing the viewer, full body visible from head to feet. Neutral expression or slight smile. Plain solid color gradient background only, no objects, no environment, no scenery. Portrait composition, centered framing, professional lighting. {{imageStylePrompt}}`,
  userContent: '',
}

/**
 * Image templates array for registration
 */
export const imageTemplates: PromptTemplate[] = [
  softAnimeStyleTemplate,
  semiRealisticAnimeStyleTemplate,
  photorealisticStyleTemplate,
  imagePromptAnalysisTemplate,
  imagePromptAnalysisReferenceTemplate,
  imagePortraitGenerationTemplate,
]
