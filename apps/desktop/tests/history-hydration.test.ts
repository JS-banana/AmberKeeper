import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import {
  normalizeHydratedDomMessages,
  resolveSessionNavigationUrl,
  summarizeDeepSeekHydrationDiagnostics,
} from '../src/main/runtime/history-hydration';
import { createHistoryCapturePersistenceService } from '../src/main/capture/history-capture-persistence-service';
import { CaptureStore } from '../src/main/storage/capture-store';

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

describe('history capture persistence', () => {
  test('skips user-only DOM snapshots when the cached session has assistant messages', () => {
    for (const trigger of ['history-auto-cache', 'history-hydration'] as const) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-history-hydration-'));
      const dbPath = path.join(tempDir, 'capture.db');

      try {
        const store = new CaptureStore(dbPath);
        const existingSessionId = store.persistEnvelope({
          provider: 'doubao',
          source: 'cdp-network',
          sourceSessionKey: 'doubao-primary-view',
          pageUrl: 'https://www.doubao.com/chat/38433782403373826',
          remoteConversationId: '38433782403373826',
          capturedAt: '2026-03-19T10:00:01.000Z',
          messages: [
            {
              role: 'user',
              content: '在吗',
              createdAt: '2026-03-19T10:00:00.000Z',
            },
            {
              role: 'assistant',
              content: '我在',
              createdAt: '2026-03-19T10:00:01.000Z',
            },
          ],
        });
        const setLastCaptureAt = vi.fn();
        const recordAttempt = vi.fn();
        const service = createHistoryCapturePersistenceService({
          getCaptureStore: () => store,
          setLastCaptureAt,
          recordAttempt,
        });

        const result = service.persistAutoCachedEnvelope(
          {
            provider: 'doubao',
            source: 'preload-dom',
            sourceSessionKey: 'doubao-primary-view',
            pageUrl: 'https://www.doubao.com/chat/38433782403373826',
            remoteConversationId: '38433782403373826',
            capturedAt: '2026-03-19T10:05:00.000Z',
            messages: [
              {
                role: 'user',
                content: '在吗',
                createdAt: '2026-03-19T10:05:00.000Z',
              },
            ],
          },
          {
            trigger,
            triggerUrl: 'https://www.doubao.com/chat/38433782403373826',
          }
        );

        expect(result).toBeNull();
        expect(store.listMessages(existingSessionId).map((message) => message.content)).toEqual([
          '在吗',
          '我在',
        ]);
        expect(setLastCaptureAt).not.toHaveBeenCalled();
        expect(recordAttempt).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'preload-dom',
            stage: trigger,
            status: 'info',
            message: expect.stringContaining('Skipped user-only DOM snapshot'),
          })
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  test('skips user-only DOM snapshots when the cached session only has request-side user messages', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-history-hydration-'));
    const dbPath = path.join(tempDir, 'capture.db');

    try {
      const store = new CaptureStore(dbPath);
      const existingSessionId = store.persistEnvelope({
        provider: 'doubao',
        source: 'cdp-network',
        sourceSessionKey: 'doubao-primary-view',
        pageUrl: 'https://www.doubao.com/chat/38433782403373826',
        remoteConversationId: '38433782403373826',
        capturedAt: '2026-03-19T10:00:00.000Z',
        messages: [
          {
            role: 'user',
            content: '你觉得目前的世界杯哪队赢面大',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
      });
      const setLastCaptureAt = vi.fn();
      const recordAttempt = vi.fn();
      const service = createHistoryCapturePersistenceService({
        getCaptureStore: () => store,
        setLastCaptureAt,
        recordAttempt,
      });

      const result = service.persistAutoCachedEnvelope(
        {
          provider: 'doubao',
          source: 'preload-dom',
          sourceSessionKey: 'doubao-primary-view',
          pageUrl: 'https://www.doubao.com/chat/38433782403373826',
          remoteConversationId: '38433782403373826',
          capturedAt: '2026-03-19T10:00:02.000Z',
          messages: [
            {
              role: 'user',
              content: '你觉得目前的世界杯哪队赢面大',
              createdAt: '2026-03-19T10:00:02.000Z',
            },
          ],
        },
        {
          trigger: 'history-auto-cache',
          triggerUrl: 'https://www.doubao.com/chat/38433782403373826',
        }
      );

      expect(result).toBeNull();
      expect(store.listMessages(existingSessionId)).toEqual([
        expect.objectContaining({
          role: 'user',
          source: 'cdp-network',
          createdAt: '2026-03-19T10:00:00.000Z',
        }),
      ]);
      expect(setLastCaptureAt).not.toHaveBeenCalled();
      expect(recordAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'preload-dom',
          stage: 'history-auto-cache',
          status: 'info',
          message: expect.stringContaining('Skipped user-only DOM snapshot'),
        })
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('merges incomplete DOM history snapshots instead of replacing earlier user turns', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-history-hydration-'));
    const dbPath = path.join(tempDir, 'capture.db');

    try {
      const store = new CaptureStore(dbPath);
      const existingSessionId = store.persistEnvelope({
        provider: 'deepseek',
        source: 'preload-dom',
        sourceSessionKey: 'deepseek-primary-view',
        pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
        remoteConversationId: 'deepseek-conv',
        capturedAt: '2026-07-03T13:34:42.129Z',
        messages: [
          {
            role: 'user',
            content: '南昌适合什么季节去玩',
            createdAt: '2026-07-03T13:34:42.129Z',
          },
          {
            role: 'assistant',
            content: '南昌春秋两季最适合旅游。',
            createdAt: '2026-07-03T13:34:42.130Z',
          },
          {
            role: 'user',
            content: '建议去哪玩呢',
            createdAt: '2026-07-03T13:34:43.005Z',
          },
        ],
      });
      const service = createHistoryCapturePersistenceService({
        getCaptureStore: () => store,
        setLastCaptureAt: vi.fn(),
        recordAttempt: vi.fn(),
      });

      service.persistAutoCachedEnvelope(
        {
          provider: 'deepseek',
          source: 'preload-dom',
          sourceSessionKey: 'deepseek-primary-view',
          pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
          remoteConversationId: 'deepseek-conv',
          capturedAt: '2026-07-03T13:36:57.873Z',
          messages: [
            {
              role: 'assistant',
              content: '南昌春秋两季最适合旅游。',
              createdAt: '2026-07-03T13:36:57.873Z',
            },
            {
              role: 'user',
              content: '建议去哪玩呢',
              createdAt: '2026-07-03T13:36:57.874Z',
            },
            {
              role: 'assistant',
              content: '南昌可以去滕王阁和万寿宫。',
              createdAt: '2026-07-03T13:36:57.875Z',
            },
          ],
        },
        {
          trigger: 'history-hydration',
          triggerUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
        }
      );

      expect(store.listMessages(existingSessionId).map((message) => message.content)).toEqual([
        '南昌适合什么季节去玩',
        '南昌春秋两季最适合旅游。',
        '建议去哪玩呢',
        '南昌可以去滕王阁和万寿宫。',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('aligns auto-cache DOM snapshots to the latest cached user before merging', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-history-hydration-'));
    const dbPath = path.join(tempDir, 'capture.db');

    try {
      const store = new CaptureStore(dbPath);
      const existingSessionId = store.persistEnvelope({
        provider: 'qianwen',
        source: 'cdp-network',
        sourceSessionKey: 'qianwen-primary-view',
        pageUrl: 'https://www.qianwen.com/chat/qw-conv',
        remoteConversationId: 'qw-conv',
        capturedAt: '2026-07-04T14:04:25.497Z',
        messages: [
          {
            role: 'user',
            content: '第一问',
            createdAt: '2026-07-04T13:59:41.197Z',
          },
          {
            role: 'assistant',
            content: '第一答',
            createdAt: '2026-07-04T14:01:06.724Z',
          },
          {
            role: 'user',
            content: '你知道 hono 吗，不推荐吗',
            createdAt: '2026-07-04T14:04:25.497Z',
          },
        ],
      });
      const service = createHistoryCapturePersistenceService({
        getCaptureStore: () => store,
        setLastCaptureAt: vi.fn(),
        recordAttempt: vi.fn(),
      });

      service.persistAutoCachedEnvelope(
        {
          provider: 'qianwen',
          source: 'preload-dom',
          sourceSessionKey: 'qianwen-primary-view',
          pageUrl: 'https://www.qianwen.com/chat/qw-conv',
          remoteConversationId: 'qw-conv',
          capturedAt: '2026-07-04T14:05:37.380Z',
          messages: [
            {
              role: 'assistant',
              content: '第一答重新渲染变体',
              createdAt: '2026-07-04T14:05:37.380Z',
            },
            {
              role: 'user',
              content: '你知道\u00A0hono\u00A0吗，不推荐吗',
              createdAt: '2026-07-04T14:05:37.381Z',
            },
            {
              role: 'assistant',
              content: 'Hono 值得推荐，尤其适合轻量 API、BFF 和 Edge 场景。',
              createdAt: '2026-07-04T14:05:37.382Z',
            },
          ],
        },
        {
          trigger: 'history-auto-cache',
          triggerUrl: 'https://www.qianwen.com/chat/qw-conv',
        }
      );

      expect(store.listMessages(existingSessionId).map((message) => message.content)).toEqual([
        '第一问',
        '第一答',
        '你知道 hono 吗，不推荐吗',
        'Hono 值得推荐，尤其适合轻量 API、BFF 和 Edge 场景。',
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('skips assistant-only DOM snapshots when the latest cached turn already has an assistant', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amberkeeper-history-hydration-'));
    const dbPath = path.join(tempDir, 'capture.db');

    try {
      const store = new CaptureStore(dbPath);
      const existingSessionId = store.persistEnvelope({
        provider: 'qianwen',
        source: 'preload-dom',
        sourceSessionKey: 'qianwen-primary-view',
        pageUrl: 'https://www.qianwen.com/chat/qw-conv',
        remoteConversationId: 'qw-conv',
        capturedAt: '2026-07-04T14:01:06.724Z',
        messages: [
          {
            role: 'user',
            content: '第一问',
            createdAt: '2026-07-04T13:59:41.197Z',
          },
          {
            role: 'assistant',
            content: '第一答',
            createdAt: '2026-07-04T14:01:06.724Z',
          },
        ],
      });
      const setLastCaptureAt = vi.fn();
      const service = createHistoryCapturePersistenceService({
        getCaptureStore: () => store,
        setLastCaptureAt,
        recordAttempt: vi.fn(),
      });

      const result = service.persistAutoCachedEnvelope(
        {
          provider: 'qianwen',
          source: 'preload-dom',
          sourceSessionKey: 'qianwen-primary-view',
          pageUrl: 'https://www.qianwen.com/chat/qw-conv',
          remoteConversationId: 'qw-conv',
          capturedAt: '2026-07-04T14:04:24.051Z',
          messages: [
            {
              role: 'assistant',
              content: '第一答重新渲染变体',
              createdAt: '2026-07-04T14:04:24.051Z',
            },
          ],
        },
        {
          trigger: 'history-auto-cache',
          triggerUrl: 'https://www.qianwen.com/chat/qw-conv',
        }
      );

      expect(result).toBeNull();
      expect(store.listMessages(existingSessionId).map((message) => message.content)).toEqual([
        '第一问',
        '第一答',
      ]);
      expect(setLastCaptureAt).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
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
