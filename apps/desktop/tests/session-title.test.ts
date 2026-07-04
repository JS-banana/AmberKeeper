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

  test('falls back to preview text for provider-generic Gemini page titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'gemini',
          title: 'Google Gemini',
          remoteConversationId: 'gemini-conv',
          previewText: 'Plan the Q3 research agenda for multimodal agents',
        })
      )
    ).toBe('Plan the Q3 research agenda for multimodal agents');
  });

  test('strips Gemini preview chrome prefixes like You said from fallback titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'gemini',
          title: 'Google Gemini',
          remoteConversationId: 'gemini-conv',
          previewText: 'You said 我问你，现在主流模型中，哪个擅长写作',
        })
      )
    ).toBe('我问你，现在主流模型中，哪个擅长写作');
  });

  test('treats provider-generic new provider titles as non-meaningful', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'grok',
          title: 'Grok',
          remoteConversationId: 'grok-conv',
          previewText: 'Summarize launch blockers for the Grok rollout',
        })
      )
    ).toBe('Summarize launch blockers for the Grok rollout');

    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'xiaomi-aistudio',
          title: 'MiMo',
          remoteConversationId: 'xiaomi-conv',
          previewText: 'Rehydrate the Xiaomi workspace history',
        })
      )
    ).toBe('Rehydrate the Xiaomi workspace history');
  });

  test('strips provider brand chrome from meaningful provider-owned titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'deepseek',
          title: '景德镇最佳旅游季节 - DeepSeek',
          remoteConversationId: 'deepseek-conv',
          previewText: '景德镇适合什么季节去玩',
        })
      )
    ).toBe('景德镇最佳旅游季节');

    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'doubao',
          title: '景德镇旅游季节 - 豆包',
          remoteConversationId: 'doubao-conv',
          previewText: '景德镇适合什么季节去玩',
        })
      )
    ).toBe('景德镇旅游季节');
  });

  test('falls back when stored titles are provider landing page titles', () => {
    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'chatgpt',
          title: '千问-阿里 AI 助手',
          remoteConversationId: 'chatgpt-conv',
          previewText: '景德镇适合什么季节去玩',
        })
      )
    ).toBe('景德镇适合什么季节去玩');

    expect(
      resolveSessionTitle(
        buildSession({
          provider: 'doubao',
          title: '豆包 - 字节跳动旗下 AI 智能助手',
          remoteConversationId: 'doubao-conv',
          previewText: '今天天气如何',
        })
      )
    ).toBe('今天天气如何');
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
