import { describe, expect, test, vi } from 'vitest';
import type {
  CaptureSessionRecord,
  ProviderLiveAutomationSpec,
  ProviderLiveProbeActionResult,
} from '@amberkeeper/shared-types';
import { runProviderLiveProbe } from '../src/main/runtime/provider-live-automation';

describe('provider-live-automation', () => {
  test('marks a new-message probe as passed when a provider session appears locally', async () => {
    let pollCount = 0;
    const runtime = createRuntimeFixture({
      providerId: 'doubao',
      currentUrl: 'https://www.doubao.com/chat',
      actionResult: { ok: true, selector: 'textarea', submitSelector: 'button[type="submit"]' },
    });

    const result = await runProviderLiveProbe(
      {
        providerId: 'doubao',
        kind: 'new-message',
        promptText: 'hello',
        timeoutMs: 6_000,
      },
      {
        activateProvider: async () => undefined,
        resolveRuntime: () => runtime,
        getAutomationSpec: () => createSpecFixture('doubao'),
        listProviderSessions: () => {
          pollCount += 1;
          if (pollCount >= 2) {
            runtime.currentUrl = 'https://www.doubao.com/chat/doubao-conv-1';
            return [
              createSession({
                id: 'session-1',
                provider: 'doubao',
                remoteConversationId: 'doubao-conv-1',
                pageUrl: runtime.currentUrl,
                messageCount: 2,
                updatedAt: '2026-04-05T00:00:03.000Z',
              }),
            ];
          }

          return [];
        },
        listAttemptLogs: () => [],
      }
    );

    expect(result.outcome).toBe('passed');
    expect(result.remoteConversationId).toBe('doubao-conv-1');
    expect(result.evidence.sessionDelta.newSessionIds).toEqual(['session-1']);
    expect(result.evidence.preUrl).toBe('https://www.doubao.com/chat');
    expect(result.evidence.postUrl).toBe('https://www.doubao.com/chat/doubao-conv-1');
    expect(result.evidence.action.ok).toBe(true);
    expect(runtime.loadUrl).toHaveBeenCalledWith('https://www.doubao.com/chat');
    expect(pollCount).toBeGreaterThan(0);
  });

  test('marks a history-click probe as failed when no clickable history target is found', async () => {
    const runtime = createRuntimeFixture({
      providerId: 'qianwen',
      currentUrl: 'https://www.qianwen.com',
      actionResult: { ok: false, reason: 'history-item-not-found' },
    });

    const result = await runProviderLiveProbe(
      {
        providerId: 'qianwen',
        kind: 'history-click',
        timeoutMs: 5_000,
      },
      {
        activateProvider: async () => undefined,
        resolveRuntime: () => runtime,
        getAutomationSpec: () => createSpecFixture('qianwen'),
        listProviderSessions: () => [],
        listAttemptLogs: () => [],
      }
    );

    expect(result.outcome).toBe('failed-no-history-target');
    expect(result.evidence.action.reason).toBe('history-item-not-found');
  });

  test('treats repeated history-click replay on an already cached session as passed', async () => {
    const conversationId = 'qwen-conv-1';
    let attemptPollCount = 0;
    const runtime = createRuntimeFixture({
      providerId: 'qianwen',
      currentUrl: `https://www.qianwen.com/chat/${conversationId}`,
      actionResult: {
        ok: true,
        selector: 'a[href*="/chat/"]',
        historyItem: {
          index: 0,
          label: 'existing session',
          href: `https://www.qianwen.com/chat/${conversationId}`,
          conversationId,
        },
      },
      domMessages: [{ role: 'user', content: 'Existing prompt' }],
    });
    const existingSession = createSession({
      id: 'session-existing',
      provider: 'qianwen',
      remoteConversationId: conversationId,
      pageUrl: `https://www.qianwen.com/chat/${conversationId}`,
      messageCount: 5,
      updatedAt: '2026-04-05T00:00:03.000Z',
    });

    const result = await runProviderLiveProbe(
      {
        providerId: 'qianwen',
        kind: 'history-click',
        historyItemIndex: 0,
        timeoutMs: 5_000,
      },
      {
        activateProvider: async () => undefined,
        resolveRuntime: () => runtime,
        getAutomationSpec: () => createSpecFixture('qianwen'),
        listProviderSessions: () => [existingSession],
        listAttemptLogs: () => {
          attemptPollCount += 1;
          return attemptPollCount >= 2
            ? [
                {
                  id: 'attempt-1',
                  source: 'preload-dom',
                  stage: 'history-auto-cache',
                  status: 'info',
                  message: 'probe observed',
                  detail: null,
                  createdAt: '2026-04-05T00:00:04.000Z',
                },
              ]
            : [];
        },
      }
    );

    expect(result.outcome).toBe('passed');
    expect(result.remoteConversationId).toBe(conversationId);
    expect(result.evidence.sessionDelta.newSessionIds).toEqual([]);
  });
});

function createRuntimeFixture(input: {
  providerId: CaptureSessionRecord['provider'];
  currentUrl: string;
  actionResult: ProviderLiveProbeActionResult;
  domMessages?: Array<{ role?: string; content?: string }>;
}) {
  const runtime = {
    providerId: input.providerId,
    currentUrl: input.currentUrl,
    loadUrl: vi.fn(async (url: string) => {
      runtime.currentUrl = url;
    }),
    view: {
      webContents: {
        executeJavaScript: vi.fn(async (script: string) => {
          if (script.includes('return selectors.some')) {
            return true;
          }

          if (script.includes('const composerSelectors =') || script.includes('const itemSelectors =')) {
            return input.actionResult;
          }

          return false;
        }),
      },
    },
    browserSession: {
      config: {
        homeUrl: input.currentUrl,
      },
      runDomSnapshot: vi.fn(async () => ({
        message: 'snapshot',
        detail: '{}',
      })),
      readStructuredDomSnapshot: vi.fn(async (fallbackUrl: string) => ({
        url: fallbackUrl,
        title: 'fixture',
        messages: input.domMessages ?? [],
      })),
    },
  };

  return runtime;
}

function createSpecFixture(providerId: ProviderLiveAutomationSpec['id']): ProviderLiveAutomationSpec {
  return {
    id: providerId,
    newMessage: {
      composerSelectors: ['textarea'],
      sendButtonSelectors: ['button[type="submit"]'],
      submitButtonTextCandidates: ['send'],
      submitStrategy: 'button-or-enter',
    },
    historyClick: {
      itemSelectors: ['a[href*="/chat/"]'],
      ignoreTextPatterns: ['new chat'],
      routeFragments: ['/chat/'],
    },
  };
}

function createSession(
  input: Partial<CaptureSessionRecord> & Pick<CaptureSessionRecord, 'id' | 'provider'>
): CaptureSessionRecord {
  return {
    id: input.id,
    provider: input.provider,
    title: input.title ?? 'fixture',
    remoteConversationId: input.remoteConversationId ?? null,
    sourceSessionKey: input.sourceSessionKey ?? `${input.provider}-primary-view`,
    pageUrl: input.pageUrl ?? 'https://example.com/chat',
    titleSource: input.titleSource ?? 'provider',
    previewText: input.previewText ?? null,
    messageCount: input.messageCount ?? 0,
    createdAt: input.createdAt ?? '2026-04-05T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-05T00:00:00.000Z',
  };
}
