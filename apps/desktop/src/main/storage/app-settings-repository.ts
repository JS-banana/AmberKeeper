import type { DatabaseSync } from 'node:sqlite';
import type { InterfaceLanguage } from '@amberkeeper/shared-types';

type AppSettingsRow = {
  id: number;
  interfaceLanguage: string;
  activeServiceId: string | null;
  createdAt: string;
  updatedAt: string;
};

const INTERFACE_LANGUAGES: InterfaceLanguage[] = ['system', 'zh-CN', 'en'];

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
        active_service_id,
        created_at,
        updated_at
      ) VALUES (1, 'system', NULL, ?, ?)
    `
  ).run(now, now);
}

function normalizeInterfaceLanguage(language: string | null | undefined): InterfaceLanguage {
  return INTERFACE_LANGUAGES.find((entry) => entry === language) ?? 'system';
}
