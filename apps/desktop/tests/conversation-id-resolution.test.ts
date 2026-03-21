import { geminiAdapter } from '@amberkeeper/provider-gemini';
import { describe, expect, test } from 'vitest';
import { resolveConversationIdSignal } from '../src/main/runtime/conversation-id-resolution';

describe('conversation-id-resolution', () => {
  test('emits a conversationIdResolved signal when Gemini discovery urls reveal the new conversation id', () => {
    const signal = resolveConversationIdSignal({
      provider: 'gemini',
      source: 'cdp-network',
      sourceSessionKey: 'gemini-primary-view',
      pageUrl: 'https://gemini.google.com/app',
      capturedAt: '2026-03-20T07:45:22.306Z',
      urls: [
        'https://gemini.google.com/app',
        'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=aPya6c&source-path=%2Fapp%2F62c89b373361ccd6&bl=boq_assistant-bard-web-server_20260317.00_p3&_reqid=2956673&rt=c',
      ],
      adapter: geminiAdapter,
    });

    expect(signal).toEqual(
      expect.objectContaining({
        provider: 'gemini',
        kind: 'conversationIdResolved',
        conversationId: '62c89b373361ccd6',
      })
    );
  });
});
