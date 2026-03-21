import type { DatabaseSync } from 'node:sqlite';
import type { ProviderId, ProviderRecord } from '@amberkeeper/shared-types';
import {
  BUILT_IN_BROWSER_SESSION_CONFIGS,
  type BrowserSessionConfig,
} from '../runtime/browser-session';

type ProviderRow = {
  id: ProviderId;
  name: string;
  homeUrl: string;
  enabled: number;
  builtin: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export function createProviderSettingsRepository(db: DatabaseSync) {
  seedBuiltInProviders(db);
  const listProviders = (): ProviderRecord[] => {
    return sortProviders(
      db
        .prepare(
          `
            SELECT
              id,
              name,
              home_url AS homeUrl,
              enabled,
              builtin,
              active,
              created_at AS createdAt,
              updated_at AS updatedAt
            FROM providers
          `
        )
        .all()
        .map((row) => mapProviderRow(row as ProviderRow))
    );
  };

  return {
    list(): ProviderRecord[] {
      return listProviders();
    },
    getActive(): ProviderRecord | null {
      return listProviders().find((provider) => provider.active) ?? null;
    },
    setActive(providerId: ProviderId): ProviderRecord {
      return runInTransaction(db, () => {
        const provider = getProviderById(db, providerId);
        if (!provider) {
          throw new Error(`Unknown provider: ${providerId}.`);
        }
        if (!provider.enabled) {
          throw new Error(`Cannot activate disabled provider: ${providerId}.`);
        }

        setActiveProvider(db, providerId, new Date().toISOString());

        return getProviderById(db, providerId) as ProviderRecord;
      });
    },
    setEnabled(providerId: ProviderId, enabled: boolean): ProviderRecord {
      return runInTransaction(db, () => {
        const provider = getProviderById(db, providerId);
        if (!provider) {
          throw new Error(`Unknown provider: ${providerId}.`);
        }
        if (provider.enabled === enabled) {
          return provider;
        }

        if (!enabled) {
          const enabledProviders = listProviders().filter((entry) => entry.enabled);
          if (enabledProviders.length === 1 && enabledProviders[0]?.id === providerId) {
            throw new Error('At least one provider must remain enabled.');
          }
        }

        const updatedAt = new Date().toISOString();
        db.prepare(
          `
            UPDATE providers
            SET
              enabled = ?,
              active = CASE
                WHEN ? = 0 THEN 0
                ELSE active
              END,
              updated_at = ?
            WHERE id = ?
          `
        ).run(enabled ? 1 : 0, enabled ? 1 : 0, updatedAt, providerId);

        normalizeActiveProvider(db, updatedAt);

        return getProviderById(db, providerId) as ProviderRecord;
      });
    },
  };
}

function seedBuiltInProviders(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const insertProvider = db.prepare(
    `
      INSERT OR IGNORE INTO providers (
        id,
        name,
        home_url,
        enabled,
        builtin,
        active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  );
  const updateMetadata = db.prepare(
    `
      UPDATE providers
      SET
        name = ?,
        home_url = ?,
        builtin = 1,
        updated_at = CASE
          WHEN name <> ? OR home_url <> ? OR builtin <> 1 THEN ?
          ELSE updated_at
        END
      WHERE id = ?
    `
  );

  runInTransaction(db, () => {
    BUILT_IN_BROWSER_SESSION_CONFIGS.forEach((config, index) => {
      insertProvider.run(
        config.id,
        config.name,
        config.homeUrl,
        1,
        1,
        index === 0 ? 1 : 0,
        now,
        now
      );
      updateMetadata.run(
        config.name,
        config.homeUrl,
        config.name,
        config.homeUrl,
        now,
        config.id
      );
    });

    normalizeActiveProvider(db, now);
  });
}

function normalizeActiveProvider(db: DatabaseSync, updatedAt: string): void {
  const providers = sortProviders(
    db
      .prepare(
        `
          SELECT
            id,
            name,
            home_url AS homeUrl,
            enabled,
            builtin,
            active,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM providers
        `
      )
      .all()
      .map((row) => mapProviderRow(row as ProviderRow))
  );
  const enabledProviders = providers.filter((provider) => provider.enabled);

  if (enabledProviders.length === 0) {
    return;
  }

  const nextActiveProviderId =
    enabledProviders.find((provider) => provider.active)?.id ?? enabledProviders[0]?.id;

  if (!nextActiveProviderId) {
    return;
  }

  setActiveProvider(db, nextActiveProviderId, updatedAt);
}

function setActiveProvider(db: DatabaseSync, providerId: ProviderId, updatedAt: string): void {
  db.prepare(
    `
      UPDATE providers
      SET
        active = CASE
          WHEN id = ? THEN 1
          ELSE 0
        END,
        updated_at = CASE
          WHEN active <> CASE WHEN id = ? THEN 1 ELSE 0 END THEN ?
          ELSE updated_at
        END
    `
  ).run(providerId, providerId, updatedAt);
}

function getProviderById(db: DatabaseSync, providerId: ProviderId): ProviderRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          id,
          name,
          home_url AS homeUrl,
          enabled,
          builtin,
          active,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM providers
        WHERE id = ?
      `
    )
    .get(providerId) as ProviderRow | undefined;

  return row ? mapProviderRow(row) : null;
}

function mapProviderRow(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    name: row.name,
    homeUrl: row.homeUrl,
    enabled: row.enabled === 1,
    builtin: row.builtin === 1,
    active: row.active === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortProviders<T extends { id: ProviderId }>(providers: T[]): T[] {
  const order = new Map<ProviderId, number>(
    BUILT_IN_BROWSER_SESSION_CONFIGS.map((config, index) => [config.id, index] satisfies [
      BrowserSessionConfig['id'],
      number,
    ])
  );

  return [...providers].sort((left, right) => {
    return (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });
}

function runInTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');

  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
