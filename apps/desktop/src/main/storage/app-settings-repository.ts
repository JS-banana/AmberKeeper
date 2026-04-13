import type { DatabaseSync } from 'node:sqlite';
import type { InterfaceLanguage } from '@amberkeeper/shared-types';

type AppSettingsRow = {
  id: number;
  interfaceLanguage: string;
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
  };
}

function seedAppSettings(db: DatabaseSync): void {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT OR IGNORE INTO app_settings (
        id,
        interface_language,
        created_at,
        updated_at
      ) VALUES (1, 'system', ?, ?)
    `
  ).run(now, now);
}

function normalizeInterfaceLanguage(language: string | null | undefined): InterfaceLanguage {
  return INTERFACE_LANGUAGES.find((entry) => entry === language) ?? 'system';
}
