import { describe, expect, test, vi } from 'vitest';
import { createCaptureOrchestrator } from '../src/capture-orchestrator';

describe('capture-orchestrator', () => {
  test('persists exactly once when a turn reaches stable completion', () => {
    const persist = vi.fn();
    const orchestrator = createCaptureOrchestrator({ persist });

    orchestrator.consume({
      provider: 'chatgpt',
      kind: 'candidateUserMessage',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com',
      capturedAt: '2026-03-19T12:00:00.000Z',
      createdAt: '2026-03-19T12:00:00.000Z',
      conversationId: null,
      content: 'hi',
    });
    orchestrator.consume({
      provider: 'chatgpt',
      kind: 'conversationIdResolved',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-1',
      capturedAt: '2026-03-19T12:00:01.000Z',
      conversationId: 'conv-1',
    });
    orchestrator.consume({
      provider: 'chatgpt',
      kind: 'assistantMayBeReady',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-1',
      capturedAt: '2026-03-19T12:00:02.000Z',
      createdAt: '2026-03-19T12:00:02.000Z',
      conversationId: 'conv-1',
      content: 'done',
      stable: true,
    });

    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('replays a persisted turn when richer metadata arrives later', () => {
    const persist = vi.fn();
    const orchestrator = createCaptureOrchestrator({ persist });

    orchestrator.consume({
      provider: 'claude',
      kind: 'candidateUserMessage',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:00:00.000Z',
      createdAt: '1970-01-01T00:00:00.000Z',
      conversationId: 'conv-1',
      content: 'probe',
    });
    orchestrator.consume({
      provider: 'claude',
      kind: 'assistantMayBeReady',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:00:01.000Z',
      createdAt: '1970-01-01T00:00:00.000Z',
      conversationId: 'conv-1',
      content: 'answer',
      stable: true,
    });

    orchestrator.consume({
      provider: 'claude',
      kind: 'candidateUserMessage',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:00:02.000Z',
      createdAt: '2026-03-20T01:00:00.500Z',
      conversationId: 'conv-1',
      content: 'probe',
      remoteMessageId: 'msg-user-1',
    });
    orchestrator.consume({
      provider: 'claude',
      kind: 'assistantMayBeReady',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:00:03.000Z',
      createdAt: '2026-03-20T01:00:01.500Z',
      conversationId: 'conv-1',
      content: 'answer',
      stable: true,
      remoteMessageId: 'msg-assistant-1',
      model: 'claude-sonnet-4-6',
    });

    expect(persist).toHaveBeenCalledTimes(2);
  });
});
