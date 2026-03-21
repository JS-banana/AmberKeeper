import type { DatabaseSync } from 'node:sqlite';
import { ensureCaptureCorePersistenceSchema } from '@anychat/capture-core';

const CAPTURE_ATTEMPT_LOGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS capture_attempt_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_capture_attempt_logs_created
  ON capture_attempt_logs(created_at DESC);
`;

const PROVIDERS_SCHEMA = `
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  home_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_providers_enabled
  ON providers(enabled);

CREATE INDEX IF NOT EXISTS idx_providers_active
  ON providers(active);
`;

export function ensureCaptureStoreSchema(db: DatabaseSync): void {
  ensureCaptureCorePersistenceSchema(db);
  db.exec(PROVIDERS_SCHEMA);
  db.exec(CAPTURE_ATTEMPT_LOGS_SCHEMA);
}

export function hasTable(db: DatabaseSync, tableName: string): boolean {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `
    )
    .get(tableName) as { name?: string } | undefined;

  return Boolean(row?.name);
}
