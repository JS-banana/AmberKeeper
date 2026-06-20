import type { DatabaseSync } from 'node:sqlite';
import type { CaptureSaveScope, InterfaceLanguage } from '@amberkeeper/shared-types';

type AppSettingsRow = {
  id: number;
  interfaceLanguage: string;
  captureSaveScope: string;
  activeServiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

const INTERFACE_LANGUAGES: InterfaceLanguage[] = ['system', 'zh-CN', 'en'];
const CAPTURE_SAVE_SCOPES: CaptureSaveScope[] = ['complete', 'user'];

export function createAppSettingsRepository(db: DatabaseSync) {
  seedAppSettings(db);

  return {
    getInterfaceLanguage(): InterfaceLanguage {
      const row = db
        .prepare(
          `
            SELECT
              id,
              interface_language AS interfaceLanguage,
              capture_save_scope AS captureSaveScope,
              active_service_id AS activeServiceId,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM app_settings
            WHERE id = 1
          `
        )
        .get() as AppSettingsRow | undefined;

      return normalizeInterfaceLanguage(row?.interfaceLanguage);
    },
    getCaptureSaveScope(): CaptureSaveScope {
      const row = db
        .prepare(
          `
            SELECT
              id,
              interface_language AS interfaceLanguage,
              capture_save_scope AS captureSaveScope,
              active_service_id AS activeServiceId,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM app_settings
            WHERE id = 1
          `
        )
        .get() as AppSettingsRow | undefined;

      return normalizeCaptureSaveScope(row?.captureSaveScope);
    },
    setCaptureSaveScope(saveScope: CaptureSaveScope): CaptureSaveScope {
      const nextSaveScope = normalizeCaptureSaveScope(saveScope);
      const updatedAt = new Date().toISOString();

      db.prepare(
        `
          UPDATE app_settings
          SET
            capture_save_scope = ?,
            updated_at = CASE
              WHEN capture_save_scope <> ? THEN ?
              ELSE updated_at
            END
          WHERE id = 1
        `
      ).run(nextSaveScope, nextSaveScope, updatedAt);

      return nextSaveScope;
    },
    setInterfaceLanguage(language: InterfaceLanguage): InterfaceLanguage {
      const nextLanguage = normalizeInterfaceLanguage(language);
      const updatedAt = new Date().toISOString();

      db.prepare(
        `
          UPDATE app_settings
          SET
            interface_language = ?,
            updated_at = CASE
              WHEN interface_language <> ? THEN ?
              ELSE updated_at
            END
          WHERE id = 1
        `
      ).run(nextLanguage, nextLanguage, updatedAt);

      return nextLanguage;
    },
    getActiveServiceId(): string | null {
      const row = db
        .prepare(
          `
            SELECT
              id,
              interface_language AS interfaceLanguage,
              capture_save_scope AS captureSaveScope,
              active_service_id AS activeServiceId,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM app_settings
            WHERE id = 1
          `
        )
        .get() as AppSettingsRow | undefined;

      return row?.activeServiceId ?? null;
    },
    setActiveServiceId(serviceId: string | null): string | null {
      const updatedAt = new Date().toISOString();

      db.prepare(
        `
          UPDATE app_settings
          SET
            active_service_id = ?,
            updated_at = CASE
              WHEN COALESCE(active_service_id, '') <> COALESCE(?, '') THEN ?
              ELSE updated_at
            END
          WHERE id = 1
        `
      ).run(serviceId, serviceId, updatedAt);

      return serviceId;
    },
  };
}

function seedAppSettings(db: DatabaseSync): void {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT OR IGNORE INTO app_settings (
        id,
        interface_language,
        capture_save_scope,
        active_service_id,
        created_at,
        updated_at
      ) VALUES (1, 'system', 'complete', NULL, ?, ?)
    `
  ).run(now, now);
}

function normalizeInterfaceLanguage(language: string | null | undefined): InterfaceLanguage {
  return INTERFACE_LANGUAGES.find((entry) => entry === language) ?? 'system';
}

function normalizeCaptureSaveScope(saveScope: string | null | undefined): CaptureSaveScope {
  return CAPTURE_SAVE_SCOPES.find((entry) => entry === saveScope) ?? 'complete';
}
