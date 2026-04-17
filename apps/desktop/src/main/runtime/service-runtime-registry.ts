import type { ServiceRecord } from '@amberkeeper/shared-types';

export interface ServiceRuntimeEntry<
  TView extends { setBounds(bounds: ServiceStageBounds): void } = {
    setBounds(bounds: ServiceStageBounds): void;
  },
> {
  serviceId: string;
  view: TView;
  loadInitialUrl: () => Promise<void>;
}

export interface ServiceStageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createServiceRuntimeRegistry<TRuntime extends ServiceRuntimeEntry>(options: {
  services: ServiceRecord[];
  activeServiceId: string | null;
  createRuntime: (service: ServiceRecord) => TRuntime;
  disposeRuntime?: (runtime: TRuntime) => void;
  onStateChanged?: (input: {
    runtimes: TRuntime[];
    activeServiceId: string | null;
  }) => void;
}) {
  let services = [...options.services];
  let activeServiceId = resolveActiveServiceId(options.activeServiceId, services);
  const runtimes = new Map<string, TRuntime>();

  const listResolvedRuntimes = (): TRuntime[] =>
    services
      .map((service) => runtimes.get(service.id))
      .filter((runtime): runtime is TRuntime => Boolean(runtime));

  const notifyStateChanged = () => {
    options.onStateChanged?.({
      runtimes: listResolvedRuntimes(),
      activeServiceId,
    });
  };

  const ensureRuntime = (serviceId: string, emit = true): TRuntime => {
    const existing = runtimes.get(serviceId);
    if (existing) {
      return existing;
    }

    const service = services.find((entry) => entry.id === serviceId);
    if (!service) {
      throw new Error(`Unknown service runtime: ${serviceId}.`);
    }

    const runtime = options.createRuntime(service);
    runtimes.set(serviceId, runtime);
    void runtime.loadInitialUrl().catch(() => undefined);

    if (emit) {
      notifyStateChanged();
    }

    return runtime;
  };

  if (activeServiceId) {
    ensureRuntime(activeServiceId, false);
  }
  notifyStateChanged();

  return {
    listServices(): ServiceRecord[] {
      return [...services];
    },
    listResolvedRuntimes(): TRuntime[] {
      return listResolvedRuntimes();
    },
    getActiveServiceId(): string | null {
      return activeServiceId;
    },
    getActiveRuntime(): TRuntime | null {
      if (!activeServiceId) {
        return null;
      }

      return ensureRuntime(activeServiceId, false);
    },
    resolveRuntime(serviceId: string): TRuntime {
      return ensureRuntime(serviceId);
    },
    setActiveService(serviceId: string): TRuntime {
      const service = services.find((entry) => entry.id === serviceId);
      if (!service) {
        throw new Error(`Unknown service runtime: ${serviceId}.`);
      }
      if (!service.enabled) {
        throw new Error(`Cannot activate disabled service: ${serviceId}.`);
      }

      activeServiceId = serviceId;
      const runtime = ensureRuntime(serviceId, false);
      notifyStateChanged();

      return runtime;
    },
    syncServices(nextServices: ServiceRecord[], nextActiveServiceId?: string | null): void {
      const nextServiceIds = new Set(nextServices.map((service) => service.id));

      for (const [serviceId, runtime] of runtimes) {
        if (nextServiceIds.has(serviceId)) {
          continue;
        }

        runtimes.delete(serviceId);
        options.disposeRuntime?.(runtime);
      }

      services = [...nextServices];
      activeServiceId = resolveActiveServiceId(
        nextActiveServiceId === undefined ? activeServiceId : nextActiveServiceId,
        services
      );

      if (activeServiceId) {
        ensureRuntime(activeServiceId, false);
      }

      notifyStateChanged();
    },
  };
}

function resolveActiveServiceId(
  preferredServiceId: string | null,
  services: ServiceRecord[]
): string | null {
  if (
    preferredServiceId &&
    services.some((service) => service.id === preferredServiceId && service.enabled)
  ) {
    return preferredServiceId;
  }

  return services.find((service) => service.enabled)?.id ?? null;
}
