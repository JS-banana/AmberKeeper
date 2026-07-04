import { describe, expect, test } from 'vitest';
import { collectQianwenStructuredMessages, normalizeQianwenDomSnapshotMessages } from '../src/dom';

const MESSAGE_BLOCK_SELECTOR =
  '.message-item, .chat-message, .qwen-message, .conversation-turn, [class*="questionItem"], [class*="answerItem"], [class*="question"], [class*="query"], [class*="answer"], [class*="assistant"], [class*="markdown"], [data-chat-list-key], [data-msgid], [data-role]';

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
        [MESSAGE_BLOCK_SELECTOR]: [userMessage, assistantMessage, latestUser, latestAssistant],
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
        [MESSAGE_BLOCK_SELECTOR]: [questionNode, answerNode],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Who wrote this?' },
      { role: 'assistant', content: 'It was written by Qianwen.' },
    ]);
  });

  test('splits qianwen wrapper nodes that contain both prompt and answer children', () => {
    const userNode = createNode({
      className: 'user-message',
      textContent: 'Latest qianwen prompt',
      queries: {
        '.message-content, .content, .markdown, .qwen-markdown': createNode({
          textContent: 'Latest qianwen prompt',
        }),
      },
    });
    const assistantNode = createNode({
      className: 'assistant-message',
      textContent: 'Latest qianwen answer',
      queries: {
        '.message-content, .content, .markdown, .qwen-markdown': createNode({
          textContent: 'Latest qianwen answer',
        }),
      },
    });
    const wrapper = createNode({
      className: 'questionItem-u8_ahH',
      textContent: 'Latest qianwen prompt Latest qianwen answer',
      queries: {
        '.user-message, .assistant-message, [data-role="user"], [data-role="assistant"], [data-message-role="user"], [data-message-role="assistant"]':
          [userNode, assistantNode],
      },
    });
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [wrapper],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Latest qianwen prompt' },
      { role: 'assistant', content: 'Latest qianwen answer' },
    ]);
  });

  test('collects qianwen prompt and assistant nodes from generic query/assistant classes', () => {
    const promptNode = createNode({
      className: 'query-text-block',
      textContent: '南京适合什么季节去玩',
    });
    const assistantNode = createNode({
      className: 'assistant-markdown response-content',
      textContent: '南京春秋季节最适合旅游。',
    });
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [promptNode, assistantNode],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '南京适合什么季节去玩' },
      { role: 'assistant', content: '南京春秋季节最适合旅游。' },
    ]);
  });

  test('preserves repeated qianwen prompt text across separate turns', () => {
    const firstPrompt = createNode({
      className: 'query-text-block',
      textContent: '继续',
    });
    const firstAssistant = createNode({
      className: 'assistant-markdown response-content',
      textContent: '第一段回答',
    });
    const secondPrompt = createNode({
      className: 'query-text-block',
      textContent: '继续',
    });
    const secondAssistant = createNode({
      className: 'assistant-markdown response-content',
      textContent: '第二段回答',
    });
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [firstPrompt, firstAssistant, secondPrompt, secondAssistant],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '第一段回答' },
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '第二段回答' },
    ]);
  });

  test('ignores qianwen thinking blocks and keeps the final assistant answer once', () => {
    const promptNode = createNode({
      className: 'query-text-block',
      textContent: '介绍一下合肥',
    });
    const thinkingNode = createNode({
      className: 'qwen-markdown thinking-content',
      textContent: '思考过程\n先分析用户想了解城市介绍。',
    });
    const finalNode = createNode({
      className: 'qwen-markdown response-content',
      textContent: '合肥是安徽省省会。',
    });
    const assistantNode = createNode({
      className: 'assistant-message',
      textContent: '思考过程\n先分析用户想了解城市介绍。\n合肥是安徽省省会。',
      queries: {
        '.message-content, .content, .markdown, .qwen-markdown': [thinkingNode, finalNode],
      },
    });
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [promptNode, assistantNode, thinkingNode, finalNode],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '介绍一下合肥' },
      { role: 'assistant', content: '合肥是安徽省省会。' },
    ]);
  });

  test('ignores qianwen hidden reasoning text that is exposed as a markdown node', () => {
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [
          createNode({
            className: 'query-text-block',
            textContent: '你知道 hono 吗，不推荐吗',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent:
              '用户问我是否知道 Hono，以及是否推荐它。\n我需要：\n澄清 Hono 的适用场景。',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: 'Hono 值得推荐，尤其适合轻量 API、BFF 和 Edge 场景。',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '你知道 hono 吗，不推荐吗' },
      { role: 'assistant', content: 'Hono 值得推荐，尤其适合轻量 API、BFF 和 Edge 场景。' },
    ]);
  });

  test('drops qianwen hidden reasoning when the final answer is not present yet', () => {
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [
          createNode({
            className: 'query-text-block',
            textContent: '你知道 hono 吗，不推荐吗',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent:
              '用户问我是否知道 Hono，以及是否推荐它。\n我需要：\n澄清 Hono 的适用场景。',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '你知道 hono 吗，不推荐吗' },
    ]);
  });

  test('collapses qianwen assistant candidates to the final answer for each user turn', () => {
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [
          createNode({
            className: 'query-text-block',
            textContent: '你觉得目前的世界杯哪队赢面大',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '深度思考已完成\n参考8篇相关网页\n搜索中间稿',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '参考8篇相关网页\n好的，根据搜索结果，中间稿',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '根据各大权威数据机构，西班牙和法国是目前公认赢面最大的两支球队。',
          }),
          createNode({
            className: 'query-text-block',
            textContent: '是看队员身价判断的吗',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '深度思考已完成\n队员身价是评估球队实力的重要参考。',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '队员身价是评估球队实力的重要参考，但不是唯一标准。',
          }),
          createNode({
            className: 'qwen-markdown response-content',
            textContent: '不完全是。\n队员身价确实是评估球队实力的一个重要基础指标。',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '你觉得目前的世界杯哪队赢面大' },
      {
        role: 'assistant',
        content: '根据各大权威数据机构，西班牙和法国是目前公认赢面最大的两支球队。',
      },
      { role: 'user', content: '是看队员身价判断的吗' },
      {
        role: 'assistant',
        content: '不完全是。\n队员身价确实是评估球队实力的一个重要基础指标。',
      },
    ]);
  });

  test('ignores qianwen navigation labels and deduplicates nested message nodes', () => {
    const recentNode = createNode({
      className: 'assistant-sidebar-label',
      textContent: '最近对话',
    });
    const promptNode = createNode({
      className: 'query-text-block',
      textContent: '南昌适合什么季节去玩',
    });
    const promptChild = createNode({
      className: 'questionItem-u8_ahH',
      textContent: '南昌适合什么季节去玩',
    });
    const assistantNode = createNode({
      className: 'assistant-markdown response-content',
      textContent: '南昌春秋季节最适合旅游。',
    });
    const root = createNode({
      queries: {
        [MESSAGE_BLOCK_SELECTOR]: [recentNode, promptNode, promptChild, assistantNode],
      },
    }) as unknown as ParentNode;

    expect(collectQianwenStructuredMessages(root)).toEqual([
      { role: 'user', content: '南昌适合什么季节去玩' },
      { role: 'assistant', content: '南昌春秋季节最适合旅游。' },
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
