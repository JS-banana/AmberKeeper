import { describe, expect, test } from 'vitest';
import {
  computeContentHash,
  getLatestAssistantContent,
  hasStableDomAssistantTurn,
  normalizeDomSnapshotMessages,
  parseChatGptHistoryResponse,
  parseChatGptRequestBody,
  parseChatGptSseResponse,
  parseChatGptStreamStatus,
  summarizeResponseBody,
} from '@amberkeeper/provider-chatgpt';

describe('chatgpt-parser', () => {
  test('extracts the user message from a ChatGPT request body', () => {
    const messages = parseChatGptRequestBody(
      JSON.stringify({
        conversation_id: 'conv-123',
        model: 'gpt-4.1',
        messages: [
          {
            id: 'msg-user-1',
            author: { role: 'user' },
            content: { parts: ['Explain WebContentsView in one paragraph.'] },
          },
        ],
      })
    );

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Explain WebContentsView in one paragraph.',
        remoteConversationId: 'conv-123',
        remoteMessageId: 'msg-user-1',
        model: 'gpt-4.1',
      }),
    ]);
  });

  test('extracts the final assistant message from a ChatGPT SSE payload', () => {
    const body = [
      'data: {"message":{"id":"msg-assistant-1","author":{"role":"assistant"},"content":{"parts":["Partial answer"]},"metadata":{"model_slug":"gpt-4.1"},"status":"in_progress"},"conversation_id":"conv-123"}',
      'data: {"message":{"id":"msg-assistant-1","author":{"role":"assistant"},"content":{"parts":["Final answer"]},"metadata":{"model_slug":"gpt-4.1"},"status":"finished_successfully"},"conversation_id":"conv-123"}',
      'data: [DONE]',
    ].join('\n');

    const messages = parseChatGptSseResponse(body);

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Final answer',
        remoteConversationId: 'conv-123',
        remoteMessageId: 'msg-assistant-1',
        model: 'gpt-4.1',
      }),
    ]);
  });

  test('extracts ordered messages from a ChatGPT history response', () => {
    const messages = parseChatGptHistoryResponse(
      JSON.stringify({
        conversation_id: 'conv-123',
        mapping: {
          root: { children: ['user-node'] },
          'user-node': {
            message: {
              id: 'msg-user-1',
              author: { role: 'user' },
              content: { parts: ['First question'] },
              create_time: 100,
            },
            children: ['assistant-node'],
          },
          'assistant-node': {
            message: {
              id: 'msg-assistant-1',
              author: { role: 'assistant' },
              content: { parts: ['First answer'] },
              create_time: 101,
              metadata: { model_slug: 'gpt-4.1' },
            },
            children: [],
          },
        },
      })
    );

    expect(messages.map((message) => message.content)).toEqual(['First question', 'First answer']);
    expect(messages[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        remoteConversationId: 'conv-123',
        model: 'gpt-4.1',
      })
    );
  });

  test('produces a stable content hash for deduplication', () => {
    expect(computeContentHash('same content')).toBe(computeContentHash('same content'));
    expect(computeContentHash('same content')).not.toBe(computeContentHash('different'));
  });

  test('summarizes a response body for parse failure diagnostics', () => {
    const summary = summarizeResponseBody(
      JSON.stringify({
        type: 'message.delta',
        delta: {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Codex supports subagents in some environments.' }],
        },
      })
    );

    expect(summary).toContain('"type":"message.delta"');
    expect(summary.length).toBeLessThanOrEqual(400);
  });

  test('detects when ChatGPT stream status reports completion', () => {
    expect(parseChatGptStreamStatus(JSON.stringify({ status: 'COMPLETE' }))).toBe('COMPLETE');
    expect(parseChatGptStreamStatus(JSON.stringify({ status: 'RUNNING' }))).toBeNull();
  });

  test('normalizes DOM snapshot messages into capture records', () => {
    const messages = normalizeDomSnapshotMessages(
      [
        { role: 'user', content: ' hi ' },
        { role: 'assistant', content: '你好，我是 ChatGPT。' },
        { role: 'tool', content: 'ignore me' },
      ],
      {
        conversationId: 'conv-123',
        capturedAt: '2026-03-19T09:30:00.000Z',
      }
    );

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'hi',
        remoteConversationId: 'conv-123',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: '你好，我是 ChatGPT。',
        remoteConversationId: 'conv-123',
      }),
    ]);
  });

  test('waits when the latest DOM turn has no assistant yet', () => {
    const messages = normalizeDomSnapshotMessages(
      [
        { role: 'user', content: '上一轮问题' },
        { role: 'assistant', content: '上一轮回答' },
        { role: 'user', content: '这一轮问题' },
      ],
      {
        conversationId: 'conv-123',
        capturedAt: '2026-03-19T09:57:20.000Z',
      }
    );

    expect(messages).toEqual([]);
  });

  test('returns only the latest completed DOM turn', () => {
    const messages = normalizeDomSnapshotMessages(
      [
        { role: 'user', content: '上一轮问题' },
        { role: 'assistant', content: '上一轮回答' },
        { role: 'user', content: '这一轮问题' },
        { role: 'assistant', content: '这一轮回答' },
      ],
      {
        conversationId: 'conv-123',
        capturedAt: '2026-03-19T09:57:20.000Z',
      }
    );

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '这一轮问题',
        remoteConversationId: 'conv-123',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: '这一轮回答',
        remoteConversationId: 'conv-123',
      }),
    ]);
  });

  test('treats a DOM turn as stable only after the assistant content repeats', async () => {
    const messages = normalizeDomSnapshotMessages(
      [
        { role: 'user', content: '这一轮问题' },
        { role: 'assistant', content: '这一轮回答' },
      ],
      {
        conversationId: 'conv-123',
        capturedAt: '2026-03-19T09:57:20.000Z',
      }
    );

    expect(hasStableDomAssistantTurn(messages, null)).toBe(false);
    expect(hasStableDomAssistantTurn(messages, '这一轮回答')).toBe(true);
    expect(getLatestAssistantContent(messages)).toBe('这一轮回答');
  });
});
