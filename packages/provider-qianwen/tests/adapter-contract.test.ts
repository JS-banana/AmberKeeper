import { describe, expect, test } from 'vitest';
import { qianwenAdapter } from '../src/adapter';

describe('qianwen-adapter', () => {
  test('normalizes request, response, and dom snapshots into provider signals', () => {
    const requestSignals = qianwenAdapter.interpretRequest({
      url: 'https://www.qianwen.com/api/chat/completions',
      method: 'POST',
      body: JSON.stringify({
        conversation_id: 'qw-conv-1',
        model: 'qwen-max',
        messages: [
          { role: 'user', content: 'Hello Qianwen' },
          { role: 'assistant', content: 'Hello there' },
          { role: 'user', content: 'Please explain the latest provider shape.' },
        ],
      }),
      pageUrl: 'https://www.qianwen.com/chat/qw-conv-1',
      capturedAt: '2026-03-20T00:00:00.000Z',
      sourceSessionKey: 'qianwen-primary-view',
    });

    const response = qianwenAdapter.interpretResponseBody({
      url: 'https://www.qianwen.com/api/chat/completions',
      method: 'POST',
      body: [
        'data: {"conversation_id":"qw-conv-1","response_message_id":12,"choices":[{"delta":{"content":"Here is "}}]}',
        'data: {"conversation_id":"qw-conv-1","response_message_id":12,"choices":[{"delta":{"content":"the answer."}}]}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://www.qianwen.com/chat/qw-conv-1',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'qianwen-primary-view',
    });

    const domResult = qianwenAdapter.interpretDomSnapshot({
      pageUrl: 'https://www.qianwen.com/chat/qw-conv-1',
      capturedAt: '2026-03-20T00:00:02.000Z',
      sourceSessionKey: 'qianwen-primary-view',
      conversationId: 'qw-conv-1',
      messages: [
        { role: 'user', content: 'Please explain the latest provider shape.' },
        { role: 'assistant', content: 'Here is the answer.' },
      ],
      previousAssistantContent: 'Here is the answer.',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          content: 'Please explain the latest provider shape.',
          conversationId: 'qw-conv-1',
        }),
      ])
    );
    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'qw-conv-1',
          content: 'Here is the answer.',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'qw-conv-1',
        }),
      ])
    );
    expect(domResult.stable).toBe(true);
    expect(domResult.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'qw-conv-1',
        }),
      ])
    );
  });

  test('treats qianwen history responses as completed assistant turns', () => {
    const response = qianwenAdapter.interpretResponseBody({
      url: 'https://www.qianwen.com/api/chat/conversations/qw-history-1',
      method: 'GET',
      body: JSON.stringify({
        conversation_id: 'qw-history-1',
        messages: [
          { role: 'user', content: 'Older question', created_at: '2026-03-20T00:00:00.000Z' },
          { role: 'assistant', content: 'Older answer', created_at: '2026-03-20T00:00:01.000Z' },
          { role: 'user', content: 'Latest question', created_at: '2026-03-20T00:00:02.000Z' },
          { role: 'assistant', content: 'Latest answer', created_at: '2026-03-20T00:00:03.000Z' },
        ],
      }),
      pageUrl: 'https://www.qianwen.com/chat/qw-history-1',
      capturedAt: '2026-03-20T00:00:04.000Z',
      sourceSessionKey: 'qianwen-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'qw-history-1',
          content: 'Latest answer',
        }),
      ])
    );
  });

  test('extracts history payloads from qianwen session message list responses', () => {
    const historyCapture = qianwenAdapter.extractHistoryCapture?.({
      url: 'https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=qw-history-2',
      method: 'GET',
      body: JSON.stringify({
        data: {
          messages: [
            {
              role: 'user',
              content: 'Earlier question',
              created_at: '2026-03-20T00:00:00.000Z',
              session_id: 'qw-history-2',
            },
            {
              role: 'assistant',
              content: 'Earlier answer',
              created_at: '2026-03-20T00:00:01.000Z',
              session_id: 'qw-history-2',
            },
          ],
        },
      }),
      pageUrl: 'https://www.qianwen.com/chat/qw-history-2',
      capturedAt: '2026-03-20T00:00:04.000Z',
      sourceSessionKey: 'qianwen-primary-view',
    });

    expect(historyCapture).toEqual({
      conversationId: 'qw-history-2',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'Earlier question',
          remoteConversationId: 'qw-history-2',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: 'Earlier answer',
          remoteConversationId: 'qw-history-2',
        }),
      ],
    });
  });
});
