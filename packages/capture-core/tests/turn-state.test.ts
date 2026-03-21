import { describe, expect, test } from 'vitest';
import { reduceTurn } from '../src/turn-state';

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
});
