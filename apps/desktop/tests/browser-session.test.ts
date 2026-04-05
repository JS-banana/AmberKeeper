import { describe, expect, test } from 'vitest';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';

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
    expect(resolveBrowserSessionConfig('grok').homeUrl).toBe('https://grok.com');
    expect(resolveBrowserSessionConfig('kimi').homeUrl).toBe('https://www.kimi.com/');
    expect(resolveBrowserSessionConfig('qianwen').homeUrl).toBe('https://www.qianwen.com');
    expect(resolveBrowserSessionConfig('doubao').homeUrl).toBe('https://www.doubao.com/chat');
    expect(resolveBrowserSessionConfig('xiaomi-aistudio').homeUrl).toBe(
      'https://aistudio.xiaomimimo.com/#/c'
    );
  });
});
