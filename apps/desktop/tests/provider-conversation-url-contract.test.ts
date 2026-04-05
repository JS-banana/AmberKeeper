import { describe, expect, test } from 'vitest';
import type { CaptureSessionRecord, ProviderId } from '@amberkeeper/shared-types';
import { resolveBrowserSessionConfig } from '../src/main/runtime/browser-session';
import { resolveSessionNavigationUrl } from '../src/main/runtime/history-hydration';
import { getProviderAdapter } from '../src/main/runtime/provider-adapters';

describe('provider conversation url contract', () => {
  test.each([
    ['grok', 'grok-conv-1', 'https://grok.com/c/grok-conv-1'],
    ['kimi', 'kimi-conv-1', 'https://www.kimi.com/chat/kimi-conv-1'],
    ['qianwen', 'qianwen-conv-1', 'https://www.qianwen.com/chat/qianwen-conv-1'],
    ['doubao', 'doubao-conv-1', 'https://www.doubao.com/chat/doubao-conv-1'],
    ['xiaomi-aistudio', 'xiaomi-conv-1', 'https://aistudio.xiaomimimo.com/#/chat/xiaomi-conv-1'],
  ] as Array<[ProviderId, string, string]>)(
    'keeps %s home/config/navigation/extraction aligned',
    (providerId, conversationId, expectedUrl) => {
      const config = resolveBrowserSessionConfig(providerId);
      const adapter = getProviderAdapter(providerId);

      expect(adapter).not.toBeNull();

      const navigationUrl = resolveSessionNavigationUrl(
        buildSession({
          provider: providerId,
          pageUrl: '',
          remoteConversationId: conversationId,
        }),
        config.homeUrl
      );

      expect(navigationUrl).toBe(expectedUrl);
      expect(adapter?.extractConversationIdFromUrl(navigationUrl)).toBe(conversationId);
    }
  );
});

function buildSession(input: {
  provider: ProviderId;
  pageUrl: string;
  remoteConversationId: string;
}): CaptureSessionRecord {
  return {
    id: `${input.provider}-session`,
    provider: input.provider,
    title: null,
    remoteConversationId: input.remoteConversationId,
    sourceSessionKey: `${input.provider}-primary-view`,
    pageUrl: input.pageUrl,
    titleSource: null,
    previewText: null,
    messageCount: 0,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
}
