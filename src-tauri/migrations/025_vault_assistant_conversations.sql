-- Migration 025: Vault assistant conversation persistence
-- Stores AI chat conversations for the interactive vault assistant

CREATE TABLE IF NOT EXISTS vault_assistant_conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    messages TEXT NOT NULL  -- JSON blob of conversation history (ModelMessage[])
);
