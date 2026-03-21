import { describe, expect, test } from 'vitest';
import { chatgptAdapter } from '../src/adapter';
import requestFixture from './fixtures/chatgpt-turn-request.json';

describe('chatgpt-adapter', () => {
  test('turns request + dom signals into a stable completed turn', () => {
    const signals = chatgptAdapter.interpretRequest({
      url: 'https://chatgpt.com/backend-api/f/conversation',
      method: 'POST',
      body: JSON.stringify(requestFixture),
      pageUrl: 'https://chatgpt.com',
      capturedAt: '2026-03-19T12:30:00.000Z',
      sourceSessionKey: 'chatgpt-primary-view',
    });

    expect(signals.some((signal) => signal.kind === 'candidateUserMessage')).toBe(true);
  });
});
