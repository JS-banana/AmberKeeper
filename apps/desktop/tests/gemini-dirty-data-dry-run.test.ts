import { describe, expect, test } from 'vitest';
// @ts-ignore plain JS CLI module is intentionally imported in the test.
import { analyzeGeminiDirtyData, resolveGeminiCaptureDbPath } from '../scripts/gemini-dirty-data-dry-run.mjs';

interface GeminiDirtyDataCandidate {
  conversationId: string;
  reasonCodes: string[];
  proposedAction: 'review_delete_conversation';
}

interface GeminiDirtyDataReport {
  scannedConversationCount: number;
  scannedMessageCount: number;
  candidateCount: number;
  candidates: GeminiDirtyDataCandidate[];
}

describe('analyzeGeminiDirtyData', () => {
  test('flags historical Gemini conversations that match known dirty-data patterns', () => {
    const report = analyzeGeminiDirtyData({
      conversations: [
        {
          id: 'conversation-clean',
          provider: 'gemini',
          remoteConversationId: '6cb927648a31294c',
          sourceSessionKey: 'gemini-primary-view',
          pageUrl: 'https://gemini.google.com/app/6cb927648a31294c',
          messageCount: 2,
          createdAt: '2026-03-20T08:19:14.890Z',
          updatedAt: '2026-03-20T08:19:14.890Z',
        },
        {
          id: 'conversation-asset-url',
          provider: 'gemini',
          remoteConversationId: '923076df400ee934',
          sourceSessionKey: 'gemini-primary-view',
          pageUrl: 'https://gemini.google.com/app/923076df400ee934',
          messageCount: 2,
          createdAt: '2026-03-20T08:04:47.054Z',
          updatedAt: '2026-03-20T08:04:47.054Z',
        },
        {
          id: 'conversation-cumulative',
          provider: 'gemini',
          remoteConversationId: 'ad4a3694cb8a16d7',
          sourceSessionKey: 'gemini-primary-view',
          pageUrl: 'https://gemini.google.com/app/ad4a3694cb8a16d7',
          messageCount: 2,
          createdAt: '2026-03-20T08:11:56.406Z',
          updatedAt: '2026-03-20T08:11:56.406Z',
        },
        {
          id: 'conversation-rpc-noise',
          provider: 'gemini',
          remoteConversationId: 'workspace_tool',
          sourceSessionKey: 'gemini-primary-view',
          pageUrl: 'https://gemini.google.com/app/workspace_tool',
          messageCount: 3,
          createdAt: '2026-03-20T07:38:41.719Z',
          updatedAt: '2026-03-20T07:38:41.719Z',
        },
      ],
      messages: [
        {
          id: 'message-clean-user',
          conversationId: 'conversation-clean',
          provider: 'gemini',
          remoteConversationId: '6cb927648a31294c',
          role: 'user',
          content: 'GEMINI-PROBE-20260320-6',
          contentHash: 'hash-clean-user',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:19:14.890Z',
          capturedAt: '2026-03-20T08:19:14.890Z',
        },
        {
          id: 'message-clean-assistant',
          conversationId: 'conversation-clean',
          provider: 'gemini',
          remoteConversationId: '6cb927648a31294c',
          role: 'assistant',
          content:
            "That's quite a specific designation. It looks like a diagnostic code or a timestamped probe identifier for today, March 20, 2026.",
          contentHash: 'hash-clean-assistant',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:19:14.890Z',
          capturedAt: '2026-03-20T08:19:14.890Z',
        },
        {
          id: 'message-url-user',
          conversationId: 'conversation-asset-url',
          provider: 'gemini',
          remoteConversationId: '923076df400ee934',
          role: 'user',
          content: 'GEMINI-PROBE-20260320-4',
          contentHash: 'hash-url-user',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:04:47.054Z',
          capturedAt: '2026-03-20T08:04:47.054Z',
        },
        {
          id: 'message-url-assistant',
          conversationId: 'conversation-asset-url',
          provider: 'gemini',
          remoteConversationId: '923076df400ee934',
          role: 'assistant',
          content:
            'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/expand/default/24px.svghttps://fonts.gstatic.com/s/i/short-term/release/googlesymbols/expand/default/24px.svg',
          contentHash: 'hash-url-assistant',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:04:47.054Z',
          capturedAt: '2026-03-20T08:04:47.054Z',
        },
        {
          id: 'message-cumulative-user',
          conversationId: 'conversation-cumulative',
          provider: 'gemini',
          remoteConversationId: 'ad4a3694cb8a16d7',
          role: 'user',
          content: 'GEMINI-PROBE-20260320-5',
          contentHash: 'hash-cumulative-user',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:11:56.406Z',
          capturedAt: '2026-03-20T08:11:56.406Z',
        },
        {
          id: 'message-cumulative-assistant',
          conversationId: 'conversation-cumulative',
          provider: 'gemini',
          remoteConversationId: 'ad4a3694cb8a16d7',
          role: 'assistant',
          content:
            "I'm ready for the probeI'm ready for the probe. Please provide the specific query, data setI'm ready for the probe. Please provide the specific query, data set, or task associated with GEMINI-PROBE-20260320-5.",
          contentHash: 'hash-cumulative-assistant',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T08:11:56.406Z',
          capturedAt: '2026-03-20T08:11:56.406Z',
        },
        {
          id: 'message-rpc-user',
          conversationId: 'conversation-rpc-noise',
          provider: 'gemini',
          remoteConversationId: 'workspace_tool',
          role: 'user',
          content: 'DYBcR',
          contentHash: 'hash-rpc-user',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T07:38:41.719Z',
          capturedAt: '2026-03-20T07:38:41.719Z',
        },
        {
          id: 'message-rpc-assistant-1',
          conversationId: 'conversation-rpc-noise',
          provider: 'gemini',
          remoteConversationId: 'workspace_tool',
          role: 'assistant',
          content: '1die',
          contentHash: 'hash-rpc-assistant-1',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T07:38:41.719Z',
          capturedAt: '2026-03-20T07:38:41.719Z',
        },
        {
          id: 'message-rpc-assistant-2',
          conversationId: 'conversation-rpc-noise',
          provider: 'gemini',
          remoteConversationId: 'workspace_tool',
          role: 'assistant',
          content: 'Google Docsdie',
          contentHash: 'hash-rpc-assistant-2',
          remoteMessageId: null,
          model: null,
          source: 'cdp-network',
          createdAt: '2026-03-20T07:38:41.719Z',
          capturedAt: '2026-03-20T07:38:41.719Z',
        },
      ],
    }) as GeminiDirtyDataReport;

    expect(report.scannedConversationCount).toBe(4);
    expect(report.scannedMessageCount).toBe(9);
    expect(report.candidateCount).toBe(3);
    expect(report.candidates.map((candidate) => candidate.conversationId)).toEqual([
      'conversation-asset-url',
      'conversation-cumulative',
      'conversation-rpc-noise',
    ]);
    expect(report.candidates[0]?.reasonCodes).toContain('assistant_asset_url_content');
    expect(report.candidates[1]?.reasonCodes).toContain('assistant_repeated_cumulative_content');
    expect(report.candidates[2]?.reasonCodes).toEqual(
      expect.arrayContaining(['non_hex_remote_conversation_id', 'rpc_noise_content'])
    );
    expect(report.candidates.every((candidate) => candidate.proposedAction === 'review_delete_conversation')).toBe(
      true
    );
  });
});

describe('resolveGeminiCaptureDbPath', () => {
  test('prefers the AmberKeeper environment variable before the legacy AnyChat fallback', () => {
    expect(
      resolveGeminiCaptureDbPath({
        argv: ['node', 'script'],
        env: {
          AMBERKEEPER_CAPTURE_DB_PATH: '/tmp/amberkeeper.db',
          ANYCHAT_CAPTURE_DB_PATH: '/tmp/anychat.db',
        },
      })
    ).toBe('/tmp/amberkeeper.db');
  });

  test('falls back to the legacy AnyChat environment variable when the AmberKeeper variable is absent', () => {
    expect(
      resolveGeminiCaptureDbPath({
        argv: ['node', 'script'],
        env: {
          ANYCHAT_CAPTURE_DB_PATH: '/tmp/anychat.db',
        },
      })
    ).toBe('/tmp/anychat.db');
  });
});
