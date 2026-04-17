import { describe, expect, test, vi } from 'vitest';
import type { ProviderId, ProviderRecord } from '@amberkeeper/shared-types';
import { createProviderRuntimeRegistry } from '../src/main/runtime/provider-runtime-registry';
import { applyProviderStageLayout } from '../src/main/windows/main-window';

describe('provider-runtime-registry', () => {
  test('resolves built-in runtimes and keeps one active native view visible at a time', () => {
    const attachedViews = new Set<FakeView>();
    const createdRuntimes = new Map<ProviderId, ProviderRuntimeFixture>();
    const providers = buildProviders();

    const registry = createProviderRuntimeRegistry({
      providers,
      activeProviderId: 'chatgpt',
      createRuntime(provider) {
        const runtime = createRuntimeFixture(provider.id);
        createdRuntimes.set(provider.id, runtime);
        return runtime;
      },
      onStateChanged({ runtimes, activeProviderId }) {
        applyProviderStageLayout({
          providerViews: runtimes,
          activeProviderId,
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

    const chatgptRuntime = registry.getActiveRuntime();
    const claudeRuntime = registry.resolveRuntime('claude');
    const deepseekRuntime = registry.resolveRuntime('deepseek');
    const geminiRuntime = registry.resolveRuntime('gemini');
    const grokRuntime = registry.resolveRuntime('grok');
    const kimiRuntime = registry.resolveRuntime('kimi');
    const qianwenRuntime = registry.resolveRuntime('qianwen');
    const doubaoRuntime = registry.resolveRuntime('doubao');
    const xiaomiRuntime = registry.resolveRuntime('xiaomi-aistudio');

    expect(chatgptRuntime?.providerId).toBe('chatgpt');
    expect(claudeRuntime.providerId).toBe('claude');
    expect(deepseekRuntime.providerId).toBe('deepseek');
    expect(geminiRuntime.providerId).toBe('gemini');
    expect(grokRuntime.providerId).toBe('grok');
    expect(kimiRuntime.providerId).toBe('kimi');
    expect(qianwenRuntime.providerId).toBe('qianwen');
    expect(doubaoRuntime.providerId).toBe('doubao');
    expect(xiaomiRuntime.providerId).toBe('xiaomi-aistudio');
    expect(createdRuntimes.size).toBe(9);
    expect(attachedViews.size).toBe(9);

    registry.setActiveProvider('gemini');

    expect(registry.getActiveProviderId()).toBe('gemini');
    expect(geminiRuntime.view.bounds).toEqual({
      x: 420,
      y: 0,
      width: 1020,
      height: 900,
    });
    expect(chatgptRuntime?.view.bounds).toEqual({
      x: 1440,
      y: 0,
      width: 0,
      height: 900,
    });

    registry.setActiveProvider('chatgpt');

    expect(registry.getActiveProviderId()).toBe('chatgpt');
    expect(registry.resolveRuntime('gemini')).toBe(geminiRuntime);
    expect(registry.resolveRuntime('chatgpt')).toBe(chatgptRuntime);
    expect(geminiRuntime.loadInitialUrl).toHaveBeenCalledTimes(1);
    expect(chatgptRuntime?.loadInitialUrl).toHaveBeenCalledTimes(1);
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

type ProviderRuntimeFixture = {
  providerId: ProviderId;
  view: FakeView;
  loadInitialUrl: ReturnType<typeof vi.fn<() => Promise<void>>>;
};

function buildProviders(): ProviderRecord[] {
  const now = '2026-03-19T00:00:00.000Z';

  return [
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      homeUrl: 'https://chatgpt.com',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'claude',
      name: 'Claude',
      homeUrl: 'https://claude.ai',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      homeUrl: 'https://chat.deepseek.com/',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'gemini',
      name: 'Gemini',
      homeUrl: 'https://gemini.google.com/app',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'grok',
      name: 'Grok',
      homeUrl: 'https://grok.com',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kimi',
      name: 'Kimi',
      homeUrl: 'https://kimi.moonshot.cn',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'qianwen',
      name: 'Qianwen',
      homeUrl: 'https://www.qianwen.com',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'doubao',
      name: 'Doubao',
      homeUrl: 'https://www.doubao.com/chat',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'xiaomi-aistudio',
      name: 'MiMo',
      homeUrl: 'https://aistudio.xiaomimimo.com',
      enabled: true,
      cacheEnabled: true,
      builtin: true,
      active: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createRuntimeFixture(providerId: ProviderId): ProviderRuntimeFixture {
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
    providerId,
    view,
    loadInitialUrl: vi.fn(async () => undefined),
  };
}
