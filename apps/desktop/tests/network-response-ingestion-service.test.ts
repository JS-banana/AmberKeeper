import { describe, expect, test, vi } from 'vitest';
import type { ProviderSignal } from '@amberkeeper/capture-core';
import type { ProviderAdapter } from '@amberkeeper/shared-types';
import { createNetworkResponseIngestionService } from '../src/main/capture/network-response-ingestion-service';

describe('network-response-ingestion-service', () => {
  test('uses the response-time page URL when interpreting provider response bodies', async () => {
    const interpretResponseBody = vi.fn(() => ({
      signals: [
        {
          provider: 'doubao',
          kind: 'assistantMayBeReady',
          source: 'cdp-network',
          sourceSessionKey: 'doubao-primary-view',
          pageUrl: 'https://www.doubao.com/chat/38433844550879746',
          capturedAt: '2026-07-04T04:11:34.036Z',
          conversationId: '38433844550879746',
          content: '安庆很好玩',
          createdAt: '2026-07-04T04:11:34.036Z',
          stable: true,
        } satisfies ProviderSignal,
      ],
      streamStatus: 'COMPLETE' as const,
    }));
    const adapter = {
      interpretResponseBody,
      summarizeResponseBody: () => '',
    } as unknown as ProviderAdapter<ProviderSignal>;
    const buildHistoryEnvelopeFromTrackedResponse = vi.fn(() => null);
    const captureConversationFromDom = vi.fn(async () => undefined);
    const service = createNetworkResponseIngestionService({
      buildHistoryEnvelopeFromTrackedResponse,
      persistAutoCachedEnvelope: vi.fn(),
      emitProviderSignals: vi.fn(),
      captureConversationFromDom,
      recordAttempt: vi.fn(),
      formatError: (error) => String(error),
    });

    await service.handleResponseBodySeen({
      adapter,
      tracked: {
        provider: 'doubao',
        sourceSessionKey: 'doubao-primary-view',
        url: 'https://www.doubao.com/chat/completion',
        method: 'POST',
        postData: JSON.stringify({ client_meta: { local_conversation_id: 'local_1343331803079166' } }),
        pageUrl: 'https://www.doubao.com/chat',
        capturedAt: '2026-07-04T04:11:02.944Z',
        classification: 'capture',
      },
      signal: {
        kind: 'responseBodySeen',
        provider: 'doubao',
        source: 'cdp-network',
        sourceSessionKey: 'doubao-primary-view',
        requestId: 'request-1',
        body: 'data: [DONE]',
        base64Encoded: false,
        pageUrl: 'https://www.doubao.com/chat/38433844550879746',
        capturedAt: '2026-07-04T04:11:34.036Z',
      },
    });

    expect(interpretResponseBody).toHaveBeenCalledWith(
      expect.objectContaining({
        pageUrl: 'https://www.doubao.com/chat/38433844550879746',
        requestCapturedAt: '2026-07-04T04:11:02.944Z',
      })
    );
    expect(buildHistoryEnvelopeFromTrackedResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        pageUrl: 'https://www.doubao.com/chat/38433844550879746',
      }),
      'data: [DONE]'
    );
    expect(captureConversationFromDom).toHaveBeenCalledWith(
      'https://www.doubao.com/chat/38433844550879746'
    );
  });
});
