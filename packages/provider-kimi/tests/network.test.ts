import { describe, expect, test } from 'vitest';
import {
  classifyKimiRequest,
  extractKimiConversationIdFromUrl,
  matchesKimiView,
  shouldTriggerKimiDomAutoCapture,
} from '../src/network';

describe('kimi-network', () => {
  test('matches kimi views and classifies capture/discovery routes', () => {
    expect(matchesKimiView('https://www.kimi.com/app')).toBe(true);
    expect(matchesKimiView('https://kimi.moonshot.cn')).toBe(true);
    expect(
      classifyKimiRequest('https://www.kimi.com/api/chat/completions', 'POST')
    ).toBe('capture');
    expect(classifyKimiRequest('https://www.kimi.com/chat/kimi-123/messages', 'POST')).toBe(
      'capture'
    );
    expect(classifyKimiRequest('https://www.kimi.com/api/models', 'GET')).toBe('discover');
    expect(classifyKimiRequest('https://www.kimi.com/chat/history', 'GET')).toBe('capture');
    expect(classifyKimiRequest('https://example.com/api/chat/completions', 'POST')).toBe('ignore');
  });

  test('extracts conversation ids from kimi urls', () => {
    expect(extractKimiConversationIdFromUrl('https://www.kimi.com/chat/qw-123')).toBe('qw-123');
    expect(extractKimiConversationIdFromUrl('https://kimi.moonshot.cn/chat/qw-123')).toBe('qw-123');
    expect(
      extractKimiConversationIdFromUrl(
        'https://www.kimi.com/api/chat/completions?conversation_id=qw-456'
      )
    ).toBe('qw-456');
  });

  test('triggers DOM auto capture only for completed or capture posts', () => {
    expect(
      shouldTriggerKimiDomAutoCapture({
        url: 'https://www.kimi.com/api/chat/completions',
        method: 'POST',
        streamStatus: null,
      })
    ).toBe(true);
    expect(
      shouldTriggerKimiDomAutoCapture({
        url: 'https://www.kimi.com/api/chat/completions',
        method: 'GET',
        streamStatus: null,
      })
    ).toBe(false);
    expect(
      shouldTriggerKimiDomAutoCapture({
        url: 'https://www.kimi.com/app',
        method: 'GET',
        streamStatus: 'COMPLETE',
      })
    ).toBe(true);
  });
});
