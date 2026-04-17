import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ServiceRecord } from '@amberkeeper/shared-types';
import { CaptureStore } from '../src/main/storage/capture-store';

describe('service-settings', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-service-settings-'));
    dbPath = path.join(tempDir, 'capture.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('seeds built-in shell services and persists custom services across restart', () => {
    const firstStore = new CaptureStore(dbPath);

    expect(firstStore.listServices().map((service) => service.id)).toEqual([
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

    const created = firstStore.addCustomService({
      name: 'Perplexity',
      url: 'https://www.perplexity.ai/discover',
    });

    expect(created).toEqual(
      expect.objectContaining({
        kind: 'custom',
        name: 'Perplexity',
        displayUrl: 'https://www.perplexity.ai',
        launchUrl: 'https://www.perplexity.ai/discover',
        iconUrl: null,
        enabled: true,
        supportsCapture: false,
        supportsDataManagement: false,
      })
    );

    const secondStore = new CaptureStore(dbPath);
    expect(secondStore.listServices()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: created.id,
          name: 'Perplexity',
          displayUrl: 'https://www.perplexity.ai',
          launchUrl: 'https://www.perplexity.ai/discover',
        }),
      ])
    );
  });

  test('persists mixed built-in/custom ordering across restart', () => {
    const firstStore = new CaptureStore(dbPath);
    const custom = firstStore.addCustomService({
      name: 'Perplexity',
      url: 'https://www.perplexity.ai/discover',
    });

    for (let moveIndex = 0; moveIndex < 6; moveIndex += 1) {
      firstStore.moveService(custom.id, 'up');
    }

    const secondStore = new CaptureStore(dbPath);
    expect(secondStore.listServices().map((service) => service.id).slice(0, 5)).toEqual([
      'chatgpt',
      'claude',
      'deepseek',
      custom.id,
      'gemini',
    ]);
  });

  test('rejects deleting built-in services', () => {
    const store = new CaptureStore(dbPath);

    expect(() => store.removeCustomService('chatgpt')).toThrow('Built-in services cannot be deleted.');
  });

  test('falls back to the next enabled custom service when deleting or hiding the active custom service', () => {
    const store = new CaptureStore(dbPath);

    store.setActiveProvider('claude');
    const research = store.addCustomService({
      name: 'Research',
      url: 'https://research.example.com/workspace',
    });
    const docs = store.addCustomService({
      name: 'Docs',
      url: 'https://docs.example.com/portal',
    });

    store.setActiveService(research.id);
    expect(store.getActiveService()?.id).toBe(research.id);
    expect(store.getActiveProvider()?.id).toBe('claude');

    store.setServiceEnabled(research.id, false);
    expect(store.getActiveService()?.id).toBe(docs.id);
    expect(store.getActiveProvider()?.id).toBe('claude');

    store.removeCustomService(docs.id);
    expect(store.getActiveService()?.id).toBe('chatgpt');
    expect(store.getActiveProvider()?.id).toBe('claude');
  });

  test('toggles built-in services without nested transaction failures and persists the fallback active service', () => {
    const firstStore = new CaptureStore(dbPath);
    const custom = firstStore.addCustomService({
      name: 'Docs',
      url: 'https://docs.example.com/portal',
    });

    firstStore.setActiveProvider('claude');
    firstStore.setActiveService('claude');
    const disabled = firstStore.setServiceEnabled('claude', false);

    expect(disabled).toEqual(
      expect.objectContaining({
        id: 'claude',
        enabled: false,
      })
    );
    expect(firstStore.getActiveService()?.id).toBe('deepseek');
    expect(firstStore.getActiveProvider()?.id).toBe('chatgpt');

    firstStore.setProviderEnabled('deepseek', false);
    expect(firstStore.getActiveService()?.id).toBe('gemini');

    const secondStore = new CaptureStore(dbPath);
    expect(findService(secondStore.listServices(), 'claude')).toEqual(
      expect.objectContaining({
        enabled: false,
      })
    );
    expect(findService(secondStore.listServices(), custom.id)).toEqual(
      expect.objectContaining({
        enabled: true,
      })
    );
    expect(secondStore.getActiveService()?.id).toBe('gemini');
    expect(secondStore.getActiveProvider()?.id).toBe('chatgpt');
  });

  test('stores active service independently from the active built-in provider', () => {
    const firstStore = new CaptureStore(dbPath);
    firstStore.setActiveProvider('claude');
    const custom = firstStore.addCustomService({
      name: 'Console',
      url: 'https://console.example.com/app',
    });
    firstStore.setActiveService(custom.id);

    const secondStore = new CaptureStore(dbPath);
    expect(secondStore.getActiveService()).toEqual(
      expect.objectContaining({
        id: custom.id,
        active: true,
      })
    );
    expect(secondStore.getActiveProvider()?.id).toBe('claude');
  });

  test('persists custom icon self-healing updates without touching built-in services', () => {
    const firstStore = new CaptureStore(dbPath);
    const custom = firstStore.addCustomService({
      name: 'Docs',
      url: 'https://docs.example.com/portal',
    });

    const updated = firstStore.updateCustomServiceIcon(custom.id, 'https://docs.example.com/favicon.ico');
    expect(updated).toEqual(
      expect.objectContaining({
        id: custom.id,
        iconUrl: 'https://docs.example.com/favicon.ico',
      })
    );

    const secondStore = new CaptureStore(dbPath);
    expect(findService(secondStore.listServices(), custom.id)?.iconUrl).toBe(
      'https://docs.example.com/favicon.ico'
    );
    expect(() =>
      secondStore.updateCustomServiceIcon('chatgpt', 'https://chatgpt.com/favicon.ico')
    ).toThrow('Only custom services can persist discovered icons.');
  });

  test('persists preset-icon tokens for custom services across restart', () => {
    const firstStore = new CaptureStore(dbPath);
    const custom = firstStore.addCustomService({
      name: 'Console',
      url: 'https://console.example.com/app',
      iconUrl: 'amberkeeper:preset-icon:brain',
    });

    const secondStore = new CaptureStore(dbPath);
    expect(findService(secondStore.listServices(), custom.id)?.iconUrl).toBe(
      'amberkeeper:preset-icon:brain'
    );
  });
});

function findService(services: ServiceRecord[], serviceId: string): ServiceRecord | undefined {
  return services.find((service) => service.id === serviceId);
}
