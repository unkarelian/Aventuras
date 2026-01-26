-- Simplify Character Vault: Remove type distinction (protagonist/supporting)
-- and type-specific fields (background, motivation, role, relationship_template).
-- These concepts are now handled in the Story Wizard, not the global Vault.

CREATE TABLE character_vault_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    
    -- Common fields (mirroring Character interface)
    traits TEXT NOT NULL DEFAULT '[]',
    visual_descriptors TEXT NOT NULL DEFAULT '[]',
    portrait TEXT,
    
    -- Organization
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    source TEXT,
    original_story_id TEXT,
    metadata TEXT,
    
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

INSERT INTO character_vault_new (
    id, name, description,
    traits, visual_descriptors, portrait,
    tags, favorite,
    source, original_story_id, metadata,
    created_at, updated_at
)
SELECT 
    id, name, description,
    traits, visual_descriptors, portrait,
    tags, favorite,
    source, original_story_id, metadata,
    created_at, updated_at
FROM character_vault;

DROP TABLE character_vault;

ALTER TABLE character_vault_new RENAME TO character_vault;

-- Recreate indices
CREATE INDEX IF NOT EXISTS idx_character_vault_name ON character_vault(name);
CREATE INDEX IF NOT EXISTS idx_character_vault_favorite ON character_vault(favorite);
