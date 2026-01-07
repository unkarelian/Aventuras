-- Add retry_state column to stories for persistent retry functionality
ALTER TABLE stories ADD COLUMN retry_state TEXT;
