import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateCustomServiceInput,
  ProviderId,
  ServiceMoveDirection,
  ServiceRecord,
} from '@amberkeeper/shared-types';
import { buildServiceDisplayUrl, normalizeServiceUrl } from '../../shared/service-url';

type ProviderServiceRow = {
  id: ProviderId;
  name: string;
  launchUrl: string;
  sortOrder: number;
  enabled: number;
  cacheEnabled: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

type CustomServiceRow = {
  id: string;
  name: string;
  displayUrl: string;
  launchUrl: string;
  iconUrl: string | null;
  sortOrder: number;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

type ServiceSettingsRepositoryDeps = {
  getActiveProviderId: () => ProviderId | null;
  setActiveServiceId: (serviceId: string | null) => string | null;
  getActiveServiceId: () => string | null;
};

export function createServiceSettingsRepository(
  db: DatabaseSync,
  deps: ServiceSettingsRepositoryDeps
) {
  const listServices = (): ServiceRecord[] => {
    const providerRows = listProviderServiceRows(db);
    const customRows = listCustomServiceRows(db);
    const preferredActiveServiceId = deps.getActiveServiceId();
    const activeProviderId = deps.getActiveProviderId();
    const sorted = [...providerRows, ...customRows].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
    const enabledServices = sorted.filter((row) => row.enabled === 1);
    const resolvedActiveServiceId =
      enabledServices.find((row) => row.id === preferredActiveServiceId)?.id ??
      enabledServices.find((row) => row.id === activeProviderId)?.id ??
      enabledServices[0]?.id ??
      null;

    return sorted.map((row) =>
      isProviderServiceRow(row)
        ? {
            id: row.id,
            providerId: row.id,
            kind: 'builtin',
            name: row.name,
            displayUrl: buildServiceDisplayUrl(row.launchUrl),
            launchUrl: row.launchUrl,
            iconUrl: null,
            cacheEnabled: row.cacheEnabled === 1,
            enabled: row.enabled === 1,
            builtin: true,
            active: row.id === resolvedActiveServiceId,
            supportsDataManagement: true,
            supportsCapture: true,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        : {
            id: row.id,
            providerId: null,
            kind: 'custom',
            name: row.name,
            displayUrl: row.displayUrl,
            launchUrl: row.launchUrl,
            iconUrl: row.iconUrl,
            enabled: row.enabled === 1,
            builtin: false,
            active: row.id === resolvedActiveServiceId,
            supportsDataManagement: false,
            supportsCapture: false,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
    );
  };

  const normalizeActiveService = (preferredServiceId?: string | null): ServiceRecord | null => {
    const services = listServices();
    const enabledServices = services.filter((service) => service.enabled);
    const nextActiveServiceId =
      enabledServices.find((service) => service.id === preferredServiceId)?.id ??
      enabledServices.find((service) => service.id === deps.getActiveProviderId())?.id ??
      enabledServices[0]?.id ??
      null;
    deps.setActiveServiceId(nextActiveServiceId);
    return services.find((service) => service.id === nextActiveServiceId) ?? null;
  };

  return {
    list(): ServiceRecord[] {
      return listServices();
    },
    getActive(): ServiceRecord | null {
      return listServices().find((service) => service.active) ?? normalizeActiveService();
    },
    setActive(serviceId: string): ServiceRecord {
      return runInTransaction(db, () => {
        const service = listServices().find((entry) => entry.id === serviceId) ?? null;
        if (!service) {
          throw new Error(`Unknown service: ${serviceId}.`);
        }
        if (!service.enabled) {
          throw new Error(`Cannot activate disabled service: ${serviceId}.`);
        }

        deps.setActiveServiceId(serviceId);
        return listServices().find((entry) => entry.id === serviceId) as ServiceRecord;
      });
    },
    addCustom(input: CreateCustomServiceInput): ServiceRecord {
      return runInTransaction(db, () => {
        const launchUrl = normalizeServiceUrl(input.url);
        if (!launchUrl) {
          throw new Error('Invalid custom service URL.');
        }

        const now = new Date().toISOString();
        const serviceId = `custom-${crypto.randomUUID()}`;
        const nextSortOrder = resolveNextSortOrder(db);
        db.prepare(
          `
            INSERT INTO custom_services (
              id,
              name,
              display_url,
              launch_url,
              icon_url,
              enabled,
              sort_order,
              created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          `
        ).run(
          serviceId,
          input.name.trim(),
          buildServiceDisplayUrl(launchUrl),
          launchUrl,
          input.iconUrl ?? null,
          nextSortOrder,
          now,
          now
        );

        return listServices().find((service) => service.id === serviceId) as ServiceRecord;
      });
    },
    removeCustom(serviceId: string): void {
      runInTransaction(db, () => {
        const service = listServices().find((entry) => entry.id === serviceId) ?? null;
        if (!service) {
          throw new Error(`Unknown service: ${serviceId}.`);
        }
        if (service.kind !== 'custom') {
          throw new Error('Built-in services cannot be deleted.');
        }

        const fallbackServiceId = resolveFallbackServiceId(listServices(), serviceId);
        db.prepare(
          `
            DELETE FROM custom_services
            WHERE id = ?
          `
        ).run(serviceId);
        normalizeSortOrder(db);
        normalizeActiveService(fallbackServiceId);
      });
    },
    setEnabled(serviceId: string, enabled: boolean): ServiceRecord {
      return runInTransaction(db, () => {
        const service = listServices().find((entry) => entry.id === serviceId) ?? null;
        if (!service) {
          throw new Error(`Unknown service: ${serviceId}.`);
        }
        if (service.enabled === enabled) {
          return service;
        }

        if (!enabled) {
          const enabledServices = listServices().filter((entry) => entry.enabled);
          if (enabledServices.length === 1 && enabledServices[0]?.id === serviceId) {
            throw new Error('At least one service must remain enabled.');
          }
        }

        if (service.kind === 'builtin') {
          throw new Error('Built-in service enablement must be coordinated externally.');
        } else {
          const updatedAt = new Date().toISOString();
          db.prepare(
            `
              UPDATE custom_services
              SET
                enabled = ?,
                updated_at = CASE
                  WHEN enabled <> ? THEN ?
                  ELSE updated_at
                END
              WHERE id = ?
            `
          ).run(enabled ? 1 : 0, enabled ? 1 : 0, updatedAt, serviceId);
        }

        if (!enabled && service.active) {
          normalizeActiveService(resolveFallbackServiceId(listServices(), serviceId));
        }

        return listServices().find((entry) => entry.id === serviceId) as ServiceRecord;
      });
    },
    move(serviceId: string, direction: ServiceMoveDirection): ServiceRecord[] {
      return runInTransaction(db, () => {
        const services = listServices();
        const currentIndex = services.findIndex((service) => service.id === serviceId);
        if (currentIndex < 0) {
          throw new Error(`Unknown service: ${serviceId}.`);
        }

        const nextIndex =
          direction === 'up'
            ? Math.max(currentIndex - 1, 0)
            : Math.min(currentIndex + 1, services.length - 1);
        if (nextIndex === currentIndex) {
          return services;
        }

        const reordered = [...services];
        const [service] = reordered.splice(currentIndex, 1);
        reordered.splice(nextIndex, 0, service);

        const updatedAt = new Date().toISOString();
        const updateProviderOrder = db.prepare(
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
        const updateCustomOrder = db.prepare(
          `
            UPDATE custom_services
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
          if (entry.kind === 'builtin') {
            updateProviderOrder.run(index, index, updatedAt, entry.id);
          } else {
            updateCustomOrder.run(index, index, updatedAt, entry.id);
          }
        });

        return listServices();
      });
    },
    updateCustomIcon(serviceId: string, iconUrl: string | null): ServiceRecord {
      return runInTransaction(db, () => {
        const service = listServices().find((entry) => entry.id === serviceId) ?? null;
        if (!service) {
          throw new Error(`Unknown service: ${serviceId}.`);
        }
        if (service.kind !== 'custom') {
          throw new Error('Only custom services can persist discovered icons.');
        }

        const updatedAt = new Date().toISOString();
        db.prepare(
          `
            UPDATE custom_services
            SET
              icon_url = ?,
              updated_at = CASE
                WHEN COALESCE(icon_url, '') <> COALESCE(?, '') THEN ?
                ELSE updated_at
              END
            WHERE id = ?
          `
        ).run(iconUrl, iconUrl, updatedAt, serviceId);

        return listServices().find((entry) => entry.id === serviceId) as ServiceRecord;
      });
    },
  };
}

function isProviderServiceRow(
  row: ProviderServiceRow | CustomServiceRow
): row is ProviderServiceRow {
  return !('displayUrl' in row);
}

function listProviderServiceRows(db: DatabaseSync): ProviderServiceRow[] {
  return db
    .prepare(
      `
        SELECT
          id,
          name,
          home_url AS launchUrl,
          sort_order AS sortOrder,
          enabled,
          cache_enabled AS cacheEnabled,
          active,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM providers
      `
    )
    .all() as ProviderServiceRow[];
}

function listCustomServiceRows(db: DatabaseSync): CustomServiceRow[] {
  return db
    .prepare(
      `
        SELECT
          id,
          name,
          display_url AS displayUrl,
          launch_url AS launchUrl,
          icon_url AS iconUrl,
          sort_order AS sortOrder,
          enabled,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM custom_services
      `
    )
    .all() as CustomServiceRow[];
}

function resolveNextSortOrder(db: DatabaseSync): number {
  const row = db
    .prepare(
      `
        SELECT MAX(sortOrder) AS maxSortOrder
        FROM (
          SELECT sort_order AS sortOrder FROM providers
          UNION ALL
          SELECT sort_order AS sortOrder FROM custom_services
        )
      `
    )
    .get() as { maxSortOrder?: number | null } | undefined;

  return (row?.maxSortOrder ?? -1) + 1;
}

function normalizeSortOrder(db: DatabaseSync): void {
  const services = [
    ...listProviderServiceRows(db),
    ...listCustomServiceRows(db),
  ].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }
    return left.createdAt.localeCompare(right.createdAt);
  });
  const updatedAt = new Date().toISOString();
  const updateProviderOrder = db.prepare(
    `
      UPDATE providers
      SET sort_order = ?, updated_at = ?
      WHERE id = ?
    `
  );
  const updateCustomOrder = db.prepare(
    `
      UPDATE custom_services
      SET sort_order = ?, updated_at = ?
      WHERE id = ?
    `
  );

  services.forEach((service, index) => {
    if (isProviderServiceRow(service)) {
      updateProviderOrder.run(index, updatedAt, service.id);
    } else {
      updateCustomOrder.run(index, updatedAt, service.id);
    }
  });
}

function resolveFallbackServiceId(services: ServiceRecord[], serviceId: string): string | null {
  const currentIndex = services.findIndex((service) => service.id === serviceId);
  if (currentIndex < 0) {
    return null;
  }

  for (let index = currentIndex + 1; index < services.length; index += 1) {
    if (services[index]?.enabled && services[index]?.id !== serviceId) {
      return services[index]!.id;
    }
  }

  for (let index = 0; index < services.length; index += 1) {
    if (services[index]?.enabled && services[index]?.id !== serviceId) {
      return services[index]!.id;
    }
  }

  return null;
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
