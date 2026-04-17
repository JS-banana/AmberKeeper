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
          content: 'What is the plan?',
        }),
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          conversationId: 'doubao-conv-3',
          content: 'Use the package-local provider contract.',
          remoteMessageId: 'msg-3',
        }),
      ])
    );

    const historyCapture = doubaoAdapter.extractHistoryCapture?.({
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
      pageUrl: 'https://www.doubao.com/chat/doubao-conv-3',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'doubao-primary-view',
    });

    expect(historyCapture).toEqual({
      conversationId: 'doubao-conv-3',
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
