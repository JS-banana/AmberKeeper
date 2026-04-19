import type { DatabaseSync } from 'node:sqlite';
import type { ProviderId, ProviderRecord, ServiceRecord } from '@amberkeeper/shared-types';

export function createSettingsWriteCoordinator(options: {
  db: DatabaseSync;
  listServices: () => ServiceRecord[];
  getActiveServiceId: () => string | null;
  setActiveServiceId: (serviceId: string | null) => string | null;
  setProviderEnabledWithinTransaction: (providerId: ProviderId, enabled: boolean) => ProviderRecord;
}) {
  return {
    setProviderEnabled(providerId: ProviderId, enabled: boolean): ProviderRecord {
      return runInTransaction(options.db, () => {
        const services = options.listServices();
        const activeServiceId = options.getActiveServiceId();
        const fallbackServiceId =
          !enabled && activeServiceId === providerId
            ? resolveFallbackServiceId(services, providerId)
            : null;

        const provider = options.setProviderEnabledWithinTransaction(providerId, enabled);

        if (fallbackServiceId !== null) {
          options.setActiveServiceId(fallbackServiceId);
        }

        return provider;
      });
    },
  };
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
