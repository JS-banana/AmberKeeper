import { claudeAdapter } from '@amberkeeper/provider-claude';
import { deepseekAdapter } from '@amberkeeper/provider-deepseek';
import { geminiAdapter } from '@amberkeeper/provider-gemini';
import { chatgptAdapter } from '@amberkeeper/provider-chatgpt';
import { describe, expect, test } from 'vitest';
import {
  createNormalizedMessageSignature,
  createOldSessionAutoCacheKey,
  resolveAutoCachedTitle,
  resolveDiscoveryAutoCacheCandidate,
  shouldAcceptAutoCacheSnapshot,
  shouldPersistAutoCachedMessages,
} from '../src/main/runtime/old-session-auto-cache';

describe('old-session-auto-cache', () => {
  test('builds stable provider+conversation job keys', () => {
    expect(createOldSessionAutoCacheKey('chatgpt', 'conv-1')).toBe('chatgpt:conv-1');
    expect(createOldSessionAutoCacheKey('claude', 'conv-1')).not.toBe(
      createOldSessionAutoCacheKey('chatgpt', 'conv-1')
    );
  });

  test('compares message signatures across create and enrich snapshots', () => {
    const initial = [
      {
        role: 'user' as const,
        content: 'Question',
        createdAt: '2026-03-20T00:00:00.000Z',
        remoteMessageId: null,
        model: null,
      },
      {
        role: 'assistant' as const,
        content: 'Answer',
        createdAt: '2026-03-20T00:00:01.000Z',
        remoteMessageId: null,
        model: 'gpt-4.1',
      },
    ];
    const richer = [
      ...initial,
      {
        role: 'user' as const,
        content: 'Follow-up',
        createdAt: '2026-03-20T00:00:02.000Z',
        remoteMessageId: null,
        model: null,
      },
    ];

    expect(createNormalizedMessageSignature(initial)).toBe(
      createNormalizedMessageSignature([...initial])
    );
    expect(shouldPersistAutoCachedMessages(initial, initial)).toBe(false);
    expect(shouldPersistAutoCachedMessages(initial, richer)).toBe(true);
  });

  test('extracts conversation-route ids only from actual provider conversation urls', () => {
    expect(chatgptAdapter.extractConversationIdFromUrl('https://chatgpt.com/c/chatgpt-conv')).toBe(
      'chatgpt-conv'
    );
    expect(claudeAdapter.extractConversationIdFromUrl('https://claude.ai/chat/claude-conv')).toBe(
      'claude-conv'
    );
    expect(
      deepseekAdapter.extractConversationIdFromUrl('https://chat.deepseek.com/a/chat/s/deepseek-conv')
    ).toBe('deepseek-conv');
    expect(geminiAdapter.extractConversationIdFromUrl('https://gemini.google.com/app/gemini-conv')).toBe(
      'gemini-conv'
    );

    expect(chatgptAdapter.extractConversationIdFromUrl('https://chatgpt.com')).toBeNull();
    expect(claudeAdapter.extractConversationIdFromUrl('https://claude.ai/new')).toBeNull();
    expect(deepseekAdapter.extractConversationIdFromUrl('https://chat.deepseek.com/')).toBeNull();
    expect(geminiAdapter.extractConversationIdFromUrl('https://gemini.google.com/app')).toBeNull();
  });

  test('accepts discovery-trigger auto-cache only for the active provider/runtime with a real conversation id', () => {
    expect(
      resolveDiscoveryAutoCacheCandidate({
        classification: 'discover',
        activeProviderId: 'gemini',
        runtimeProviderId: 'gemini',
        signalProviderId: 'gemini',
        remoteConversationId: '62c89b373361ccd6',
        pageUrl: 'https://gemini.google.com/app',
      })
    ).toEqual({
      providerId: 'gemini',
      remoteConversationId: '62c89b373361ccd6',
      targetUrl: 'https://gemini.google.com/app',
    });

    expect(
      resolveDiscoveryAutoCacheCandidate({
        classification: 'capture',
        activeProviderId: 'gemini',
        runtimeProviderId: 'gemini',
        signalProviderId: 'gemini',
        remoteConversationId: '62c89b373361ccd6',
        pageUrl: 'https://gemini.google.com/app',
      })
    ).toBeNull();
    expect(
      resolveDiscoveryAutoCacheCandidate({
        classification: 'discover',
        activeProviderId: 'chatgpt',
        runtimeProviderId: 'gemini',
        signalProviderId: 'gemini',
        remoteConversationId: '62c89b373361ccd6',
        pageUrl: 'https://gemini.google.com/app',
      })
    ).toBeNull();
    expect(
      resolveDiscoveryAutoCacheCandidate({
        classification: 'discover',
        activeProviderId: 'gemini',
        runtimeProviderId: 'chatgpt',
        signalProviderId: 'gemini',
        remoteConversationId: '62c89b373361ccd6',
        pageUrl: 'https://gemini.google.com/app',
      })
    ).toBeNull();
    expect(
      resolveDiscoveryAutoCacheCandidate({
        classification: 'discover',
        activeProviderId: 'gemini',
        runtimeProviderId: 'gemini',
        signalProviderId: 'gemini',
        remoteConversationId: null,
        pageUrl: 'https://gemini.google.com/app',
      })
    ).toBeNull();
  });

  test('rejects unchanged pre-navigation DOM snapshots for discovery-trigger auto-cache until the conversation is confirmed', () => {
    expect(
      shouldAcceptAutoCacheSnapshot({
        stage: 'history-auto-cache',
        preferredConversationId: 'gemini-conv-1',
        resolvedConversationId: null,
        initialSignature: 'same-signature',
        nextSignature: 'same-signature',
      })
    ).toBe(false);

    expect(
      shouldAcceptAutoCacheSnapshot({
        stage: 'history-auto-cache',
        preferredConversationId: 'gemini-conv-1',
        resolvedConversationId: 'gemini-conv-1',
        initialSignature: 'same-signature',
        nextSignature: 'same-signature',
      })
    ).toBe(true);

    expect(
      shouldAcceptAutoCacheSnapshot({
        stage: 'history-auto-cache',
        preferredConversationId: 'gemini-conv-1',
        resolvedConversationId: null,
        initialSignature: 'old-signature',
        nextSignature: 'new-signature',
      })
    ).toBe(true);
  });

  test('drops potentially stale titles for auto-cached sessions but keeps hydration titles', () => {
    expect(
      resolveAutoCachedTitle({
        stage: 'history-auto-cache',
        snapshotTitle: 'Some previous conversation title',
      })
    ).toBeNull();
    expect(
      resolveAutoCachedTitle({
        stage: 'network-history-response',
        snapshotTitle: 'Another title',
      })
    ).toBeNull();
    expect(
      resolveAutoCachedTitle({
        stage: 'history-hydration',
        snapshotTitle: 'Confirmed local title',
      })
    ).toBe('Confirmed local title');
  });
});
