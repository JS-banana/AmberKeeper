import { describe, expect, test } from 'vitest';
import { grokAdapter } from '../src/adapter';
import { collectGrokStructuredMessages } from '../src/dom';

describe('grok-adapter', () => {
  test('normalizes Grok request, streaming response, and dom snapshots into provider signals', () => {
    const requestSignals = grokAdapter.interpretRequest({
      url: 'https://api.x.ai/v1/chat/completions',
      method: 'POST',
      body: JSON.stringify({
        conversation_id: 'grok-conv-1',
        model: 'grok-4',
        messages: [
          { role: 'system', content: 'You are Grok.' },
          { role: 'user', content: 'Hello Grok' },
        ],
      }),
      pageUrl: 'https://grok.com/chat/grok-conv-1',
      capturedAt: '2026-03-20T00:00:00.000Z',
      sourceSessionKey: 'grok-primary-view',
    });

    const response = grokAdapter.interpretResponseBody({
      url: 'https://api.x.ai/v1/chat/completions',
      method: 'POST',
      body: [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" Grok"}}]}',
        'data: [DONE]',
      ].join('\n'),
      pageUrl: 'https://grok.com/chat/grok-conv-1',
      capturedAt: '2026-03-20T00:00:01.000Z',
      sourceSessionKey: 'grok-primary-view',
    });

    const domResult = grokAdapter.interpretDomSnapshot({
      pageUrl: 'https://grok.com/chat/grok-conv-1',
      capturedAt: '2026-03-20T00:00:02.000Z',
      sourceSessionKey: 'grok-primary-view',
      conversationId: 'grok-conv-1',
      messages: [
        { role: 'user', content: 'Hello Grok' },
        { role: 'assistant', content: 'Hello Grok' },
      ],
      previousAssistantContent: 'Hello Grok',
    });

    expect(requestSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'candidateUserMessage',
          provider: 'grok',
          conversationId: 'grok-conv-1',
          content: 'Hello Grok',
        }),
        expect.objectContaining({
          kind: 'conversationIdResolved',
          provider: 'grok',
          conversationId: 'grok-conv-1',
        }),
      ])
    );
    expect(response.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'assistantMayBeReady',
          provider: 'grok',
          conversationId: 'grok-conv-1',
          content: 'Hello Grok',
        }),
      ])
    );
    expect(response.streamStatus).toBe('COMPLETE');
    expect(domResult.stable).toBe(true);
    expect(domResult.signals.some((signal) => signal.kind === 'conversationIdResolved')).toBe(true);
  });

  test('classifies Grok api.x.ai requests and resolves conversation ids from share urls', () => {
    expect(
      grokAdapter.classifyRequest({ url: 'https://api.x.ai/v1/chat/completions', method: 'POST' })
    ).toBe('capture');
    expect(
      grokAdapter.classifyRequest({
        url: 'https://api.x.ai/v1/chat/deferred-completion/request-1',
        method: 'GET',
      })
    ).toBe('capture');
    expect(grokAdapter.classifyRequest({ url: 'https://api.x.ai/v1/models', method: 'GET' })).toBe(
      'discover'
    );
    expect(
      grokAdapter.matchesView(
        'https://grok.com/share/c2hhcmQtNA%3D%3D_1c18f2ea-9da8-4c74-9f62-730fe04cd2f6'
      )
    ).toBe(true);
    expect(
      grokAdapter.extractConversationIdFromUrl(
        'https://grok.com/share/c2hhcmQtNA%3D%3D_1c18f2ea-9da8-4c74-9f62-730fe04cd2f6'
      )
    ).toBe('c2hhcmQtNA==_1c18f2ea-9da8-4c74-9f62-730fe04cd2f6');
  });

  test('collects Grok history DOM turns from message bubbles', () => {
    const userNode = createNode({
      className: 'chat-content-item chat-content-item-user',
      queries: {
        '.message-content': createNode({
          textContent: 'Hello from user',
        }),
      },
    });
    const assistantNode = createNode({
      className: 'chat-content-item chat-content-item-assistant',
      queries: {
        '.response-content-markdown': createNode({
          textContent: 'Hello from Grok',
        }),
      },
    });
    const root = createNode({
      queries: {
        '.chat-content-item': [userNode, assistantNode],
        '.message-bubble': [userNode, assistantNode],
        '[data-message-author-role]': [],
        '[data-testid="conversation-turn"]': [],
        '.conversation-container': [],
        '.conversation-turn': [],
        '.conversation-message': [],
        '.message-item': [],
        '.chat-message': [],
        '.user-message': [],
        '.assistant-message': [],
        '.grok-message': [],
        '[role="article"], main article': [],
      },
    }) as unknown as ParentNode;

    expect(collectGrokStructuredMessages(root)).toEqual([
      { role: 'user', content: 'Hello from user' },
      { role: 'assistant', content: 'Hello from Grok' },
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
