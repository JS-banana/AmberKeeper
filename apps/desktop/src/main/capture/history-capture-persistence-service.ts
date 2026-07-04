import type {
  CaptureEnvelope,
  CaptureSessionRecord,
  ProviderId,
} from '@amberkeeper/shared-types';
import type { CaptureStore } from '../storage/capture-store';
import { normalizeHydratedDomMessages } from '../runtime/history-hydration';
import {
  alignDomSnapshotToLatestExistingUser,
  hasSameRoleContent,
  isAssistantOnlyDomSnapshotAfterCompletedTurn,
  isUserOnlyDomSnapshotDowngrade,
  resolveAutoCachedTitle,
  shouldMergeIncompleteDomSnapshot,
  shouldPersistAutoCachedMessages,
} from '../runtime/old-session-auto-cache';

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
      const existingMessages = existingSession ? captureStore.listMessages(existingSession.id) : [];
      const envelopeToEvaluate =
        existingSession && input.trigger === 'history-auto-cache'
          ? {
              ...envelope,
              messages: alignDomSnapshotToLatestExistingUser({
                source: envelope.source,
                existingMessages,
                nextMessages: envelope.messages,
              }),
            }
          : envelope;

      if (existingSession && envelopeToEvaluate.messages.length === 0) {
        return null;
      }

      if (
        existingSession &&
        isUserOnlyDomSnapshotDowngrade({
          trigger: input.trigger,
          source: envelopeToEvaluate.source,
          existingMessages,
          nextMessages: envelopeToEvaluate.messages,
        })
      ) {
        options.recordAttempt({
          source: envelopeToEvaluate.source,
          stage: input.trigger === 'history-hydration' ? 'history-hydration' : 'history-auto-cache',
          status: 'info',
          message:
            'Skipped user-only DOM snapshot because the cached session already has messages.',
          detail: [
            input.triggerUrl,
            `session=${existingSession.id}`,
            envelope.remoteConversationId ? `remoteConversationId=${envelope.remoteConversationId}` : '',
            `trigger=${input.trigger}`,
          ]
            .filter(Boolean)
            .join('\n'),
          createdAt: envelope.capturedAt,
        });
        return null;
      }
      if (
        existingSession &&
        isAssistantOnlyDomSnapshotAfterCompletedTurn({
          source: envelopeToEvaluate.source,
          existingMessages,
          nextMessages: envelopeToEvaluate.messages,
        })
      ) {
        options.recordAttempt({
          source: envelopeToEvaluate.source,
          stage: input.trigger === 'history-hydration' ? 'history-hydration' : 'history-auto-cache',
          status: 'info',
          message:
            'Skipped assistant-only DOM snapshot because the cached latest turn already has an assistant.',
          detail: [
            input.triggerUrl,
            `session=${existingSession.id}`,
            envelope.remoteConversationId ? `remoteConversationId=${envelope.remoteConversationId}` : '',
            `trigger=${input.trigger}`,
          ]
            .filter(Boolean)
            .join('\n'),
          createdAt: envelope.capturedAt,
        });
        return null;
      }

      if (
        existingSession &&
        existingSession.pageUrl === envelopeToEvaluate.pageUrl &&
        (existingSession.title ?? null) === (envelopeToEvaluate.title ?? null) &&
        !shouldPersistAutoCachedMessages(existingMessages, envelopeToEvaluate.messages)
      ) {
        return null;
      }

      const shouldMerge =
        existingSession &&
        envelopeToEvaluate.remoteConversationId &&
        shouldMergeIncompleteDomSnapshot({
          source: envelopeToEvaluate.source,
          existingMessages,
          nextMessages: envelopeToEvaluate.messages,
        });
      const envelopeToPersist = shouldMerge
        ? {
            ...envelopeToEvaluate,
            messages: envelopeToEvaluate.messages.filter(
              (message) =>
                !existingMessages.some((existing) => hasSameRoleContent(existing, message))
            ),
          }
        : envelopeToEvaluate;

      if (shouldMerge && envelopeToPersist.messages.length === 0) {
        return null;
      }

      const sessionId = existingSession
        ? shouldMerge
          ? captureStore.persistEnvelope(envelopeToPersist)
          : captureStore.replaceSessionEnvelope(existingSession.id, envelope)
        : captureStore.persistEnvelope(envelope);

      options.setLastCaptureAt(envelope.capturedAt);
      options.recordAttempt({
        source: envelope.source,
        stage: input.trigger === 'history-hydration' ? 'history-hydration' : 'history-auto-cache',
        status: 'captured',
        message: `${existingSession ? 'Updated' : 'Cached'} ${envelopeToPersist.messages.length} message(s) from the remote session.`,
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
