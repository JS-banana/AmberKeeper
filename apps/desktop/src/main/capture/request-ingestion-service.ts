import type { ProviderSignal, RuntimeSignal } from '@amberkeeper/capture-core';
import type { CaptureEnvelope, ProviderAdapter, ProviderId } from '@amberkeeper/shared-types';
import { resolveConversationIdSignal } from '../runtime/conversation-id-resolution';

type RequestSeenSignal = Extract<RuntimeSignal, { kind: 'requestSeen' }>;
type ResponseMetaSeenSignal = Extract<RuntimeSignal, { kind: 'responseMetaSeen' }>;
type WebsocketSeenSignal = Extract<RuntimeSignal, { kind: 'websocketSeen' }>;

export type TrackedRequestRecord = {
  provider: ProviderId;
  sourceSessionKey: string;
  url: string;
  method: string;
  postData?: string;
  pageUrl: string;
  capturedAt: string;
  resourceType: string;
  classification: 'capture' | 'discover';
};

export function createRequestIngestionService(options: {
  maybeAutoCacheDiscoveredConversation: (input: {
    classification: 'capture' | 'discover' | 'ignore';
    providerId: ProviderId;
    remoteConversationId: string | null;
    pageUrl: string;
  }) => void;
  emitProviderSignals: (signals: ProviderSignal[]) => void;
  recordUniqueObservation: (key: string, input: {
    source: 'cdp-network';
    stage: string;
    status: 'info';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
  recordAttempt: (input: {
    source: 'cdp-network';
    stage: string;
    status: 'info' | 'captured';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
  persistEnvelope: (envelope: CaptureEnvelope) => void;
  resolveActiveRuntimeTitle: (providerId: ProviderId) => string | null;
  captureConversationFromDom: (pageUrl: string) => Promise<void>;
}) {
  return {
    handleRequestSeen(input: {
      signal: RequestSeenSignal;
      adapter: ProviderAdapter<ProviderSignal>;
    }): TrackedRequestRecord | null {
      const classification = input.adapter.classifyRequest({
        url: input.signal.url,
        method: input.signal.method,
      });
      if (classification === 'ignore') {
        return null;
      }

      const tracked = {
        provider: input.signal.provider,
        sourceSessionKey: input.signal.sourceSessionKey,
        url: input.signal.url,
        method: input.signal.method,
        postData: input.signal.postData,
        pageUrl: input.signal.pageUrl,
        capturedAt: input.signal.capturedAt,
        resourceType: input.signal.resourceType,
        classification,
      } satisfies TrackedRequestRecord;

      const requestConversationSignal = resolveConversationIdSignal({
        provider: input.signal.provider,
        source: 'cdp-network',
        sourceSessionKey: input.signal.sourceSessionKey,
        pageUrl: input.signal.pageUrl,
        capturedAt: input.signal.capturedAt,
        urls: [input.signal.pageUrl, input.signal.url],
        adapter: input.adapter,
      });
      if (requestConversationSignal) {
        options.maybeAutoCacheDiscoveredConversation({
          classification,
          providerId: requestConversationSignal.provider,
          remoteConversationId: requestConversationSignal.conversationId,
          pageUrl: requestConversationSignal.pageUrl,
        });
        options.emitProviderSignals([requestConversationSignal]);
      }

      if (
        input.adapter.classifyRequest({ url: tracked.url, method: 'GET' }) !== 'ignore' &&
        ['Fetch', 'XHR'].includes(tracked.resourceType)
      ) {
        options.recordUniqueObservation(
          `request:${tracked.method}:${tracked.url}:${tracked.resourceType}`,
          {
            source: 'cdp-network',
            stage: classification === 'capture' ? 'request-candidate' : 'request-discovery',
            status: 'info',
            message: `${tracked.method} ${tracked.resourceType} ${tracked.url}`,
            detail: tracked.postData ? tracked.postData.slice(0, 400) : tracked.pageUrl,
            createdAt: tracked.capturedAt,
          }
        );
      }

      if (classification === 'capture' && tracked.method === 'POST' && tracked.postData) {
        const signals = input.adapter.interpretRequest({
          url: tracked.url,
          method: tracked.method,
          body: tracked.postData,
          pageUrl: tracked.pageUrl,
          capturedAt: tracked.capturedAt,
          sourceSessionKey: tracked.sourceSessionKey,
        });

        if (signals.length > 0) {
          options.emitProviderSignals(signals);
          this.persistRequestCandidateEnvelope(tracked, signals);
        } else {
          options.recordAttempt({
            source: 'cdp-network',
            stage: 'request-parse-empty',
            status: 'info',
            message: 'Request matched capture route but yielded no normalized user message.',
            detail: tracked.url,
            createdAt: tracked.capturedAt,
          });
        }
      }

      return tracked;
    },

    handleResponseMetaSeen(input: {
      signal: ResponseMetaSeenSignal;
      tracked: TrackedRequestRecord;
      adapter: ProviderAdapter<ProviderSignal>;
    }): void {
      if (
        input.adapter.classifyRequest({ url: input.signal.url, method: 'GET' }) !== 'ignore' &&
        ['Fetch', 'XHR'].includes(input.tracked.resourceType)
      ) {
        options.recordUniqueObservation(
          `response:${input.tracked.method}:${input.signal.url}:${input.signal.status}:${input.signal.mimeType}`,
          {
            source: 'cdp-network',
            stage:
              input.tracked.classification === 'capture'
                ? 'response-candidate'
                : 'response-discovery',
            status: 'info',
            message: `${input.tracked.method} ${input.signal.status ?? 'unknown'} ${input.signal.mimeType ?? 'unknown'} ${input.signal.url}`,
            detail: input.tracked.pageUrl,
            createdAt: input.signal.capturedAt,
          }
        );
      }

      const responseConversationSignal = resolveConversationIdSignal({
        provider: input.signal.provider,
        source: 'cdp-network',
        sourceSessionKey: input.tracked.sourceSessionKey,
        pageUrl: input.signal.pageUrl,
        capturedAt: input.signal.capturedAt,
        urls: [input.signal.pageUrl, input.signal.url],
        adapter: input.adapter,
      });
      if (responseConversationSignal) {
        options.maybeAutoCacheDiscoveredConversation({
          classification: input.tracked.classification,
          providerId: responseConversationSignal.provider,
          remoteConversationId: responseConversationSignal.conversationId,
          pageUrl: responseConversationSignal.pageUrl,
        });
        options.emitProviderSignals([responseConversationSignal]);
      }

      if (
        input.adapter.shouldTriggerDomAutoCapture({
          url: input.tracked.url,
          method: input.tracked.method,
          streamStatus: null,
        })
      ) {
        void options.captureConversationFromDom(input.tracked.pageUrl);
      }
    },

    handleWebsocketSeen(input: {
      signal: WebsocketSeenSignal;
      adapter: ProviderAdapter<ProviderSignal>;
    }): void {
      if (!input.adapter.matchesView(input.signal.url)) {
        return;
      }

      options.recordUniqueObservation(`websocket:${input.signal.url}`, {
        source: 'cdp-network',
        stage: 'websocket-created',
        status: 'info',
        message: `WebSocket observed: ${input.signal.url}`,
        detail: input.signal.pageUrl,
        createdAt: input.signal.capturedAt,
      });
    },

    persistRequestCandidateEnvelope(
      tracked: TrackedRequestRecord,
      signals: ProviderSignal[]
    ): void {
      const conversationId =
        signals.find((signal) => signal.kind === 'conversationIdResolved')?.conversationId ??
        signals.find((signal) => signal.kind === 'candidateUserMessage')?.conversationId ??
        null;
      const userSignals = signals.filter(
        (signal): signal is Extract<ProviderSignal, { kind: 'candidateUserMessage' }> =>
          signal.kind === 'candidateUserMessage' && Boolean(signal.content.trim())
      );

      if (userSignals.length === 0) {
        return;
      }

      const latestUserSignal = userSignals[userSignals.length - 1];
      const resolvedTitle = options.resolveActiveRuntimeTitle(tracked.provider);
      const envelope: CaptureEnvelope = {
        provider: tracked.provider,
        source: 'cdp-network',
        pageUrl: tracked.pageUrl,
        capturedAt: tracked.capturedAt,
        sourceSessionKey: tracked.sourceSessionKey,
        remoteConversationId: conversationId ?? undefined,
        title: resolvedTitle,
        titleSource: resolvedTitle ? 'provider' : 'fallback',
        messages: [
          {
            role: 'user',
            content: latestUserSignal.content,
            createdAt: latestUserSignal.createdAt,
            remoteConversationId: conversationId ?? undefined,
            remoteMessageId: latestUserSignal.remoteMessageId,
            model: latestUserSignal.model,
          },
        ],
      };

      options.persistEnvelope(envelope);
      options.recordAttempt({
        source: 'cdp-network',
        stage: 'request-user-persist',
        status: 'captured',
        message: `Persisted request-side user turn for ${tracked.provider}.`,
        detail: JSON.stringify({
          remoteConversationId: conversationId,
          pageUrl: tracked.pageUrl,
          preview: latestUserSignal.content.slice(0, 160),
        }),
        createdAt: tracked.capturedAt,
      });
    },
  };
}
