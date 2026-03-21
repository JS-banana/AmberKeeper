import { describe, expect, test } from 'vitest';
import { deepseekAdapter } from '../src/adapter';

describe('deepseek-adapter', () => {
  test('normalizes actual DeepSeek completion request and streaming response into provider signals', () => {
    const requestSignals = deepseekAdapter.interpretRequest({
      url: 'https://chat.deepseek.com/api/v0/chat/completion',
      method: 'POST',
      body: JSON.stringify({
        chat_session_id: 'deepseek-conv-1',
        parent_message_id: null,
        prompt: 'Explain this code path.',
        thinking_enabled: true,
      }),
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-1',
      capturedAt: '2026-03-19T00:00:00.000Z',
      sourceSessionKey: 'deepseek-primary-view',
    });

    const response = deepseekAdapter.interpretResponseBody({
      url: 'https://chat.deepseek.com/api/v0/chat/completion',
      method: 'POST',
      body: [
        'event: ready',
        'data: {"request_message_id":3,"response_message_id":4}',
        'event: update_session',
        'data: {"updated_at":1773940584.44607}',
        'data: {"v":{"response":{"message_id":4,"parent_id":3,"model":"","role":"ASSISTANT","status":"WIP","inserted_at":1773940584.443699,"contents":[{"content_type":"text","text":"Here is the path."}]}}}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-1',
      capturedAt: '2026-03-19T00:00:01.000Z',
      sourceSessionKey: 'deepseek-primary-view',
    });

    const domResult = deepseekAdapter.interpretDomSnapshot({
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-1',
      capturedAt: '2026-03-19T00:00:02.000Z',
      sourceSessionKey: 'deepseek-primary-view',
      conversationId: 'deepseek-conv-1',
      messages: [
        { role: 'user', content: 'Explain this code path.' },
        { role: 'assistant', content: 'Here is the path.' },
      ],
      previousAssistantContent: 'Here is the path.',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'deepseek-conv-1',
          content: 'Explain this code path.',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'deepseek-conv-1',
        }),
      ])
    );
    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'deepseek-conv-1',
          content: 'Here is the path.',
          createdAt: '2026-03-19T17:16:24.443Z',
          remoteMessageId: '4',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'deepseek-conv-1',
        }),
      ])
    );
    expect(domResult.stable).toBe(true);
    expect(domResult.signals.some((signal) => signal.kind === 'conversationIdResolved')).toBe(true);
  });

  test('prefers final response contents when DeepSeek emits a shallow legacy text event first', () => {
    const response = deepseekAdapter.interpretResponseBody({
      url: 'https://chat.deepseek.com/api/v0/chat/completion',
      method: 'POST',
      body: [
        'event: ready',
        'data: {"request_message_id":9,"response_message_id":12}',
        'data: {"text":"Probe Response"}',
        'data: {"v":{"response":{"message_id":12,"role":"ASSISTANT","inserted_at":1773940584.443699,"contents":[{"type":"text","text":"Full final answer from DeepSeek."}]}}}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-2',
      capturedAt: '2026-03-19T00:00:03.000Z',
      sourceSessionKey: 'deepseek-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'deepseek-conv-2',
          content: 'Full final answer from DeepSeek.',
          createdAt: '2026-03-19T17:16:24.443Z',
          remoteMessageId: '12',
        }),
      ])
    );
  });

  test('retains response metadata when DeepSeek emits legacy content after inserted_at metadata', () => {
    const response = deepseekAdapter.interpretResponseBody({
      url: 'https://chat.deepseek.com/api/v0/chat/completion',
      method: 'POST',
      body: [
        'event: ready',
        'data: {"request_message_id":1,"response_message_id":2}',
        'data: {"v":{"response":{"message_id":2,"role":"ASSISTANT","status":"WIP","inserted_at":1773941941.5224018,"fragments":[{"id":2,"type":"THINK","content":"嗯"}]}}}',
        'data: {"content":"探测请求回应"}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-3',
      capturedAt: '2026-03-19T00:00:04.000Z',
      sourceSessionKey: 'deepseek-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'deepseek-conv-3',
          content: '探测请求回应',
          createdAt: '2026-03-19T17:39:01.522Z',
          remoteMessageId: '2',
        }),
      ])
    );
  });

  test('treats DeepSeek preflight chat endpoints as discovery rather than captures', () => {
    expect(
      deepseekAdapter.classifyRequest({
        url: 'https://chat.deepseek.com/api/v0/chat/create_pow_challenge',
        method: 'POST',
      })
    ).toBe('discover');
    expect(
      deepseekAdapter.classifyRequest({
        url: 'https://chat.deepseek.com/api/v0/chat_session/create',
        method: 'POST',
      })
    ).toBe('discover');
  });

  test('falls back to request capturedAt for DeepSeek user message timestamps', () => {
    const requestSignals = deepseekAdapter.interpretRequest({
      url: 'https://chat.deepseek.com/api/v0/chat/completion',
      method: 'POST',
      body: JSON.stringify({
        chat_session_id: 'deepseek-conv-4',
        prompt: 'Timestamp this request.',
      }),
      pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv-4',
      capturedAt: '2026-03-19T17:44:31.330Z',
      sourceSessionKey: 'deepseek-primary-view',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'deepseek-conv-4',
          content: 'Timestamp this request.',
          createdAt: '2026-03-19T17:44:31.330Z',
        }),
      ])
    );
  });
});
