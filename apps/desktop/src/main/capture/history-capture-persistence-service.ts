import type {
  CaptureEnvelope,
  CaptureSessionRecord,
  ProviderId,
} from '@amberkeeper/shared-types';
import type { CaptureStore } from '../storage/capture-store';
import { normalizeHydratedDomMessages } from '../runtime/history-hydration';
import { resolveAutoCachedTitle, shouldPersistAutoCachedMessages } from '../runtime/old-session-auto-cache';

type RuntimeLike = {
  browserSession: {
    config: {
      sourceSessionKey: string;
    };
  };
};

export function createHistoryCapturePersistenceService(options: {
  getCaptureStore: () => CaptureStore | null;
  setLastCaptureAt: (capturedAt: string) => void;
  recordAttempt: (input: {
    source: 'cdp-network' | 'preload-dom' | 'runtime';
    stage: string;
    status: 'info' | 'captured' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
}) {
  return {
    persistHydratedConversationSnapshot(input: {
      providerId: ProviderId;
      existingSessionId?: string | null;
      runtime: RuntimeLike;
      snapshot: {
        url: string;
        title: string;
        conversationId: string | null;
        messages: Array<{ role?: string; content?: string }>;
      };
      targetUrl: string;
      preferredConversationId?: string | null;
      stage: 'history-hydration' | 'history-auto-cache';
    }): { message: string; detail: string } {
      const capturedAt = new Date().toISOString();
      const conversationId = input.snapshot.conversationId ?? input.preferredConversationId ?? null;
      const messages = normalizeHydratedDomMessages(input.snapshot.messages, {
        capturedAt,
        conversationId,
      });

      if (messages.length === 0) {
        options.recordAttempt({
          source: 'preload-dom',
          stage: input.stage,
          status: 'info',
          message: 'Opened remote session but normalized history was empty.',
          detail: `${input.targetUrl}\nremoteConversationId=${conversationId ?? ''}`,
          createdAt: capturedAt,
        });

        return {
          message:
            input.stage === 'history-hydration'
              ? 'The selected session did not expose any normalized history yet.'
              : 'The active remote session did not expose any normalized history yet.',
          detail: input.targetUrl,
        };
      }

      const resolvedTitle = resolveAutoCachedTitle({
        stage: input.stage,
        snapshotTitle: input.snapshot.title,
      });
      const envelope: CaptureEnvelope = {
        provider: input.providerId,
        source: 'preload-dom',
        pageUrl: input.snapshot.url || input.targetUrl,
        capturedAt,
        sourceSessionKey: input.runtime.browserSession.config.sourceSessionKey,
        remoteConversationId: conversationId ?? undefined,
        title: resolvedTitle,
        titleSource: resolvedTitle ? 'provider' : 'fallback',
        messages,
      };
      const sessionId = this.persistAutoCachedEnvelope(envelope, {
        existingSessionId: input.existingSessionId ?? null,
        trigger: input.stage,
        triggerUrl: input.snapshot.url || input.targetUrl,
      });

      if (!sessionId) {
        return {
          message: 'The remote conversation is already cached with the latest stable snapshot.',
          detail: input.snapshot.url || input.targetUrl,
        };
      }

      const actionLabel = input.existingSessionId ? 'Hydrated' : 'Cached';
      return {
        message: `${actionLabel} ${messages.length} message(s) from the remote session.`,
        detail: input.snapshot.url || input.targetUrl,
      };
    },

    persistAutoCachedEnvelope(
      envelope: CaptureEnvelope,
      input: {
        existingSessionId?: string | null;
        trigger: 'history-hydration' | 'history-auto-cache' | 'network-history-response';
        triggerUrl: string;
      }
    ): string | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      const existingSession = this.resolveExistingSessionForEnvelope(
        envelope,
        input.existingSessionId ?? null
      );
      if (
        existingSession &&
        existingSession.pageUrl === envelope.pageUrl &&
        (existingSession.title ?? null) === (envelope.title ?? null) &&
        !shouldPersistAutoCachedMessages(
          captureStore.listMessages(existingSession.id),
          envelope.messages
        )
      ) {
        return null;
      }

      const sessionId = existingSession
        ? captureStore.replaceSessionEnvelope(existingSession.id, envelope)
        : captureStore.persistEnvelope(envelope);

      options.setLastCaptureAt(envelope.capturedAt);
      options.recordAttempt({
        source: envelope.source,
        stage: input.trigger === 'history-hydration' ? 'history-hydration' : 'history-auto-cache',
        status: 'captured',
        message: `${existingSession ? 'Updated' : 'Cached'} ${envelope.messages.length} message(s) from the remote session.`,
        detail: [
          input.triggerUrl,
          `session=${sessionId}`,
          envelope.remoteConversationId ? `remoteConversationId=${envelope.remoteConversationId}` : '',
          `trigger=${input.trigger}`,
        ]
          .filter(Boolean)
          .join('\n'),
        createdAt: envelope.capturedAt,
      });

      return sessionId;
    },

    resolveExistingSessionForEnvelope(
      envelope: CaptureEnvelope,
      existingSessionId: string | null
    ): CaptureSessionRecord | null {
      const captureStore = options.getCaptureStore();
      if (!captureStore) {
        return null;
      }

      if (existingSessionId) {
        return captureStore.listSessions().find((session) => session.id === existingSessionId) ?? null;
      }

      const remoteConversationId = envelope.remoteConversationId?.trim();
      if (!remoteConversationId) {
        return null;
      }

      return captureStore.findSessionByRemoteConversation(envelope.provider, remoteConversationId);
    },
  };
}
