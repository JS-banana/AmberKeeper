import { describe, expect, test, vi } from 'vitest';
import { qianwenAdapter } from '@amberkeeper/provider-qianwen';
import { createRequestIngestionService } from '../src/main/capture/request-ingestion-service';

describe('request-ingestion-service', () => {
  test('marks request-side captures as persisted so the renderer can refresh library data', () => {
    const persistEnvelope = vi.fn(() => 'session-qw-1');
    const markCapturePersisted = vi.fn();
    const recordAttempt = vi.fn();
    const service = createRequestIngestionService({
      maybeAutoCacheDiscoveredConversation: vi.fn(),
      emitProviderSignals: vi.fn(),
      recordUniqueObservation: vi.fn(),
      recordAttempt,
      persistEnvelope,
      markCapturePersisted,
      resolveActiveRuntimeTitle: () => 'Qianwen live session',
      captureConversationFromDom: vi.fn(),
    });

    service.handleRequestSeen({
      adapter: qianwenAdapter,
      signal: {
        kind: 'requestSeen',
        provider: 'qianwen',
        source: 'cdp-network',
        sourceSessionKey: 'qianwen-primary-view',
        pageUrl: 'https://www.qianwen.com/chat/qw-v2-conv',
        capturedAt: '2026-04-16T09:28:25.509Z',
        requestId: 'req-qw-1',
        url: 'https://chat2.qianwen.com/api/v2/chat?biz_id=ai_qwen',
        method: 'POST',
        postData: JSON.stringify({
          session_id: 'qw-v2-conv',
          model: 'Qwen',
          messages: [
            {
              content: 'Latest qianwen prompt',
              mime_type: 'text/plain',
            },
          ],
        }),
        resourceType: 'Fetch',
      },
    });

    expect(persistEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'qianwen',
        remoteConversationId: 'qw-v2-conv',
        messages: [
          expect.objectContaining({
            role: 'user',
            content: 'Latest qianwen prompt',
          }),
        ],
      })
    );
    expect(markCapturePersisted).toHaveBeenCalledWith('2026-04-16T09:28:25.509Z');
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'cdp-network',
        stage: 'request-user-persist',
        status: 'captured',
      })
    );
  });
});
