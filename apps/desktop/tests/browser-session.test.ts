import { describe, expect, test } from 'vitest';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';

describe('browser-session', () => {
  test('uses a persistent partition for chat providers', () => {
    expect(resolveBrowserSessionConfig('chatgpt').partition).toBe('persist:anychat-chatgpt');
  });
});
