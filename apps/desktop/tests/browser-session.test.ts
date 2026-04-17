import { describe, expect, test } from 'vitest';
import {
  buildRemoteContentWebPreferences,
  buildCustomBrowserSessionConfig,
  executeChatCaptureScript,
  resolveBrowserSessionConfig,
} from '../src/main/runtime/browser-session';
import { AMBERKEEPER_CHAT_CAPTURE_WORLD_ID } from '../src/shared/chat-capture-bridge';

describe('browser-session', () => {
  test('uses a persistent partition for chat providers', () => {
    expect(resolveBrowserSessionConfig('chatgpt').partition).toBe('persist:anychat-chatgpt');
    expect(resolveBrowserSessionConfig('grok').partition).toBe('persist:anychat-grok');
    expect(resolveBrowserSessionConfig('kimi').partition).toBe('persist:anychat-kimi');
    expect(resolveBrowserSessionConfig('qianwen').partition).toBe('persist:anychat-qianwen');
    expect(resolveBrowserSessionConfig('doubao').partition).toBe('persist:anychat-doubao');
    expect(resolveBrowserSessionConfig('xiaomi-aistudio').partition).toBe('persist:anychat-xiaomi-aistudio');
  });

  test('exposes canonical home urls for the new providers', () => {
    expect(resolveBrowserSessionConfig('gemini').homeUrl).toBe('https://gemini.google.com/app');
    expect(resolveBrowserSessionConfig('grok').homeUrl).toBe('https://grok.com');
    expect(resolveBrowserSessionConfig('kimi').homeUrl).toBe('https://www.kimi.com/');
    expect(resolveBrowserSessionConfig('qianwen').homeUrl).toBe('https://www.qianwen.com');
    expect(resolveBrowserSessionConfig('doubao').homeUrl).toBe('https://www.doubao.com/chat');
    expect(resolveBrowserSessionConfig('xiaomi-aistudio').homeUrl).toBe(
      'https://aistudio.xiaomimimo.com/#/c'
    );
  });

  test('builds stable custom-service partitions without colliding with built-in providers', () => {
    const config = buildCustomBrowserSessionConfig({
      id: 'custom-service-1',
      name: 'Perplexity',
      launchUrl: 'https://www.perplexity.ai/discover',
    });

    expect(config).toEqual(
      expect.objectContaining({
        id: 'custom-service-1',
        name: 'Perplexity',
        homeUrl: 'https://www.perplexity.ai/discover',
        partition: 'persist:amberkeeper-custom-custom-service-1',
        sourceSessionKey: 'custom-service-1-primary-view',
      })
    );
    expect(config.partition).not.toBe(resolveBrowserSessionConfig('gemini').partition);
    expect(config.partition).not.toBe(resolveBrowserSessionConfig('xiaomi-aistudio').partition);
  });

  test('uses sandboxed isolated webPreferences for remote content surfaces', () => {
    expect(
      buildRemoteContentWebPreferences({
        preloadPath: '/tmp/chat.mjs',
        partition: 'persist:anychat-chatgpt',
      })
    ).toEqual({
      partition: 'persist:anychat-chatgpt',
      contextIsolation: true,
      sandbox: true,
      preload: '/tmp/chat.mjs',
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
    });
  });

  test('executes chat capture scripts in the dedicated isolated world when available', async () => {
    const isolatedCalls: Array<{
      worldId: number;
      scripts: Array<{ code: string }>;
      userGesture?: boolean;
    }> = [];
    const webContents = {
      executeJavaScript: async () => 'page-world',
      executeJavaScriptInIsolatedWorld: async (
        worldId: number,
        scripts: Array<{ code: string }>,
        userGesture?: boolean
      ) => {
        isolatedCalls.push({ worldId, scripts, userGesture });
        return 'isolated-world';
      },
    };

    await expect(executeChatCaptureScript(webContents, '(() => 1)()', true)).resolves.toBe(
      'isolated-world'
    );
    expect(isolatedCalls).toEqual([
      {
        worldId: AMBERKEEPER_CHAT_CAPTURE_WORLD_ID,
        scripts: [{ code: '(() => 1)()' }],
        userGesture: true,
      },
    ]);
  });

  test('falls back to executeJavaScript when isolated-world execution fails', async () => {
    const pageCalls: Array<{ code: string; userGesture?: boolean }> = [];
    const webContents = {
      executeJavaScript: async (code: string, userGesture?: boolean) => {
        pageCalls.push({ code, userGesture });
        return 'page-world';
      },
      executeJavaScriptInIsolatedWorld: async () => {
        throw new Error('missing bridge');
      },
    };

    await expect(executeChatCaptureScript(webContents, '(() => 2)()', false)).resolves.toBe(
      'page-world'
    );
    expect(pageCalls).toEqual([{ code: '(() => 2)()', userGesture: false }]);
  });
});
