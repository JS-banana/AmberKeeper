import type { ProviderId, ProviderRecord } from '@amberkeeper/shared-types';

export interface ProviderRuntimeEntry<
  TView extends { setBounds(bounds: ProviderStageBounds): void } = {
    setBounds(bounds: ProviderStageBounds): void;
  },
> {
  providerId: ProviderId;
  view: TView;
  loadInitialUrl: () => Promise<void>;
}

export interface ProviderStageBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createProviderRuntimeRegistry<TRuntime extends ProviderRuntimeEntry>(options: {
  providers: ProviderRecord[];
  activeProviderId: ProviderId | null;
  createRuntime: (provider: ProviderRecord) => TRuntime;
  onStateChanged?: (input: {
    runtimes: TRuntime[];
    activeProviderId: ProviderId | null;
  }) => void;
}) {
  let providers = [...options.providers];
  let activeProviderId = resolveActiveProviderId(options.activeProviderId, providers);
  const runtimes = new Map<ProviderId, TRuntime>();

  const notifyStateChanged = () => {
    options.onStateChanged?.({
      runtimes: listResolvedRuntimes(),
      activeProviderId,
    });
  };

  const ensureRuntime = (providerId: ProviderId, emit = true): TRuntime => {
    const existing = runtimes.get(providerId);
    if (existing) {
      return existing;
    }

    const provider = providers.find((entry) => entry.id === providerId);
    if (!provider) {
      throw new Error(`Unknown provider runtime: ${providerId}.`);
    }

    const runtime = options.createRuntime(provider);
    runtimes.set(providerId, runtime);
    void runtime.loadInitialUrl().catch(() => undefined);

    if (emit) {
      notifyStateChanged();
    }

    return runtime;
  };

  const listResolvedRuntimes = (): TRuntime[] => {
    return providers
      .map((provider) => runtimes.get(provider.id))
      .filter((runtime): runtime is TRuntime => Boolean(runtime));
  };

  if (activeProviderId) {
    ensureRuntime(activeProviderId, false);
  }
  notifyStateChanged();

  return {
    listProviders(): ProviderRecord[] {
      return [...providers];
    },
    listResolvedRuntimes(): TRuntime[] {
      return listResolvedRuntimes();
    },
    getActiveProviderId(): ProviderId | null {
      return activeProviderId;
    },
    getActiveRuntime(): TRuntime | null {
      if (!activeProviderId) {
        return null;
      }

      return ensureRuntime(activeProviderId, false);
    },
    resolveRuntime(providerId: ProviderId): TRuntime {
      return ensureRuntime(providerId);
    },
    setActiveProvider(providerId: ProviderId): TRuntime {
      const provider = providers.find((entry) => entry.id === providerId);
      if (!provider) {
        throw new Error(`Unknown provider runtime: ${providerId}.`);
      }
      if (!provider.enabled) {
        throw new Error(`Cannot activate disabled provider: ${providerId}.`);
      }

      activeProviderId = providerId;
      const runtime = ensureRuntime(providerId, false);
      notifyStateChanged();

      return runtime;
    },
    syncProviders(nextProviders: ProviderRecord[], nextActiveProviderId?: ProviderId | null): void {
      providers = [...nextProviders];
      activeProviderId = resolveActiveProviderId(
        nextActiveProviderId === undefined ? activeProviderId : nextActiveProviderId,
        providers
      );

      if (activeProviderId) {
        ensureRuntime(activeProviderId, false);
      }

      notifyStateChanged();
    },
  };
}

function resolveActiveProviderId(
  preferredProviderId: ProviderId | null,
  providers: ProviderRecord[]
): ProviderId | null {
  if (
    preferredProviderId &&
    providers.some((provider) => provider.id === preferredProviderId && provider.enabled)
  ) {
    return preferredProviderId;
  }

  return providers.find((provider) => provider.enabled)?.id ?? null;
}
