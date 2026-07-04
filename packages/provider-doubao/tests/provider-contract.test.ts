import { describe, expect, test } from 'vitest';
import { doubaoAdapter } from '../src/adapter';
import { collectDoubaoStructuredMessages } from '../src/dom';
import { classifyDoubaoRequest, extractDoubaoConversationIdFromUrl } from '../src/network';
import { parseDoubaoRequestBody, parseDoubaoResponseBody } from '../src/parser';

describe('doubao-provider', () => {
  test('classifies Doubao chat routes and resolves conversation ids from chat urls', () => {
    expect(classifyDoubaoRequest('https://www.doubao.com/chat/completion', 'POST')).toBe('capture');
    expect(classifyDoubaoRequest('https://www.doubao.com/samantha/chat/completion', 'POST')).toBe(
      'capture'
    );
    expect(classifyDoubaoRequest('https://www.doubao.com/chat/history', 'GET')).toBe('discover');
    expect(doubaoAdapter.matchesView('https://www.doubao.com/chat/')).toBe(true);
    expect(extractDoubaoConversationIdFromUrl('https://www.doubao.com/chat/conv-123?foo=bar')).toBe(
      'conv-123'
    );
    expect(extractDoubaoConversationIdFromUrl('https://www.doubao.com/chat/?from_login=1')).toBeNull();
    expect(
      extractDoubaoConversationIdFromUrl('https://www.doubao.com/samantha/skill/list?foo=bar')
    ).toBeNull();
    expect(
      extractDoubaoConversationIdFromUrl('https://www.doubao.com/samantha/fission/entrance?foo=bar')
    ).toBeNull();
  });

  test('parses the latest user request turn and conversation id from Doubao request bodies', () => {
    const messages = parseDoubaoRequestBody(
      JSON.stringify({
        conversation_id: 'doubao-conv-1',
        model: 'doubao',
        messages: [
          { role: 'system', content: 'You are Doubao.' },
          {
            role: 'user',
            content_block: [
              {
                content: {
                  text_block: {
                    text: 'Explain the repository structure.',
                  },
                },
              },
            ],
          },
        ],
      })
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          remoteConversationId: 'doubao-conv-1',
          content: 'Explain the repository structure.',
        }),
      ])
    );
  });

  test('parses Doubao streaming and history responses into assistant and turn signals', () => {
    const streamed = parseDoubaoResponseBody(
      [
        'data: {"event_type":2001,"event_data":"{\\"conversation_id\\":\\"doubao-conv-2\\",\\"message\\":{\\"id\\":\\"msg-2\\",\\"content\\":{\\"text\\":\\"Hello\\"}}}","model":"doubao"}',
        'data: {"event_type":2001,"event_data":"{\\"message\\":{\\"content\\":{\\"text\\":\\" from Doubao\\"}}}"}',
        'data: [DONE]',
      ].join('\n')
    );

    expect(streamed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          remoteConversationId: 'doubao-conv-2',
          content: 'Hello from Doubao',
          remoteMessageId: 'msg-2',
          model: 'doubao',
        }),
      ])
    );

    const historySignals = doubaoAdapter.interpretResponseBody({
      url: 'https://www.doubao.com/chat/completion',
      method: 'POST',
      body: JSON.stringify({
        id: 'doubao-conv-3',
        model: 'doubao',
        messages: [
          {
            role: 'user',
            content: 'What is the plan?',
            create_time: 1773940584,
          },
          {
            role: 'assistant',
            content: 'Use the package-local provider contract.',
            create_time: 1773940585,
            id: 'msg-3',
          },
        ],
      }),
      requestBody: JSON.stringify({ conversation_id: 'local_9139387259118100' }),
      pageUrl: 'https://www.doubao.com/chat/doubao-conv-3',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'doubao-primary-view',
    });

    expect(historySignals.streamStatus).toBe('COMPLETE');
    expect(historySignals.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          conversationId: 'doubao-conv-3',
          conversationAliases: ['local_9139387259118100'],
          content: 'What is the plan?',
        }),
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'doubao-conv-3',
          conversationAliases: ['local_9139387259118100'],
          content: 'Use the package-local provider contract.',
          remoteMessageId: 'msg-3',
        }),
      ])
    );

    expect(
      doubaoAdapter.extractHistoryCapture?.({
        url: 'https://www.doubao.com/chat/completion',
        method: 'POST',
        body: JSON.stringify({
          id: 'doubao-conv-3',
          model: 'doubao',
          messages: [
            {
              role: 'user',
              content: 'What is the plan?',
              create_time: 1773940584,
            },
            {
              role: 'assistant',
              content: 'Use the package-local provider contract.',
              create_time: 1773940585,
              id: 'msg-3',
            },
          ],
        }),
        requestBody: JSON.stringify({ conversation_id: 'local_9139387259118100' }),
        pageUrl: 'https://www.doubao.com/chat/doubao-conv-3',
        capturedAt: '2026-03-20T00:00:01.000Z',
        sourceSessionKey: 'doubao-primary-view',
      })
    ).toBeNull();

    const historyCapture = doubaoAdapter.extractHistoryCapture?.({
      url: 'https://www.doubao.com/chat/completion',
      method: 'GET',
      body: JSON.stringify({
        id: 'doubao-conv-3',
        model: 'doubao',
        messages: [
          {
            role: 'user',
            content: 'What is the plan?',
            create_time: 1773940584,
          },
          {
            role: 'assistant',
            content: 'Use the package-local provider contract.',
            create_time: 1773940585,
            id: 'msg-3',
          },
        ],
      }),
      requestBody: JSON.stringify({ conversation_id: 'local_9139387259118100' }),
      pageUrl: 'https://www.doubao.com/chat/doubao-conv-3',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'doubao-primary-view',
    });

    expect(historyCapture).toEqual({
      conversationId: 'doubao-conv-3',
      remoteConversationAliases: ['local_9139387259118100'],
      messages: [
        expect.objectContaining({
          role: 'user',
          content: 'What is the plan?',
          remoteConversationId: 'doubao-conv-3',
        }),
        expect.objectContaining({
          role: 'assistant',
          content: 'Use the package-local provider contract.',
          remoteConversationId: 'doubao-conv-3',
        }),
      ],
    });
  });

  test('repairs mojibake assistant text from Doubao streaming event_data messages', () => {
    const messages = parseDoubaoResponseBody(
      [
        `data: ${JSON.stringify({
          event_type: 2001,
          event_data: JSON.stringify({
            conversation_id: 'doubao-conv-mojibake',
            message: {
              id: 'msg-mojibake',
              content: {
                text: 'åœ¨å—ï¼Œæœ‰ä»€ä¹ˆäº‹å¯ä»¥ç›´æŽ¥è¯´ï½ž',
              },
            },
          }),
          model: 'doubao',
        })}`,
        'data: [DONE]',
      ].join('\n')
    );

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: '在吗，有什么事可以直接说～',
      }),
    ]);
  });

  test('repairs mixed Chinese prompt prefix followed by Doubao mojibake Markdown assistant text', () => {
    const messages = parseDoubaoResponseBody(
      [
        `data: ${JSON.stringify({
          event_type: 2001,
          event_data: JSON.stringify({
            conversation_id: 'doubao-conv-mixed-mojibake',
            message: {
              id: 'msg-mixed-mojibake',
              content: {
                text:
                  '小磨香油有哪些传统用途？#å°ç£¨é¦™æ²¹ä¼ ç»Ÿç”¨é€”å°ç£¨é¦™æ²¹ä½œä¸ºä¼ ç»Ÿè°ƒå‘³å“ï¼Œåœ¨ä¸­å¼çƒ¹é¥ªä¸­æœ‰å¤šç§ç”¨é€”ã€‚\\n\\n## å¸¸è§ç”¨é€”\\n\\n- å‡‰æ‹Œè”¬èœæ—¶æ·‹å…¥å¢žé¦™\\n- ç…²æ±¤æˆ–çƒ­èœå‡ºé”…å‰ç‚¹å‡ æ»´\\n- è°ƒé¥ºå­ã€é¦„é¥¨é¦…æ—¶æ��é¦™\\n\\nè¿™äº›ç”¨æ³•èƒ½ä¿ç•™é¦™æ²¹çš„é¦™æ°”ã€‚',
              },
            },
          }),
          model: 'doubao',
        })}`,
        'data: [DONE]',
      ].join('\n')
    );

    expect(messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('#小磨香油传统用途小磨香油'),
      }),
    ]);
    expect(messages[0]?.content).not.toContain('#å°ç£¨é¦™æ²¹');
  });

  test('strips Doubao prompt and thinking prefix from streamed assistant text', () => {
    const response = doubaoAdapter.interpretResponseBody({
      url: 'https://www.doubao.com/chat/completion',
      method: 'POST',
      requestBody: JSON.stringify({
        conversation_id: 'doubao-conv-thinking',
        prompt: '法国队在世界杯上的夺冠次数',
      }),
      pageUrl: 'https://www.doubao.com/chat/doubao-conv-thinking',
      capturedAt: '2026-07-04T13:43:37.464Z',
      sourceSessionKey: 'doubao-primary-view',
      body: [
        `data: ${JSON.stringify({
          event_type: 2001,
          event_data: JSON.stringify({
            conversation_id: 'doubao-conv-thinking',
            message: {
              content: {
                text:
                  '法国队在世界杯上的夺冠次数询问法国队世界杯夺冠次数，我需准确作答。，法国国家男子足球队**共2次夺得世界杯冠军**。',
              },
            },
          }),
        })}`,
        'data: [DONE]',
      ].join('\n'),
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          content: '法国国家男子足球队**共2次夺得世界杯冠军**。',
        }),
      ])
    );
  });

  test('uses the final Doubao page route and keeps local conversation id as an alias', () => {
    const response = doubaoAdapter.interpretResponseBody({
      url: 'https://www.doubao.com/chat/completion',
      method: 'POST',
      requestBody: JSON.stringify({ conversation_id: 'local_5338199761265197' }),
      pageUrl: 'https://www.doubao.com/chat/38433806243934978',
      capturedAt: '2026-07-03T13:10:12.921Z',
      sourceSessionKey: 'doubao-primary-view',
      body: [
        `data: ${JSON.stringify({
          event_type: 2001,
          event_data: JSON.stringify({
            conversation_id: 'local_5338199761265197',
            message: {
              id: 'msg-local-first-answer',
              content: {
                text: '南京适合什么季节去玩南京四季游玩推荐',
              },
            },
          }),
          model: 'doubao',
        })}`,
        'data: [DONE]',
      ].join('\n'),
    });

    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: '38433806243934978',
          conversationAliases: ['local_5338199761265197'],
        }),
      ])
    );
  });

  test('collects Doubao DOM message turns and preserves latest assistant stability', () => {
    const root = createNode({
      queries: {
        '[data-message-author-role]': [
          createNode({
            attributes: { 'data-message-author-role': 'user' },
            textContent: 'Hello Doubao',
          }),
          createNode({
            attributes: { 'data-message-author-role': 'assistant' },
            textContent: 'Hello from Doubao',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectDoubaoStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Hello Doubao' },
      { role: 'assistant', content: 'Hello from Doubao' },
    ]);

    const domResult = doubaoAdapter.interpretDomSnapshot({
      pageUrl: 'https://www.doubao.com/chat/doubao-conv-4',
      capturedAt: '2026-03-20T00:00:02.000Z',
      sourceSessionKey: 'doubao-primary-view',
      conversationId: 'doubao-conv-4',
      messages: [
        { role: 'user', content: 'Hello Doubao' },
        { role: 'assistant', content: 'Hello from Doubao' },
      ],
      previousAssistantContent: 'Hello from Doubao',
    });

    expect(domResult.stable).toBe(true);
    expect(domResult.latestAssistantContent).toBe('Hello from Doubao');
    expect(domResult.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'conversationIdResolved',
          conversationId: 'doubao-conv-4',
        }),
      ])
    );
  });

  test('collects Doubao history DOM turns from send/receive message test ids', () => {
    const assistantNode = createNode({
      attributes: { 'data-testid': 'receive_message' },
      queries: {
        '[data-testid="message_text_content"]': [
          createNode({
            attributes: { 'data-testid': 'message_text_content' },
            textContent: 'Use the package-local provider contract.',
          }),
        ],
      },
    });
    const userNode = createNode({
      attributes: { 'data-testid': 'send_message' },
      queries: {
        '[data-testid="message_text_content"]': [
          createNode({
            attributes: { 'data-testid': 'message_text_content' },
            textContent: 'What is the plan?',
          }),
        ],
      },
    });
    const root = createNode({
      queries: {
        '[data-testid="union_message"]': [userNode, assistantNode],
        '[data-testid="send_message"]': [userNode],
        '[data-testid="receive_message"]': [assistantNode],
      },
    }) as unknown as ParentNode;

    expect(collectDoubaoStructuredMessages(root)).toEqual([
      { role: 'user', content: 'What is the plan?' },
      { role: 'assistant', content: 'Use the package-local provider contract.' },
    ]);
  });

  test('collects Doubao DOM turns from current production bubble/container classes', () => {
    const root = createNode({
      queries: {
        '.bg-g-send-msg-bubble-bg': [
          createNode({
            className:
              'whitespace-pre-wrap wrap-anywhere rounded-s-radius-s bg-g-send-msg-bubble-bg',
            textContent: '[amberkeeper-live-probe doubao] reply with OK only',
          }),
        ],
        '.container-P2rR72': [
          createNode({
            className: 'container-P2rR72 flow-markdown-body theme-samantha-uDexJL',
            textContent: 'OK',
          }),
        ],
        '.paragraph-pP9ZLC': [
          createNode({
            className: 'paragraph-pP9ZLC paragraph-element',
            textContent: 'OK',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectDoubaoStructuredMessages(root)).toEqual([
      { role: 'user', content: '[amberkeeper-live-probe doubao] reply with OK only' },
      { role: 'assistant', content: 'OK' },
    ]);
  });

  test('collects Doubao assistant markdown when primary selectors only find the user bubble', () => {
    const root = createNode({
      queries: {
        '.bg-g-send-msg-bubble-bg': [
          createNode({
            className: 'bg-g-send-msg-bubble-bg',
            textContent: '你觉得目前的世界杯哪队赢面大',
          }),
        ],
        '.flow-markdown-body': [
          createNode({
            className: 'flow-markdown-body theme-samantha-uDexJL',
            textContent: '西班牙和法国是目前公认赢面最大的两支球队。',
          }),
        ],
      },
    }) as unknown as ParentNode;

    expect(collectDoubaoStructuredMessages(root)).toEqual([
      { role: 'user', content: '你觉得目前的世界杯哪队赢面大' },
      { role: 'assistant', content: '西班牙和法国是目前公认赢面最大的两支球队。' },
    ]);
  });
});

type FakeNode = {
  className?: string;
  textContent?: string | null;
  innerText?: string;
  attributes?: Record<string, string>;
  querySelector: (selector: string) => FakeNode | null;
  querySelectorAll: (selector: string) => FakeNode[];
  getAttribute: (name: string) => string | null;
};

function createNode(input: {
  className?: string;
  textContent?: string | null;
  innerText?: string;
  attributes?: Record<string, string>;
  queries?: Record<string, FakeNode | FakeNode[] | null>;
}): FakeNode {
  const queries = input.queries ?? {};

  return {
    className: input.className ?? '',
    textContent: input.textContent ?? null,
    innerText: input.innerText,
    attributes: input.attributes ?? {},
    querySelector(selector: string) {
      const result = queries[selector] ?? null;
      return Array.isArray(result) ? (result[0] ?? null) : result;
    },
    querySelectorAll(selector: string) {
      const result = queries[selector] ?? null;
      return Array.isArray(result) ? result : result ? [result] : [];
    },
    getAttribute(name: string) {
      return this.attributes?.[name] ?? null;
    },
  };
}
