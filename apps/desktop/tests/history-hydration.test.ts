import { describe, expect, test } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  normalizeHydratedDomMessages,
  resolveSessionNavigationUrl,
  summarizeDeepSeekHydrationDiagnostics,
} from '../src/main/runtime/history-hydration';

describe('history-hydration', () => {
  test('normalizes every captured DOM message for history hydration', () => {
    expect(
      normalizeHydratedDomMessages(
        [
          { role: 'user', content: 'First prompt' },
          { role: 'assistant', content: 'First answer' },
          { role: 'assistant', content: '   ' },
          { role: 'user', content: 'Second prompt' },
          { role: 'assistant', content: 'Second answer' },
        ],
        {
          capturedAt: '2026-03-19T10:00:00.000Z',
          conversationId: 'conv-1',
        }
      )
    ).toEqual([
      {
        role: 'user',
        content: 'First prompt',
        createdAt: '2026-03-19T10:00:00.000Z',
        remoteConversationId: 'conv-1',
      },
      {
        role: 'assistant',
        content: 'First answer',
        createdAt: '2026-03-19T10:00:00.001Z',
        remoteConversationId: 'conv-1',
      },
      {
        role: 'user',
        content: 'Second prompt',
        createdAt: '2026-03-19T10:00:00.003Z',
        remoteConversationId: 'conv-1',
      },
      {
        role: 'assistant',
        content: 'Second answer',
        createdAt: '2026-03-19T10:00:00.004Z',
        remoteConversationId: 'conv-1',
      },
    ]);
  });

  test('prefers persisted pageUrl and falls back to provider conversation routes', () => {
    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'chatgpt',
          pageUrl: 'https://chatgpt.com/c/persisted-conv',
          remoteConversationId: 'ignored-conv',
        }),
        'https://chatgpt.com'
      )
    ).toBe('https://chatgpt.com/c/persisted-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'claude',
          pageUrl: 'not-a-url',
          remoteConversationId: 'claude-conv',
        }),
        'https://claude.ai'
      )
    ).toBe('https://claude.ai/chat/claude-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'deepseek',
          pageUrl: '',
          remoteConversationId: 'deepseek-conv',
        }),
        'https://chat.deepseek.com/'
      )
    ).toBe('https://chat.deepseek.com/a/chat/s/deepseek-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'grok',
          pageUrl: '',
          remoteConversationId: 'grok-conv',
        }),
        'https://grok.com/'
      )
    ).toBe('https://grok.com/c/grok-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'kimi',
          pageUrl: '',
          remoteConversationId: 'kimi-conv',
        }),
        'https://www.kimi.com/'
      )
    ).toBe('https://www.kimi.com/chat/kimi-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'qianwen',
          pageUrl: '',
          remoteConversationId: 'qianwen-conv',
        }),
        'https://www.qianwen.com/'
      )
    ).toBe('https://www.qianwen.com/chat/qianwen-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'doubao',
          pageUrl: '',
          remoteConversationId: 'doubao-conv',
        }),
        'https://www.doubao.com/chat'
      )
    ).toBe('https://www.doubao.com/chat/doubao-conv');

    expect(
      resolveSessionNavigationUrl(
        buildSession({
          provider: 'xiaomi-aistudio',
          pageUrl: '',
          remoteConversationId: 'xiaomi-conv',
        }),
        'https://aistudio.xiaomimimo.com/'
      )
    ).toBe('https://aistudio.xiaomimimo.com/#/chat/xiaomi-conv');
  });

  test('summarizes DeepSeek hydration diagnostics with trimmed DOM samples', () => {
    expect(
      JSON.parse(
        summarizeDeepSeekHydrationDiagnostics({
          historyFetch: {
            ok: true,
            status: 200,
            url: 'https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=deepseek-conv',
            preview: '  {"code":0,"msg":"","data":{"biz_data":{"chat_messages":[]}}}  ',
          },
          dom: {
            locationHref: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
            title: 'Probe Received Response',
            bodyTextSample: '  First line\n\nSecond line  ',
            mainHtmlSample: '<div class="wrapper">\n  <span>Message block</span>\n</div>',
            selectorCounts: {
              '.message-item': 0,
              '.assistant-message': 2,
              '.user-message': 1,
            },
            candidateNodes: [
              {
                selector: '[class*="message"]',
                tagName: 'DIV',
                className: 'message-shell',
                textSample: '  User prompt  ',
                htmlSample: '<div class="message-shell">User prompt</div>',
              },
            ],
          },
        })
      )
    ).toEqual({
      historyFetch: {
        ok: true,
        status: 200,
        url: 'https://chat.deepseek.com/api/v0/chat/history_messages?chat_session_id=deepseek-conv',
        preview: '{"code":0,"msg":"","data":{"biz_data":{"chat_messages":[]}}}',
      },
      dom: {
        locationHref: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
        title: 'Probe Received Response',
        bodyTextSample: 'First line Second line',
        mainHtmlSample: '<div class="wrapper"> <span>Message block</span> </div>',
        selectorCounts: {
          '.message-item': 0,
          '.assistant-message': 2,
          '.user-message': 1,
        },
        candidateNodes: [
          {
            selector: '[class*="message"]',
            tagName: 'DIV',
            className: 'message-shell',
            textSample: 'User prompt',
            htmlSample: '<div class="message-shell">User prompt</div>',
          },
        ],
      },
    });
  });
});

function buildSession(
  input: Pick<CaptureSessionRecord, 'provider' | 'pageUrl' | 'remoteConversationId'>
): CaptureSessionRecord {
  return {
    id: `${input.provider}-session`,
    provider: input.provider,
    remoteConversationId: input.remoteConversationId,
    sourceSessionKey: `${input.provider}-primary-view`,
    pageUrl: input.pageUrl,
    messageCount: 0,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
  };
}
