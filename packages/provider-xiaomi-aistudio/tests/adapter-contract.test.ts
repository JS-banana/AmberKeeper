import { describe, expect, test } from 'vitest';
import { xiaomiAistudioAdapter } from '../src/adapter';

describe('xiaomi-aistudio-adapter', () => {
  test('normalizes MiMo Studio chat requests, streaming responses, and DOM snapshots into provider signals', () => {
    const requestSignals = xiaomiAistudioAdapter.interpretRequest({
      url: 'https://aistudio.xiaomimimo.com/open-apis/bot/chat',
      method: 'POST',
      body: JSON.stringify({
        conversationId: 'mimo-conv-1',
        messageId: 'mimo-msg-1',
        model: 'mimo-v2-flash',
        query: 'Explain the MiMo Studio message flow.',
      }),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-1',
      capturedAt: '2026-04-04T00:00:00.000Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    const response = xiaomiAistudioAdapter.interpretResponseBody({
      url: 'https://aistudio.xiaomimimo.com/open-apis/bot/chat',
      method: 'POST',
      body: [
        'data: {"conversationId":"mimo-conv-1","dialogId":"mimo-dialog-1","content":"MiMo Studio streams"}',
        'data: {"content":" responses in chunks."}',
        'data: {"done":true}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-1',
      capturedAt: '2026-04-04T00:00:01.000Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    const domResult = xiaomiAistudioAdapter.interpretDomSnapshot({
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-1',
      capturedAt: '2026-04-04T00:00:02.000Z',
      sourceSessionKey: 'xiaomi-primary-view',
      conversationId: 'mimo-conv-1',
      messages: [
        { role: 'user', content: 'Explain the MiMo Studio message flow.' },
        { role: 'assistant', content: 'MiMo Studio streams responses in chunks.' },
      ],
      previousAssistantContent: 'MiMo Studio streams responses in chunks.',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'mimo-conv-1',
          content: 'Explain the MiMo Studio message flow.',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'mimo-conv-1',
        }),
      ])
    );

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'mimo-conv-1',
          content: 'MiMo Studio streams responses in chunks.',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'mimo-conv-1',
        }),
      ])
    );
    expect(response.streamStatus).toBe('COMPLETE');
    expect(domResult.stable).toBe(true);
    expect(domResult.latestAssistantContent).toBe('MiMo Studio streams responses in chunks.');
  });

  test('supports Xiaomi MiMo OpenAI-compatible and Anthropic-compatible payloads', () => {
    const openAiResponse = xiaomiAistudioAdapter.interpretResponseBody({
      url: 'https://api.xiaomimimo.com/v1/chat/completions',
      method: 'POST',
      body: JSON.stringify({
        id: 'chatcmpl-mimo-1',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Hello from MiMo.',
            },
          },
        ],
      }),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-2',
      capturedAt: '2026-04-04T00:00:03.000Z',
      sourceSessionKey: 'xiaomi-api-view',
    });

    const anthropicRequest = xiaomiAistudioAdapter.interpretRequest({
      url: 'https://api.xiaomimimo.com/anthropic/v1/messages',
      method: 'POST',
      body: JSON.stringify({
        model: 'mimo-v2-pro',
        messages: [
          {
            role: 'user',
            content: 'Introduce yourself in one sentence.',
          },
        ],
      }),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-3',
      capturedAt: '2026-04-04T00:00:04.000Z',
      sourceSessionKey: 'xiaomi-api-view',
    });

    expect(openAiResponse.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          content: 'Hello from MiMo.',
        }),
      ])
    );
    expect(anthropicRequest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          content: 'Introduce yourself in one sentence.',
        }),
      ])
    );
  });

  test('parses inline event/data SSE lines emitted by the real MiMo chat endpoint', () => {
    const response = xiaomiAistudioAdapter.interpretResponseBody({
      url: 'https://aistudio.xiaomimimo.com/open-apis/bot/chat',
      method: 'POST',
      body: [
        'id:b99 event:dialogId data:{"content":"8158283"}',
        'id:b99 event:message data:{"type":"text","content":""}',
        'id:b99 event:message data:{"type":"text","content":"OK"}',
      ].join('\n'),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-inline',
      capturedAt: '2026-04-04T23:44:16.685Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          content: 'OK',
        }),
      ])
    );
    expect(response.streamStatus).toBe('COMPLETE');
  });

  test('strips inline think blocks from MiMo SSE responses while keeping the final assistant answer', () => {
    const response = xiaomiAistudioAdapter.interpretResponseBody({
      url: 'https://aistudio.xiaomimimo.com/open-apis/bot/chat',
      method: 'POST',
      body: [
        'id:b100 event:message data:{"conversationId":"mimo-conv-think","type":"text","content":"<think>hidden"}',
        'id:b100 event:message data:{"type":"text","content":"</think>Hello from MiMo."}',
        'data: [DONE]',
      ].join(' '),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-think',
      capturedAt: '2026-04-04T23:44:17.685Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'mimo-conv-think',
          content: 'Hello from MiMo.',
        }),
      ])
    );
    expect(response.streamStatus).toBe('COMPLETE');
  });

  test('extracts history payloads from chat dialog list responses', () => {
    const historyCapture = xiaomiAistudioAdapter.extractHistoryCapture?.({
      url: 'https://aistudio.xiaomimimo.com/open-apis/chat/dialog/list',
      method: 'POST',
      body: JSON.stringify({
        code: 0,
        data: [
          {
            conversationId: 'mimo-conv-history-1',
            msgId: 'msg-1',
            inputInfo: {
              query: '身份牵扯，交汇揭秘',
            },
            createTime: '2026-04-02 23:36:56',
            dialogLogDetailList: [
              {
                id: 'detail-1',
                result: '这是小米历史对话的回答。',
                createTime: '2026-04-02 23:37:16',
              },
            ],
          },
        ],
      }),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-history-1',
      capturedAt: '2026-04-04T15:45:44.234Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    expect(historyCapture).toEqual({
      conversationId: 'mimo-conv-history-1',
      messages: [
        expect.objectContaining({
          role: 'user',
          content: '身份牵扯，交汇揭秘',
          remoteConversationId: 'mimo-conv-history-1',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: '这是小米历史对话的回答。',
          remoteConversationId: 'mimo-conv-history-1',
        }),
      ],
    });
  });

  test('parses current MiMo SSE frames that include inline event metadata and think chunks', () => {
    const response = xiaomiAistudioAdapter.interpretResponseBody({
      url: 'https://aistudio.xiaomimimo.com/open-apis/bot/chat',
      method: 'POST',
      body: [
        'id:b97 event:dialogId data:{"content":"8149759"}',
        'id:b97 event:message data:{"type":"text","content":"<think>\\u0000First, the user"}',
        'id:b97 event:message data:{"type":"text","content":" wants Xiaomi help.</think>Hi there! I can help with Xiaomi."}',
      ].join(' '),
      pageUrl: 'https://aistudio.xiaomimimo.com/#/chat/mimo-conv-live-1',
      capturedAt: '2026-04-05T00:00:00.000Z',
      sourceSessionKey: 'xiaomi-primary-view',
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          content: 'Hi there! I can help with Xiaomi.',
        }),
      ])
    );
  });
});
