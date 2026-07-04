import { describe, expect, test } from 'vitest';
import { reduceTurn, toCompletedTurn } from '../src/turn-state';

describe('turn-state', () => {
  test('does not become ready_to_persist until conversation id and stable assistant exist', () => {
    let state = reduceTurn(undefined, {
      provider: 'chatgpt',
      kind: 'candidateUserMessage',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com',
      capturedAt: '2026-03-19T12:00:00.000Z',
      createdAt: '2026-03-19T12:00:00.000Z',
      conversationId: null,
      content: 'hello',
    });

    state = reduceTurn(state, {
      provider: 'chatgpt',
      kind: 'assistantMayBeReady',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-1',
      capturedAt: '2026-03-19T12:00:01.000Z',
      createdAt: '2026-03-19T12:00:01.000Z',
      conversationId: 'conv-1',
      content: 'partial',
      stable: false,
    });

    expect(state.status).not.toBe('ready_to_persist');
  });

  test('uses the candidate capture time for placeholder user timestamps', () => {
    let state = reduceTurn(undefined, {
      provider: 'doubao',
      kind: 'candidateUserMessage',
      source: 'cdp-network',
      sourceSessionKey: 'doubao-primary-view',
      pageUrl: 'https://www.doubao.com/chat/conv-1',
      capturedAt: '2026-07-03T13:33:34.350Z',
      createdAt: '1970-01-01T00:00:00.000Z',
      conversationId: 'conv-1',
      content: '建议去哪玩呢',
    });

    state = reduceTurn(state, {
      provider: 'doubao',
      kind: 'assistantMayBeReady',
      source: 'cdp-network',
      sourceSessionKey: 'doubao-primary-view',
      pageUrl: 'https://www.doubao.com/chat/conv-1',
      capturedAt: '2026-07-03T13:33:59.019Z',
      createdAt: '1970-01-01T00:00:00.000Z',
      conversationId: 'conv-1',
      content: '南昌分类型景点推荐',
      stable: true,
    });

    expect(toCompletedTurn(state)?.messages[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: '建议去哪玩呢',
        createdAt: '2026-07-03T13:33:34.350Z',
      })
    );
  });
});
