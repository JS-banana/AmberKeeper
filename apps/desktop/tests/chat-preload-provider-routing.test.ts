// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from 'vitest';
import { createChatCaptureApi } from '../src/preload/provider-chat-capture';

describe('chat preload provider routing', () => {
  const capturedAt = '2026-03-20T00:00:00.000Z';

  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  test.each([
    {
      name: 'chatgpt',
      url: 'https://chatgpt.com/c/conv-1',
      title: 'ChatGPT',
      sourceSessionKey: 'chatgpt-primary-view',
      html: `
        <article data-message-author-role="user">Hello ChatGPT</article>
        <article data-message-author-role="assistant">Hello from ChatGPT</article>
      `,
      expectedMessage: 'Hello from ChatGPT',
    },
    {
      name: 'claude',
      url: 'https://claude.ai/chat/conv-1',
      title: 'Claude',
      sourceSessionKey: 'claude-primary-view',
      html: `
        <div data-testid="conversation-turn">
          <div class="human-message"><div class="prose">Hello Claude</div></div>
        </div>
        <div data-testid="conversation-turn">
          <div class="assistant-message"><div class="prose">Hello from Claude</div></div>
        </div>
      `,
      expectedMessage: 'Hello from Claude',
    },
    {
      name: 'deepseek',
      url: 'https://chat.deepseek.com/a/chat/s/conv-1',
      title: 'DeepSeek',
      sourceSessionKey: 'deepseek-primary-view',
      html: `
        <div class="message-item">
          <div class="user-message"><div class="message-content">Hello DeepSeek</div></div>
        </div>
        <div class="message-item">
          <div class="assistant-message"><div class="message-content">Hello from DeepSeek</div></div>
        </div>
      `,
      expectedMessage: 'Hello from DeepSeek',
    },
    {
      name: 'gemini',
      url: 'https://gemini.google.com/app/conv-1',
      title: 'Gemini',
      sourceSessionKey: 'gemini-primary-view',
      html: `
        <section class="conversation-container">
          <div class="query-content">Hello Gemini</div>
        </section>
        <section class="conversation-container">
          <div class="response-container"><div class="markdown">Hello from Gemini</div></div>
        </section>
      `,
      expectedMessage: 'Hello from Gemini',
    },
  ])('creates $name capture bridge from provider-specific DOM', (fixture) => {
    document.title = fixture.title;
    document.body.innerHTML = fixture.html;

    const capture = createChatCaptureApi({
      getUrl: () => fixture.url,
      getTitle: () => fixture.title,
      getCapturedAt: () => capturedAt,
      root: document,
    });

    const snapshotSignal = capture.snapshotSignal();
    const snapshotMessages = capture.snapshotMessages();
    expect('provider' in snapshotSignal).toBe(true);
    if (!('provider' in snapshotSignal)) {
      throw new Error('Expected a provider-specific DOM snapshot signal.');
    }

    expect(snapshotSignal.provider).toBe(fixture.name);
    expect(snapshotSignal.sourceSessionKey).toBe(fixture.sourceSessionKey);
    expect(snapshotMessages.messages.at(-1)?.content).toBe(fixture.expectedMessage);
    expect(snapshotSignal.messages.at(-1)?.content).toBe(fixture.expectedMessage);
  });

  test('returns an empty structured snapshot for unsupported hosts', () => {
    const capture = createChatCaptureApi({
      getUrl: () => 'https://example.com/chat',
      getTitle: () => 'Example',
      getCapturedAt: () => capturedAt,
      root: document,
    });

    expect(capture.snapshotMessages()).toEqual({
      url: 'https://example.com/chat',
      title: 'Example',
      messages: [],
    });
  });

  test('includes Claude selector diagnostics when no Claude messages are matched', () => {
    document.title = 'Claude Diagnostics';
    document.body.innerHTML = `
      <div data-testid="conversation-turn">
        <div class="unexpected-role">
          <span>CLAUDE-PROBE-20260320-1</span>
        </div>
      </div>
    `;

    const capture = createChatCaptureApi({
      getUrl: () => 'https://claude.ai/chat/conv-debug',
      getTitle: () => document.title,
      getCapturedAt: () => capturedAt,
      root: document,
    });

    const snapshot = capture.snapshotDom();
    const detail = JSON.parse(snapshot.detail) as {
      messages: unknown[];
      debug?: {
        selectorCounts?: Record<string, number>;
        textSamples?: string[];
      };
    };

    expect(snapshot.message).toBe('Collected 0 Claude DOM message block(s).');
    expect(detail.messages).toEqual([]);
    expect(detail.debug?.selectorCounts?.conversationTurn).toBe(1);
    expect(detail.debug?.textSamples?.some((text) => text.includes('CLAUDE-PROBE-20260320-1'))).toBe(
      true
    );
  });
});
