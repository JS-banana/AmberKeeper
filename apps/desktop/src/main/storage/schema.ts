import type { DatabaseSync } from 'node:sqlite';
import { ensureCaptureCorePersistenceSchema } from '@amberkeeper/capture-core';

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
  sort_order INTEGER NOT NULL DEFAULT 0,
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

const APP_SETTINGS_SCHEMA = `
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY,
  interface_language TEXT NOT NULL DEFAULT 'system',
  capture_save_scope TEXT NOT NULL DEFAULT 'complete',
  active_service_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const CUSTOM_SERVICES_SCHEMA = `
CREATE TABLE IF NOT EXISTS custom_services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_url TEXT NOT NULL,
  launch_url TEXT NOT NULL,
  icon_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_services_enabled
  ON custom_services(enabled);

CREATE INDEX IF NOT EXISTS idx_custom_services_sort_order
  ON custom_services(sort_order);
`;

export function ensureCaptureStoreSchema(db: DatabaseSync): void {
  ensureCaptureCorePersistenceSchema(db);
  db.exec(PROVIDERS_SCHEMA);
  ensureProvidersSortOrderColumn(db);
  ensureProvidersCacheEnabledColumn(db);
  db.exec(CAPTURE_ATTEMPT_LOGS_SCHEMA);
  db.exec(APP_SETTINGS_SCHEMA);
  ensureAppSettingsActiveServiceIdColumn(db);
  ensureAppSettingsCaptureSaveScopeColumn(db);
  db.exec(CUSTOM_SERVICES_SCHEMA);
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

function ensureProvidersCacheEnabledColumn(db: DatabaseSync): void {
  const columns = db
    .prepare(
      `
        PRAGMA table_info(providers)
      `
    )
    .all() as Array<{ name?: string }>;

  if (columns.some((column) => column.name === 'cache_enabled')) {
    return;
  }

  db.exec('ALTER TABLE providers ADD COLUMN cache_enabled INTEGER NOT NULL DEFAULT 1;');
}

function ensureProvidersSortOrderColumn(db: DatabaseSync): void {
  const columns = db
    .prepare(
      `
        PRAGMA table_info(providers)
      `
    )
    .all() as Array<{ name?: string }>;

  if (columns.some((column) => column.name === 'sort_order')) {
    return;
  }

  db.exec('ALTER TABLE providers ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;');
}

function ensureAppSettingsActiveServiceIdColumn(db: DatabaseSync): void {
  const columns = db
    .prepare(
      `
        PRAGMA table_info(app_settings)
      `
    )
    .all() as Array<{ name?: string }>;

  if (columns.some((column) => column.name === 'active_service_id')) {
    return;
  }

  db.exec('ALTER TABLE app_settings ADD COLUMN active_service_id TEXT;');
}

function ensureAppSettingsCaptureSaveScopeColumn(db: DatabaseSync): void {
  const columns = db
    .prepare(
      `
        PRAGMA table_info(app_settings)
      `
    )
    .all() as Array<{ name?: string }>;

  if (columns.some((column) => column.name === 'capture_save_scope')) {
    return;
  }

  db.exec("ALTER TABLE app_settings ADD COLUMN capture_save_scope TEXT NOT NULL DEFAULT 'complete';");
}
