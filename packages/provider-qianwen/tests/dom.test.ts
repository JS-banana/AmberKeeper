import { describe, expect, test } from 'vitest';
import { collectQianwenStructuredMessages, normalizeQianwenDomSnapshotMessages } from '../src/dom';

describe('qianwen-dom', () => {
  test('collects qianwen DOM messages and preserves the latest turn only', () => {
    const userMessage = createNode({
      className: 'message-item',
      queries: {
        '.user-message, [data-role="user"], [data-message-role="user"]': createNode({
          textContent: 'Earlier question',
          queries: {
            '.message-content, .content, .markdown, .qwen-markdown': createNode({
              textContent: 'Earlier question',
            }),
          },
        }),
      },
    });
    const assistantMessage = createNode({
      className: 'message-item',
      queries: {
        '.user-message, [data-role="user"], [data-message-role="user"]': null,
        '.assistant-message, [data-role="assistant"], [data-message-role="assistant"]': createNode({
          textContent: 'Earlier answer',
          queries: {
            '.message-content, .content, .markdown, .qwen-markdown': createNode({
              textContent: 'Earlier answer',
            }),
          },
        }),
      },
    });
    const latestUser = createNode({
      className: 'qwen-message',
      queries: {
        '.user-message, [data-role="user"], [data-message-role="user"]': createNode({
          textContent: 'Latest question',
          queries: {
            '.message-content, .content, .markdown, .qwen-markdown': createNode({
              textContent: 'Latest question',
            }),
          },
        }),
      },
    });
    const latestAssistant = createNode({
      className: 'qwen-message',
      queries: {
        '.user-message, [data-role="user"], [data-message-role="user"]': null,
        '.assistant-message, [data-role="assistant"], [data-message-role="assistant"]': createNode({
          textContent: 'Latest answer',
          queries: {
            '.message-content, .content, .markdown, .qwen-markdown': createNode({
              textContent: 'Latest answer',
            }),
          },
        }),
      },
    });
    const root = createNode({
      queries: {
        '.message-item, .chat-message, .qwen-message, .conversation-turn, [class*="questionItem"], [class*="answerItem"], [data-chat-list-key], [data-msgid]': [
          userMessage,
          assistantMessage,
          latestUser,
          latestAssistant,
        ],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' },
      { role: 'assistant', content: 'Latest answer' },
    ]);

    expect(
      normalizeQianwenDomSnapshotMessages(collectQianwenStructuredMessages(root), {
        conversationId: 'qw-conv-1',
        capturedAt: '2026-03-20T00:00:00.000Z',
      })
    ).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Latest question',
        remoteConversationId: 'qw-conv-1',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Latest answer',
        remoteConversationId: 'qw-conv-1',
      }),
    ]);
  });

  test('collects qianwen history DOM turns from question/answer items', () => {
    const questionNode = createNode({
      className: 'questionItem-u8_ahH group',
      attributes: {
        'data-msgid': 'msg-1-question',
      },
      textContent: 'Who wrote this?',
    });
    const answerNode = createNode({
      className: 'answerItem-sQ6QT6 true quark',
      attributes: {
        'data-msgid': 'msg-1-answer',
      },
      textContent: 'It was written by Qianwen.',
    });
    const root = createNode({
      queries: {
        '.message-item, .chat-message, .qwen-message, .conversation-turn, [class*="questionItem"], [class*="answerItem"], [data-chat-list-key], [data-msgid]':
          [questionNode, answerNode],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Who wrote this?' },
      { role: 'assistant', content: 'It was written by Qianwen.' },
    ]);
  });
});

type FakeNode = {
  className?: string;
  textContent?: string | null;
  querySelector: (selector: string) => FakeNode | null;
  querySelectorAll: (selector: string) => FakeNode[];
  getAttribute: (name: string) => string | null;
};

function createNode(input: {
  className?: string;
  textContent?: string | null;
  attributes?: Record<string, string>;
  queries?: Record<string, FakeNode | FakeNode[] | null>;
}): FakeNode {
  const queries = input.queries ?? {};
  const attributes = input.attributes ?? {};

  return {
    className: input.className ?? '',
    textContent: input.textContent ?? null,
    getAttribute(name: string) {
      return attributes[name] ?? null;
    },
    querySelector(selector: string) {
      const result = queries[selector] ?? null;
      return Array.isArray(result) ? (result[0] ?? null) : result;
    },
    querySelectorAll(selector: string) {
      const result = queries[selector] ?? null;
      if (!result) {
        return [];
      }

      return Array.isArray(result) ? result : [result];
    },
  };
}
