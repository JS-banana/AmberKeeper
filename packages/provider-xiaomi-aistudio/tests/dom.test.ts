import { describe, expect, test } from 'vitest';
import { collectXiaomiAistudioStructuredMessages } from '../src/dom';

describe('xiaomi-aistudio-dom', () => {
  test('collects user and assistant turns from the MiMo Studio message list', () => {
    const userMessage = createNode({
      className: 'message-item user-message',
      textContent: 'How does the MiMo Studio chat work?',
      queries: {
        'img[alt="User profile"]': createNode({ textContent: '' }),
        '.markdown, .message-content, .message-text, [data-message-content]': createNode({
          textContent: 'How does the MiMo Studio chat work?',
        }),
      },
    });
    const assistantMessage = createNode({
      className: 'message-item assistant-message',
      textContent: 'MiMo Studio streams assistant text in small chunks.',
      queries: {
        '.markdown, .message-content, .message-text, [data-message-content]': createNode({
          textContent: 'MiMo Studio streams assistant text in small chunks.',
        }),
      },
    });
    const root = createNode({
      queries: {
        '.message-list > *': [userMessage, assistantMessage],
        '.message-list [class*="message"]': [userMessage, assistantMessage],
        '.message-list [class*="bubble"]': [],
        '.mimo-chat [class*="message"]': [],
        '.mimo-chat [class*="bubble"]': [],
      },
    }) as unknown as ParentNode;

    expect(collectXiaomiAistudioStructuredMessages(root)).toEqual([
      { role: 'user', content: 'How does the MiMo Studio chat work?' },
      { role: 'assistant', content: 'MiMo Studio streams assistant text in small chunks.' },
    ]);
  });

  test('collects user and assistant turns from the current MiMo #message-list layout', () => {
    const userMessage = createNode({
      className:
        'relative inline-block whitespace-pre-wrap rounded-lg bg-mimo-bg-message px-3 py-2',
      textContent: 'AK probe xiaomi current chat 01:47',
    });
    const assistantMessage = createNode({
      className: 'markdown-prose select-text Markdown_markdown__a19823a0',
      textContent: 'Hi there! I can help with Xiaomi.',
    });
    const root = createNode({
      queries: {
        '#message-list .bg-mimo-bg-message, #message-list .markdown-prose, #message-list [class*="Markdown_markdown"]': [
          userMessage,
          assistantMessage,
        ],
      },
    }) as unknown as ParentNode;

    expect(collectXiaomiAistudioStructuredMessages(root)).toEqual([
      { role: 'user', content: 'AK probe xiaomi current chat 01:47' },
      { role: 'assistant', content: 'Hi there! I can help with Xiaomi.' },
    ]);
  });
});

type FakeNode = {
  className?: string;
  textContent?: string | null;
  getAttribute?: (name: string) => string | null;
  querySelector: (selector: string) => FakeNode | null;
  querySelectorAll: (selector: string) => FakeNode[];
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
