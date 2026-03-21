import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import {
  createCaptureEventRepository,
  ensureCaptureCorePersistenceSchema,
} from '../src/persistence/capture-event-repository';

describe('capture-event-repository', () => {
  test('stores evidence records for completed turns', () => {
    const db = new DatabaseSync(':memory:');
    ensureCaptureCorePersistenceSchema(db);
    const repository = createCaptureEventRepository(db);

    repository.insert({
      provider: 'chatgpt',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-1',
      remoteConversationId: 'conv-1',
      eventKind: 'turn_persisted',
      payloadJson: '{"messages":2}',
      createdAt: '2026-03-19T13:10:00.000Z',
    });

    expect(repository.list(10)).toEqual([
      expect.objectContaining({
        provider: 'chatgpt',
        remoteConversationId: 'conv-1',
        eventKind: 'turn_persisted',
      }),
    ]);
  });
});
