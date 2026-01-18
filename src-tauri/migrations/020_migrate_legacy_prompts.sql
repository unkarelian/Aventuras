-- Migrate legacy systemPromptOverride to centralized prompt system
-- Stories with old-style prompts (no macros) will have systemPromptOverride cleared
-- They will fall back to the centralized prompt system which is better maintained

-- Clear systemPromptOverride for stories that don't have the modern macro syntax
-- A prompt is considered "legacy" if it doesn't contain {{styleInstruction}} or {{responseInstruction}}
UPDATE stories
SET settings = json_remove(settings, '$.systemPromptOverride')
WHERE settings IS NOT NULL
  AND json_extract(settings, '$.systemPromptOverride') IS NOT NULL
  AND json_extract(settings, '$.systemPromptOverride') NOT LIKE '%{{styleInstruction}}%'
  AND json_extract(settings, '$.systemPromptOverride') NOT LIKE '%{{responseInstruction}}%';

-- Also clear template_id for stories using BUILTIN_TEMPLATES since we're moving to seeds
-- These stories will now use the centralized prompt system based on mode
UPDATE stories
SET template_id = NULL
WHERE template_id IN (
  'fantasy-adventure',
  'scifi-exploration',
  'mystery-investigation',
  'horror-survival',
  'slice-of-life',
  'custom'
);