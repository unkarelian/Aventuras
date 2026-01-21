-- Add translation columns to story_entries
ALTER TABLE story_entries ADD COLUMN translated_content TEXT;
ALTER TABLE story_entries ADD COLUMN translation_language TEXT;
ALTER TABLE story_entries ADD COLUMN original_input TEXT;

-- Add translation columns to characters
ALTER TABLE characters ADD COLUMN translated_name TEXT;
ALTER TABLE characters ADD COLUMN translated_description TEXT;
ALTER TABLE characters ADD COLUMN translated_relationship TEXT;
ALTER TABLE characters ADD COLUMN translated_traits TEXT;
ALTER TABLE characters ADD COLUMN translated_visual_descriptors TEXT;
ALTER TABLE characters ADD COLUMN translation_language TEXT;

-- Add translation columns to locations
ALTER TABLE locations ADD COLUMN translated_name TEXT;
ALTER TABLE locations ADD COLUMN translated_description TEXT;
ALTER TABLE locations ADD COLUMN translation_language TEXT;

-- Add translation columns to items
ALTER TABLE items ADD COLUMN translated_name TEXT;
ALTER TABLE items ADD COLUMN translated_description TEXT;
ALTER TABLE items ADD COLUMN translation_language TEXT;

-- Add translation columns to story_beats
ALTER TABLE story_beats ADD COLUMN translated_title TEXT;
ALTER TABLE story_beats ADD COLUMN translated_description TEXT;
ALTER TABLE story_beats ADD COLUMN translation_language TEXT;
