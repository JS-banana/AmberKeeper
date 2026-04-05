import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CaptureStore } from '../src/main/storage/capture-store';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';

describe('provider-settings', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anychat-provider-settings-'));
    dbPath = path.join(tempDir, 'capture.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('seeds the built-in providers with unique runtime configs', () => {
    const store = new CaptureStore(dbPath);

    const providers = store.listProviders();

    expect(providers.map((provider) => provider.id)).toEqual([
      'chatgpt',
      'claude',
      'deepseek',
      'gemini',
      'grok',
      'kimi',
      'qianwen',
      'doubao',
      'xiaomi-aistudio',
    ]);

    const configs = providers.map((provider) => resolveBrowserSessionConfig(provider.id));
    const partitions = new Set(configs.map((config) => config.partition));
    const homeUrls = new Set(configs.map((config) => config.homeUrl));

    expect(partitions.size).toBe(9);
    expect(homeUrls.size).toBe(9);
    expect(store.getActiveProvider()?.id).toBe('chatgpt');
  });

  test('persists enable state and falls back active provider when disabling the current one', () => {
    const firstStore = new CaptureStore(dbPath);

    firstStore.setActiveProvider('claude');
    firstStore.setProviderEnabled('claude', false);

    const secondStore = new CaptureStore(dbPath);
    const providers = secondStore.listProviders();

    expect(providers.find((provider) => provider.id === 'claude')).toEqual(
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(secondStore.getActiveProvider()?.id).toBe('chatgpt');
  });

  test('rejects disabling the last enabled provider', () => {
    const store = new CaptureStore(dbPath);

    store.setProviderEnabled('claude', false);
    store.setProviderEnabled('deepseek', false);
    store.setProviderEnabled('gemini', false);
    store.setProviderEnabled('grok', false);
    store.setProviderEnabled('kimi', false);
    store.setProviderEnabled('qianwen', false);
    store.setProviderEnabled('doubao', false);
    store.setProviderEnabled('xiaomi-aistudio', false);

    expect(() => store.setProviderEnabled('chatgpt', false)).toThrow(
      'At least one provider must remain enabled.'
    );
    expect(store.getActiveProvider()?.id).toBe('chatgpt');
  });

  test('persists custom provider order across restarts', () => {
    const firstStore = new CaptureStore(dbPath);

    firstStore.moveProvider('gemini', 'up');
    firstStore.moveProvider('gemini', 'up');

    const secondStore = new CaptureStore(dbPath);

    expect(secondStore.listProviders().map((provider) => provider.id)).toEqual([
      'chatgpt',
      'gemini',
      'claude',
      'deepseek',
      'grok',
      'kimi',
      'qianwen',
      'doubao',
      'xiaomi-aistudio',
    ]);
  });
});
