import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureCaptureCorePersistenceSchema } from '@anychat/capture-core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
// @ts-expect-error plain JS CLI module is intentionally imported in the test.
import { runGeminiDirtyDataCleanup } from '../scripts/gemini-dirty-data-cleanup.mjs';

interface GeminiDirtyDataCleanupResult {
  mode: 'dry-run' | 'apply';
  candidateCount: number;
  deletedConversationCount: number;
  deletedMessageCount: number;
  deletedCaptureEventCount: number;
  remainingCandidateCount: number;
  backupPath: string | null;
}

describe('runGeminiDirtyDataCleanup', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anychat-gemini-cleanup-'));
    dbPath = path.join(tempDir, 'capture.db');
    seedGeminiDirtyDataFixture(dbPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('does not mutate the database unless apply is explicitly enabled', () => {
    const report = runGeminiDirtyDataCleanup({
      dbPath,
    }) as GeminiDirtyDataCleanupResult;

    expect(report.mode).toBe('dry-run');
    expect(report.candidateCount).toBe(2);
    expect(report.deletedConversationCount).toBe(0);
    expect(report.deletedMessageCount).toBe(0);
    expect(report.deletedCaptureEventCount).toBe(0);
    expect(report.remainingCandidateCount).toBe(2);
    expect(report.backupPath).toBeNull();

    const db = new DatabaseSync(dbPath);
    expect(countRows(db, 'conversations')).toBe(3);
    expect(countRows(db, 'messages')).toBe(6);
    expect(countRows(db, 'capture_events')).toBe(9);
    db.close();
  });

  test('backs up and removes dirty Gemini conversations, messages, and capture events in apply mode', () => {
    const report = runGeminiDirtyDataCleanup({
      dbPath,
      apply: true,
      backupDir: tempDir,
      now: () => '2026-03-20T11:22:33.000Z',
    }) as GeminiDirtyDataCleanupResult;

    expect(report.mode).toBe('apply');
    expect(report.candidateCount).toBe(2);
    expect(report.deletedConversationCount).toBe(2);
    expect(report.deletedMessageCount).toBe(4);
    expect(report.deletedCaptureEventCount).toBe(6);
    expect(report.remainingCandidateCount).toBe(0);
    expect(report.backupPath).not.toBeNull();
    expect(fs.existsSync(report.backupPath as string)).toBe(true);

    const db = new DatabaseSync(dbPath);
    expect(countRows(db, 'conversations')).toBe(1);
    expect(countRows(db, 'messages')).toBe(2);
    expect(countRows(db, 'capture_events')).toBe(3);
    expect(
      db
        .prepare(
          `
            SELECT remote_conversation_id AS remoteConversationId
            FROM conversations
            ORDER BY updated_at DESC
          `
        )
        .all()
    ).toEqual([{ remoteConversationId: '6cb927648a31294c' }]);
    db.close();

    const backupDb = new DatabaseSync(report.backupPath as string);
    expect(countRows(backupDb, 'conversations')).toBe(3);
    expect(countRows(backupDb, 'messages')).toBe(6);
    expect(countRows(backupDb, 'capture_events')).toBe(9);
    backupDb.close();
  });
});

function seedGeminiDirtyDataFixture(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  ensureCaptureCorePersistenceSchema(db);

  insertConversation(db, {
    id: 'conversation-clean',
    remoteConversationId: '6cb927648a31294c',
    pageUrl: 'https://gemini.google.com/app/6cb927648a31294c',
    updatedAt: '2026-03-20T08:19:14.890Z',
  });
  insertConversation(db, {
    id: 'conversation-asset-url',
    remoteConversationId: '923076df400ee934',
    pageUrl: 'https://gemini.google.com/app/923076df400ee934',
    updatedAt: '2026-03-20T08:04:47.054Z',
  });
  insertConversation(db, {
    id: 'conversation-null-remote',
    remoteConversationId: null,
    pageUrl: 'https://gemini.google.com',
    updatedAt: '2026-03-20T07:58:42.263Z',
  });

  insertMessage(db, {
    id: 'message-clean-user',
    conversationId: 'conversation-clean',
    remoteConversationId: '6cb927648a31294c',
    role: 'user',
    content: 'GEMINI-PROBE-20260320-6',
    createdAt: '2026-03-20T08:19:14.890Z',
  });
  insertMessage(db, {
    id: 'message-clean-assistant',
    conversationId: 'conversation-clean',
    remoteConversationId: '6cb927648a31294c',
    role: 'assistant',
    content: 'Clean Gemini response',
    createdAt: '2026-03-20T08:19:14.891Z',
  });
  insertMessage(db, {
    id: 'message-asset-url-user',
    conversationId: 'conversation-asset-url',
    remoteConversationId: '923076df400ee934',
    role: 'user',
    content: 'GEMINI-PROBE-20260320-4',
    createdAt: '2026-03-20T08:04:47.054Z',
  });
  insertMessage(db, {
    id: 'message-asset-url-assistant',
    conversationId: 'conversation-asset-url',
    remoteConversationId: '923076df400ee934',
    role: 'assistant',
    content:
      'https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/expand/default/24px.svghttps://fonts.gstatic.com/s/i/short-term/release/googlesymbols/expand/default/24px.svg',
    createdAt: '2026-03-20T08:04:47.055Z',
  });
  insertMessage(db, {
    id: 'message-null-remote-user',
    conversationId: 'conversation-null-remote',
    remoteConversationId: null,
    role: 'user',
    content: 'GEMINI-PROBE-NULL-REMOTE',
    createdAt: '2026-03-20T07:58:42.263Z',
  });
  insertMessage(db, {
    id: 'message-null-remote-assistant',
    conversationId: 'conversation-null-remote',
    remoteConversationId: null,
    role: 'assistant',
    content:
      'I can help with thatI can help with that. Please share the exact promptI can help with that. Please share the exact prompt you want me to analyze.',
    createdAt: '2026-03-20T07:58:42.264Z',
  });

  insertCaptureEvents(db, {
    conversationId: 'conversation-clean',
    remoteConversationId: '6cb927648a31294c',
    pageUrl: 'https://gemini.google.com/app/6cb927648a31294c',
    createdAt: '2026-03-20T08:19:14.890Z',
  });
  insertCaptureEvents(db, {
    conversationId: 'conversation-asset-url',
    remoteConversationId: '923076df400ee934',
    pageUrl: 'https://gemini.google.com/app/923076df400ee934',
    createdAt: '2026-03-20T08:04:47.054Z',
  });
  insertCaptureEvents(db, {
    conversationId: 'conversation-null-remote',
    remoteConversationId: null,
    pageUrl: 'https://gemini.google.com',
    createdAt: '2026-03-20T07:58:42.263Z',
  });

  db.close();
}

function insertConversation(
  db: DatabaseSync,
  input: {
    id: string;
    remoteConversationId: string | null;
    pageUrl: string;
    updatedAt: string;
  }
): void {
  db.prepare(
    `
      INSERT INTO conversations (
        id,
        provider,
        remote_conversation_id,
        source_session_key,
        page_url,
        message_count,
        created_at,
        updated_at
      ) VALUES (?, 'gemini', ?, 'gemini-primary-view', ?, 2, ?, ?)
    `
  ).run(input.id, input.remoteConversationId, input.pageUrl, input.updatedAt, input.updatedAt);
}

function insertMessage(
  db: DatabaseSync,
  input: {
    id: string;
    conversationId: string;
    remoteConversationId: string | null;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }
): void {
  db.prepare(
    `
      INSERT INTO messages (
        id,
        conversation_id,
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
      ) VALUES (?, ?, 'gemini', ?, ?, ?, ?, NULL, NULL, 'cdp-network', ?, ?)
    `
  ).run(
    input.id,
    input.conversationId,
    input.remoteConversationId,
    input.role,
    input.content,
    `hash-${input.id}`,
    input.createdAt,
    input.createdAt
  );
}

function insertCaptureEvents(
  db: DatabaseSync,
  input: {
    conversationId: string;
    remoteConversationId: string | null;
    pageUrl: string;
    createdAt: string;
  }
): void {
  db.prepare(
    `
      INSERT INTO capture_events (
        id,
        provider,
        source,
        source_session_key,
        page_url,
        remote_conversation_id,
        event_kind,
        payload_json,
        created_at
      ) VALUES (?, 'gemini', 'cdp-network', 'gemini-primary-view', ?, ?, ?, ?, ?)
    `
  ).run(
    `event-${input.conversationId}-user`,
    input.pageUrl,
    input.remoteConversationId,
    'message_persisted',
    '{"role":"user"}',
    input.createdAt
  );
  db.prepare(
    `
      INSERT INTO capture_events (
        id,
        provider,
        source,
        source_session_key,
        page_url,
        remote_conversation_id,
        event_kind,
        payload_json,
        created_at
      ) VALUES (?, 'gemini', 'cdp-network', 'gemini-primary-view', ?, ?, ?, ?, ?)
    `
  ).run(
    `event-${input.conversationId}-assistant`,
    input.pageUrl,
    input.remoteConversationId,
    'message_persisted',
    '{"role":"assistant"}',
    input.createdAt
  );
  db.prepare(
    `
      INSERT INTO capture_events (
        id,
        provider,
        source,
        source_session_key,
        page_url,
        remote_conversation_id,
        event_kind,
        payload_json,
        created_at
      ) VALUES (?, 'gemini', 'cdp-network', 'gemini-primary-view', ?, ?, ?, ?, ?)
    `
  ).run(
    `event-${input.conversationId}-turn`,
    input.pageUrl,
    input.remoteConversationId,
    'turn_persisted',
    '{"messageCount":2}',
    input.createdAt
  );
}

function countRows(db: DatabaseSync, tableName: 'conversations' | 'messages' | 'capture_events'): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get() as { count: number };
  return row.count;
}
