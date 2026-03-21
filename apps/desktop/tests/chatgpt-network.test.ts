import { describe, expect, test } from 'vitest';
import {
  classifyChatGptRequest,
  extractConversationIdFromBody,
  extractConversationIdFromUrl,
  isChatGptConversationTurnRoute,
  shouldTriggerDomAutoCapture,
  shouldLogNetworkObservation,
} from '@anychat/provider-chatgpt';

describe('chatgpt-network', () => {
  test('classifies legacy and current conversation endpoints as capture routes', () => {
    expect(classifyChatGptRequest('https://chatgpt.com/backend-api/conversation', 'POST')).toBe(
      'capture'
    );
    expect(
      classifyChatGptRequest('https://chatgpt.com/backend-api/conversation/conv-123', 'GET')
    ).toBe('capture');
    expect(
      classifyChatGptRequest('https://chatgpt.com/backend-api/f/conversation', 'POST')
    ).toBe('capture');
  });

  test('classifies other backend api routes as discovery candidates', () => {
    expect(classifyChatGptRequest('https://chatgpt.com/backend-api/models', 'GET')).toBe(
      'discover'
    );
    expect(
      classifyChatGptRequest('https://chatgpt.com/backend-api/files/upload_status', 'GET')
    ).toBe('discover');
  });

  test('ignores unrelated domains and static assets', () => {
    expect(classifyChatGptRequest('https://cdn.oaistatic.com/assets/app.js', 'GET')).toBe(
      'ignore'
    );
    expect(classifyChatGptRequest('https://example.com/backend-api/conversation', 'POST')).toBe(
      'ignore'
    );
  });

  test('logs only meaningful network observations', () => {
    expect(
      shouldLogNetworkObservation('https://chatgpt.com/backend-api/models', 'Fetch')
    ).toBe(true);
    expect(
      shouldLogNetworkObservation('https://chatgpt.com/backend-api/f/conversation', 'XHR')
    ).toBe(true);
    expect(shouldLogNetworkObservation('wss://chatgpt.com/backend-api/ws', 'WebSocket')).toBe(
      true
    );
    expect(shouldLogNetworkObservation('https://chatgpt.com/favicon.ico', 'Other')).toBe(false);
  });

  test('identifies the actual turn submission route but excludes prepare and init endpoints', () => {
    expect(
      isChatGptConversationTurnRoute('https://chatgpt.com/backend-api/f/conversation', 'POST')
    ).toBe(true);
    expect(
      isChatGptConversationTurnRoute(
        'https://chatgpt.com/backend-api/f/conversation/prepare',
        'POST'
      )
    ).toBe(false);
    expect(
      isChatGptConversationTurnRoute('https://chatgpt.com/backend-api/conversation/init', 'POST')
    ).toBe(false);
  });

  test('extracts conversation ids from page urls and backend urls', () => {
    expect(extractConversationIdFromUrl('https://chatgpt.com/c/conv-123')).toBe('conv-123');
    expect(
      extractConversationIdFromUrl(
        'https://chatgpt.com/backend-api/conversation/conv-123/stream_status'
      )
    ).toBe('conv-123');
    expect(extractConversationIdFromUrl('https://chatgpt.com/backend-api/models')).toBeNull();
  });

  test('extracts conversation ids from request bodies when present', () => {
    expect(
      extractConversationIdFromBody(JSON.stringify({ conversation_id: 'conv-123', action: 'next' }))
    ).toBe('conv-123');
    expect(extractConversationIdFromBody(JSON.stringify({ action: 'next' }))).toBeNull();
    expect(extractConversationIdFromBody('not-json')).toBeNull();
  });

  test('triggers dom auto capture on stream completion signals', () => {
    expect(
      shouldTriggerDomAutoCapture({
        url: 'https://chatgpt.com/backend-api/conversation/conv-123/stream_status',
        method: 'GET',
        streamStatus: 'COMPLETE',
      })
    ).toBe(true);

    expect(
      shouldTriggerDomAutoCapture({
        url: 'https://chatgpt.com/backend-api/f/conversation',
        method: 'POST',
        streamStatus: null,
      })
    ).toBe(true);

    expect(
      shouldTriggerDomAutoCapture({
        url: 'https://chatgpt.com/backend-api/f/conversation/prepare',
        method: 'POST',
        streamStatus: null,
      })
    ).toBe(false);
  });
});
