-- Migration 024: Table-based background images
-- Supports per-branch and per-checkpoint backgrounds

CREATE TABLE IF NOT EXISTS background_images (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    branch_id TEXT,           -- NULL for main branch context
    checkpoint_id TEXT,       -- Linked to a specific checkpoint
    image_data TEXT NOT NULL, -- The image data (URL or base64)
    created_at INTEGER NOT NULL,

    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE CASCADE
);

-- Index for fast lookup by story/branch
CREATE INDEX IF NOT EXISTS idx_backgrounds_branch ON background_images(story_id, branch_id);

-- Index for fast lookup by story/checkpoint
CREATE INDEX IF NOT EXISTS idx_backgrounds_checkpoint ON background_images(story_id, checkpoint_id);
