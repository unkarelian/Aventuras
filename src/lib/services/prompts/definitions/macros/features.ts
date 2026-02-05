/**
 * Features Macros - Feature-Specific Macros
 *
 * Simple macros for optional story features:
 * - visualProseInstructions: HTML/CSS creative instructions (Visual Prose Mode)
 * - inlineImageInstructions: <pic> tag instructions (Inline Image Mode)
 * - visualProseBlock: Auto-resolved Visual Prose instructions block
 * - inlineImageBlock: Auto-resolved Inline Image instructions block
 * - responseLength: Target word count for AI responses
 * - targetLanguage: Target language for translation
 * - sourceLanguage: Source language for translation
 */

import type { SimpleMacro } from '../../types'

/**
 * Visual Prose instructions macro - HTML/CSS creative instructions
 * Injected when Visual Prose Mode is enabled for a story
 */
export const visualProseInstructionsMacro: SimpleMacro = {
  id: 'visual-prose-instructions',
  name: 'Visual Prose Instructions',
  token: 'visualProseInstructions',
  type: 'simple',
  builtin: true,
  dynamic: false,
  description: 'HTML/CSS creative instructions injected when Visual Prose Mode is enabled',
  defaultValue: `<VisualProse>
You are also a visual artist with HTML5 and CSS3 at your disposal. Your entire response must be valid HTML.

**OUTPUT FORMAT (CRITICAL):**
Your response must be FULLY STRUCTURED HTML:
- Wrap ALL prose paragraphs in \`<p>\` tags
- Use \`<span>\` with inline styles for colored/styled text (dialogue, emphasis, actions)
- Use \`<div>\` with \`<style>\` blocks for complex visual elements (menus, letters, signs, etc.)
- NO plain text outside of HTML tags - everything must be wrapped

Example structure:
\`\`\`html
<p>She stepped into the tavern, the smell of smoke and ale washing over her.</p>

<p><span style="color: #8B4513;">"Welcome, stranger,"</span> the bartender said, sliding a mug across the counter.</p>

<style>
.tavern-sign { background: #2a1810; padding: 15px; border: 3px solid #8B4513; }
.tavern-sign h2 { color: #d4a574; text-align: center; }
</style>
<div class="tavern-sign">
  <h2>The Rusty Anchor</h2>
  <p>Est. 1847</p>
</div>

<p>She studied the sign, then turned back to her drink.</p>
\`\`\`

**STYLING CAPABILITIES:**
- **Layouts:** CSS Grid, Flexbox, block/inline positioning
- **Styling:** Backgrounds, gradients, typography, borders, colors - themed by scene and genre
- **Interactivity:** :hover, :focus, :active states for subtle effects
- **Animation:** @keyframes for movement, rotation, fading, opacity changes
- **Variables:** CSS Custom Properties (--variable) for theming

**FORBIDDEN:**
- Plain text without HTML tags (NO raw paragraphs - use \`<p>\`)
- Markdown syntax (\`*asterisks*\`, \`**bold**\`) - use \`<em>\`, \`<strong>\`, or \`<span>\` with styles instead
- \`position: fixed/absolute\` - breaks the interface
- \`<script>\` tags - only HTML and CSS
- Box-shadow animation - use border-color, background-color, or opacity instead

**PRINCIPLES:**
- Purpose over flash - every visual choice serves the narrative
- Readability is paramount - never sacrifice text clarity for effects
- Seamless integration - visuals feel like part of the story

Create atmospheric layouts, styled dialogue, themed visual elements. Match visual style to genre and mood.
</VisualProse>`,
}

/**
 * Inline Image instructions macro - <pic> tag instructions
 * Injected when Inline Image Mode is enabled for a story
 */
export const inlineImageInstructionsMacro: SimpleMacro = {
  id: 'inline-image-instructions',
  name: 'Inline Image Instructions',
  token: 'inlineImageInstructions',
  type: 'simple',
  builtin: true,
  dynamic: false,
  description: 'Instructions for embedding <pic> image tags directly in narrative',
  defaultValue: `<InlineImages>
You can embed images directly in your narrative using the <pic> tag. Images will be generated automatically where you place these tags.

**TAG FORMAT:**
<pic prompt="[detailed visual description]" characters="[character names]"></pic>

**ATTRIBUTES:**
- \`prompt\` (REQUIRED): A detailed visual description for image generation. Write as a complete scene description, NOT a reference to the text. **MUST ALWAYS BE IN ENGLISH** regardless of the narrative language.
- \`characters\` (optional): Comma-separated names of characters appearing in the image (for portrait reference).

**USAGE GUIDELINES:**
- Place <pic> tags AFTER the prose that describes the scene they illustrate
- Write prompts as detailed visual descriptions: subject, action, setting, mood, lighting, art style
- Include character names in the "characters" attribute if they appear in the image
- Use sparingly: 1-3 images per response maximum, reserved for impactful visual moments
- Best used for: dramatic reveals, emotional peaks, action climaxes, new locations, important character moments

**EXAMPLE:**
The dragon descended from the storm clouds, its obsidian scales gleaming with each flash of lightning.
<pic prompt="A massive black dragon descending from dark storm clouds, scales gleaming with rain, lightning illuminating the scene, dramatic low angle shot, dark fantasy art style" characters=""></pic>

Elena drew her blade, firelight dancing along the steel edge as she faced the creature.
<pic prompt="Young woman warrior with determined expression drawing a glowing sword, firelight reflecting on blade and face, medieval interior background, dramatic lighting, fantasy art" characters="Elena"></pic>

**CRITICAL RULES:**
- **PROMPTS MUST BE IN ENGLISH** - Image generation models only understand English prompts. Always write the prompt attribute in English, even if the surrounding narrative is in another language.
- The prompt must be a COMPLETE visual description - do not write "the dragon from the scene" or "as described above"
- Never place <pic> tags in the middle of a sentence - always after the descriptive prose
- Do not use <pic> for every scene - reserve for truly striking visual moments
- Keep prompts between 50-150 words for best results
</InlineImages>`,
}

/**
 * Visual Prose block macro - auto-resolved based on visualProseMode in context
 * Empty if disabled
 */
export const visualProseBlockMacro: SimpleMacro = {
  id: 'visual-prose-block',
  name: 'Visual Prose Block',
  token: 'visualProseBlock',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description:
    'Visual Prose instructions - auto-resolved based on visualProseMode in context (empty if disabled)',
  defaultValue: '',
}

/**
 * Inline Image block macro - auto-resolved based on inlineImageMode in context
 * Empty if disabled
 */
export const inlineImageBlockMacro: SimpleMacro = {
  id: 'inline-image-block',
  name: 'Inline Image Block',
  token: 'inlineImageBlock',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description:
    'Inline image instructions - auto-resolved based on inlineImageMode in context (empty if disabled)',
  defaultValue: '',
}

/**
 * Response length macro - target word count for AI responses
 */
export const responseLengthMacro: SimpleMacro = {
  id: 'response-length',
  name: 'Response Length',
  token: 'responseLength',
  type: 'simple',
  builtin: true,
  dynamic: false,
  description: 'Target word count for AI responses',
  defaultValue: '500',
}

/**
 * Target language macro - for translation services
 */
export const targetLanguageMacro: SimpleMacro = {
  id: 'target-language',
  name: 'Target Language',
  token: 'targetLanguage',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The target language for translation (e.g., Spanish, French)',
  defaultValue: 'English',
}

/**
 * Source language macro - for translation services
 */
export const sourceLanguageMacro: SimpleMacro = {
  id: 'source-language',
  name: 'Source Language',
  token: 'sourceLanguage',
  type: 'simple',
  builtin: true,
  dynamic: true,
  description: 'The source language for translation',
  defaultValue: 'auto-detect',
}

/**
 * Combined export for registration
 */
export const featureMacros: SimpleMacro[] = [
  visualProseInstructionsMacro,
  inlineImageInstructionsMacro,
  visualProseBlockMacro,
  inlineImageBlockMacro,
  responseLengthMacro,
  targetLanguageMacro,
  sourceLanguageMacro,
]
