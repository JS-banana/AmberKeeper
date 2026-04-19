import { describe, expect, test } from 'vitest';
import { getProviderLiveAutomationSpec } from '../src/main/runtime/provider-adapters';

describe('provider-live-automation-registry', () => {
  test('registers live automation specs for chatgpt plus the five live-adaptation providers', () => {
    expect(getProviderLiveAutomationSpec('chatgpt')).toEqual(
      expect.objectContaining({ providerId: 'chatgpt', newMessage: expect.any(Object) })
    );
    expect(getProviderLiveAutomationSpec('xiaomi-aistudio')).toEqual(
      expect.objectContaining({ providerId: 'xiaomi-aistudio', newMessage: expect.any(Object) })
    );
    expect(getProviderLiveAutomationSpec('qianwen')).toEqual(
      expect.objectContaining({ providerId: 'qianwen', newMessage: expect.any(Object) })
    );
    expect(getProviderLiveAutomationSpec('doubao')).toEqual(
      expect.objectContaining({ providerId: 'doubao', newMessage: expect.any(Object) })
    );
    expect(getProviderLiveAutomationSpec('kimi')).toEqual(
      expect.objectContaining({ providerId: 'kimi', newMessage: expect.any(Object) })
    );
    expect(getProviderLiveAutomationSpec('grok')).toEqual(
      expect.objectContaining({ providerId: 'grok', newMessage: expect.any(Object) })
    );
  });

  test('returns null for providers without a live automation spec', () => {
    expect(getProviderLiveAutomationSpec('claude')).toBeNull();
  });
});
