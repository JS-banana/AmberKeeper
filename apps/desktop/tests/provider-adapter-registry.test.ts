import { describe, expect, test } from 'vitest';
import { chatgptAdapter } from '@anychat/provider-chatgpt';
import { getProviderAdapter, listRegisteredProviderAdapters } from '../src/main/runtime/provider-adapters';

describe('provider-adapter-registry', () => {
  test('resolves adapters by provider id and keeps mainstream adapters wired', () => {
    expect(getProviderAdapter('chatgpt')).toBe(chatgptAdapter);
    expect(getProviderAdapter('claude')).not.toBeNull();
    expect(getProviderAdapter('deepseek')).not.toBeNull();
    expect(getProviderAdapter('gemini')).not.toBeNull();
    expect(listRegisteredProviderAdapters().map((adapter) => adapter.id)).toEqual([
      'chatgpt',
      'claude',
      'deepseek',
      'gemini',
    ]);
  });

  test('represents missing provider adapters explicitly without crashing', () => {
    expect(getProviderAdapter('missing-provider' as unknown as Parameters<typeof getProviderAdapter>[0])).toBeNull();
  });
});
