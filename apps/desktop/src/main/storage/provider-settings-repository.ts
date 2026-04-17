import type { DatabaseSync } from 'node:sqlite';
import type { ProviderId, ProviderMoveDirection, ProviderRecord } from '@amberkeeper/shared-types';
import {
  BUILT_IN_BROWSER_SESSION_CONFIGS,
  type BrowserSessionConfig,
} from '../runtime/browser-session';

type ProviderRow = {
  id: ProviderId;
  name: string;
  homeUrl: string;
  sortOrder: number;
  enabled: number;
  cacheEnabled: number;
  builtin: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export function createProviderSettingsRepository(db: DatabaseSync) {
  seedBuiltInProviders(db);
  const listProviders = (): ProviderRecord[] => {
    const rows = db
      .prepare(
        `
          SELECT
            id,
            name,
            home_url AS homeUrl,
            sort_order AS sortOrder,
            enabled,
            cache_enabled AS cacheEnabled,
            builtin,
            active,
            created_at AS createdAt,
            updated_at AS updatedAt
          FROM providers
        `
      )
      .all() as ProviderRow[];

    return sortProviders(rows).map((row) => mapProviderRow(row));
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
      return runInTransaction(db, () => setEnabledInternal(providerId, enabled));
    },
    setEnabledWithinTransaction(providerId: ProviderId, enabled: boolean): ProviderRecord {
      return setEnabledInternal(providerId, enabled);
    },
    move(providerId: ProviderId, direction: ProviderMoveDirection): ProviderRecord[] {
      return runInTransaction(db, () => {
        const providers = listProviders();
        const currentIndex = providers.findIndex((provider) => provider.id === providerId);
        if (currentIndex < 0) {
          throw new Error(`Unknown provider: ${providerId}.`);
        }

        const nextIndex =
          direction === 'up'
            ? Math.max(currentIndex - 1, 0)
            : Math.min(currentIndex + 1, providers.length - 1);
        if (nextIndex === currentIndex) {
          return providers;
        }

        const reordered = [...providers];
        const [provider] = reordered.splice(currentIndex, 1);
        reordered.splice(nextIndex, 0, provider);

        const updatedAt = new Date().toISOString();
        const updateOrder = db.prepare(
          `
            UPDATE providers
            SET
              sort_order = ?,
              updated_at = CASE
                WHEN sort_order <> ? THEN ?
                ELSE updated_at
              END
            WHERE id = ?
          `
        );

        reordered.forEach((entry, index) => {
          updateOrder.run(index, index, updatedAt, entry.id);
        });

        return listProviders();
      });
    },
    setCacheEnabled(providerId: ProviderId, cacheEnabled: boolean): ProviderRecord {
      return runInTransaction(db, () => {
        const provider = getProviderById(db, providerId);
        if (!provider) {
          throw new Error(`Unknown provider: ${providerId}.`);
        }

        const updatedAt = new Date().toISOString();
        db.prepare(
          `
            UPDATE providers
            SET
              cache_enabled = ?,
              updated_at = CASE
                WHEN cache_enabled <> ? THEN ?
                ELSE updated_at
              END
            WHERE id = ?
          `
        ).run(cacheEnabled ? 1 : 0, cacheEnabled ? 1 : 0, updatedAt, providerId);

        return getProviderById(db, providerId) as ProviderRecord;
      });
    },
  };

  function setEnabledInternal(providerId: ProviderId, enabled: boolean): ProviderRecord {
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
  }
}

function seedBuiltInProviders(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const insertProvider = db.prepare(
    `
      INSERT OR IGNORE INTO providers (
        id,
        name,
        home_url,
        sort_order,
        enabled,
        builtin,
        active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        index,
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

    initializeProviderSortOrder(db, now);
    normalizeActiveProvider(db, now);
  });
}

function initializeProviderSortOrder(db: DatabaseSync, updatedAt: string): void {
  const summary = db
    .prepare(
      `
        SELECT
          MIN(sort_order) AS minSortOrder,
          MAX(sort_order) AS maxSortOrder,
          COUNT(*) AS totalProviders
        FROM providers
      `
    )
    .get() as
    | {
        minSortOrder?: number | null;
        maxSortOrder?: number | null;
        totalProviders?: number | null;
      }
    | undefined;

  if (!summary?.totalProviders || summary.minSortOrder !== 0 || summary.maxSortOrder !== 0) {
    return;
  }

  const updateOrder = db.prepare(
    `
      UPDATE providers
      SET
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `
  );

  BUILT_IN_BROWSER_SESSION_CONFIGS.forEach((config, index) => {
    updateOrder.run(index, updatedAt, config.id);
  });
}

function normalizeActiveProvider(db: DatabaseSync, updatedAt: string): void {
  const rows = db
    .prepare(
      `
        SELECT
          id,
          name,
          home_url AS homeUrl,
          sort_order AS sortOrder,
          enabled,
          builtin,
          active,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM providers
      `
    )
    .all() as ProviderRow[];
  const providers = sortProviders(rows).map((row) => mapProviderRow(row));
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
          sort_order AS sortOrder,
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
    cacheEnabled: row.cacheEnabled === 1,
    builtin: row.builtin === 1,
    active: row.active === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortProviders<T extends { id: ProviderId }>(providers: T[]): T[] {
  const providersWithOrder = providers as Array<T & { sortOrder?: number }>;
  const hasCustomOrder = providersWithOrder.some((provider) => typeof provider.sortOrder === 'number');
  if (hasCustomOrder) {
    return [...providersWithOrder].sort((left, right) => {
      return (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER);
    });
  }

  const order = new Map<ProviderId, number>(
    BUILT_IN_BROWSER_SESSION_CONFIGS.map(
      (config, index): [ProviderId, number] => [config.id as ProviderId, index]
    )
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
