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
        '.message-item, .ds-message, .fbb737a4': [userMessage, assistantMessage],
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

  test('collects DeepSeek user bubbles that are exposed as standalone fbb737a4 nodes', () => {
    const userMessage = createNode({
      className: 'fbb737a4',
      textContent: '南京适合什么季节去玩',
    });
    const assistantMessage = createNode({
      className: 'ds-message',
      textContent: '南京春秋季节最适合旅游。',
      queries: {
        '.ds-markdown': [
          createNode({
            textContent: '南京春秋季节最适合旅游。',
          }),
        ],
      },
    });
    const root = createNode({
      queries: {
        '.message-item, .ds-message, .fbb737a4': [userMessage, assistantMessage],
      },
    }) as unknown as ParentNode;

    expect(collectDeepSeekStructuredMessages(root)).toEqual([
      { role: 'user', content: '南京适合什么季节去玩' },
      { role: 'assistant', content: '南京春秋季节最适合旅游。' },
    ]);
  });

  test('preserves repeated DeepSeek user text across separate turns', () => {
    const firstUser = createNode({
      className: 'fbb737a4',
      textContent: '继续',
    });
    const firstAssistant = createNode({
      className: 'ds-message',
      queries: {
        '.ds-markdown': [
          createNode({
            textContent: '第一段回答',
          }),
        ],
      },
    });
    const secondUser = createNode({
      className: 'fbb737a4',
      textContent: '继续',
    });
    const secondAssistant = createNode({
      className: 'ds-message',
      queries: {
        '.ds-markdown': [
          createNode({
            textContent: '第二段回答',
          }),
        ],
      },
    });
    const root = createNode({
      queries: {
        '.message-item, .ds-message, .fbb737a4': [
          firstUser,
          firstAssistant,
          secondUser,
          secondAssistant,
        ],
      },
    }) as unknown as ParentNode;

    expect(collectDeepSeekStructuredMessages(root)).toEqual([
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '第一段回答' },
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '第二段回答' },
    ]);
  });

  test('deduplicates DeepSeek user bubbles selected both as parent and child nodes', () => {
    const userBubble = createNode({
      className: 'fbb737a4',
      textContent: '建议去哪玩呢',
    });
    const userMessage = createNode({
      className: 'ds-message',
      textContent: '建议去哪玩呢',
      queries: {
        '.ds-markdown': [],
        '.fbb737a4': userBubble,
      },
    });
    const root = createNode({
      queries: {
        '.message-item, .ds-message, .fbb737a4': [userMessage, userBubble],
      },
    }) as unknown as ParentNode;

    expect(collectDeepSeekStructuredMessages(root)).toEqual([
      { role: 'user', content: '建议去哪玩呢' },
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
