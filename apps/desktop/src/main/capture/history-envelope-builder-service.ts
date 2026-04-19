import type { CaptureEnvelope, NormalizedMessage, ProviderId } from '@amberkeeper/shared-types';
import type { getProviderAdapter } from '../runtime/provider-adapters';
import { resolveAutoCachedTitle } from '../runtime/old-session-auto-cache';

type ProviderAdapter = NonNullable<ReturnType<typeof getProviderAdapter>>;

type TrackedRequestLike = {
  provider: ProviderId;
  sourceSessionKey: string;
  url: string;
  method: string;
  pageUrl: string;
  capturedAt: string;
};

export function createHistoryEnvelopeBuilderService(options: {
  getProviderAdapter: (providerId: ProviderId) => ProviderAdapter | null;
  resolveActiveRuntimeTitle: (providerId: ProviderId) => string | null;
}) {
  return {
    buildHistoryEnvelopeFromTrackedResponse(
      tracked: TrackedRequestLike,
      body: string
    ): CaptureEnvelope | null {
      const adapter = options.getProviderAdapter(tracked.provider);
      const historyCapture = adapter?.extractHistoryCapture?.({
        url: tracked.url,
        method: tracked.method,
        body,
        pageUrl: tracked.pageUrl,
        capturedAt: tracked.capturedAt,
        sourceSessionKey: tracked.sourceSessionKey,
      });

      if (!historyCapture) {
        return null;
      }

      return this.buildProviderHistoryEnvelope({
        tracked,
        messages: historyCapture.messages,
        conversationId: historyCapture.conversationId ?? null,
      });
    },

    buildProviderHistoryEnvelope(input: {
      tracked: TrackedRequestLike;
      messages: NormalizedMessage[];
      conversationId: string | null;
    }): CaptureEnvelope | null {
      if (input.messages.length === 0) {
        return null;
      }

      const remoteConversationId =
        input.messages.find((message) => message.remoteConversationId)?.remoteConversationId ??
        input.conversationId ??
        null;
      if (!remoteConversationId) {
        return null;
      }

      const activeTitle = resolveAutoCachedTitle({
        stage: 'network-history-response',
        snapshotTitle: options.resolveActiveRuntimeTitle(input.tracked.provider),
      });

      return {
        provider: input.tracked.provider,
        source: 'cdp-network',
        pageUrl: input.tracked.pageUrl,
        capturedAt: input.tracked.capturedAt,
        sourceSessionKey: input.tracked.sourceSessionKey,
        remoteConversationId,
        title: activeTitle,
        titleSource: activeTitle ? 'provider' : 'fallback',
        messages: input.messages.map((message, index) => ({
          ...message,
          createdAt:
            message.createdAt === new Date(0).toISOString()
              ? new Date(new Date(input.tracked.capturedAt).getTime() + index).toISOString()
              : message.createdAt,
          remoteConversationId: message.remoteConversationId ?? remoteConversationId,
        })),
      };
    },
  };
}
