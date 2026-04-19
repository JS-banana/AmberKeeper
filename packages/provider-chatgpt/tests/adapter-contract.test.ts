import { describe, expect, test } from 'vitest';
import { chatgptAdapter } from '../src/adapter';
import requestFixture from './fixtures/chatgpt-turn-request.json';

describe('chatgpt-adapter', () => {
  test('turns request + dom signals into a stable completed turn', () => {
    const signals = chatgptAdapter.interpretRequest({
      url: 'https://chatgpt.com/backend-api/f/conversation',
      method: 'POST',
      body: JSON.stringify(requestFixture),
      pageUrl: 'https://chatgpt.com',
      capturedAt: '2026-03-19T12:30:00.000Z',
      sourceSessionKey: 'chatgpt-primary-view',
    });

    expect(signals.some((signal) => signal.kind === 'candidateUserMessage')).toBe(true);
  });

  test('extracts a full history capture candidate from conversation GET responses', () => {
    const candidate = chatgptAdapter.extractHistoryCapture?.({
      url: 'https://chatgpt.com/backend-api/conversation/conv-123',
      method: 'GET',
      body: JSON.stringify({
        conversation_id: 'conv-123',
        mapping: {
          root: { children: ['user-node'] },
          'user-node': {
            message: {
              id: 'msg-user-1',
              author: { role: 'user' },
              content: { parts: ['Old question'] },
              create_time: 100,
            },
          },
          'assistant-node': {
            message: {
              id: 'msg-assistant-1',
              author: { role: 'assistant' },
              content: { parts: ['Old answer'] },
              create_time: 101,
              metadata: { model_slug: 'gpt-4.1' },
            },
          },
        },
      }),
      pageUrl: 'https://chatgpt.com/c/conv-123',
      capturedAt: '2026-03-20T00:00:00.000Z',
      sourceSessionKey: 'chatgpt-primary-view',
    });

    expect(candidate).toEqual({
      conversationId: 'conv-123',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'Old question',
          remoteConversationId: 'conv-123',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: 'Old answer',
          remoteConversationId: 'conv-123',
          model: 'gpt-4.1',
        }),
      ],
    });
  });
});
