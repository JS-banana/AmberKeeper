import { describe, expect, test } from 'vitest';
import { claudeAdapter } from '../src/adapter';

describe('claude-adapter', () => {
  test('normalizes request, response, and dom snapshots into provider signals', () => {
    const requestSignals = claudeAdapter.interpretRequest({
      url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1/completion',
      method: 'POST',
      body: JSON.stringify({
        conversation_uuid: 'conv-1',
        prompt: 'Hello Claude',
        model: 'claude-3-7-sonnet',
      }),
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-19T00:00:00.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    const response = claudeAdapter.interpretResponseBody({
      url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1/completion',
      method: 'POST',
      body: [
        'data: {"completion":"Hello"}',
        'data: {"completion":" from Claude"}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-19T00:00:01.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    const domResult = claudeAdapter.interpretDomSnapshot({
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-19T00:00:02.000Z',
      sourceSessionKey: 'claude-primary-view',
      conversationId: 'conv-1',
      messages: [
        { role: 'user', content: 'Hello Claude' },
        { role: 'assistant', content: 'Hello from Claude' },
      ],
      previousAssistantContent: 'Hello from Claude',
    });

    expect(requestSignals.some((signal) => signal.kind === 'candidateUserMessage')).toBe(true);
    expect(response.signals.some((signal) => signal.kind === 'assistantMayBeReady')).toBe(true);
    expect(domResult.stable).toBe(true);
    expect(domResult.signals.some((signal) => signal.kind === 'conversationIdResolved')).toBe(true);
  });

  test('falls back to the conversation id encoded in Claude completion URLs', () => {
    const requestSignals = claudeAdapter.interpretRequest({
      url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-from-url/completion',
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Hello Claude',
        model: 'claude-sonnet-4-6',
      }),
      pageUrl: 'https://claude.ai/chat/conv-from-url',
      capturedAt: '2026-03-20T00:00:00.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    const response = claudeAdapter.interpretResponseBody({
      url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-from-url/completion',
      method: 'POST',
      body: ['data: {"completion":"Hello"}', 'data: {"completion":" again"}', 'data: [DONE]'].join('\n'),
      pageUrl: 'https://claude.ai/chat/conv-from-url',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'conv-from-url',
          content: 'Hello Claude',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'conv-from-url',
        }),
      ])
    );
    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'conv-from-url',
          content: 'Hello again',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'conv-from-url',
        }),
      ])
    );
  });

  test('treats retry and history routes as Claude conversation captures', () => {
    expect(
      claudeAdapter.classifyRequest({
        url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1/retry_completion',
        method: 'POST',
      })
    ).toBe('capture');
    expect(
      claudeAdapter.classifyRequest({
        url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1?tree=True&rendering_mode=messages',
        method: 'GET',
      })
    ).toBe('capture');
    expect(
      claudeAdapter.extractConversationIdFromUrl(
        'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1/retry_completion'
      )
    ).toBe('conv-1');
    expect(
      claudeAdapter.extractConversationIdFromUrl(
        'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1?tree=True&rendering_mode=messages'
      )
    ).toBe('conv-1');
  });

  test('normalizes Claude history JSON responses with stable timestamps', () => {
    const response = claudeAdapter.interpretResponseBody({
      url: 'https://claude.ai/api/organizations/org-1/chat_conversations/conv-1?tree=True&rendering_mode=messages&consistency=strong',
      method: 'GET',
      body: JSON.stringify({
        uuid: 'conv-1',
        created_at: '2026-03-20T00:10:00.000Z',
        updated_at: '2026-03-20T00:10:10.000Z',
        chat_messages: [
          {
            uuid: 'msg-assistant-1',
            sender: 'assistant',
            created_at: '2026-03-20T00:10:02.000Z',
            updated_at: '2026-03-20T00:10:03.000Z',
            content: [{ type: 'text', text: 'History answer' }],
          },
          {
            uuid: 'msg-user-1',
            sender: 'human',
            created_at: '2026-03-20T00:10:01.000Z',
            updated_at: '2026-03-20T00:10:01.500Z',
            content: [{ type: 'text', text: 'History question' }],
          },
        ],
      }),
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T00:10:11.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'conv-1',
          content: 'History question',
          createdAt: '2026-03-20T00:10:01.000Z',
        }),
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'conv-1',
          content: 'History answer',
          createdAt: '2026-03-20T00:10:02.000Z',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'conv-1',
        }),
      ])
    );
  });

  test('ignores non-history Claude GET responses instead of trying to parse them as chat history', () => {
    const response = claudeAdapter.interpretResponseBody({
      url: 'https://claude.ai/api/organizations/org-1/projects?include_harmony_projects=true&limit=30',
      method: 'GET',
      body: JSON.stringify({ data: [{ uuid: 'project-1' }] }),
      pageUrl: 'https://claude.ai/new',
      capturedAt: '2026-03-20T00:20:00.000Z',
      sourceSessionKey: 'claude-primary-view',
    });

    expect(response.signals).toEqual([]);
    expect(response.streamStatus).toBeNull();
  });
});
