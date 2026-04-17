import { describe, expect, test, vi } from 'vitest';
import type { ServiceRecord } from '@amberkeeper/shared-types';
import { createServiceRuntimeRegistry } from '../src/main/runtime/service-runtime-registry';
import { applyProviderStageLayout } from '../src/main/windows/main-window';

describe('service-runtime-registry', () => {
  test('creates mixed built-in/custom runtimes while only built-ins opt into capture-capable behavior', () => {
    const attachedViews = new Set<FakeView>();
    const services = buildServices();
    const createdRuntimes = new Map<string, ServiceRuntimeFixture>();

    const registry = createServiceRuntimeRegistry({
      services,
      activeServiceId: 'chatgpt',
      createRuntime(service) {
        const runtime = createRuntimeFixture(service);
        createdRuntimes.set(service.id, runtime);
        return runtime;
      },
      onStateChanged({ runtimes, activeServiceId }) {
        applyProviderStageLayout({
          providerViews: runtimes.map((runtime) => ({
            providerId: runtime.serviceId,
            view: runtime.view,
          })),
          activeProviderId: activeServiceId,
          panelWidth: 420,
          contentBounds: {
            width: 1440,
            height: 900,
          },
          ensureAttached(view) {
            attachedViews.add(view as FakeView);
          },
        });
      },
    });

    const builtInRuntime = registry.getActiveRuntime();
    const customRuntime = registry.resolveRuntime('custom-service-1');

    expect(builtInRuntime?.serviceId).toBe('chatgpt');
    expect(builtInRuntime?.supportsCapture).toBe(true);
    expect(customRuntime.supportsCapture).toBe(false);
    expect(customRuntime.partition).toBe('persist:amberkeeper-custom-custom-service-1');

    registry.setActiveService('custom-service-1');
    expect(registry.getActiveServiceId()).toBe('custom-service-1');
    expect(customRuntime.view.bounds).toEqual({
      x: 420,
      y: 0,
      width: 1020,
      height: 900,
    });

    registry.setActiveService('chatgpt');
    expect(registry.resolveRuntime('chatgpt')).toBe(builtInRuntime);
    expect(builtInRuntime?.loadInitialUrl).toHaveBeenCalledTimes(1);
    expect(customRuntime.loadInitialUrl).toHaveBeenCalledTimes(1);
    expect(attachedViews.size).toBe(2);
  });

  test('disposes removed custom runtimes while keeping still-registered ones reusable', () => {
    const disposedServiceIds: string[] = [];
    const registry = createServiceRuntimeRegistry({
      services: buildServices(),
      activeServiceId: 'custom-service-1',
      createRuntime(service) {
        return createRuntimeFixture(service);
      },
      disposeRuntime(runtime) {
        disposedServiceIds.push(runtime.serviceId);
      },
    });

    const customRuntime = registry.getActiveRuntime();
    expect(customRuntime?.serviceId).toBe('custom-service-1');

    registry.syncServices([buildServices()[0]!], 'chatgpt');

    expect(disposedServiceIds).toEqual(['custom-service-1']);
    expect(registry.getActiveServiceId()).toBe('chatgpt');
    expect(registry.getActiveRuntime()?.serviceId).toBe('chatgpt');
    expect(registry.listResolvedRuntimes().map((runtime) => runtime.serviceId)).toEqual(['chatgpt']);
  });
});

type FakeView = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  setBounds: (bounds: FakeView['bounds']) => void;
};

type ServiceRuntimeFixture = {
  serviceId: string;
  supportsCapture: boolean;
  partition: string;
  view: FakeView;
  loadInitialUrl: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function buildServices(): ServiceRecord[] {
  const now = '2026-04-14T00:00:00.000Z';

  return [
    {
      id: 'chatgpt',
      providerId: 'chatgpt',
      kind: 'builtin',
      name: 'ChatGPT',
      displayUrl: 'https://chatgpt.com',
      launchUrl: 'https://chatgpt.com',
      iconUrl: null,
      enabled: true,
      builtin: true,
      active: true,
      supportsCapture: true,
      supportsDataManagement: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'custom-service-1',
      providerId: null,
      kind: 'custom',
      name: 'Perplexity',
      displayUrl: 'https://www.perplexity.ai',
      launchUrl: 'https://www.perplexity.ai/discover',
      iconUrl: null,
      enabled: true,
      builtin: false,
      active: false,
      supportsCapture: false,
      supportsDataManagement: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createRuntimeFixture(service: ServiceRecord): ServiceRuntimeFixture {
  const view: FakeView = {
    bounds: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
    setBounds(bounds) {
      this.bounds = bounds;
    },
  };

  return {
    serviceId: service.id,
    supportsCapture: service.supportsCapture,
    partition:
      service.kind === 'builtin'
        ? `persist:anychat-${service.id}`
        : `persist:amberkeeper-custom-${service.id}`,
    view,
    loadInitialUrl: vi.fn(async () => undefined),
  };
}
