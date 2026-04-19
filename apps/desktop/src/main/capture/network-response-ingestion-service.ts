import type { ProviderSignal, RuntimeSignal } from '@amberkeeper/capture-core';
import type { CaptureEnvelope, ProviderAdapter, ProviderId } from '@amberkeeper/shared-types';
import { shouldRecordParsedResponseDiagnostics } from '../runtime/response-diagnostics';

type ResponseBodySeenSignal = Extract<RuntimeSignal, { kind: 'responseBodySeen' }>;
type ResponseBodyFailedSignal = Extract<RuntimeSignal, { kind: 'responseBodyFailed' }>;

type TrackedRequestLike = {
  provider: ProviderId;
  sourceSessionKey: string;
  url: string;
  method: string;
  pageUrl: string;
  capturedAt: string;
  classification: 'capture' | 'discover';
};

export function createNetworkResponseIngestionService(options: {
  buildHistoryEnvelopeFromTrackedResponse: (
    tracked: TrackedRequestLike,
    body: string
  ) => CaptureEnvelope | null;
  persistAutoCachedEnvelope: (
    envelope: CaptureEnvelope,
    input: {
      trigger: 'network-history-response';
      triggerUrl: string;
    }
  ) => string | null;
  emitProviderSignals: (signals: ProviderSignal[]) => void;
  captureConversationFromDom: (pageUrl: string) => Promise<void>;
  recordAttempt: (input: {
    source: 'cdp-network';
    stage: string;
    status: 'info' | 'error';
    message: string;
    detail?: string | null;
    createdAt: string;
  }) => void;
  formatError: (error: unknown) => string;
}) {
  return {
    handleResponseBodyFailed(input: {
      tracked: TrackedRequestLike | null;
      signal: ResponseBodyFailedSignal;
    }): void {
      options.recordAttempt({
        source: 'cdp-network',
        stage: 'response-body',
        status: 'error',
        message: `Failed to retrieve or parse a ${input.signal.provider} response body.`,
        detail: [input.tracked?.url ?? '', options.formatError(input.signal.error)].filter(Boolean).join('\n'),
        createdAt: input.signal.capturedAt,
      });
    },

    async handleResponseBodySeen(input: {
      tracked: TrackedRequestLike;
      signal: ResponseBodySeenSignal;
      adapter: ProviderAdapter<ProviderSignal>;
    }): Promise<void> {
      const text = input.signal.base64Encoded
        ? Buffer.from(input.signal.body, 'base64').toString('utf8')
        : input.signal.body;
      const response = input.adapter.interpretResponseBody({
        url: input.tracked.url,
        method: input.tracked.method,
        body: text,
        pageUrl: input.tracked.pageUrl,
        capturedAt: input.signal.capturedAt,
        sourceSessionKey: input.tracked.sourceSessionKey,
      });
      const historyEnvelope = options.buildHistoryEnvelopeFromTrackedResponse(input.tracked, text);

      if (historyEnvelope) {
        options.persistAutoCachedEnvelope(historyEnvelope, {
          trigger: 'network-history-response',
          triggerUrl: input.tracked.url,
        });
      }

      if (response.signals.length > 0) {
        if (
          shouldRecordParsedResponseDiagnostics({
            provider: input.tracked.provider,
            classification: input.tracked.classification,
          })
        ) {
          options.recordAttempt({
            source: 'cdp-network',
            stage: 'response-parsed',
            status: 'info',
            message: `Parsed ${response.signals.length} signal(s) from ${input.tracked.provider} response.`,
            detail: [
              input.tracked.url,
              summarizeSignalsForDiagnostics(response.signals),
              input.adapter.summarizeResponseBody(text, 800),
            ]
              .filter(Boolean)
              .join('\n'),
            createdAt: input.signal.capturedAt,
          });
        }

        options.emitProviderSignals(response.signals);
      } else if (input.tracked.classification === 'capture') {
        options.recordAttempt({
          source: 'cdp-network',
          stage: input.tracked.method === 'POST' ? 'response-sse' : 'history-json',
          status: 'info',
          message: `Matched ${input.tracked.provider} request but parsed no normalized messages.`,
          detail: `${input.tracked.url}\n${input.adapter.summarizeResponseBody(text)}`,
          createdAt: input.signal.capturedAt,
        });
      }

      if (response.streamStatus === 'COMPLETE') {
        await options.captureConversationFromDom(input.tracked.pageUrl);
      }
    },
  };
}

function summarizeSignalsForDiagnostics(signals: ProviderSignal[]): string {
  return JSON.stringify(
    signals.map((signal) => ({
      kind: signal.kind,
      conversationId: 'conversationId' in signal ? (signal.conversationId ?? null) : null,
      createdAt: 'createdAt' in signal ? (signal.createdAt ?? null) : null,
      remoteMessageId: 'remoteMessageId' in signal ? (signal.remoteMessageId ?? null) : null,
      stable: 'stable' in signal ? (signal.stable ?? null) : null,
      content:
        'content' in signal && typeof signal.content === 'string'
          ? signal.content.slice(0, 160)
          : null,
    })),
    null,
    2
  );
}
