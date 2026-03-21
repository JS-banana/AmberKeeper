import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ensureCaptureCorePersistenceSchema } from './schema';

export function createCaptureEventRepository(db: DatabaseSync) {
  ensureCaptureCorePersistenceSchema(db);

  return {
    insert(input: {
      provider: string;
      source: string;
      sourceSessionKey: string;
      pageUrl: string;
      remoteConversationId?: string | null;
      eventKind: string;
      payloadJson: string;
      createdAt: string;
    }): void {
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        `event-${crypto.randomUUID()}`,
        input.provider,
        input.source,
        input.sourceSessionKey,
        input.pageUrl,
        input.remoteConversationId ?? null,
        input.eventKind,
        input.payloadJson,
        input.createdAt
      );
    },
    list(limit = 20) {
      return db
        .prepare(
          `
            SELECT
              id,
              provider,
              source,
              source_session_key AS sourceSessionKey,
              page_url AS pageUrl,
              remote_conversation_id AS remoteConversationId,
              event_kind AS eventKind,
              payload_json AS payloadJson,
              created_at AS createdAt
            FROM capture_events
            ORDER BY created_at DESC
            LIMIT ?
          `
        )
        .all(limit);
    },
  };
}

export { ensureCaptureCorePersistenceSchema } from './schema';
