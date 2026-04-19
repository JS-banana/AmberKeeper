import { describe, expect, test } from 'vitest';
import { collectKimiStructuredMessages, normalizeKimiDomSnapshotMessages } from '../src/dom';

describe('kimi-dom', () => {
  test('collects kimi DOM messages and preserves the latest turn only', () => {
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
        '.message-item': [userMessage, assistantMessage],
        '.qwen-message': [latestUser, latestAssistant],
        '[data-message-author-role]': [],
        '[data-role]': [],
        '[data-message-role]': [],
        '[data-testid*="message"]': [],
        '.chat-message': [],
        '.conversation-turn': [],
        '.conversation-message': [],
        '.user-message': [],
        '.assistant-message': [],
        '[class*="message"]': [userMessage, assistantMessage, latestUser, latestAssistant],
        '[class*="chat"]': [],
        '[role="article"]': [],
        'main article, [role="article"]': [],
      },
    }) as unknown as ParentNode;

    expect(collectKimiStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'Latest question' },
      { role: 'assistant', content: 'Latest answer' },
    ]);

    expect(
      normalizeKimiDomSnapshotMessages(collectKimiStructuredMessages(root), {
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

  test('collects kimi chat-content user and assistant turns', () => {
    const userNode = createNode({
      className: 'chat-content-item chat-content-item-user',
      queries: {
        '.message-content, .content, .markdown, .markdown-container, .paragraph, .user-content, .qwen-markdown':
          createNode({
            textContent: 'Kimi question',
          }),
      },
    });
    const assistantNode = createNode({
      className: 'chat-content-item chat-content-item-assistant',
      queries: {
        '.message-content, .content, .markdown, .markdown-container, .paragraph, .user-content, .qwen-markdown':
          createNode({
            textContent: 'Kimi answer',
          }),
      },
    });
    const root = createNode({
      queries: {
        '.chat-content-item': [userNode, assistantNode],
        '[class*="chat"]': [userNode, assistantNode],
        '[class*="message"]': [],
        '[data-message-author-role]': [],
        '[data-role]': [],
        '[data-message-role]': [],
        '[data-testid*="message"]': [],
        '.message-item': [],
        '.chat-message': [],
        '.conversation-turn': [],
        '.conversation-message': [],
        '.user-message': [],
        '.assistant-message': [],
        '[role="article"]': [],
        'main article, [role="article"]': [],
      },
    }) as unknown as ParentNode;

    expect(collectKimiStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Kimi question' },
      { role: 'assistant', content: 'Kimi answer' },
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
