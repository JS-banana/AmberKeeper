import { describe, expect, test } from 'vitest';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { resolveSessionTitle } from '../src/shared/session-title';

describe('resolveSessionTitle', () => {
  test('falls back to preview text for UUID-like titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          title: '4ffe4cb3-1488-4098-80cd-d99365144411',
          remoteConversationId: '4ffe4cb3-1488-4098-80cd-d99365144411',
          previewText: 'Summarize the roadmap risks for tomorrow',
        })
      )
    ).toBe('Summarize the roadmap risks for tomorrow');
  });

  test('falls back to preview text for provider-generic DeepSeek page titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'deepseek',
          title: 'DeepSeek - Into the Unknown',
          remoteConversationId: 'deepseek-conv',
          previewText: 'Draft launch checklist for the DeepSeek workspace',
        })
      )
    ).toBe('Draft launch checklist for the DeepSeek workspace');
  });
});

function buildSession(
  input: Partial<
    Pick<CaptureSessionRecord, 'provider' | 'title' | 'remoteConversationId' | 'previewText'>
  >
): CaptureSessionRecord {
  return {
    id: 'session-1',
    provider: input.provider ?? 'chatgpt',
    title: input.title ?? null,
    previewText: input.previewText ?? null,
    remoteConversationId: input.remoteConversationId ?? 'conv-1',
    sourceSessionKey: 'chatgpt-primary-view',
    pageUrl: 'https://example.com/conversation',
    messageCount: 1,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T01:00:00.000Z',
  };
}
