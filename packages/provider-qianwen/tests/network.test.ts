import { describe, expect, test } from 'vitest';
import {
  classifyQianwenRequest,
  extractQianwenConversationIdFromUrl,
  matchesQianwenView,
  shouldTriggerQianwenDomAutoCapture,
} from '../src/network';

describe('qianwen-network', () => {
  test('matches qianwen views and classifies capture/discovery routes', () => {
    expect(matchesQianwenView('https://www.qianwen.com/app')).toBe(true);
    expect(
      classifyQianwenRequest('https://www.qianwen.com/api/chat/completions', 'POST')
    ).toBe('capture');
    expect(
      classifyQianwenRequest('https://chat2.qianwen.com/api/v2/chat?biz_id=ai_qwen', 'POST')
    ).toBe('capture');
    expect(
      classifyQianwenRequest(
        'https://chat2-api.qianwen.com/api/v1/session/msg/list?session_id=qw-123',
        'GET'
      )
    ).toBe('capture');
    expect(classifyQianwenRequest('https://www.qianwen.com/api/models', 'GET')).toBe('discover');
    expect(classifyQianwenRequest('https://example.com/api/chat/completions', 'POST')).toBe('ignore');
  });

  test('extracts conversation ids from qianwen urls', () => {
    expect(extractQianwenConversationIdFromUrl('https://www.qianwen.com/chat/qw-123')).toBe('qw-123');
    expect(
      extractQianwenConversationIdFromUrl(
        'https://www.qianwen.com/api/chat/completions?conversation_id=qw-456'
      )
    ).toBe('qw-456');
  });

  test('triggers DOM auto capture only for completed or capture posts', () => {
    expect(
      shouldTriggerQianwenDomAutoCapture({
        url: 'https://www.qianwen.com/api/chat/completions',
        method: 'POST',
        streamStatus: null,
      })
    ).toBe(true);
    expect(
      shouldTriggerQianwenDomAutoCapture({
        url: 'https://www.qianwen.com/api/chat/completions',
        method: 'GET',
        streamStatus: null,
      })
    ).toBe(false);
    expect(
      shouldTriggerQianwenDomAutoCapture({
        url: 'https://www.qianwen.com/app',
        method: 'GET',
        streamStatus: 'COMPLETE',
      })
    ).toBe(true);
  });
});
