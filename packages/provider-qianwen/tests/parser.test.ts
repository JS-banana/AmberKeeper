import { describe, expect, test } from 'vitest';
import {
  parseQianwenHistoryResponse,
  parseQianwenRequestBody,
  parseQianwenSseResponse,
  summarizeQianwenResponseBody,
} from '../src/parser';

describe('qianwen-parser', () => {
  test('parses the latest user turn from request bodies and fills metadata', () => {
    const result = parseQianwenRequestBody(
      JSON.stringify({
        conversation_id: 'qw-conv-1',
        model: 'qwen-max',
        messages: [
          { role: 'system', content: 'ignore me' },
          { role: 'user', content: 'First user turn' },
          { role: 'assistant', content: 'First assistant turn' },
          { role: 'user', content: 'Latest user turn' },
        ],
      })
    );

    expect(result).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Latest user turn',
        remoteConversationId: 'qw-conv-1',
        model: 'qwen-max',
      }),
    ]);
  });

  test('parses qianwen v2 chat request messages without explicit roles', () => {
    const result = parseQianwenRequestBody(
      JSON.stringify({
        session_id: 'qw-v2-conv',
        model: 'Qwen',
        messages: [
          {
            content: 'Latest qianwen prompt',
            mime_type: 'text/plain',
          },
        ],
      })
    );

    expect(result).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Latest qianwen prompt',
        remoteConversationId: 'qw-v2-conv',
        model: 'Qwen',
      }),
    ]);
  });

  test('parses streamed assistant responses into a final assistant message', () => {
    const result = parseQianwenSseResponse(
      [
        'data: {"conversation_id":"qw-conv-1","response_message_id":77,"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"conversation_id":"qw-conv-1","response_message_id":77,"choices":[{"delta":{"content":" Hello, world"}}]}',
        'data: [DONE]',
      ].join('\n')
    );

    expect(result).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello, world',
        remoteConversationId: 'qw-conv-1',
        remoteMessageId: '77',
      }),
    ]);
  });

  test('parses history responses from message arrays', () => {
    const result = parseQianwenHistoryResponse(
      JSON.stringify({
        conversation_id: 'qw-history-1',
        messages: [
          {
            role: 'user',
            content: 'Earlier question',
            created_at: '2026-03-20T00:00:00.000Z',
            message_id: 'u1',
          },
          {
            role: 'assistant',
            content: 'Earlier answer',
            created_at: '2026-03-20T00:00:01.000Z',
            message_id: 'a1',
          },
          {
            role: 'user',
            content: 'Latest question',
            created_at: '2026-03-20T00:00:02.000Z',
            message_id: 'u2',
          },
          {
            role: 'assistant',
            content: 'Latest answer',
            created_at: '2026-03-20T00:00:03.000Z',
            message_id: 'a2',
          },
        ],
      })
    );

    expect(result).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Earlier question',
        remoteConversationId: 'qw-history-1',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Earlier answer',
        remoteConversationId: 'qw-history-1',
      }),
      expect.objectContaining({
        role: 'user',
        content: 'Latest question',
        remoteConversationId: 'qw-history-1',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Latest answer',
        remoteConversationId: 'qw-history-1',
      }),
    ]);
  });

  test('summarizes qianwen response bodies into compact previews', () => {
    expect(summarizeQianwenResponseBody('  hello   world  ')).toBe('hello world');
  });
});
