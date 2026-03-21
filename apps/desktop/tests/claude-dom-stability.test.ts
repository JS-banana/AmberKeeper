// @ts-expect-error apps/desktop test harness intentionally uses jsdom without local type declarations.
import { JSDOM } from 'jsdom';
import { describe, expect, test } from 'vitest';
import { collectClaudeStructuredMessages } from '@anychat/provider-claude';

describe('collectClaudeStructuredMessages', () => {
  test('prefers visible innerText over textContent noise inside Claude prose blocks', () => {
    const dom = new JSDOM(`
      <div data-testid="conversation-turn">
        <div class="human-message">
          <div class="prose">Hello Claude</div>
        </div>
      </div>
      <div data-testid="conversation-turn">
        <div class="assistant-message">
          <div class="prose">
            Visible Claude answer
            <button class="sr-only">Copy response</button>
          </div>
        </div>
      </div>
    `);

    const proseNodes = dom.window.document.querySelectorAll('.prose');
    const userProse = proseNodes[0] as HTMLElement;
    const assistantProse = proseNodes[1] as HTMLElement;

    Object.defineProperty(userProse, 'innerText', {
      configurable: true,
      value: 'Hello Claude',
    });
    Object.defineProperty(assistantProse, 'innerText', {
      configurable: true,
      value: 'Visible Claude answer',
    });

    const messages = collectClaudeStructuredMessages(dom.window.document);

    expect(messages).toEqual([
      { role: 'user', content: 'Hello Claude' },
      { role: 'assistant', content: 'Visible Claude answer' },
    ]);
  });

  test('collects messages from the current Claude chat DOM structure', () => {
    const dom = new JSDOM(`
      <section>
        <div class="flex flex-col items-end gap-1">
          <div class="group relative inline-flex gap-2">
            <div class="flex-1">
              <div data-testid="user-message" class="font-large !font-user-message grid grid-cols-1 gap-2 py-0.5 relative">
                <p class="whitespace-pre-wrap break-words">Fresh Claude probe</p>
              </div>
            </div>
          </div>
        </div>
        <div class="contents">
          <div data-is-streaming="false" class="group relative relative pb-3">
            <div class="font-claude-response relative leading-[1.65rem]">
              <div>
                <div class="standard-markdown grid-cols-1 grid [&_>*]:min-w-0 gap-3 standard-markdown">
                  <p class="font-claude-response-body break-words whitespace-normal leading-[1.7]">
                    ACK-Fresh-Claude-probe
                  </p>
                </div>
              </div>
            </div>
            <div role="group" aria-label="Message actions">
              <button>Copy response</button>
            </div>
          </div>
        </div>
      </section>
    `);

    const userNode = dom.window.document.querySelector('[data-testid="user-message"]') as HTMLElement;
    const assistantNode = dom.window.document.querySelector('.font-claude-response') as HTMLElement;

    Object.defineProperty(userNode, 'innerText', {
      configurable: true,
      value: 'Fresh Claude probe',
    });
    Object.defineProperty(assistantNode, 'innerText', {
      configurable: true,
      value: 'ACK-Fresh-Claude-probe',
    });

    const messages = collectClaudeStructuredMessages(dom.window.document);

    expect(messages).toEqual([
      { role: 'user', content: 'Fresh Claude probe' },
      { role: 'assistant', content: 'ACK-Fresh-Claude-probe' },
    ]);
  });
});
