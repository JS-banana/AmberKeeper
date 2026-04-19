import { DatabaseSync } from 'node:sqlite';
import { describe, expect, test } from 'vitest';
import { ensureCaptureCorePersistenceSchema, persistCompletedTurn } from '../src';

describe('turn-persistence-service', () => {
  test('writes a conversation, two messages, and capture events for one completed turn', () => {
    const db = new DatabaseSync(':memory:');

    persistCompletedTurn(db, {
      provider: 'chatgpt',
      source: 'cdp-network',
      sourceSessionKey: 'chatgpt-primary-view',
      pageUrl: 'https://chatgpt.com/c/conv-1',
      capturedAt: '2026-03-19T13:00:02.000Z',
      conversationId: 'conv-1',
      messages: [
        {
          role: 'user',
          content: 'hi',
          createdAt: '2026-03-19T13:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'hello',
          createdAt: '2026-03-19T13:00:01.000Z',
        },
      ],
    });

    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);
    expect(countRows(db, 'capture_events')).toBeGreaterThan(0);
  });

  test('upgrades placeholder timestamps and metadata when the same turn is replayed', () => {
    const db = new DatabaseSync(':memory:');

    persistCompletedTurn(db, {
      provider: 'claude',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:10:02.000Z',
      conversationId: 'conv-1',
      messages: [
        {
          role: 'user',
          content: 'probe',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        {
          role: 'assistant',
          content: 'answer',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
      ],
    });

    persistCompletedTurn(db, {
      provider: 'claude',
      source: 'cdp-network',
      sourceSessionKey: 'claude-primary-view',
      pageUrl: 'https://claude.ai/chat/conv-1',
      capturedAt: '2026-03-20T01:10:05.000Z',
      conversationId: 'conv-1',
      messages: [
        {
          role: 'user',
          content: 'probe',
          createdAt: '2026-03-20T01:10:00.500Z',
          remoteMessageId: 'msg-user-1',
        },
        {
          role: 'assistant',
          content: 'answer',
          createdAt: '2026-03-20T01:10:01.500Z',
          remoteMessageId: 'msg-assistant-1',
          model: 'claude-sonnet-4-6',
        },
      ],
    });

    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);

    const conversation = db
      .prepare(
        `
          SELECT created_at AS createdAt
          FROM conversations
          WHERE provider = 'claude' AND remote_conversation_id = 'conv-1'
        `
      )
      .get() as { createdAt: string };
    expect(conversation.createdAt).toBe('2026-03-20T01:10:00.500Z');

    const messages = db
      .prepare(
        `
          SELECT role, created_at AS createdAt, remote_message_id AS remoteMessageId, model
          FROM messages
          WHERE provider = 'claude'
          ORDER BY role ASC
        `
      )
      .all() as Array<{
      role: string;
      createdAt: string;
      remoteMessageId: string | null;
      model: string | null;
    }>;

    expect(messages).toEqual([
      {
        role: 'assistant',
        createdAt: '2026-03-20T01:10:01.500Z',
        remoteMessageId: 'msg-assistant-1',
        model: 'claude-sonnet-4-6',
      },
      {
        role: 'user',
        createdAt: '2026-03-20T01:10:00.500Z',
        remoteMessageId: 'msg-user-1',
        model: null,
      },
    ]);
  });

  test('rolls back the completed turn when capture-event writes fail late', () => {
    const db = new DatabaseSync(':memory:');
    ensureCaptureCorePersistenceSchema(db);
    db.exec(`
      CREATE TRIGGER fail_capture_events_before_insert
      BEFORE INSERT ON capture_events
      BEGIN
        SELECT RAISE(ABORT, 'capture event insert failed');
      END;
    `);

    expect(() =>
      persistCompletedTurn(db, {
        provider: 'chatgpt',
        source: 'cdp-network',
        sourceSessionKey: 'chatgpt-primary-view',
        pageUrl: 'https://chatgpt.com/c/conv-fail',
        capturedAt: '2026-03-19T13:00:02.000Z',
        conversationId: 'conv-fail',
        messages: [
          {
            role: 'user',
            content: 'hi',
            createdAt: '2026-03-19T13:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'hello',
            createdAt: '2026-03-19T13:00:01.000Z',
          },
        ],
      })
    ).toThrow('capture event insert failed');

    expect(countRows(db, 'conversations')).toBe(0);
    expect(countRows(db, 'messages')).toBe(0);
    expect(countRows(db, 'capture_events')).toBe(0);
  });
});

function countRows(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  return row.count;
}
