-- Schema for ai-chat-prototype server.
-- SQLite storage for chats, messages (as ai-sdk UIMessage parts) and
-- in-flight generation state (used to support resume/cancel).

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  parts TEXT NOT NULL, -- JSON array of ai-sdk UIMessage parts
  status TEXT NOT NULL CHECK (status IN ('complete', 'streaming', 'aborted', 'error')),
  seq INTEGER NOT NULL, -- preserves message order within a chat
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_seq ON messages (chat_id, seq);

-- One row per chat: tracks the currently active (or last) generation so a
-- disconnected client can resume it, and so "cancel" has something to flip.
CREATE TABLE IF NOT EXISTS generation_state (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  accumulated_chunks TEXT NOT NULL DEFAULT '[]', -- JSON array of UIMessageChunk
  is_active INTEGER NOT NULL DEFAULT 0,
  abort_requested INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
