import type { CaptureSessionRecord, ProviderId, ProviderRecord } from '@amberkeeper/shared-types';
import { resolveSessionNavigationUrl } from '../runtime/history-hydration';
import type { CaptureAttemptInput, CaptureStore } from '../storage/capture-store';

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
  recordAttempt: (input: CaptureAttemptInput) => void;
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
          metadataDetail: `session=${sessionId}`,
          createdAt: new Date().toISOString(),
        });
        throw new Error(`Unknown session: ${sessionId}.`);
      }

      options.recordAttempt({
        source: 'preload-dom',
        stage: 'history-hydration',
        status: 'info',
        message: 'Requested hydration for the selected session.',
        metadataDetail: [
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
          metadataDetail: [
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
          metadataDetail: [`session=${session.id}`, `provider=${session.provider}`].join('\n'),
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
          metadataDetail: [
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
        metadataDetail: [
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
            metadataDetail: [`session=${session.id}`, `targetUrl=${targetUrl}`].join('\n'),
            createdAt: new Date().toISOString(),
          });
        }

        return options.hydrateSessionHistory(session, runtime, targetUrl);
      } catch (error) {
        const metadataDetail = `session=${session.id}\ntargetUrl=${targetUrl}`;
        options.recordAttempt({
          source: 'preload-dom',
          stage: 'history-hydration',
          status: 'error',
          message: 'Selected session hydration failed before persistence.',
          detail: `${metadataDetail}\n${options.formatError(error)}`,
          metadataDetail,
          createdAt: new Date().toISOString(),
        });

        throw error;
      }
    },
  };
}
