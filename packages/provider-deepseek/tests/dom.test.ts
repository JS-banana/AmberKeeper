import { describe, expect, test } from 'vitest';
import { collectDeepSeekStructuredMessages } from '../src/dom';

describe('deepseek-dom', () => {
  test('collects DeepSeek archived session messages from ds-message blocks', () => {
    const finalAssistantMarkdown = createNode({
      textContent: 'Received probe: DEEPSEEK-PROBE-20260320-5. All systems operational.',
    });
    const thinkMarkdown = createNode({
      textContent: 'We are given a probe string: "DEEPSEEK-PROBE-20260320-5".',
    });
    const thinkContent = createNode({
      queries: {
        '.ds-markdown': [thinkMarkdown],
      },
    });
    const userMessage = createNode({
      className: 'd29f3d7d ds-message _63c77b1',
      textContent: 'DEEPSEEK-PROBE-20260320-5',
      queries: {
        '.ds-markdown': [],
        '.ds-think-content': null,
        '.fbb737a4': createNode({
          textContent: 'DEEPSEEK-PROBE-20260320-5',
        }),
      },
    });
    const assistantMessage = createNode({
      className: 'ds-message _63c77b1',
      textContent:
        '已思考（用时 5 秒）We are given a probe string: "DEEPSEEK-PROBE-20260320-5".Received probe: DEEPSEEK-PROBE-20260320-5. All systems operational.',
      queries: {
        '.ds-markdown': [thinkMarkdown, finalAssistantMarkdown],
        '.ds-think-content': thinkContent,
      },
    });
    const root = createNode({
      queries: {
        '.message-item, .ds-message': [userMessage, assistantMessage],
      },
    }) as unknown as ParentNode;

    expect(collectDeepSeekStructuredMessages(root)).toEqual([
      {
        role: 'user',
        content: 'DEEPSEEK-PROBE-20260320-5',
      },
      {
        role: 'assistant',
        content: 'Received probe: DEEPSEEK-PROBE-20260320-5. All systems operational.',
      },
    ]);
  });
});

type FakeNode = {
  className?: string;
  textContent?: string | null;
  querySelector: (selector: string) => FakeNode | null;
  querySelectorAll: (selector: string) => FakeNode[];
};

function createNode(input: {
  className?: string;
  textContent?: string | null;
  queries?: Record<string, FakeNode | FakeNode[] | null>;
}): FakeNode {
  const queries = input.queries ?? {};

  return {
    className: input.className ?? '',
    textContent: input.textContent ?? null,
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
