import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { CaptureEnvelope } from '@amberkeeper/shared-types';
import { CaptureStore } from '../src/main/storage/capture-store';

describe('capture-store', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anychat-electron-store-'));
    dbPath = path.join(tempDir, 'capture.db');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates and reuses a session when remoteConversationId is present', () => {
    const store = new CaptureStore(dbPath);

    const firstSessionId = store.persistEnvelope(buildEnvelope({ remoteConversationId: 'conv-123' }));
    const secondSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Second answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    expect(secondSessionId).toBe(firstSessionId);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        remoteConversationId: 'conv-123',
        messageCount: 2,
      }),
    ]);
  });

  test('creates a fallback session when remoteConversationId is missing', () => {
    const store = new CaptureStore(dbPath);

    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: undefined,
        sourceSessionKey: 'chatgpt-primary-view',
      })
    );

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: null,
        sourceSessionKey: 'chatgpt-primary-view',
      }),
    ]);
  });

  test('deduplicates messages by provider, conversation, role, and content hash', () => {
    const store = new CaptureStore(dbPath);
    const envelope = buildEnvelope({ remoteConversationId: 'conv-123' });

    store.persistEnvelope(envelope);
    store.persistEnvelope(envelope);

    const [session] = store.listSessions();

    expect(store.listMessages(session.id)).toHaveLength(1);
  });

  test('replaces existing session messages when hydrating selected session history', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Placeholder answer',
            createdAt: '2026-03-19T10:00:01.000Z',
          },
        ],
      })
    );

    store.replaceSessionEnvelope(
      sessionId,
      buildEnvelope({
        source: 'preload-dom',
        capturedAt: '2026-03-19T10:05:00.000Z',
        messages: [
          {
            role: 'user',
            content: 'Recovered prompt',
            createdAt: '2026-03-19T10:04:59.000Z',
          },
          {
            role: 'assistant',
            content: 'Recovered answer',
            createdAt: '2026-03-19T10:05:00.000Z',
          },
        ],
      })
    );

    expect(store.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'Recovered prompt',
        source: 'preload-dom',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Recovered answer',
        source: 'preload-dom',
      }),
    ]);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        messageCount: 2,
      }),
    ]);
  });

  test('persists sessions and messages across store instances', () => {
    const firstStore = new CaptureStore(dbPath);
    const sessionId = firstStore.persistEnvelope(buildEnvelope({ remoteConversationId: 'conv-123' }));

    const secondStore = new CaptureStore(dbPath);

    expect(secondStore.listSessions()).toEqual([
      expect.objectContaining({
        id: sessionId,
        remoteConversationId: 'conv-123',
      }),
    ]);
    expect(secondStore.listMessages(sessionId)).toEqual([
      expect.objectContaining({
        content: 'User question',
      }),
    ]);
  });

  test('writes envelopes into conversations, messages, and capture events tables', () => {
    const store = new CaptureStore(dbPath);

    store.persistEnvelope(
      buildEnvelope({
        messages: [
          {
            role: 'user',
            content: 'User question',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
          {
            role: 'assistant',
            content: 'Assistant answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    const db = new DatabaseSync(dbPath);

    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);
    expect(countRows(db, 'capture_events')).toBeGreaterThan(0);

    db.close();
  });

  test('reconciles a fallback session into the final remote conversation', () => {
    const store = new CaptureStore(dbPath);

    const fallbackSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: undefined,
        pageUrl: 'https://chatgpt.com',
      })
    );

    const resolvedSessionId = store.persistEnvelope(
      buildEnvelope({
        remoteConversationId: 'conv-123',
        pageUrl: 'https://chatgpt.com/c/conv-123',
        messages: [
          {
            role: 'assistant',
            content: 'Resolved answer',
            createdAt: '2026-03-19T10:00:02.000Z',
          },
        ],
      })
    );

    expect(resolvedSessionId).toBe(fallbackSessionId);
    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: fallbackSessionId,
        remoteConversationId: 'conv-123',
        messageCount: 2,
      }),
    ]);
  });

  test('uses preview-based fallback titles when exporting sessions with provider-generic page titles', () => {
    const store = new CaptureStore(dbPath);
    const sessionId = store.persistEnvelope(
      buildEnvelope({
        provider: 'deepseek',
        pageUrl: 'https://chat.deepseek.com/a/chat/s/deepseek-conv',
        remoteConversationId: 'deepseek-conv',
        title: 'DeepSeek - Into the Unknown',
        messages: [
          {
            role: 'user',
            content: 'Draft launch checklist for the DeepSeek workspace',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
      })
    );

    const artifact = store.exportSession(sessionId, 'markdown');

    expect(artifact.fileName).toBe(
      'amberkeeper-deepseek-draft-launch-checklist-for-the-deepseek-workspace.md'
    );
    expect(artifact.content).toContain('## Draft launch checklist for the DeepSeek workspace');
    expect(artifact.content).not.toContain('## DeepSeek - Into the Unknown');
  });

  test('migrates legacy capture tables into the new read model', () => {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE capture_sessions (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        remote_conversation_id TEXT,
        source_session_key TEXT NOT NULL,
        page_url TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE capture_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        remote_conversation_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        remote_message_id TEXT,
        model TEXT,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
    `);
    db.prepare(
      `
        INSERT INTO capture_sessions (
          id,
          provider,
          remote_conversation_id,
          source_session_key,
          page_url,
          message_count,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      'legacy-session-1',
      'chatgpt',
      'conv-legacy',
      'chatgpt-primary-view',
      'https://chatgpt.com/c/conv-legacy',
      1,
      '2026-03-19T09:59:00.000Z',
      '2026-03-19T09:59:10.000Z'
    );
    db.prepare(
      `
        INSERT INTO capture_messages (
          id,
          session_id,
          provider,
          remote_conversation_id,
          role,
          content,
          content_hash,
          remote_message_id,
          model,
          source,
          created_at,
          captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      'legacy-message-1',
      'legacy-session-1',
      'chatgpt',
      'conv-legacy',
      'assistant',
      'Legacy answer',
      'legacy-hash-1',
      null,
      'gpt-4o',
      'cdp-network',
      '2026-03-19T09:59:05.000Z',
      '2026-03-19T09:59:10.000Z'
    );
    db.close();

    const store = new CaptureStore(dbPath);
    const migratedDb = new DatabaseSync(dbPath);

    expect(store.listSessions()).toEqual([
      expect.objectContaining({
        id: 'legacy-session-1',
        remoteConversationId: 'conv-legacy',
        messageCount: 1,
      }),
    ]);
    expect(store.listMessages('legacy-session-1')).toEqual([
      expect.objectContaining({
        id: 'legacy-message-1',
        sessionId: 'legacy-session-1',
        content: 'Legacy answer',
      }),
    ]);
    expect(countRows(migratedDb, 'conversations')).toBe(1);
    expect(countRows(migratedDb, 'messages')).toBe(1);

    migratedDb.close();
  });
});

function buildEnvelope(
  overrides: Partial<CaptureEnvelope> = {}
): CaptureEnvelope {
  return {
    provider: 'chatgpt',
    source: 'cdp-network',
    pageUrl: 'https://chatgpt.com/c/conv-123',
    sourceSessionKey: 'chatgpt-primary-view',
    capturedAt: '2026-03-19T10:00:00.000Z',
    remoteConversationId: 'conv-123',
    messages: [
      {
        role: 'user',
        content: 'User question',
        createdAt: '2026-03-19T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

function countRows(db: DatabaseSync, tableName: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName}`)
    .get() as { count: number };

  return row.count;
}
