import type { ProviderId } from '@amberkeeper/shared-types';
import { summarizeDomSnapshotMetadata } from '../diagnostics/dom-snapshot-metadata';
import type { getProviderAdapter } from '../runtime/provider-adapters';
import {
  normalizeHydratedDomMessages,
  summarizeDeepSeekHydrationDiagnostics,
} from '../runtime/history-hydration';
import { shouldAcceptAutoCacheSnapshot } from '../runtime/old-session-auto-cache';
import type { CaptureAttemptInput } from '../storage/capture-store';

type ProviderAdapter = NonNullable<ReturnType<typeof getProviderAdapter>>;

type RuntimeLike = {
  currentUrl: string;
  browserSession: {
    readStructuredDomSnapshot: (fallbackUrl: string) => Promise<{
      url: string;
      title: string;
      messages: Array<{ role?: string; content?: string }>;
    }>;
    runDomSnapshot: () => Promise<{ message: string; detail: string }>;
  };
  view: {
    webContents: {
      executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
    };
  };
};

export function createHistoryDomHydrationService<TRuntime extends RuntimeLike>(options: {
  getProviderAdapter: (providerId: ProviderId) => ProviderAdapter | null;
  wait: (milliseconds: number) => Promise<void>;
  formatError: (error: unknown) => string;
  recordAttempt: (input: CaptureAttemptInput) => void;
  persistHydratedConversationSnapshot: (input: {
    providerId: ProviderId;
    existingSessionId?: string | null;
    runtime: TRuntime;
    snapshot: {
      url: string;
      title: string;
      conversationId: string | null;
      messages: Array<{ role?: string; content?: string }>;
    };
    targetUrl: string;
    preferredConversationId?: string | null;
    stage: 'history-hydration' | 'history-auto-cache';
  }) => { message: string; detail: string };
  domCapturePollAttempts: number;
  domCapturePollIntervalMs: number;
}) {
  return {
    async runConversationHistoryCaptureFromDom(input: {
      providerId: ProviderId;
      runtime: TRuntime;
      targetUrl: string;
      preferredConversationId?: string | null;
      existingSessionId?: string | null;
      stage: 'history-hydration' | 'history-auto-cache';
      emptyMessage: string;
    }): Promise<{ message: string; detail: string }> {
      options.recordAttempt({
        source: 'preload-dom',
        stage: input.stage,
        status: 'info',
        message:
          input.stage === 'history-hydration'
            ? 'Started DOM hydration for the selected session.'
            : 'Started DOM auto-cache for the active remote session.',
        metadataDetail: [
          input.preferredConversationId ? `remoteConversationId=${input.preferredConversationId}` : '',
          `targetUrl=${input.targetUrl}`,
        ]
          .filter(Boolean)
          .join('\n'),
        createdAt: new Date().toISOString(),
      });

      const adapter = options.getProviderAdapter(input.providerId);
      const initialRouteConversationId =
        adapter?.extractConversationIdFromUrl(input.runtime.currentUrl) ??
        adapter?.extractConversationIdFromUrl(input.targetUrl) ??
        null;
      let initialSignature: string | null = null;

      if (
        input.stage === 'history-auto-cache' &&
        input.preferredConversationId &&
        initialRouteConversationId !== input.preferredConversationId
      ) {
        const initialSnapshot = await input.runtime.browserSession.readStructuredDomSnapshot(
          input.runtime.currentUrl || input.targetUrl
        );
        initialSignature = createHydrationSignature(initialSnapshot.messages);
      }

      let previousSignature: string | null = null;
      let bestSnapshot:
        | {
            url: string;
            title: string;
            conversationId: string | null;
            messages: Array<{ role?: string; content?: string }>;
          }
        | null = null;

      for (let attempt = 0; attempt < options.domCapturePollAttempts; attempt += 1) {
        const snapshot = await input.runtime.browserSession.readStructuredDomSnapshot(
          input.runtime.currentUrl || input.targetUrl
        );
        const resolvedConversationId =
          adapter?.extractConversationIdFromUrl(snapshot.url) ??
          adapter?.extractConversationIdFromUrl(input.runtime.currentUrl) ??
          input.preferredConversationId ??
          null;
        const normalized = normalizeHydratedDomMessages(snapshot.messages, {
          capturedAt: new Date().toISOString(),
          conversationId: resolvedConversationId,
        });

        if (normalized.length > 0) {
          const signature = createHydrationSignature(snapshot.messages);
          if (
            !shouldAcceptAutoCacheSnapshot({
              stage: input.stage,
              preferredConversationId: input.preferredConversationId,
              resolvedConversationId,
              initialSignature,
              nextSignature: signature,
            })
          ) {
            await options.wait(options.domCapturePollIntervalMs);
            continue;
          }

          bestSnapshot = {
            url: snapshot.url || input.targetUrl,
            title: snapshot.title ?? '',
            conversationId: resolvedConversationId,
            messages: snapshot.messages,
          };

          if (signature === previousSignature) {
            return options.persistHydratedConversationSnapshot({
              providerId: input.providerId,
              existingSessionId: input.existingSessionId ?? null,
              runtime: input.runtime,
              snapshot: bestSnapshot,
              targetUrl: input.targetUrl,
              preferredConversationId: input.preferredConversationId ?? null,
              stage: input.stage,
            });
          }

          previousSignature = signature;
        }

        await options.wait(options.domCapturePollIntervalMs);
      }

      if (bestSnapshot) {
        return options.persistHydratedConversationSnapshot({
          providerId: input.providerId,
          existingSessionId: input.existingSessionId ?? null,
          runtime: input.runtime,
          snapshot: bestSnapshot,
          targetUrl: input.targetUrl,
          preferredConversationId: input.preferredConversationId ?? null,
          stage: input.stage,
        });
      }

      let domSnapshotDetail: string;
      let domSnapshotMetadata: string;
      try {
        const domSnapshot = await input.runtime.browserSession.runDomSnapshot();
        domSnapshotDetail = domSnapshot.detail;
        domSnapshotMetadata = summarizeDomSnapshotMetadata(domSnapshotDetail) ?? 'unstructured';
      } catch (error) {
        domSnapshotDetail = `runDomSnapshot failed: ${options.formatError(error)}`;
        domSnapshotMetadata = 'failed';
      }

      const deepSeekHistoryDiagnostics =
        input.providerId === 'deepseek'
          ? await this.collectDeepSeekHistoryFetchDiagnostics(
              input.runtime,
              input.preferredConversationId ?? null
            )
          : null;
      const targetMetadata = [
        input.targetUrl,
        input.preferredConversationId ? `remoteConversationId=${input.preferredConversationId}` : '',
      ].filter(Boolean);

      options.recordAttempt({
        source: 'preload-dom',
        stage: input.stage,
        status: 'info',
        message:
          input.stage === 'history-hydration'
            ? 'Opened remote session but found no DOM messages to hydrate.'
            : 'Observed remote session route but found no DOM history to cache.',
        detail: [
          ...targetMetadata,
          deepSeekHistoryDiagnostics && `deepseekHistory=${deepSeekHistoryDiagnostics.detail}`,
          domSnapshotDetail && `domSnapshot=${domSnapshotDetail}`,
        ]
          .filter(Boolean)
          .join('\n'),
        metadataDetail: [
          ...targetMetadata,
          deepSeekHistoryDiagnostics && `deepseekHistory=${deepSeekHistoryDiagnostics.metadataDetail}`,
          `domSnapshot=${domSnapshotMetadata}`,
        ]
          .filter(Boolean)
          .join('\n'),
        createdAt: new Date().toISOString(),
      });

      return {
        message: input.emptyMessage,
        detail: input.targetUrl,
      };
    },

    async collectDeepSeekHistoryFetchDiagnostics(
      runtime: TRuntime,
      remoteConversationId: string | null
    ): Promise<{ detail: string; metadataDetail: string }> {
      if (!remoteConversationId) {
        const detail = 'missing-remote-conversation-id';
        return { detail, metadataDetail: detail };
      }

      try {
        const diagnostics = (await runtime.view.webContents.executeJavaScript(
          `
            (async () => {
              const chatSessionId = ${JSON.stringify(remoteConversationId)};
              const queryCount = (selector) => {
                try {
                  return document.querySelectorAll(selector).length;
                } catch {
                  return -1;
                }
              };
              const sampleNodes = (selector, limit = 3) => {
                try {
                  return Array.from(document.querySelectorAll(selector))
                    .slice(0, limit)
                    .map((node) => ({
                      selector,
                      tagName: node.tagName,
                      className: typeof node.className === 'string' ? node.className : '',
                      textSample: node.textContent ?? '',
                      htmlSample: node instanceof HTMLElement ? node.outerHTML : '',
                    }));
                } catch {
                  return [];
                }
              };
              const main = document.querySelector('main');

              let historyFetch;
              try {
                const response = await fetch(
                  '/api/v0/chat/history_messages?chat_session_id=' + encodeURIComponent(chatSessionId),
                  {
                    credentials: 'include',
                    headers: {
                      accept: 'application/json, text/plain, */*',
                    },
                  }
                );
                const text = await response.text();
                historyFetch = {
                  ok: response.ok,
                  status: response.status,
                  url: response.url,
                  preview: text.slice(0, 2000),
                };
              } catch (error) {
                historyFetch = {
                  ok: false,
                  status: null,
                  url: '',
                  preview: String(error),
                };
              }

              return {
                historyFetch,
                dom: {
                  locationHref: location.href,
                  title: document.title,
                  bodyTextSample: document.body?.innerText ?? '',
                  mainHtmlSample: main?.innerHTML ?? '',
                  selectorCounts: {
                    '.message-item': queryCount('.message-item'),
                    '.user-message': queryCount('.user-message'),
                    '.assistant-message': queryCount('.assistant-message'),
                    '[data-testid*="message"]': queryCount('[data-testid*="message"]'),
                    '[class*="message"]': queryCount('[class*="message"]'),
                    'main': queryCount('main'),
                  },
                  candidateNodes: [
                    ...sampleNodes('[class*="message"]'),
                    ...sampleNodes('[data-testid*="message"]'),
                    ...sampleNodes('[role="listitem"]'),
                  ].slice(0, 6),
                },
              };
            })();
          `,
          true
        )) as {
          historyFetch?: {
            ok?: boolean;
            status?: number | null;
            url?: string;
            preview?: string;
          } | null;
          dom?: {
            locationHref?: string;
            title?: string;
            bodyTextSample?: string;
            mainHtmlSample?: string;
            selectorCounts?: Record<string, number>;
          } | null;
        } | null;

        return {
          detail: summarizeDeepSeekHydrationDiagnostics(diagnostics ?? {}),
          metadataDetail: summarizeDeepSeekHydrationDiagnostics(diagnostics ?? {}, false),
        };
      } catch (error) {
        return {
          detail: `executeJavaScript failed: ${options.formatError(error)}`,
          metadataDetail: 'executeJavaScript failed',
        };
      }
    },
  };
}

function createHydrationSignature(messages: Array<{ role?: string; content?: string }>): string {
  if (messages.length === 0) {
    return 'empty';
  }

  return JSON.stringify({
    count: messages.length,
    tail: messages.slice(-4).map((message) => ({
      role: message.role ?? '',
      content: message.content?.slice(0, 120) ?? '',
    })),
  });
}
