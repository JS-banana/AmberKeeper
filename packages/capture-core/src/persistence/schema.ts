import type { DatabaseSync } from 'node:sqlite';

export const CAPTURE_CORE_PERSISTENCE_SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  remote_conversation_id TEXT,
  source_session_key TEXT NOT NULL,
  page_url TEXT NOT NULL,
  title TEXT,
  title_source TEXT NOT NULL DEFAULT 'fallback',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_remote
  ON conversations(provider, remote_conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversations_fallback
  ON conversations(provider, source_session_key);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  remote_conversation_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  remote_message_id TEXT,
  model TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source TEXT NOT NULL,
  source_session_key TEXT NOT NULL,
  page_url TEXT NOT NULL,
  remote_conversation_id TEXT,
  event_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capture_events_created
  ON capture_events(created_at DESC);
`;

export function ensureCaptureCorePersistenceSchema(db: DatabaseSync): void {
  db.exec(CAPTURE_CORE_PERSISTENCE_SCHEMA);
  ensureConversationTitleColumns(db);
}

function ensureConversationTitleColumns(db: DatabaseSync): void {
  const columns = db
    .prepare(
      `
        PRAGMA table_info(conversations)
      `
    )
    .all() as Array<{ name?: string }>;

  if (!columns.some((column) => column.name === 'title')) {
    db.exec('ALTER TABLE conversations ADD COLUMN title TEXT;');
  }

  if (!columns.some((column) => column.name === 'title_source')) {
    db.exec("ALTER TABLE conversations ADD COLUMN title_source TEXT NOT NULL DEFAULT 'fallback';");
  }
}
