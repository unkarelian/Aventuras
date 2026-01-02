-- Add lore management blacklist column to entries table
-- When true, the entry is hidden from AI lore management (won't be seen or modified)
ALTER TABLE entries ADD COLUMN lore_management_blacklisted INTEGER DEFAULT 0;
