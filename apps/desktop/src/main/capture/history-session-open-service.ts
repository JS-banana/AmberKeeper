import type { CaptureSessionRecord, ProviderId, ProviderRecord } from '@amberkeeper/shared-types';
import { resolveSessionNavigationUrl } from '../runtime/history-hydration';
import type { CaptureStore } from '../storage/capture-store';

type RuntimeLike = {
  providerId: ProviderId;
  currentUrl: string;
  loadUrl: (url: string) => Promise<void>;
};

export function createHistorySessionOpenService<TRuntime extends RuntimeLike>(options: {
  getCaptureStore: () => CaptureStore | null;
  getSelectedProviderId: () => ProviderId | null;
  resolveRuntime: (providerId: ProviderId) => TRuntime | null;
  hydrateSessionHistory: (
    session: CaptureSessionRecord,
    runtime: TRuntime,
    targetUrl: string
  ) => Promise<{ message: string; detail: string }>;
  recordAttempt: (input: {
    source: 'preload-dom';
    stage: string;
    status: 'info' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
  formatError: (error: unknown) => string;
}) {
  return {
    async openSession(sessionId: string): Promise<{ message: string; detail: string }> {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return {
          message: 'Capture store is not ready yet.',
          detail: '',
        };
      }

      const session = captureStore.listSessions().find((entry) => entry.id === sessionId) ?? null;
      if (!session) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Requested hydration for an unknown session.',
          detail: `session=${sessionId}`,
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Unknown session: ${sessionId}.`);
      }

      options.recordAttempt({
        source: 'preload-dom',
        stage: 'history-hydration',
        status: 'info',
        message: 'Requested hydration for the selected session.',
        detail: [
          `session=${session.id}`,
          `provider=${session.provider}`,
          `activeProvider=${options.getSelectedProviderId() ?? ''}`,
          `remoteConversationId=${session.remoteConversationId ?? ''}`,
          `pageUrl=${session.pageUrl}`,
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });

      if (session.provider !== options.getSelectedProviderId()) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Selected session does not belong to the active provider.',
          detail: [
            `session=${session.id}`,
            `provider=${session.provider}`,
            `activeProvider=${options.getSelectedProviderId() ?? ''}`,
          ].join('\n'),
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Session ${sessionId} does not belong to the active provider.`);
      }

      const provider =
        captureStore.listProviders().find((entry) => entry.id === session.provider) ?? null;
      if (!provider) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Selected session provider could not be resolved.',
          detail: [`session=${session.id}`, `provider=${session.provider}`].join('\n'),
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Unknown provider for session ${sessionId}.`);
      }

      const runtime = options.resolveRuntime(session.provider);
      if (!runtime || runtime.providerId !== session.provider) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Active runtime is not ready for the selected session provider.',
          detail: [
            `session=${session.id}`,
            `provider=${session.provider}`,
            `runtimeProvider=${runtime?.providerId ?? ''}`,
          ].join('\n'),
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Active runtime is not ready for provider ${session.provider}.`);
      }

      const targetUrl = resolveSessionNavigationUrl(
        session,
        (provider as ProviderRecord).homeUrl
      );
      options.recordAttempt({
        source: 'preload-dom',
        stage: 'history-hydration',
        status: 'info',
        message: 'Resolved selected session navigation target.',
        detail: [
          `session=${session.id}`,
          `currentUrl=${runtime.currentUrl}`,
          `targetUrl=${targetUrl}`,
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });

      try {
        if (runtime.currentUrl !== targetUrl) {
          await runtime.loadUrl(targetUrl);

          options.recordAttempt({
            source: 'preload-dom',
            stage: 'history-hydration',
            status: 'info',
            message: 'Navigated the active runtime to the selected session URL.',
            detail: [`session=${session.id}`, `targetUrl=${targetUrl}`].join('\n'),
            createdAt: new Date().toISOString(),
          });
        }

        return options.hydrateSessionHistory(session, runtime, targetUrl);
      } catch (error) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Selected session hydration failed before persistence.',
          detail: [
            `session=${session.id}`,
            `targetUrl=${targetUrl}`,
            options.formatError(error),
          ].join('\n'),
          createdAt: new Date().toISOString(),
        });

        throw error;
      }
    },
  };
}
