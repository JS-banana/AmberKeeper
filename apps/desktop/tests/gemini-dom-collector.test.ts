// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, test } from 'vitest';
import { collectGeminiStructuredMessages } from '@amberkeeper/provider-gemini';

describe('gemini-dom-collector', () => {
  test('prefers focused message content over container control text for history titles', () => {
    document.body.innerHTML = `
      <div class="conversation-container">
        <div class="query-content">
          <button type="button">Edit</button>
          <div class="query-text">Actual Gemini prompt</div>
        </div>
      </div>
      <div class="conversation-container">
        <div class="response-container">
          <button type="button">Copy</button>
          <div class="markdown">Actual Gemini answer</div>
        </div>
      </div>
    `;

    expect(collectGeminiStructuredMessages(document)).toEqual([
      {
        role: 'user',
        content: 'Actual Gemini prompt',
      },
      {
        role: 'assistant',
        content: 'Actual Gemini answer',
      },
    ]);
  });

  test('strips repeated Gemini user chrome prefixes like You said from prompt titles', () => {
    document.body.innerHTML = `
      <div class="conversation-container">
        <div class="query-content">
          <div class="query-text">You said You said 我问你，现在主流模型中，哪个擅长写作</div>
        </div>
      </div>
    `;

    expect(collectGeminiStructuredMessages(document)).toEqual([
      {
        role: 'user',
        content: '我问你，现在主流模型中，哪个擅长写作',
      },
    ]);
  });
});
